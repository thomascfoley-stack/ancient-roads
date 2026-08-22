import { runAsUser } from './db';
import { paragraphAround } from './paragraph-around';
import { MUST_NOT_SERVE_AUTHORS } from './legal-corpus';
import { FORBIDDEN_PROVENANCE_DOMAINS } from './forbidden-provenance.mjs';

// Study Docs data layer (docs/STUDY_DOCS_DESIGN.md §6; build file P1 tasks 1.2/1.4/1.6).
//
// Three properties are load-bearing; each has an invariant in the design's §8 that the P2
// suite pins (S-1, S-3, S-4, S-8, S-14), and each is structural here rather than conventional.
//
// 1. EVERY QUERY RUNS THROUGH runAsUser — including the corpus reads inside clipping writes —
//    with the audited belts from lib/chat.ts: explicit `user_id` on every read (H1), and
//    ownership-checked `INSERT…SELECT…WHERE EXISTS` / `UPDATE…WHERE user_id` on every write
//    (H2). RLS is the backstop, not the belt: C5 records that RLS under Neon's user-id format
//    is UNPROVEN, so nothing here leans on it.
//
// 2. PROVENANCE IS STRUCTURAL (design F3). A clipping's `quote` and `attribution` are written
//    only by the single INSERT…SELECT statements below, which snapshot from the corpus tables
//    with the licensing gate IN the statement: `sources.status = 'published'` plus the
//    forbidden-provenance belt for the sections leg; `embeddings.served AND user_id IS NULL`
//    plus the same provenance belt for the ask leg. There is no code path on which
//    client-supplied quote text reaches a table — the routes 400 it first (S-1), and no
//    function in this module accepts quote text at all. 0 rows inserted means "not owned or
//    not servable"; `probeClipFailure` names which, after the fact, for an accurate error code.
//    The write gate deliberately matches the SERVING predicates (search-sections.ts H6 for
//    sections; teacher/routing.ts *_CORPUS_FILTER for embeddings): a row the library would not
//    serve cannot be snapshotted into a study either.
//
// 3. ORDER IS TOTAL AND COLLISION-FREE. `position` is a base-62 fractional key
//    (`positionBetween`); every read orders `position, id`; the partial unique index
//    `idx_blocks_order` forbids duplicate live positions, so a concurrent insert at the same
//    midpoint fails 23505 and is retried against fresh anchors WITH a disambiguating suffix
//    (`positionForAttempt` — contested rounds produce distinct keys, so lockstep racers of any
//    width resolve in one retry), never silently reordered (S-14).
//
// runAsUser executes a STATIC statement array in one transaction — no read-then-conditional-
// write exists inside a transaction (design §2.1). Multi-statement ops (revision + update +
// bump; tombstone cascade) are static arrays; anchor reads for position computation happen in
// a PRIOR transaction, and the unique index turns any lost race into a retry, not a corruption.
//
// Reads are bounded (row caps below, cursor pagination past them). The byte ceiling is stated
// rather than enforced per-page: a block's quote is at most one reading unit, so a page is
// bounded by rows × the corpus's own unit sizes (worst measured unit ≈ tens of KB; typical
// pages are far below 1 MB). S-7 is the standing check on all of this.

// ── bounds (exported so routes and the P2 suite share one truth) ────────────────────────────
export const STUDIES_PAGE_LIMIT = 50;
export const BLOCKS_PAGE_LIMIT = 100;
export const BLOCKS_PAGE_MAX = 200;
export const STUDY_TITLE_MAX = 300;
export const STUDY_TEXT_MAX = 20_000;
export const CLIP_REFERENCE_MAX = 300;
/** Whole-body appends: one block per reading unit, hard cap per op (design §6.3, review S-L). */
export const WHOLE_WORK_BLOCK_CAP = 500;
/** Export reads every block, paged; this is the stated ceiling, not an aspiration. */
export const EXPORT_MAX_BLOCKS = 2_000;
/**
 * The 23505 retry belt. NO LONGER LOAD-BEARING FOR CONCURRENCY (2026-08-21): until
 * `positionForAttempt` below, retried racers recomputed the SAME midpoint from the same fresh
 * anchors — collision by construction, so N lockstep racers needed N tries and this constant
 * was a zero-margin bound the four-racer invariant test sat exactly on
 * (docs/pm/orders/2026-08-21-studies-position-retry-zero-margin.md). Retries now disambiguate,
 * so a round of any width resolves w.h.p. in one retry; 3 covers the ~1/3782-per-pair residual
 * suffix collision twice over. Raising it is never the fix for a conflict storm.
 */
const POSITION_RETRIES = 3;

