// Suggested readings — the corpus searched EXACTLY, one category at a time, largest first.
//
// docs/SUGGESTED_READINGS_DESIGN.md. Owner ruling 2026-08-06: accuracy over speed, ~90s is fine.
//
// ── WHY THIS DOES NOT USE THE VECTOR INDEX ──────────────────────────────────────────────────────
// It starves. Measured against production on 398,113 served rows:
//
//     LIMIT 60, unfiltered, hnsw.ef_search=40 (the default)   ->  21 of 60 rows,     89ms
//     the same with a category filter                          ->   0 of 60 rows,     83ms
//     ef_search=200                                            ->  60 of 60,       2,634ms
//     ef_search=800                                            ->  60 of 60,       7,439ms  (max 1000)
//
// The index walks a candidate list, the filter rejects nearly all of it, and the scan gives up
// short — quietly, with a plausible-looking answer, which is why the first cut of this feature
// shipped starving and looked fine. Turning the index OFF removes the failure mode rather than
// tuning around it: an exact scan over one category is the TRUE top-k, with no `ef` to get wrong.
//
// Exact cost, measured cold, top-40 per category: poetry 0.4s · hymns 1.3s · theology 1.8s ·
// sermons 2.1s · commentaries 28.6s. ~49s for all five. That is why this is a queued job.
//
// ── ONE AT A TIME, LARGEST FIRST ────────────────────────────────────────────────────────────────
// Owner's instruction, and it is also the right order for the progress bar: the expensive category
// finishes first, so the bar's early movement is its slowest part and everything after it is fast.
// Sequential rather than parallel because five concurrent index-free scans over 342k rows would
// contend for the same buffers and make the total worse, not better.

import { runAsUser } from '@/lib/db';
import { EMBEDDING_DB_SLUG, isJoinable } from './model';
import type { CorpusPredicate } from './tradition-gap';

/** The user-facing categories, in the order they are searched: largest corpus first. */
export const READING_CATEGORIES = [
  { id: 'sermons', label: 'Sermons', types: ['sermon'] },
  { id: 'commentaries', label: 'Commentaries', types: ['commentary', 'father'] },
  { id: 'theology', label: 'Theology & Creeds', types: ['theology', 'confession'] },
  { id: 'hymns', label: 'Hymns', types: ['hymn'] },
  { id: 'poetry', label: 'Poetry', types: ['poetry'] },
] as const;

export type ReadingCategoryId = (typeof READING_CATEGORIES)[number]['id'];

/**
 * The default set. Deliberately NOT everything: defaulting to all five makes every upload a
 * ~49-second job for someone who never asked for poetry. These three are what a preacher reaches
 * for first, and the picker is one click away.
 */
export const DEFAULT_CATEGORIES: ReadingCategoryId[] = ['sermons', 'commentaries', 'theology'];

/** Historians is deliberately absent: it is a first-class sidebar catalog with ZERO served rows
 *  behind it (measured 2026-08-06), so offering it would be offering an empty box. */

export const ALL_CATEGORY_IDS = READING_CATEGORIES.map((c) => c.id) as ReadingCategoryId[];

/** Per category, how many works to keep. Bounded output, per CLAUDE.md — never an unbounded set. */
const PER_CATEGORY = 8;
/** Rows examined per category before de-duplication by author+work. */
const CANDIDATES = 60;

export function isReadingCategory(s: string): s is ReadingCategoryId {
  return (ALL_CATEGORY_IDS as string[]).includes(s);
}

/** Only ever the app's own ids reach SQL; anything else is dropped rather than passed through. */
export function sanitiseCategories(input: unknown): ReadingCategoryId[] {
  if (!Array.isArray(input)) return [];
  const out = input.filter((s): s is string => typeof s === 'string').filter(isReadingCategory);
  return [...new Set(out)];
}

export interface ReadingRow {
  category: ReadingCategoryId;
  author: string;
  work: string;
  workTitle: string | null;
  tradition: string | null;
  similarity: number;
}

export interface ReadingsProgress {
  /** 0-100, weighted by each category's ROW COUNT so the bar reflects work, not step count. */
  percent: number;
  /** The category being searched now, for a bar that names what it is doing. */
  step: string | null;
}

type ProgressFn = (p: ReadingsProgress) => Promise<void>;

