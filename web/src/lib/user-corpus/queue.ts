// The ingestion queue: a Postgres FOR UPDATE SKIP LOCKED drain (§8, "no new infra").
//
// USER-SCOPED BY CONSTRUCTION. The drain runs as app_runtime with RLS bound to one user, so it can
// only ever see and advance that user's documents. That is not a limitation worked around -- it is
// why the order says "use the fire-and-forget drain kicked on upload; do not wait for cron". A
// cross-user drain would have to run as a role that can read every user's rows, which is precisely
// the connection this slice spent migration 101 taking away.
//
// NOTHING IS EVER SILENTLY DROPPED. Every path out of a claim ends in a written status. The two
// ways a queue normally loses work are both closed here: a worker that dies mid-parse leaves a row
// in 'parsing' that the stale-claim rule reclaims by age, and a document that fails forever is
// retired to 'failed' by reapExhausted rather than being skipped by the claim predicate and left
// sitting in 'parsing' where no one would look for it.

import { runAsUser } from '@/lib/db';
import { getUserDocument } from './blob';
import { setDocStatus, setParseResult } from './documents';
import { extractText, judgeExtraction } from './parse';
import { UploadRefused, type DocStatus, type UserDocument } from './types';

/** After this many attempts a document is retired rather than retried forever. */
export const MAX_ATTEMPTS = 3;

/**
 * A row claimed longer ago than this had its worker die. Serverless functions are killed at their
 * maxDuration, so the reclaim window has to exceed the longest legitimate parse; 5 minutes is well
 * past a 25 MB PDF and short enough that a user retrying by hand is not waiting on it.
 */
export const STALE_CLAIM_MINUTES = 5;

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
              OR (status = 'parsing' AND claimed_at < now() - (${STALE_CLAIM_MINUTES} || ' minutes')::interval)
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
          AND status = 'parsing'
          AND attempts >= ${MAX_ATTEMPTS}
          AND claimed_at < now() - (${STALE_CLAIM_MINUTES} || ' minutes')::interval
        RETURNING id`,
  ]);
  return (rows as Row[]).length;
}

/**
 * Parse one claimed document and write its outcome.
 *
 * On success the document lands in 'chunking', NOT 'ready'. Step 2 builds no chunker, so 'ready'
 * would be a false claim of searchability -- the order's "prove the pipeline reports honestly
 * before it reports success". 'chunking' is true today: the document is parsed and waiting for
 * step 3.
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
    await setParseResult(userId, row.id, {
      pageCount: parsed.pages ?? null,
      extractableChars: parsed.extractableChars,
    });

    judgeExtraction(parsed, type);

    await setDocStatus(userId, row.id, 'chunking', null);
    return 'chunking';
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

  return { processed, outcomes, reaped };
}

/** Queue depth and oldest-queued age -- two of §9's four required numbers. */
export async function queueStats(userId: string): Promise<{ depth: number; oldestQueuedSeconds: number | null }> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT count(*)::int AS depth,
               EXTRACT(EPOCH FROM (now() - min(created_at)))::int AS oldest
        FROM user_documents
        WHERE user_id = ${userId} AND status IN ('queued', 'parsing', 'chunking', 'embedding')`,
  ]);
  const r = (rows as { depth: number; oldest: number | null }[])[0];
  return { depth: r?.depth ?? 0, oldestQueuedSeconds: r?.oldest ?? null };
}

export type { UserDocument };
