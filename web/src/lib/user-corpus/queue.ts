// The ingestion queue: a Postgres FOR UPDATE SKIP LOCKED drain (§8, "no new infra").
//
// USER-SCOPED BY CONSTRUCTION. The drain runs as app_runtime with RLS bound to one user, so it can
// only ever see and advance that user's documents. That is not a limitation worked around -- it is
// why the order says "use the fire-and-forget drain kicked on upload; do not wait for cron". A
// cross-user drain would have to run as a role that can read every user's rows, which is precisely
// the connection this slice spent migration 101 taking away.
//
// NOTHING IS EVER SILENTLY DROPPED. Every path out of a claim ends in a written status. The two
// ways a queue normally loses work are both closed here: a worker that dies mid-flight leaves a row
// in one of the CLAIMED_STATUSES that the stale-claim rule reclaims by age, and a document that
// fails forever is retired to 'failed' by reapExhausted rather than being skipped by the claim
// predicate and left where no one would look for it.
//
// THIS PARAGRAPH WAS FALSE FOR THE LIFE OF THE SLICE, and said 'parsing' in both places while
// `processOne` also writes 'chunking' and 'embedding' — see CLAIMED_STATUSES (B022). A header that
// states a guarantee the predicates do not implement is worse than no header, because it is read
// as a specification.

import { runAsUser } from '@/lib/db';
import { MIN_VERSE_SHINGLES, SHIPPED_K, anchorChunk } from './anchor';
import { detectDocumentTranslation, getAnchorIndexFor } from './bible-index';
import { getUserDocument } from './blob';
import { chunkProse } from './chunk';
import { setDocStatus, setParseResult } from './documents';
import { setReadingsState } from './readings-store';
import { embedChunks } from './embed';
import { extractText, judgeExtraction } from './parse';
import { extractSermonMetadata } from './metadata-extract';
import { storeSections } from './sections';
import { UploadRefused, type DocStatus, type UserDocument } from './types';

/** After this many attempts a document is retired rather than retried forever. */
export const MAX_ATTEMPTS = 3;

/**
 * A row claimed longer ago than this had its worker die. Serverless functions are killed at their
 * maxDuration, so the reclaim window has to exceed the longest legitimate parse; 5 minutes is well
 * past a 25 MB PDF and short enough that a user retrying by hand is not waiting on it.
 */
export const STALE_CLAIM_MINUTES = 5;

/**
 * The statuses a worker holds a claim in — everything `processOne` can be interrupted mid-way
 * through.
 *
 * B022 — BOTH RECOVERY RULES USED TO SAY 'parsing' AND ONLY 'parsing', while `processOne` writes
 * 'chunking' and then 'embedding'. Embedding is the longest phase (an external provider call), so
 * it is the state a killed serverless function is MOST likely to leave behind — and such a row was
 * invisible to the stale-claim reclaim and to the reaper alike, counted forever in `queueStats`
 * depth, offered no retry control, and refused a re-upload by checksum dedupe. The only way out was
 * hand-written SQL. A row in 'embedding' sat on the dev database for 3.66 days.
 *
 * ONE definition, used by both predicates, so they cannot drift apart again — and so adding a
 * status to the walk means adding it here rather than remembering two call sites.
 */
export const CLAIMED_STATUSES = ['parsing', 'chunking', 'embedding'] as const;

/** The same set as a plain array, because a `readonly` tuple is not a bindable SQL parameter. */
const CLAIMED_SQL: string[] = [...CLAIMED_STATUSES];

interface Row {
  id: string;
  blob_url: string | null;
  source_filename: string | null;
  attempts: number;
}

/**
 * Atomically take the next document. One statement, so two concurrent drains cannot claim the same
 * row: SKIP LOCKED makes the loser take the next one instead of blocking.
 */
async function claimNext(userId: string): Promise<Row | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents
        SET status = 'parsing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
        WHERE id = (
          SELECT id FROM user_documents
          WHERE user_id = ${userId}
            AND attempts < ${MAX_ATTEMPTS}
            AND (
              status = 'queued'
              OR (status = ANY(${CLAIMED_SQL}::text[])
                  AND claimed_at < now() - (${STALE_CLAIM_MINUTES} || ' minutes')::interval)
            )
          ORDER BY claimed_at NULLS FIRST, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, blob_url, source_filename, attempts`,
  ]);
  return (rows as Row[])[0] ?? null;
}

/**
 * Retire documents the claim predicate can no longer see.
 *
 * `attempts < MAX_ATTEMPTS` in claimNext means an exhausted row stops being claimed -- and a row
 * that is in 'parsing' and will never be claimed again is invisible work, which is the silent drop
 * §8 forbids. This turns that state into an explicit, visible failure with a reason.
 */
export async function reapExhausted(userId: string): Promise<number> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents
        SET status = 'failed',
            parse_error = 'Gave up after ' || attempts || ' attempts. The last error was: ' || COALESCE(parse_error, 'unknown'),
            updated_at = now()
        WHERE user_id = ${userId}
          AND status = ANY(${CLAIMED_SQL}::text[])
          AND attempts >= ${MAX_ATTEMPTS}
          AND claimed_at < now() - (${STALE_CLAIM_MINUTES} || ' minutes')::interval
        RETURNING id`,
  ]);
  return (rows as Row[]).length;
}