// ── types ───────────────────────────────────────────────────────────────────────────────────
export interface Study {
  id: string;
  title: string;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyBlock {
  id: string;
  study_id: string;
  position: string;
  kind: 'text' | 'clipping';
  body: string | null;
  /** embeddings key (ask-surface clippings), e.g. `commentary:jhn:1:1-5:Matthew Henry`. */
  source_id: string | null;
  /** sections.id — BIGINT, so the driver returns it as a string. */
  section_id: string | null;
  work_slug: string | null;
  ordinal: number | null;
  /** Server snapshot. NULL with attribution present = tombstone (data state, review S-K). */
  quote: string | null;
  attribution: { author?: string; work_title?: string; reference?: string } | null;
  cleared_at: string | null;
  /** Trim offsets into `quote` (migration 111, "trim not edit") — a VIEW over the server's
   *  bytes, never edited text. Display derives through lib/clipping-display.ts everywhere. */
  trim_start: number | null;
  trim_end: number | null;
  created_at: string;
  updated_at: string;
}

export type ClipFailReason =
  | 'study_not_found'
  | 'anchor_not_found'
  | 'source_not_found'
  | 'not_servable'
  | 'position_conflict';

export type InsertBlockResult = { ok: true; block: StudyBlock } | { ok: false; reason: ClipFailReason };

export type BulkClipResult =
  | { ok: true; inserted: number }
  | {
      ok: false;
      reason: 'study_not_found' | 'work_not_found' | 'work_empty' | 'work_too_large' | 'position_conflict';
      unitCount?: number;
    };

export interface BlockPlacement {
  afterBlockId?: string;
  beforeBlockId?: string;
}

// Every SELECT/RETURNING of a block row lists exactly these columns. Literal in each query —
// neon tagged-template interpolations are always bind parameters, never SQL fragments.
// (tsv/user_id/deleted_at stay server-side.)
//   id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal, quote,
//   attribution, cleared_at, created_at, updated_at

// ── the fractional position key ─────────────────────────────────────────────────────────────
// Base-62 digits in ASCII order, so lexicographic string comparison (and the unique index's
// btree order) IS numeric order. Keys are digit strings after an implicit radix point; the
// midpoint of two keys always exists, so there is no exhaustion, no rebalance path, no
// operational tail (design §6.1, review S-I).
const POSITION_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const POSITION_KEY_RE = /^[0-9A-Za-z]+$/;

function assertPositionKey(key: string, label: string): void {
  if (!POSITION_KEY_RE.test(key)) throw new Error(`${label} is not a base-62 position key`);
  // Never generated, and as an upper bound a '…0' key has NO key strictly before it at that
  // depth — refuse it at the boundary instead of returning something out of order.
  if (key.endsWith('0')) throw new Error(`${label} ends in the minimum digit; not a generated key`);
}

/**
 * A key strictly between `a` and `b` (each may be null: `a = null` means "before everything",
 * `b = null` means "after everything"). Pure; throws on malformed input rather than emitting a
 * key that would corrupt order. Never returns a key ending in '0', which is what keeps every
 * midpoint representable.
 */
export function positionBetween(a: string | null, b: string | null): string {
  if (a !== null) assertPositionKey(a, 'a');
  if (b !== null) assertPositionKey(b, 'b');
  if (a !== null && b !== null && a >= b) throw new Error(`positionBetween: a (${a}) must sort before b (${b})`);
  return mid(a ?? '', b);
}

function mid(a: string, b: string | null): string {
  if (b !== null) {
    // Unreachable for keys assertPositionKey admits (it needs b to be a prefix of a, or of
    // a's '0'-padding); kept as the belt against a corrupted stored key.
    if (b === '') throw new Error('positionBetween: upper bound exhausted; bounds out of order');
    // Peel the longest common prefix; the answer keeps it.
    let i = 0;
    while (i < b.length && (a.charAt(i) || '0') === b.charAt(i)) i++;
    if (i > 0) return b.slice(0, i) + mid(a.slice(i), b.slice(i));
  }
  const dA = a === '' ? 0 : POSITION_DIGITS.indexOf(a.charAt(0));
  const dB = b === null ? POSITION_DIGITS.length : POSITION_DIGITS.indexOf(b.charAt(0));
  if (dA < 0 || dB < 0) throw new Error('positionBetween: digit outside the base-62 alphabet');
  if (b === null && a !== '' && dA < POSITION_DIGITS.length - 1) {
    // Append path: the next single digit already sorts after ALL of `a` ('W' > 'Vzz…'), and
    // taking it instead of a midpoint keeps append chains short — one extra character per ~31
    // appends rather than per ~6. With the per-op and per-doc block caps this bounds keys to
    // tens of characters; the design's ~20-line midpoint deliberately stops short of the full
    // integer-part fractional-indexing scheme, and this is the one growth case worth the line.
    return POSITION_DIGITS.charAt(dA + 1);
  }
  if (dB - dA > 1) {
    // A whole digit fits between the two first digits; floor keeps it strictly inside.
    return POSITION_DIGITS.charAt(Math.floor((dA + dB) / 2));
  }
  // Consecutive first digits: keep a's digit, recurse into "after the rest of a".
  return POSITION_DIGITS.charAt(dA) + mid(a.slice(1), null);
}

/** n keys strictly after `after`, in ascending order — the bulk-append path. */
export function positionsAfter(after: string | null, n: number): string[] {
  const out: string[] = [];
  let last = after;
  for (let i = 0; i < n; i++) {
    last = positionBetween(last, null);
    out.push(last);
  }
  return out;
}

// ── retry-round disambiguation ──────────────────────────────────────────────────────────────
// THE LOCKSTEP DEFECT (2026-08-21, docs/pm/orders/2026-08-21-studies-position-retry-zero-margin.md):
// `positionBetween` is pure, so N concurrent racers that read the same anchors compute the SAME
// key — one wins, and every loser re-reads the new state and computes the same NEXT midpoint,
// colliding again. Not flakiness: collision by construction, N racers need N rounds, and
// POSITION_RETRIES was a hand-typed bound one racer below the invariant test's own racer count.
// No constant fixes that — under lockstep, N racers need N tries for every N.
//
// The cure is to make contested rounds produce DISTINCT keys: a retry appends two random
// base-62 digits inside the gap, so racers that read identical anchors no longer collide, and
// any-width rounds resolve in one retry (residual: a 1/3782 per-pair suffix collision, which
// the remaining belt absorbs). Attempt 0 stays the plain midpoint, so sequential inserts —
// the overwhelmingly common case — pay zero key growth.
//
// WHY THE SUFFIX IS SAFE UNDER AN UPPER BOUND: every `mid(a, b)` result differs from `b` at
// some index with a strictly smaller digit (the midpoint branch floors below dB; the
// consecutive-digit branch keeps dA = dB−1; the peel branch reduces to one of those on the
// remainder), so NO extension of the result can reach `b`. Extensions only grow the key
// rightward of that index, and `key < key + suffix` is lexicographic fact, so the suffixed key
// stays strictly inside (a, b). The last suffix digit is drawn from 1..z so no key ever ends
// in '0' (assertPositionKey's invariant).

/** Uniform int in [0, maxExclusive) from the platform CSPRNG. Injectable for tests. */
function randomBelow(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % maxExclusive;
}

/** `key` plus a two-digit random suffix — still strictly inside the gap `key` came from. */
export function disambiguatePosition(key: string, rand: (maxExclusive: number) => number = randomBelow): string {
  const first = POSITION_DIGITS.charAt(rand(POSITION_DIGITS.length));
  const last = POSITION_DIGITS.charAt(1 + rand(POSITION_DIGITS.length - 1));
  return key + first + last;
}

/** The ONE definition of a retry round's key: plain midpoint first, disambiguated under contest. */
export function positionForAttempt(
  a: string | null,
  b: string | null,
  attempt: number,
  rand?: (maxExclusive: number) => number,
): string {
  const base = positionBetween(a, b);
  return attempt === 0 ? base : disambiguatePosition(base, rand);
}

/** The bulk-append twin: a contested retry restarts the chain from a disambiguated head. */
export function positionsAfterForAttempt(
  after: string | null,
  n: number,
  attempt: number,
  rand?: (maxExclusive: number) => number,
): string[] {
  if (attempt === 0 || n === 0) return positionsAfter(after, n);
  const head = disambiguatePosition(positionBetween(after, null), rand);
  return [head, ...positionsAfter(head, n - 1)];
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23505';
}

// ── studies ─────────────────────────────────────────────────────────────────────────────────

export async function listStudies(
  userId: string,
  opts: { limit?: number; before?: { updatedAt: string; id: string } } = {},
): Promise<Study[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? STUDIES_PAGE_LIMIT), STUDIES_PAGE_LIMIT);
  // H1: explicit user_id belt. Cursor is (updated_at, id) — updated_at moves when a study is
  // edited mid-pagination, which can reshuffle a page; accepted, same behaviour as the chats
  // list. idx_studies_user covers the scan.
  // updated_at::text — the driver returns a JS Date, whose JSON serialization truncates to
  // milliseconds; a cursor bound from it then drops every row sharing the cursor's stored
  // millisecond (P2 swarm finding F-W1-1, probed on dev: full-precision text finds the rows,
  // the driver's Date finds none). Text round-trips at full precision.
  const [rows] = await runAsUser(userId, (sql) => [
    opts.before
      ? sql`SELECT id, title, pinned_at, created_at, updated_at::text AS updated_at FROM studies
            WHERE user_id = ${userId} AND deleted_at IS NULL
              AND (updated_at, id) < (${opts.before.updatedAt}, ${opts.before.id})
            ORDER BY updated_at DESC, id DESC LIMIT ${limit}`
      : sql`SELECT id, title, pinned_at, created_at, updated_at::text AS updated_at FROM studies
            WHERE user_id = ${userId} AND deleted_at IS NULL
            ORDER BY updated_at DESC, id DESC LIMIT ${limit}`,
  ]);
  return rows as Study[];
}

