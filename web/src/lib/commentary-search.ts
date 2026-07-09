import { getDb } from './db';

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

export async function searchCommentaries(opts: {
  query: string;
  book?: number;
  tradition?: string;
  author?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: CommentarySearchResult[]; total: number }> {
  const q = opts.query.trim();
  if (!q) return { results: [], total: 0 };

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, opts.offset ?? 0);
  const sql = getDb();

  const [results, countRows] = await Promise.all([
    sql`
      SELECT
        id, book, chapter, verse_start, verse_end,
        author, year, tradition, source_title,
        ts_headline('english', body, websearch_to_tsquery('english', ${q}),
          'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet,
        ts_rank_cd(tsv, websearch_to_tsquery('english', ${q})) AS rank
      FROM commentary_entries
      WHERE tsv @@ websearch_to_tsquery('english', ${q})
        AND (${opts.book ?? null}::smallint IS NULL OR book = ${opts.book ?? null})
        AND (${opts.tradition ?? null}::text IS NULL OR tradition = ${opts.tradition ?? null})
        AND (${opts.author ?? null}::text IS NULL OR author = ${opts.author ?? null})
      ORDER BY rank DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql`
      SELECT count(*)::int AS total
      FROM commentary_entries
      WHERE tsv @@ websearch_to_tsquery('english', ${q})
        AND (${opts.book ?? null}::smallint IS NULL OR book = ${opts.book ?? null})
        AND (${opts.tradition ?? null}::text IS NULL OR tradition = ${opts.tradition ?? null})
        AND (${opts.author ?? null}::text IS NULL OR author = ${opts.author ?? null})
    `,
  ]);

  return {
    results: results as unknown as CommentarySearchResult[],
    total: (countRows as unknown as { total: number }[])[0]?.total ?? 0,
  };
}