/**
 * Take one claimed document all the way: parse -> chunk -> anchor -> embed -> store -> 'ready'.
 *
 * `ready` means INDEXED AND SEARCHABLE, and it is set in exactly one place: after the sections,
 * their vectors and their anchors are committed. Until this wiring landed the drain stopped at
 * 'chunking' on purpose, because claiming `ready` with no chunker would have been a false claim of
 * searchability. The status walk is visible throughout -- 'parsing' -> 'chunking' -> 'embedding' ->
 * 'ready' -- so a document stuck anywhere says WHERE it is stuck rather than merely that it is.
 */
async function processOne(userId: string, row: Row): Promise<DocStatus> {
  if (!row.blob_url) {
    await setDocStatus(userId, row.id, 'failed', 'The uploaded file was not stored, so it cannot be parsed. Please upload it again.');
    return 'failed';
  }

  try {
    const bytes = await getUserDocument(row.blob_url);
    const { parsed, type } = await extractText(bytes, row.source_filename ?? '');

    // Written BEFORE the judgement, so a refusal keeps the evidence it was based on. 'needs OCR'
    // with no recorded page or character count is an assertion nobody can check afterwards.
    // The metadata suggestions ride the same write: display-only chips (migration 124), never
    // read back into title or behaviour — a wrong suggestion is a chip, not a renamed document.
    const suggested = extractSermonMetadata(parsed.text);
    await setParseResult(userId, row.id, {
      pageCount: parsed.pages ?? null,
      extractableChars: parsed.extractableChars,
      suggestedReference: suggested.reference,
      suggestedDate: suggested.date,
    });

    judgeExtraction(parsed, type);

    // ── chunk ────────────────────────────────────────────────────────────────────────────────────
    await setDocStatus(userId, row.id, 'chunking', null);
    const chunks = chunkProse(parsed.text);
    if (chunks.length === 0) {
      // judgeExtraction already passed, so there IS text; producing no chunks from it would be a
      // chunker bug, and indexing nothing while reporting ready is the silent drop this refuses.
      await setDocStatus(userId, row.id, 'empty', 'The document produced no indexable text.');
      return 'empty';
    }

    // ── anchor ───────────────────────────────────────────────────────────────────────────────────
    // ADR-100's detection, built 2026-08-21: the document votes on WHICH translation it quotes
    // (a KJV-pinned index cost non-KJV quoters roughly half their recall — measured, Run 3 of
    // the deep dive), the uncited channel shingles against the winner's index, and the
    // detection's REAL confidence is what lands in user_section_anchors.confidence — never a
    // hardcoded 1.0. Throws BibleIndexUnavailable if an index is missing, rather than anchoring
    // nothing: an empty index would lose the channel carrying 90% of the recall and still
    // report success.
    const detection = detectDocumentTranslation(parsed.text);
    const index = getAnchorIndexFor(detection.translation);
    const anchored = chunks.map((chunk) => ({
      chunk,
      anchors: anchorChunk(chunk.text, {
        index,
        minHits: SHIPPED_K,
        minVerseShingles: MIN_VERSE_SHINGLES,
        translationConfidence: detection.confidence,
      }),
    }));

    // ── embed ────────────────────────────────────────────────────────────────────────────────────
    await setDocStatus(userId, row.id, 'embedding', null);
    const vectors = await embedChunks(anchored.map((a) => a.chunk.text));
    if (vectors.length !== anchored.length) {
      throw new Error(`embedder returned ${vectors.length} vectors for ${anchored.length} chunks`);
    }

    // ── store ────────────────────────────────────────────────────────────────────────────────────
    // One transaction: either the document is fully indexed or none of it is.
    await storeSections(userId, row.id, anchored.map((a, i) => ({ ...a, embedding: vectors[i]! })));

    await setDocStatus(userId, row.id, 'ready', null);

    // The suggested-readings search can only run once the document has vectors, so this is the
    // first moment it is possible. Marked 'pending' HERE rather than started here: the search is
    // ~49s exactly (docs/SUGGESTED_READINGS_DESIGN.md) and the drain is already holding a claim on
    // this row — running it inline would keep that claim for a minute and block the queue behind a
    // job that is not ingestion. The client kicks it, and a document that is never opened simply
    // never pays for a search nobody asked to see.
    await setReadingsState(userId, row.id, { status: 'pending', progress: 0, step: null, error: null })
      .catch((e) => console.error('[user-corpus] could not mark readings pending:', String((e as Error)?.message ?? e)));

    return 'ready';
  } catch (e) {
    if (e instanceof UploadRefused) {
      // A refusal is a VERDICT, not a transient error: OCR-less scans and empty files do not
      // become parseable on a second attempt. Terminal immediately, with the reason shown.
      // 'empty' has its own status because the remedy differs -- a scan needs OCR, a blank file
      // needs a different file, and telling someone to OCR an empty .txt is worse than useless.
      const status: DocStatus = e.code === 'empty' ? 'empty' : 'failed';
      await setDocStatus(userId, row.id, status, e.message);
      return status;
    }
    // Anything else may be transient (blob fetch, cold start). Back to 'queued' so the drain
    // retries it, until MAX_ATTEMPTS retires it via the claim predicate + reapExhausted.
    const message = String((e as Error)?.message ?? e);
    if (row.attempts >= MAX_ATTEMPTS) {
      await setDocStatus(userId, row.id, 'failed', `Gave up after ${row.attempts} attempts. The last error was: ${message}`);
      return 'failed';
    }
    await setDocStatus(userId, row.id, 'queued', message);
    return 'queued';
  }
}