export async function createStudy(userId: string, title: string): Promise<Study> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO studies (user_id, title) VALUES (${userId}, ${title})
        RETURNING id, title, pinned_at, created_at, updated_at`,
  ]);
  return (rows as Study[])[0]!;
}

export async function getStudy(userId: string, studyId: string): Promise<Study | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title, pinned_at, created_at, updated_at FROM studies
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
  ]);
  return (rows as Study[])[0] ?? null;
}

/** Rename and/or pin. `pinned: true` keeps an existing pin's timestamp (stable pin order). */
export async function updateStudy(
  userId: string,
  studyId: string,
  patch: { title?: string; pinned?: boolean },
): Promise<Study | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE studies SET
          title = COALESCE(${patch.title ?? null}, title),
          pinned_at = CASE WHEN ${patch.pinned ?? null}::boolean IS NULL THEN pinned_at
                           WHEN ${patch.pinned ?? null}::boolean THEN COALESCE(pinned_at, now())
                           ELSE NULL END,
          updated_at = now()
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id, title, pinned_at, created_at, updated_at`,
  ]);
  return (rows as Study[])[0] ?? null;
}

/**
 * Soft delete. The study's tombstone and its blocks' tombstones land in the SAME transaction
 * (design §6.2, review S-H) — a deleted study's content can never surface in search, because
 * there is no instant at which the study is gone but its blocks are live. `ON DELETE CASCADE`
 * covers only hard delete, which is not a code path (E4: retention forever).
 */
