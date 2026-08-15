// The PERSONAL side of the merged search surface (docs/STUDY_DOCS_DESIGN.md §6.4): one scoped,
// capped query per domain — studies, prayers, notes — never one ranking blended with the corpus
// (F5). "Your works" is NOT here: it is served by the existing user-corpus search
// (`keywordSearch`, the same function /api/user-corpus/search?mode=keyword calls), reused from
// the page rather than re-implemented.
//
// Every query runs through runAsUser with the audited H1 belt (explicit user_id on every read),
// soft-deletes excluded, ts_headline snippets where a tsv exists, capped counts, hard LIMITs —
// the search-sections.ts properties, at user-content scale.
//
// ── RECORDED DEVIATION (W5): prayers and notes have NO tsv columns ──────────────────────────
// §6.4 sketches "a generated tsvector + GIN on body … two tiny migrations". Those migrations do
// not exist (prayers is migration 107, notes predates it; neither has a tsv), and the W5 brief
// forbids writing migrations. So prayers/notes search is plain ILIKE with the pattern escaped
// (escapeLike), a hard LIMIT, and a substring-window snippet instead of ts_headline. Ranking is
// recency, not relevance — honest at journal scale (per-user, low-thousands of rows), and the
// swap to tsv later is additive: same function signatures, same page.

import { runAsUser } from './db';
import { escapeLike } from './search-groups';

// Bounds mirror search-sections.ts / user-corpus/search.ts (each bound is a documented scar
// there). The count cap means the UI renders "N+" exactly like the corpus groups do.
export const PERSONAL_DEFAULT_LIMIT = 20;
export const PERSONAL_MAX_LIMIT = 100;
export const PERSONAL_MAX_OFFSET = 100_000;
export const PERSONAL_COUNT_CAP = 1000;

const clampLimit = (n: number | undefined) =>
  Math.min(PERSONAL_MAX_LIMIT, Math.max(1, Math.trunc(Number.isFinite(n) ? (n as number) : PERSONAL_DEFAULT_LIMIT)));
const clampOffset = (n: number | undefined) =>
  Math.min(PERSONAL_MAX_OFFSET, Math.max(0, Math.trunc(Number.isFinite(n) ? (n as number) : 0)));

export interface PersonalPage<T> {
  rows: T[];
  /** Matching rows in this domain, capped at PERSONAL_COUNT_CAP. */
  total: number;
  totalCapped: boolean;
}

export interface StudySearchHit {
  studyId: string;
  title: string;
  /** ts_headline HTML — render ONLY through sanitizeSnippet. */
  snippet: string;
}

export interface PrayerSearchHit {
  id: string;
  /** Plain text (ILIKE window), never HTML — render as text. */
  snippet: string;
  createdAt: string;
}

export interface NoteSearchHit {
  id: string;
  verseId: number;
  /** Plain text (ILIKE window), never HTML — render as text. */
  snippet: string;
  updatedAt: string;
}

/**
 * "Your studies" — one row per STUDY (its best-matching block's snippet), not one row per
 * block: the group answers "which of my docs mention this", and three hits in one doc are one
 * answer. The join to `studies` carries the title AND re-asserts the study's own tombstone, so
 * a soft-deleted study's blocks contribute nothing (S-7). The tsv is migration 110's
 * body+quote+attribution vector, so clippings match on what they quote and who said it, not
 * only on the user's own words.
 */
