// Cross-corpus full-text search over `sections` (docs/LIBRARY_READER_DESIGN.md §5). This is the
// sermon search: the same engine serves per-catalog search, in-work search, and the cross-corpus
// case. Built on the `commentary-search.ts` pattern — `ts_headline` snippets, a CAPPED count, and
// a hard LIMIT — because those are the properties that keep it honest at corpus scale.
//
// Three properties are load-bearing; each has a test that can fail.
//
// 1. PUBLISHED-ONLY (test/invariants/library-published-boundary.test.ts).
//    A plain FK cannot express "only while published", so this query re-asserts
//    `s.status = 'published'` itself. Without it, search is a door onto works that were staged or
//    quarantined after ingest — a licensing exposure, since the withdrawal would not withdraw.
//
// 2. DEDUPED TO READING UNITS (test/invariants/search-sections.test.ts).
//    `sections` is the RETRIEVAL unit — embedding-sized chunks. Calvin's Institutes is 3,448 of
//    them across 103 reading units. Searching raw sections returns twenty hits from one chapter and
//    buries every other work; the result list stops being an index and becomes a concordance of one
//    paragraph. `unit_ordinal` (ADR-026) makes the fix mechanical: DISTINCT ON (source, unit) keeps
//    the BEST-ranked chunk per reading unit, so one unit contributes one row.
//    NULL-guard: `COALESCE(unit_ordinal, -ordinal)` — Postgres treats NULLs as EQUAL in DISTINCT
//    ON, so pre-024 rows with a NULL unit would otherwise collapse a whole work into a single hit.
//    (Every row on dev is populated today; this is the guard for data that predates the column.)
//
// 3. TYPE-LABELLED (test/invariants/register-wall-surfaces.test.ts).
//    Every row carries its `sourceType`. Cross-corpus search is a NEW DOOR onto sermon/hymn/poetry
//    content, and the register wall says that content may never be presented as exegesis. The
//    caller cannot honour the wall if the row does not say what register it came from, so the
//    field is non-optional.

import { getDb } from './db';
import { typesFor, type CatalogId } from './catalog';

export interface SectionSearchResult {
  slug: string;
  title: string;
  author: string | null;
  /** The register this hit came from. Non-optional: the caller MUST be able to label it. */
  sourceType: string;
  tradition: string | null;
  /** Deep-link target: /work/{slug}#s{ordinal}. */
  ordinal: number;
  unitOrdinal: number | null;
  heading: string | null;
  snippet: string;
  rank: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Upper bound on the reported match count — never an unbounded aggregate scan (CLAUDE.md).
 *  The UI renders "N+" when the cap is hit. */
const COUNT_CAP = 1000;

export async function searchSections(opts: {
  query: string;
  /** Restrict to a catalog's types (the register fence). */
  catalog?: CatalogId;
  subFilter?: string;
  /** Restrict to ONE work — the in-work search case. */
  sourceSlug?: string;
  tradition?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: SectionSearchResult[]; total: number; totalCapped: boolean }> {
  const q = opts.query.trim();
  if (!q) return { results: [], total: 0, totalCapped: false };

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, opts.offset ?? 0);
  const types = opts.catalog ? [...typesFor(opts.catalog, opts.subFilter)] : null;
  const slug = opts.sourceSlug ?? null;
  const tradition = opts.tradition ?? null;
  const sql = getDb();

  // Shared predicate. `status='published'` first: it is the licensing boundary, not a filter.
  const WHERE = `
      sec.tsv @@ websearch_to_tsquery('english', $1)
      AND s.status = 'published'
      AND ($2::text[] IS NULL OR s.source_type = ANY($2::text[]))
      AND ($3::text IS NULL OR s.slug = $3)
      AND ($4::text IS NULL OR s.tradition = $4)`;

  const [results, countRows] = await Promise.all([
    // SNIPPET LAST, deliberately. ts_headline re-parses the whole document, and computing it
    // inside the dedupe subquery meant paying it for EVERY match before the LIMIT threw them away:
    // measured on 'grace' in the sermons catalog (27,738 matching sections) — dedupe+rank alone
    // 219ms, the same query with ts_headline inside 3,781ms (17x). Cross-corpus terms were 20s+ in
    // the browser, which is not a usable search. So: rank and page FIRST on the cheap columns, then
    // join back and compute snippets for only the <=100 rows actually being returned.
    sql.query(
      `WITH ranked AS (
         SELECT DISTINCT ON (sec.source_id, COALESCE(sec.unit_ordinal, -sec.ordinal))
                sec.id, ts_rank_cd(sec.tsv, websearch_to_tsquery('english', $1)) AS rank
         FROM sections sec
         JOIN sources s ON s.id = sec.source_id
         WHERE ${WHERE}
         ORDER BY sec.source_id,
                  COALESCE(sec.unit_ordinal, -sec.ordinal),
                  ts_rank_cd(sec.tsv, websearch_to_tsquery('english', $1)) DESC,
                  sec.ordinal
       ), page AS (
         SELECT id, rank FROM ranked ORDER BY rank DESC, id LIMIT $5 OFFSET $6
       )
       SELECT s.slug, s.title, s.author, s.source_type AS "sourceType", s.tradition,
              sec.ordinal, sec.unit_ordinal AS "unitOrdinal", sec.heading,
              ts_headline('english', sec.body, websearch_to_tsquery('english', $1),
                'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet,
              page.rank
       FROM page
       JOIN sections sec ON sec.id = page.id
       JOIN sources s ON s.id = sec.source_id
       ORDER BY page.rank DESC, s.slug, sec.ordinal`,
      [q, types, slug, tradition, limit, offset],
    ),
    // Count DISTINCT reading units, capped. Counting sections here would report "312 results" for
    // what the list shows as 14 works — the number has to mean the same thing the list shows.
    sql.query(
      `SELECT count(*)::int AS total FROM (
         SELECT DISTINCT sec.source_id, COALESCE(sec.unit_ordinal, -sec.ordinal) AS unit
         FROM sections sec
         JOIN sources s ON s.id = sec.source_id
         WHERE ${WHERE}
         LIMIT ${COUNT_CAP}
       ) capped`,
      [q, types, slug, tradition],
    ),
  ]);

  const total = (countRows as unknown as { total: number }[])[0]?.total ?? 0;
  return {
    results: results as unknown as SectionSearchResult[],
    total,
    totalCapped: total >= COUNT_CAP,
  };
}