export async function softDeleteStudy(userId: string, studyId: string): Promise<boolean> {
  const [studyRows] = await runAsUser(userId, (sql) => [
    sql`UPDATE studies SET deleted_at = now(), updated_at = now()
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id`,
    sql`UPDATE study_blocks SET deleted_at = now()
        WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
  ]);
  return (studyRows as unknown[]).length > 0;
}

// ── blocks: reads ───────────────────────────────────────────────────────────────────────────

export async function listBlocks(
  userId: string,
  studyId: string,
  opts: { limit?: number; afterPosition?: string } = {},
): Promise<StudyBlock[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? BLOCKS_PAGE_LIMIT), BLOCKS_PAGE_MAX);
  if (opts.afterPosition !== undefined) assertPositionKey(opts.afterPosition, 'afterPosition');
  // H1 belt; ORDER BY position, id (the id tiebreaker is belt — idx_blocks_order forbids ties
  // among live rows). Cursor = last position of the previous page.
  const [rows] = await runAsUser(userId, (sql) => [
    opts.afterPosition !== undefined
      ? sql`SELECT id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                   quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at
            FROM study_blocks
            WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
              AND position > ${opts.afterPosition}
            ORDER BY position, id LIMIT ${limit}`
      : sql`SELECT id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                   quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at
            FROM study_blocks
            WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
            ORDER BY position, id LIMIT ${limit}`,
  ]);
  return rows as StudyBlock[];
}

/** The doc-page read: study + first blocks page, one transaction. */
export async function getStudyWithBlocks(
  userId: string,
  studyId: string,
  opts: { limit?: number; afterPosition?: string } = {},
): Promise<{ study: Study; blocks: StudyBlock[] } | null> {
  const limit = Math.min(Math.max(1, opts.limit ?? BLOCKS_PAGE_LIMIT), BLOCKS_PAGE_MAX);
  if (opts.afterPosition !== undefined) assertPositionKey(opts.afterPosition, 'afterPosition');
  const [studyRows, blockRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title, pinned_at, created_at, updated_at FROM studies
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
    opts.afterPosition !== undefined
      ? sql`SELECT id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                   quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at
            FROM study_blocks
            WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
              AND position > ${opts.afterPosition}
            ORDER BY position, id LIMIT ${limit}`
      : sql`SELECT id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                   quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at
            FROM study_blocks
            WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
            ORDER BY position, id LIMIT ${limit}`,
  ]);
  const study = (studyRows as Study[])[0];
  if (!study) return null;
  return { study, blocks: blockRows as StudyBlock[] };
}

/**
 * Every live block, paged internally to the stated ceiling — the export read (task 1.7's
 * caller). Throws past EXPORT_MAX_BLOCKS rather than serializing a silently truncated doc.
 */
export async function listAllBlocksForExport(userId: string, studyId: string): Promise<StudyBlock[]> {
  const out: StudyBlock[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await listBlocks(userId, studyId, { limit: BLOCKS_PAGE_MAX, afterPosition: after });
    out.push(...page);
    if (out.length > EXPORT_MAX_BLOCKS) {
      throw new Error(`study ${studyId} exceeds EXPORT_MAX_BLOCKS (${EXPORT_MAX_BLOCKS})`);
    }
    if (page.length < BLOCKS_PAGE_MAX) return out;
    after = page[page.length - 1]!.position;
  }
}

// ── blocks: position anchors ────────────────────────────────────────────────────────────────

// Neighbor positions for a placement, read in their own transaction (see header — runAsUser is
// a static array, so the read cannot ride inside the write's transaction; the unique index
// turns any lost race into a 23505 retry instead of a corruption).
async function readAnchors(
  userId: string,
  studyId: string,
  place: BlockPlacement,
): Promise<{ a: string | null; b: string | null } | 'anchor_not_found'> {
  if (place.afterBlockId !== undefined || place.beforeBlockId !== undefined) {
    const anchorId = place.afterBlockId ?? place.beforeBlockId!;
    return readAnchorsViaWindow(userId, studyId, anchorId, place.afterBlockId !== undefined);
  }
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT position FROM study_blocks
        WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
        ORDER BY position DESC, id DESC LIMIT 1`,
  ]);
  const last = (rows as { position: string }[])[0]?.position ?? null;
  return { a: last, b: null };
}

