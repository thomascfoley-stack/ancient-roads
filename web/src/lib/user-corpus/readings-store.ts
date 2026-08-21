// Storage for suggested readings: the job's only writer, and the card's only reader.
//
// Kept apart from `suggested-readings.ts` (which searches) so the expensive scan and the rows it
// produces are not one module: the job can be re-run, replaced, or measured without touching how
// the answer is stored, and the card's count never depends on the search being importable.

import { runAsUser } from '@/lib/db';
import type { ReadingCategoryId, ReadingRow } from './suggested-readings';

export type ReadingsStatus = 'pending' | 'running' | 'ready' | 'failed';

export interface ReadingsState {
  status: ReadingsStatus | null;
  progress: number;
  step: string | null;
  error: string | null;
  doneAt: string | null;
  categories: ReadingCategoryId[] | null;
  count: number;
}

export async function setReadingsState(
  userId: string,
  documentId: string,
  patch: { status?: ReadingsStatus; progress?: number; step?: string | null; error?: string | null; doneAt?: boolean },
): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents SET
          readings_status   = COALESCE(${patch.status ?? null}, readings_status),
          readings_progress = COALESCE(${patch.progress ?? null}::smallint, readings_progress),
          readings_step     = ${patch.step === undefined ? null : patch.step},
          readings_error    = ${patch.error === undefined ? null : patch.error},
          readings_done_at  = CASE WHEN ${patch.doneAt ?? false} THEN now() ELSE readings_done_at END,
          updated_at        = now()
        WHERE user_id = ${userId} AND id = ${documentId}`,
  ]);
}

/**
 * Atomically claim the start of a readings run — the compare-and-set half of the H8 fix.
 *
 * `readingsStartRefused` reads then the route writes, so two SAME-INSTANT posts could both pass
 * the read before either write landed (the read-guard closes back-to-back, not simultaneous).
 * This is ONE statement: it flips to 'pending' only if no live pending/running run holds the
 * document, and returns whether it won. The route keeps the read-guard for the cheap early 409
 * with its human message; this is the belt that makes the winner singular.
 */
export async function claimReadingsStart(userId: string, documentId: string, staleMs: number): Promise<boolean> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents SET
          readings_status = 'pending', readings_progress = 0, readings_step = NULL,
          readings_error = NULL, updated_at = now()
        WHERE user_id = ${userId} AND id = ${documentId}
          AND NOT (readings_status IN ('pending', 'running')
                   AND updated_at > now() - (${Math.floor(staleMs / 1000)} || ' seconds')::interval)
        RETURNING id`,
  ]);
  return (rows as unknown[]).length > 0;
}

export async function setSearchCategories(
  userId: string,
  documentId: string,
  categories: ReadingCategoryId[],
): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents SET search_categories = ${categories as unknown as string[]}, updated_at = now()
         WHERE user_id = ${userId} AND id = ${documentId}`,
  ]);
}

/**
 * Replace a document's readings in ONE transaction.
 *
 * Delete-then-insert, not upsert: a re-run with fewer categories must not leave the old
 * categories' rows behind, which would show a reader results from a search they had switched off.
 */
export async function replaceReadings(userId: string, documentId: string, rows: ReadingRow[]): Promise<void> {
  await runAsUser(userId, (sql) => {
    const stmts = [
      sql`DELETE FROM user_document_readings WHERE user_id = ${userId} AND document_id = ${documentId}`,
    ];
    for (const r of rows) {
      stmts.push(sql`
        INSERT INTO user_document_readings (document_id, user_id, category, author, work, work_title, tradition, similarity)
        VALUES (${documentId}, ${userId}, ${r.category}, ${r.author}, ${r.work}, ${r.workTitle}, ${r.tradition}, ${r.similarity})
        ON CONFLICT (document_id, category, author, work) DO UPDATE
          SET similarity = EXCLUDED.similarity, work_title = EXCLUDED.work_title, tradition = EXCLUDED.tradition`);
    }
    return stmts;
  });
}

export async function readingsState(userId: string, documentId: string): Promise<ReadingsState | null> {
  const [docRows, countRows] = await runAsUser(userId, (sql) => [
    sql`SELECT readings_status, readings_progress, readings_step, readings_error,
               readings_done_at, search_categories
          FROM user_documents WHERE user_id = ${userId} AND id = ${documentId}`,
    sql`SELECT count(*)::int AS n FROM user_document_readings
         WHERE user_id = ${userId} AND document_id = ${documentId}`,
  ]);
  const d = (docRows as {
    readings_status: ReadingsStatus | null; readings_progress: number; readings_step: string | null;
    readings_error: string | null; readings_done_at: Date | null; search_categories: string[] | null;
  }[])[0];
  if (!d) return null;
  return {
    status: d.readings_status,
    progress: d.readings_progress ?? 0,
    step: d.readings_step,
    error: d.readings_error,
    doneAt: d.readings_done_at ? d.readings_done_at.toISOString() : null,
    categories: (d.search_categories as ReadingCategoryId[] | null),
    count: (countRows as { n: number }[])[0]?.n ?? 0,
  };
}

export async function listReadings(userId: string, documentId: string): Promise<ReadingRow[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT category, author, work, work_title, tradition, similarity
          FROM user_document_readings
         WHERE user_id = ${userId} AND document_id = ${documentId}
         ORDER BY similarity DESC
         LIMIT 100`,
  ]);
  return (rows as { category: ReadingCategoryId; author: string; work: string; work_title: string | null; tradition: string | null; similarity: number }[])
    .map((r) => ({
      category: r.category,
      author: r.author,
      work: r.work,
      workTitle: r.work_title,
      tradition: r.tradition,
      similarity: Number(r.similarity),
    }));
}

