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