async function readAnchorsViaWindow(
  userId: string,
  studyId: string,
  anchorId: string,
  after: boolean,
): Promise<{ a: string | null; b: string | null } | 'anchor_not_found'> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT position, next_position, prev_position FROM (
          SELECT id, position,
                 lead(position) OVER (ORDER BY position, id) AS next_position,
                 lag(position)  OVER (ORDER BY position, id) AS prev_position
          FROM study_blocks
          WHERE study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
        ) t WHERE id = ${anchorId}`,
  ]);
  const row = (rows as { position: string; next_position: string | null; prev_position: string | null }[])[0];
  if (!row) return 'anchor_not_found';
  return after ? { a: row.position, b: row.next_position } : { a: row.prev_position, b: row.position };
}

// ── blocks: text ops (tasks 1.2 + 1.6) ─────────────────────────────────────────────────────

export async function insertTextBlock(
  userId: string,
  studyId: string,
  body: string,
  place: BlockPlacement = {},
): Promise<InsertBlockResult> {
  for (let attempt = 0; attempt < POSITION_RETRIES; attempt++) {
    const anchors = await readAnchors(userId, studyId, place);
    if (anchors === 'anchor_not_found') return { ok: false, reason: 'anchor_not_found' };
    const position = positionForAttempt(anchors.a, anchors.b, attempt);
    try {
      // H2: INSERT…SELECT…WHERE EXISTS — a block lands only in a study the caller owns.
      // The updated_at bump rides the same transaction (design §6.2).
      const [rows] = await runAsUser(userId, (sql) => [
        sql`INSERT INTO study_blocks (study_id, user_id, position, kind, body)
            SELECT ${studyId}, ${userId}, ${position}, 'text', ${body}
            WHERE EXISTS (SELECT 1 FROM studies WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL)
            RETURNING id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                      quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at`,
        sql`UPDATE studies SET updated_at = now()
            WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
      ]);
      const block = (rows as StudyBlock[])[0];
      return block ? { ok: true, block } : { ok: false, reason: 'study_not_found' };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Someone landed on the same midpoint first — recompute against fresh anchors.
    }
  }
  return { ok: false, reason: 'position_conflict' };
}

/**
 * The `update_text` op. The OUTGOING body is appended to study_block_revisions in the SAME
 * transaction as the UPDATE (design §6.2; task 1.6) — the user's own writing is the one
 * non-regenerable asset in the system, so an overwrite is support-recoverable, never silent
 * loss. Revisions are text blocks only (review S-E) and append-only by GRANT (110).
 */
export async function updateTextBlock(
  userId: string,
  studyId: string,
  blockId: string,
  body: string,
): Promise<boolean> {
  const [, updatedRows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO study_block_revisions (block_id, user_id, body)
        SELECT id, user_id, body FROM study_blocks
        WHERE id = ${blockId} AND study_id = ${studyId} AND user_id = ${userId}
          AND kind = 'text' AND deleted_at IS NULL`,
    sql`UPDATE study_blocks SET body = ${body}, updated_at = now()
        WHERE id = ${blockId} AND study_id = ${studyId} AND user_id = ${userId}
          AND kind = 'text' AND deleted_at IS NULL
        RETURNING id`,
    sql`UPDATE studies SET updated_at = now()
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
  ]);
  return (updatedRows as unknown[]).length > 0;
}