/** Counts per document, for the list view — one query, not one per card. */
export async function readingCounts(userId: string, documentIds: string[]): Promise<Map<string, number>> {
  if (documentIds.length === 0) return new Map();
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT document_id, count(*)::int AS n
          FROM user_document_readings
         WHERE user_id = ${userId} AND document_id = ANY(${documentIds})
         GROUP BY document_id`,
  ]);
  return new Map((rows as { document_id: string; n: number }[]).map((r) => [r.document_id, r.n]));
}

/**
 * Should a new readings run be REFUSED because one is already live? (B015)
 *
 * Pure, because the failure it guards is subtle enough to pin: `running` used to refuse
 * unconditionally, and a job killed between its `running` write and any terminal write (the
 * `after()` callback is not guaranteed past a platform recycle) left the document refusing
 * restarts forever. `updatedAtIso` is the heartbeat — every setReadingsState touches it, including
 * per-category progress, so a live run advances it at least every ~10s against a 10-minute bar.
 *
 * FAILS CLOSED ON A CORRUPT TIMESTAMP: an unparseable `updatedAtIso` makes the age NaN, every
 * NaN comparison is false, and the NEGATED form below therefore refuses — a corrupt row reads as
 * "still running", never as "corpse, go ahead". The SQL watchlist's three-valued-logic lesson,
 * applied in TypeScript.
 */
export const READINGS_STALE_MS = 10 * 60_000;
export function readingsRunRefused(
  status: ReadingsStatus | null,
  updatedAtIso: string,
  now: number,
): boolean {
  if (status !== 'running') return false;
  return liveWithinStaleWindow(updatedAtIso, now);
}

/**
 * Should a POST refuse to START a new run? (2026-08-20 uploader deep dive, H8)
 *
 * `readingsRunRefused` above rejects a live `running`; this widens the refusal to a live
 * `pending` — the state the route itself writes BEFORE kicking the job, so back-to-back POSTs
 * all passed the narrower guard and each ran the full ~300 s unindexed corpus scan. The route
 * must call THIS predicate; the narrower one remains for the running arm's pinned decision table.
 *
 * The staleness escape applies to `pending` for `running`'s own reason, one state earlier: a
 * kick that died between the `pending` write and the job's first `running` write (`after()` is
 * not guaranteed past a platform recycle) leaves `pending` as a corpse — nothing touches
 * `updated_at` again — and refusing it forever would brick the document exactly as B015 did.
 * The corrupt-timestamp behaviour is inherited from the shared helper: NaN refuses.
 */
export function readingsStartRefused(
  status: ReadingsStatus | null,
  updatedAtIso: string,
  now: number,
): boolean {
  if (status === 'pending') return liveWithinStaleWindow(updatedAtIso, now);
  return readingsRunRefused(status, updatedAtIso, now);
}

/**
 * FAILS CLOSED ON A CORRUPT TIMESTAMP: an unparseable `updatedAtIso` makes the age NaN, every
 * NaN comparison is false, and the NEGATED form therefore reads as "live" — a corrupt row
 * refuses a new run, never green-lights a double one. The SQL watchlist's three-valued-logic
 * lesson, applied in TypeScript.
 */
function liveWithinStaleWindow(updatedAtIso: string, now: number): boolean {
  const age = now - new Date(updatedAtIso).getTime();
  return !(age > READINGS_STALE_MS);
}