/**
 * Run the whole search for one document, writing progress as each category completes.
 *
 * PARITY IS ENFORCED (§6): the centroid is built only from rows whose `model_slug` names the
 * corpus's model, and a mismatch throws rather than returning a plausible list. A cross-model
 * cosine returns garbage with no error — the one failure here that never announces itself.
 */
export async function computeSuggestedReadings(
  userId: string,
  documentId: string,
  categories: ReadingCategoryId[],
  predicate: CorpusPredicate,
  onProgress: ProgressFn,
): Promise<ReadingRow[]> {
  if (categories.length === 0) return [];

  const [modelRows] = await runAsUser(userId, (sql) => [
    sql`SELECT DISTINCT ue.model_slug FROM user_section_embeddings ue
          JOIN user_sections s ON s.id = ue.section_id
         WHERE ue.user_id = ${userId} AND s.document_id = ${documentId}`,
  ]);
  const slugs = (modelRows as { model_slug: string }[]).map((r) => r.model_slug);
  if (slugs.length === 0) return [];
  const bad = slugs.find((s) => !isJoinable(s, EMBEDDING_DB_SLUG));
  if (bad) throw new Error(`embedding model mismatch: user rows are "${bad}", corpus is "${EMBEDDING_DB_SLUG}"`);

  const [centroidRows] = await runAsUser(userId, (sql) => [
    sql`SELECT AVG(ue.embedding)::vector AS v
          FROM user_section_embeddings ue
          JOIN user_sections s ON s.id = ue.section_id
         WHERE ue.user_id = ${userId} AND s.document_id = ${documentId}
           AND ue.model_slug = ${EMBEDDING_DB_SLUG}`,
  ]);
  const centroid = (centroidRows as { v: string | null }[])[0]?.v;
  if (!centroid) return [];

  const ordered = READING_CATEGORIES.filter((c) => categories.includes(c.id));

  // Weights from the ACTUAL row counts, read once, rather than from constants that drift as the
  // corpus grows. ~200ms, and it is what makes the percentage mean something.
  const weights = new Map<ReadingCategoryId, number>();
  for (const cat of ordered) {
    const [rows] = await runAsUser(userId, (sql) => [
      sql`SELECT count(*)::int AS n
            FROM embeddings e
           WHERE e.user_id IS NULL
             AND e.metadata->>'work' IN (SELECT slug FROM sources WHERE source_type = ANY(${cat.types as unknown as string[]}))`,
    ]);
    weights.set(cat.id, Math.max(1, (rows as { n: number }[])[0]?.n ?? 1));
  }
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);

  const found: ReadingRow[] = [];
  let done = 0;

  for (const cat of ordered) {
    await onProgress({ percent: Math.round((done / totalWeight) * 100), step: cat.label });

    const [rows] = await runAsUser(userId, (sql) => [
      // enable_indexscan=off is the whole point: it forces the exact scan. SET LOCAL, so it lasts
      // only for this transaction and cannot leak into any other query on the pooled connection.
      sql`SET LOCAL enable_indexscan = off`,
      sql.query(
        `WITH near AS (
           SELECT e.metadata->>'author'    AS author,
                  e.metadata->>'work'      AS work,
                  e.metadata->>'tradition' AS tradition,
                  1 - (e.embedding <=> $1::vector) AS sim
             FROM embeddings e
            WHERE e.user_id IS NULL
              AND e.metadata->>'author' IS NOT NULL
              AND ${predicate}
              AND e.metadata->>'work' IN (SELECT slug FROM sources WHERE source_type = ANY($2))
            ORDER BY e.embedding <=> $1::vector
            LIMIT ${CANDIDATES}
         ), best AS (
           SELECT DISTINCT ON (author, work) author, work, tradition, sim
             FROM near ORDER BY author, work, sim DESC
         )
         SELECT b.author, b.work, b.tradition, b.sim, s.title AS work_title
           FROM best b LEFT JOIN sources s ON s.slug = b.work
          ORDER BY b.sim DESC
          LIMIT ${PER_CATEGORY}`,
        [centroid, cat.types as unknown as string[]],
      ),
    ]);

    for (const r of rows as { author: string; work: string; tradition: string | null; sim: number; work_title: string | null }[]) {
      found.push({
        category: cat.id,
        author: r.author,
        work: r.work,
        workTitle: r.work_title,
        tradition: r.tradition,
        similarity: Number(r.sim),
      });
    }

    done += weights.get(cat.id) ?? 0;
    await onProgress({ percent: Math.round((done / totalWeight) * 100), step: cat.label });
  }

  return found;
}