export async function moveBlock(
  userId: string,
  studyId: string,
  blockId: string,
  place: BlockPlacement,
): Promise<{ ok: true; position: string } | { ok: false; reason: ClipFailReason }> {
  for (let attempt = 0; attempt < POSITION_RETRIES; attempt++) {
    const anchors = await readAnchors(userId, studyId, place);
    if (anchors === 'anchor_not_found') return { ok: false, reason: 'anchor_not_found' };
    const position = positionForAttempt(anchors.a, anchors.b, attempt);
    try {
      const [moved] = await runAsUser(userId, (sql) => [
        sql`UPDATE study_blocks SET position = ${position}, updated_at = now()
            WHERE id = ${blockId} AND study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
            RETURNING id`,
        sql`UPDATE studies SET updated_at = now()
            WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
      ]);
      if ((moved as unknown[]).length === 0) return { ok: false, reason: 'study_not_found' };
      return { ok: true, position };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return { ok: false, reason: 'position_conflict' };
}

/**
 * The `trim` op (migration 111): store or clear the kept range of a clipping's quote. The
 * offsets validate against length(quote) INSIDE the statement — the server's own bytes are
 * the bound, so a client cannot store a range the snapshot cannot satisfy. `null` clears.
 * Only live clippings WITH a quote are trimmable (a tombstone has nothing to view).
 */
export async function trimBlock(
  userId: string,
  studyId: string,
  blockId: string,
  trim: { start: number; end: number } | null,
): Promise<boolean> {
  const start = trim?.start ?? null;
  const end = trim?.end ?? null;
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE study_blocks SET
          trim_start = ${start}::int,
          trim_end = ${end}::int,
          updated_at = now()
        WHERE id = ${blockId} AND study_id = ${studyId} AND user_id = ${userId}
          AND kind = 'clipping' AND deleted_at IS NULL AND quote IS NOT NULL
          AND (${trim === null}::boolean
               OR (${start ?? 0}::int >= 0 AND ${end ?? 0}::int <= length(quote) AND ${end ?? 0}::int > ${start ?? 0}::int))
        RETURNING id`,
    sql`UPDATE studies SET updated_at = now()
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
  ]);
  return (rows as unknown[]).length > 0;
}

export async function softDeleteBlock(userId: string, studyId: string, blockId: string): Promise<boolean> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE study_blocks SET deleted_at = now()
        WHERE id = ${blockId} AND study_id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id`,
    sql`UPDATE studies SET updated_at = now()
        WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
  ]);
  return (rows as unknown[]).length > 0;
}

// ── the clipping engine (task 1.4) — one atomic INSERT…SELECT per surface ──────────────────

/**
 * Reader/topic-surface clipping: snapshot one section (design §6.3). The licensing gate is IN
 * the statement — `status = 'published'` plus the forbidden-provenance belt that the serving
 * path applies (search-sections.ts H6: belt and braces, evaluated on every query, so an
 * admission mistake cannot outlive the mistake). The design's §6.3 sketch carries only the
 * status gate; the tree's serving predicate carries both, and the tree wins.
 */
export async function insertClippingFromSection(
  userId: string,
  studyId: string,
  clip: { sectionId: number; reference?: string; matchHint?: string },
  place: BlockPlacement = {},
): Promise<InsertBlockResult> {
  for (let attempt = 0; attempt < POSITION_RETRIES; attempt++) {
    const anchors = await readAnchors(userId, studyId, place);
    if (anchors === 'anchor_not_found') return { ok: false, reason: 'anchor_not_found' };
    const position = positionForAttempt(anchors.a, anchors.b, attempt);
    try {
      const [rows] = await runAsUser(userId, (sql) => [
        sql`INSERT INTO study_blocks (study_id, user_id, position, kind,
                                      section_id, work_slug, ordinal, quote, attribution)
            SELECT ${studyId}, ${userId}, ${position}, 'clipping',
                   s.id, src.slug, s.ordinal, s.body,
                   jsonb_strip_nulls(jsonb_build_object(
                     'author', src.author, 'work_title', src.title,
                     'reference', COALESCE(${clip.reference ?? null}::text, s.heading)))
            FROM sections s JOIN sources src ON src.id = s.source_id
            WHERE s.id = ${clip.sectionId}
              AND src.status = 'published'
              -- MUST_NOT_SERVE veto (2026-08-18, audit H7). Without it a clipping of a vetoed
              -- author could be CREATED here, and servability.ts would keep rendering it.
              AND NOT (
                  src.author = ANY(${MUST_NOT_SERVE_AUTHORS}::text[])
                  OR split_part(src.author, ' of ', 1) = ANY(${MUST_NOT_SERVE_AUTHORS}::text[])
                  OR split_part(src.author, ' the ', 1) = ANY(${MUST_NOT_SERVE_AUTHORS}::text[])
                  OR EXISTS (SELECT 1 FROM unnest(${MUST_NOT_SERVE_AUTHORS}::text[]) n
                             WHERE src.author LIKE n || ' %')
                  OR src.author LIKE 'Jerome''s%')
              AND (s.source_url IS NULL OR NOT EXISTS (
                     SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                     WHERE lower(s.source_url) LIKE '%' || d || '%'))
              AND EXISTS (SELECT 1 FROM studies st WHERE st.id = ${studyId} AND st.user_id = ${userId} AND st.deleted_at IS NULL)
            RETURNING id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                      quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at`,
        sql`UPDATE studies SET updated_at = now()
            WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
      ]);
      const block = (rows as StudyBlock[])[0];
      if (block) {
        // B030 — OPEN ON THE PARAGRAPH, NOT THE CHAPTER. The insert above snapshots the whole
        // section, which is right and stays right (migration 111: "trim not edit" — the bytes are
        // the record). What was wrong is what the reader SAW: an entire commentary chapter for a
        // one-paragraph match. So the row is written whole and then given a VIEW of the paragraph
        // the match sits in. Widening later is an offset change with no refetch, which is the
        // owner's ruling exactly: adding is occasional, subtracting was 100%.
        //
        // Computed SERVER-SIDE from the server's own bytes: the client sends a hint of what it
        // matched, never offsets, so a client cannot aim the view at text it never saw. A failed
        // placement stores NO trim — the pre-B030 behaviour — rather than guessing a range.
        if (clip.matchHint && block.quote) {
          const view = paragraphAround(block.quote, clip.matchHint);
          if (view) {
            await trimBlock(userId, studyId, block.id, view);
            return { ok: true, block: { ...block, trim_start: view.start, trim_end: view.end } };
          }
        }
        return { ok: true, block };
      }
      return { ok: false, reason: await probeSectionClipFailure(userId, studyId, clip.sectionId) };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return { ok: false, reason: 'position_conflict' };
}

/**
 * Ask-surface clipping: snapshot the exact bytes the user read from `embeddings` (design §2.2).
 * Gate = the serving predicate: `user_id IS NULL AND served` (044/045 — provenance holds are
 * folded into `served`) PLUS the provenance belt over `metadata->>'sourceUrl'`, same braces as
 * the sections leg. `source_type` is derived from the key's own prefix
 * (`split_part(source_id, ':', 1)`) so the lookup rides the (source_type, source_id,
 * chunk_index) unique index — measured 2026-08-12 on dev: 0 of 570,350 corpus rows violate the
 * equality, and a violating row would fail to MATCH (fail closed), never serve wrongly.
 * Without a chunkIndex the lowest served chunk is snapshotted (deterministic; the surfaced
 * list does not expose chunk identity today — companion design T0-a measures that).
 */
export async function insertClippingFromEmbedding(
  userId: string,
  studyId: string,
  clip: { sourceId: string; chunkIndex?: number; reference?: string; askOutcomeId?: string },
  place: BlockPlacement = {},
): Promise<InsertBlockResult> {
  for (let attempt = 0; attempt < POSITION_RETRIES; attempt++) {
    const anchors = await readAnchors(userId, studyId, place);
    if (anchors === 'anchor_not_found') return { ok: false, reason: 'anchor_not_found' };
    const position = positionForAttempt(anchors.a, anchors.b, attempt);
    try {
      const [rows] = await runAsUser(userId, (sql) => [
        sql`INSERT INTO study_blocks (study_id, user_id, position, kind,
                                      source_id, work_slug, quote, attribution, ask_outcome_id)
            SELECT ${studyId}, ${userId}, ${position}, 'clipping',
                   e.source_id, e.metadata->>'work', e.content,
                   jsonb_strip_nulls(jsonb_build_object(
                     'author', e.metadata->>'author', 'work_title', e.metadata->>'sourceTitle',
                     'reference', ${clip.reference ?? null}::text)),
                   -- 125: the ask this voice was kept from. No FK — ask_outcomes fails open (116),
                   -- so the row may legitimately not exist and a constraint would break the user's
                   -- save over a lost telemetry write.
                   ${clip.askOutcomeId ?? null}::uuid
            FROM embeddings e
            WHERE e.source_type = split_part(${clip.sourceId}, ':', 1)
              AND e.source_id = ${clip.sourceId}
              AND (${clip.chunkIndex ?? null}::int IS NULL OR e.chunk_index = ${clip.chunkIndex ?? null}::int)
              AND e.user_id IS NULL AND e.served
              AND e.metadata->>'author' IS NOT NULL
              AND (e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
                     SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                     WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d || '%'))
              AND EXISTS (SELECT 1 FROM studies st WHERE st.id = ${studyId} AND st.user_id = ${userId} AND st.deleted_at IS NULL)
            ORDER BY e.chunk_index
            LIMIT 1
            RETURNING id, study_id, position, kind, body, source_id, section_id, work_slug, ordinal,
                      quote, attribution, cleared_at, trim_start, trim_end, created_at, updated_at`,
        sql`UPDATE studies SET updated_at = now()
            WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
      ]);
      const block = (rows as StudyBlock[])[0];
      if (block) return { ok: true, block };
      return { ok: false, reason: await probeEmbeddingClipFailure(userId, studyId, clip.sourceId, clip.chunkIndex) };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return { ok: false, reason: 'position_conflict' };
}

/**
 * The count the whole-body affordance states before running ("This will add 412 clippings…",
 * design §6.3). Counts CLEAN units only — the same predicate the bulk write admits.
 */
export async function countWorkUnits(
  userId: string,
  slug: string,
): Promise<{ count: number; capped: boolean }> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT count(*)::int AS units FROM (
          SELECT 1
          FROM sections s JOIN sources src ON src.id = s.source_id
          WHERE src.slug = ${slug} AND src.status = 'published'
            AND (s.source_url IS NULL OR NOT EXISTS (
                   SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                   WHERE lower(s.source_url) LIKE '%' || d || '%'))
          GROUP BY COALESCE(s.unit_ordinal, -s.ordinal)
          LIMIT ${WHOLE_WORK_BLOCK_CAP + 1}
        ) capped`,
  ]);
  const units = (rows as { units: number }[])[0]?.units ?? 0;
  return { count: Math.min(units, WHOLE_WORK_BLOCK_CAP), capped: units > WHOLE_WORK_BLOCK_CAP };
}

/**
 * Whole-body append (design §6.3, review S-L): one clipping per reading unit, appended at the
 * end of the study, hard-capped per op. One INSERT…SELECT carries every gate; the unit list
 * and positions are precomputed (a prior read), joined by unit key — a unit that vanished or
 * lost servability between read and write simply inserts nothing (fail closed). A unit whose
 * sections are PARTLY forbidden-provenance snapshots its clean sections only — exactly what
 * the serving path would show of it.
 */
export async function insertClippingsForWork(
  userId: string,
  studyId: string,
  slug: string,
): Promise<BulkClipResult> {
  // Pre-read: the clean unit keys, in document order, capped (+1 detects overflow).
  const [unitRows] = await runAsUser(userId, (sql) => [
    sql`SELECT COALESCE(s.unit_ordinal, -s.ordinal) AS unit_key
        FROM sections s JOIN sources src ON src.id = s.source_id
        WHERE src.slug = ${slug} AND src.status = 'published'
          AND (s.source_url IS NULL OR NOT EXISTS (
                 SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                 WHERE lower(s.source_url) LIKE '%' || d || '%'))
        GROUP BY COALESCE(s.unit_ordinal, -s.ordinal)
        ORDER BY min(s.ordinal)
        LIMIT ${WHOLE_WORK_BLOCK_CAP + 1}`,
  ]);
  const unitKeys = (unitRows as { unit_key: number }[]).map((r) => r.unit_key);
  if (unitKeys.length > WHOLE_WORK_BLOCK_CAP) {
    return { ok: false, reason: 'work_too_large', unitCount: unitKeys.length };
  }
  if (unitKeys.length === 0) {
    return { ok: false, reason: await probeWorkClipFailure(userId, studyId, slug) };
  }

  for (let attempt = 0; attempt < POSITION_RETRIES; attempt++) {
    const anchors = await readAnchors(userId, studyId, {});
    if (anchors === 'anchor_not_found') return { ok: false, reason: 'study_not_found' };
    const positions = positionsAfterForAttempt(anchors.a, unitKeys.length, attempt);
    const placed = unitKeys.map((k, i) => ({ k, p: positions[i]! }));
    try {
      const [rows] = await runAsUser(userId, (sql) => [
        sql`INSERT INTO study_blocks (study_id, user_id, position, kind,
                                      section_id, work_slug, ordinal, quote, attribution)
            SELECT ${studyId}, ${userId}, v.pos, 'clipping',
                   (array_agg(s.id ORDER BY s.ordinal))[1],
                   max(src.slug),
                   min(s.ordinal),
                   string_agg(s.body, E'\n\n' ORDER BY s.ordinal),
                   jsonb_strip_nulls(jsonb_build_object(
                     'author', max(src.author), 'work_title', max(src.title),
                     'reference', (array_agg(s.heading ORDER BY s.ordinal))[1]))
            FROM sections s
            JOIN sources src ON src.id = s.source_id
            JOIN (SELECT (e->>'k')::int AS unit_key, e->>'p' AS pos
                  FROM jsonb_array_elements(${JSON.stringify(placed)}::jsonb) e) v
              ON v.unit_key = COALESCE(s.unit_ordinal, -s.ordinal)
            WHERE src.slug = ${slug} AND src.status = 'published'
              AND (s.source_url IS NULL OR NOT EXISTS (
                     SELECT 1 FROM unnest(${FORBIDDEN_PROVENANCE_DOMAINS}::text[]) d
                     WHERE lower(s.source_url) LIKE '%' || d || '%'))
              AND EXISTS (SELECT 1 FROM studies st WHERE st.id = ${studyId} AND st.user_id = ${userId} AND st.deleted_at IS NULL)
            GROUP BY v.unit_key, v.pos
            RETURNING id`,
        sql`UPDATE studies SET updated_at = now()
            WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
      ]);
      const inserted = (rows as unknown[]).length;
      if (inserted > 0) return { ok: true, inserted };
      return { ok: false, reason: await probeWorkClipFailure(userId, studyId, slug) };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return { ok: false, reason: 'position_conflict' };
}

// ── failure probes — 0 rows means "not owned or not servable"; these say which, so the route
// can return an accurate code instead of the blanket-401 pattern this repo already knows is a
// defect. Probes run AFTER the write (never as its gate) and are plain reads.

async function probeSectionClipFailure(
  userId: string,
  studyId: string,
  sectionId: number,
): Promise<'study_not_found' | 'source_not_found' | 'not_servable'> {
  const [studyRows, sectionRows] = await runAsUser(userId, (sql) => [
    sql`SELECT 1 AS ok FROM studies WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
    sql`SELECT 1 AS ok FROM sections WHERE id = ${sectionId}`,
  ]);
  if ((studyRows as unknown[]).length === 0) return 'study_not_found';
  if ((sectionRows as unknown[]).length === 0) return 'source_not_found';
  return 'not_servable';
}

async function probeEmbeddingClipFailure(
  userId: string,
  studyId: string,
  sourceId: string,
  chunkIndex?: number,
): Promise<'study_not_found' | 'source_not_found' | 'not_servable'> {
  const [studyRows, embRows] = await runAsUser(userId, (sql) => [
    sql`SELECT 1 AS ok FROM studies WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
    // `user_id IS NULL` (D8): this was the ONE `FROM embeddings` read of fifteen without the
    // plane fence, so a USER-owned row with a corpus-shaped key made the probe answer
    // 'not_servable' — asserting a corpus source exists where the corpus plane holds nothing.
    // Deliberately NOT `AND served`, mirroring the sections sibling above (which carries no
    // status gate): the probe distinguishes "exists" from "servable", and gating it on `served`
    // would collapse every unserved source into 'source_not_found'.
    sql`SELECT 1 AS ok FROM embeddings
        WHERE source_type = split_part(${sourceId}, ':', 1) AND source_id = ${sourceId}
          AND (${chunkIndex ?? null}::int IS NULL OR chunk_index = ${chunkIndex ?? null}::int)
          AND user_id IS NULL
        LIMIT 1`,
  ]);
  if ((studyRows as unknown[]).length === 0) return 'study_not_found';
  if ((embRows as unknown[]).length === 0) return 'source_not_found';
  return 'not_servable';
}

async function probeWorkClipFailure(
  userId: string,
  studyId: string,
  slug: string,
): Promise<'study_not_found' | 'work_not_found' | 'work_empty'> {
  const [studyRows, workRows] = await runAsUser(userId, (sql) => [
    sql`SELECT 1 AS ok FROM studies WHERE id = ${studyId} AND user_id = ${userId} AND deleted_at IS NULL`,
    sql`SELECT status FROM sources WHERE slug = ${slug}`,
  ]);
  if ((studyRows as unknown[]).length === 0) return 'study_not_found';
  if ((workRows as unknown[]).length === 0) return 'work_not_found';
  // The work exists but yielded no clean units — staged/quarantined, or nothing servable in it.
  return 'work_empty';
}