export interface DrainResult {
  processed: number;
  outcomes: Record<string, number>;
  reaped: number;
}

/**
 * Drain up to `max` documents for one user. Fire-and-forget from the upload route (§8, and the
 * order: Vercel Pro is provisioned, but cron granularity is not what makes an upload feel alive).
 */
export async function drain(userId: string, max = 5): Promise<DrainResult> {
  const reaped = await reapExhausted(userId);
  const outcomes: Record<string, number> = {};
  let processed = 0;

  for (let i = 0; i < max; i++) {
    const row = await claimNext(userId);
    if (!row) break;
    const outcome = await processOne(userId, row);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    processed++;
  }

  // §5 tripwire: emit once per drain batch that ends over the line, so a bulk import that
  // crosses it says so in the logs the day it happens, not the day search feels slow.
  if (processed > 0) {
    const stats = await queueStats(userId).catch(() => null);
    if (stats?.overTripwire) {
      console.warn(
        `[user-corpus] TRIPWIRE user=${userId} sections=${stats.sectionCount} > ${SEMANTIC_SCAN_TRIPWIRE} — ` +
          'brute-force semantic search is past the design ceiling; the per-user HNSW partition (SERMON_SEARCH_DESIGN §5) is due.',
      );
    }
  }

  return { processed, outcomes, reaped };
}

/**
 * §5's brute-force tripwire — A NUMBER, NOT A COMMENT (it lived only as a comment in search.ts
 * until the 2026-08-20 audit called that out). Above this many sections, one user's semantic
 * search stops being a cheap 100%-recall scan and the design's per-user HNSW partition becomes
 * due. At ~34 chunks per sermon that is roughly 700 documents — reachable in one bulk import.
 * Crossing it does not degrade anything today; it makes the crossing VISIBLE (a structured log
 * the drain emits once per crossing batch, and `sectionCount` on queueStats so ops can chart it)
 * instead of a surprise latency cliff.
 */
export const SEMANTIC_SCAN_TRIPWIRE = 20_000;

/** Queue depth, oldest-queued age, and the user's section count -- §9's observability numbers. */
export async function queueStats(
  userId: string,
): Promise<{ depth: number; oldestQueuedSeconds: number | null; sectionCount: number; overTripwire: boolean }> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT (SELECT count(*)::int FROM user_documents
                 WHERE user_id = ${userId} AND status IN ('queued', 'parsing', 'chunking', 'embedding')) AS depth,
               (SELECT EXTRACT(EPOCH FROM (now() - min(created_at)))::int FROM user_documents
                 WHERE user_id = ${userId} AND status IN ('queued', 'parsing', 'chunking', 'embedding')) AS oldest,
               (SELECT count(*)::int FROM user_sections WHERE user_id = ${userId}) AS sections`,
  ]);
  const r = (rows as { depth: number; oldest: number | null; sections: number }[])[0];
  const sectionCount = r?.sections ?? 0;
  return {
    depth: r?.depth ?? 0,
    oldestQueuedSeconds: r?.oldest ?? null,
    sectionCount,
    overTripwire: sectionCount > SEMANTIC_SCAN_TRIPWIRE,
  };
}

export type { UserDocument };