export async function searchStudies(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PersonalPage<StudySearchHit>> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0, totalCapped: false };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);

  const [pageRows, countRows] = await runAsUser(userId, (sql) => [
    // Rank and dedupe on the cheap columns FIRST; ts_headline runs only for the page's rows
    // (the search-sections.ts lesson: headline inside the dedupe paid 17x on the corpus).
    sql`WITH ranked AS (
          SELECT DISTINCT ON (b.study_id) b.study_id, b.id AS block_id,
                 ts_rank_cd(b.tsv, websearch_to_tsquery('english', ${q})) AS rank
          FROM study_blocks b
          JOIN studies s ON s.id = b.study_id AND s.deleted_at IS NULL
          WHERE b.user_id = ${userId} AND b.deleted_at IS NULL
            AND b.tsv @@ websearch_to_tsquery('english', ${q})
          ORDER BY b.study_id, ts_rank_cd(b.tsv, websearch_to_tsquery('english', ${q})) DESC, b.id
        ), page AS (
          SELECT study_id, block_id, rank FROM ranked ORDER BY rank DESC, study_id LIMIT ${limit} OFFSET ${offset}
        )
        SELECT p.study_id AS "studyId", st.title,
               ts_headline('english',
                 concat_ws(' ', b.body, b.quote, b.attribution->>'work_title', b.attribution->>'author'),
                 websearch_to_tsquery('english', ${q}),
                 'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet
        FROM page p
        JOIN study_blocks b ON b.id = p.block_id
        JOIN studies st ON st.id = p.study_id
        ORDER BY p.rank DESC, p.study_id`,
    sql`SELECT count(*)::int AS total FROM (
          SELECT DISTINCT b.study_id
          FROM study_blocks b
          JOIN studies s ON s.id = b.study_id AND s.deleted_at IS NULL
          WHERE b.user_id = ${userId} AND b.deleted_at IS NULL
            AND b.tsv @@ websearch_to_tsquery('english', ${q})
          LIMIT ${PERSONAL_COUNT_CAP}
        ) capped`,
  ]);
  const total = (countRows as { total: number }[])[0]?.total ?? 0;
  return { rows: pageRows as unknown as StudySearchHit[], total, totalCapped: total >= PERSONAL_COUNT_CAP };
}

/**
 * "Your prayers" (§7.3; the journal keeps its own home — E9 — this is the search-layer
 * unification, not a move). ILIKE fallback: see the header's recorded deviation. Ordered by
 * recency (there is no rank without a tsv); id is the deterministic tiebreak. The snippet is a
 * window around the first literal occurrence, falling back to the head of the body when the
 * escaped pattern's literal isn't found (a pattern metachar the user typed).
 */
export async function searchPrayers(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PersonalPage<PrayerSearchHit>> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0, totalCapped: false };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const pattern = `%${escapeLike(q)}%`;

  const [pageRows, countRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id,
               substring(body from greatest(strpos(lower(body), lower(${q})) - 40, 1) for 280) AS snippet,
               created_at AS "createdAt"
        FROM prayers
        WHERE user_id = ${userId} AND deleted_at IS NULL
          AND body ILIKE ${pattern} ESCAPE '\\'
        ORDER BY created_at DESC, id
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS total FROM (
          SELECT 1 FROM prayers
          WHERE user_id = ${userId} AND deleted_at IS NULL
            AND body ILIKE ${pattern} ESCAPE '\\'
          LIMIT ${PERSONAL_COUNT_CAP}
        ) capped`,
  ]);
  const total = (countRows as { total: number }[])[0]?.total ?? 0;
  return { rows: pageRows as unknown as PrayerSearchHit[], total, totalCapped: total >= PERSONAL_COUNT_CAP };
}

/**
 * "Your notes" (§7.3; notes stay verse-anchored in the reader — E9). Same ILIKE fallback and
 * ordering rationale as prayers; `verseId` is what the row links with (the reader's own
 * verseHref, same as /library/notes).
 */
export async function searchNotes(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PersonalPage<NoteSearchHit>> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0, totalCapped: false };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const pattern = `%${escapeLike(q)}%`;

  const [pageRows, countRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, verse_id AS "verseId",
               substring(body from greatest(strpos(lower(body), lower(${q})) - 40, 1) for 280) AS snippet,
               updated_at AS "updatedAt"
        FROM notes
        WHERE user_id = ${userId} AND deleted_at IS NULL
          AND body ILIKE ${pattern} ESCAPE '\\'
        ORDER BY updated_at DESC, id
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS total FROM (
          SELECT 1 FROM notes
          WHERE user_id = ${userId} AND deleted_at IS NULL
            AND body ILIKE ${pattern} ESCAPE '\\'
          LIMIT ${PERSONAL_COUNT_CAP}
        ) capped`,
  ]);
  const total = (countRows as { total: number }[])[0]?.total ?? 0;
  return { rows: pageRows as unknown as NoteSearchHit[], total, totalCapped: total >= PERSONAL_COUNT_CAP };
}
