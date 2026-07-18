import { getDb } from './db';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from './legal-corpus';
import { EXEGETICAL_FTS_EXCLUSION } from './teacher/routing';

export interface CommentarySearchResult {
  id: number;
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
  year: number | null;
  tradition: string | null;
  source_title: string;
  snippet: string;
  rank: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
/** Upper bound on the reported match count. A common word matches tens of thousands of
 *  legal rows; nobody pages past this, and counting further is wasted work. When the cap
 *  is hit the UI shows "N+". */
const COUNT_CAP = 1000;

export async function searchCommentaries(opts: {
  query: string;
  book?: number;
  tradition?: string;
  author?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: CommentarySearchResult[]; total: number; totalCapped: boolean }> {
  const q = opts.query.trim();
  if (!q) return { results: [], total: 0, totalCapped: false };

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, opts.offset ?? 0);
  const sql = getDb();

  const book = opts.book ?? null;
  const tradition = opts.tradition ?? null;
  const author = opts.author ?? null;

  const [results, countRows] = await Promise.all([
    sql.query(
      `SELECT
        id, book, chapter, verse_start, verse_end,
        author, year, tradition, source_title,
        ts_headline('english', body, websearch_to_tsquery('english', $1),
          'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet,
        ts_rank_cd(tsv, websearch_to_tsquery('english', $1)) AS rank
      FROM commentary_entries
      WHERE tsv @@ websearch_to_tsquery('english', $1)
        AND (${LEGAL_COMMENTARY_ENTRIES_PREDICATE})
        AND (${EXEGETICAL_FTS_EXCLUSION})
        AND ($2::smallint IS NULL OR book = $2)
        AND ($3::text IS NULL OR tradition = $3)
        AND ($4::text IS NULL OR author = $4)
      ORDER BY rank DESC
      LIMIT $5
      OFFSET $6`,
      [q, book, tradition, author, limit, offset],
    ),
    // Count is CAPPED at COUNT_CAP (never an unbounded aggregate scan — CLAUDE.md
    // "never return unbounded result sets"). A common word ("God") matches ~28k legal
    // rows; the UI only needs "how many, roughly" for a "Load more (X of Y)" label, so
    // we stop counting at the cap and render "N+" when it's hit. The inner LIMIT lets
    // Postgres stop scanning the partial index early.
    sql.query(
      `SELECT count(*)::int AS total FROM (
        SELECT 1
        FROM commentary_entries
        WHERE tsv @@ websearch_to_tsquery('english', $1)
          AND (${LEGAL_COMMENTARY_ENTRIES_PREDICATE})
          AND (${EXEGETICAL_FTS_EXCLUSION})
          AND ($2::smallint IS NULL OR book = $2)
          AND ($3::text IS NULL OR tradition = $3)
          AND ($4::text IS NULL OR author = $4)
        LIMIT ${COUNT_CAP}
      ) capped`,
      [q, book, tradition, author],
    ),
  ]);

  const total = (countRows as unknown as { total: number }[])[0]?.total ?? 0;
  return {
    results: results as unknown as CommentarySearchResult[],
    total,
    totalCapped: total >= COUNT_CAP,
  };
}
