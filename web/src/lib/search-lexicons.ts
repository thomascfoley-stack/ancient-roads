// The LEXICONS group of the merged search surface (docs/STUDY_DOCS_DESIGN.md §7.3).
//
// ── WHY THIS IS NOT searchSections ──────────────────────────────────────────────────────────
// The catalog fence (catalog-defs.ts) keeps `lexicon` out of every catalog BY DESIGN — "lexicon
// belongs to Word Study, which is its own existing surface" — so the fence's `catalog`/`catalogs`
// options cannot express the Lexicons group, and adding a lexicons catalog would change the
// sidebar and the register-wall taxonomy (neither is this stream's to change). §7.3 nevertheless
// names Lexicons as a corpus group. This module is the resolution: the SAME query pattern as
// search-sections.ts, pinned to source_type 'lexicon'. It is a sibling of the fence, never a
// widening of it — the type is a literal here, so no caller input can broaden it.
//
// The three load-bearing properties are re-asserted, not inherited:
//   1. PUBLISHED-ONLY + the serve-time forbidden-provenance belt (search-sections.ts H6);
//   2. DEDUPED TO READING UNITS (unit_ordinal, with the NULL-guard);
//   3. TYPE-LABELLED — every row selects its source_type, so the register label on the row is
//      data, not a constant the UI hopes is right (S-5).
// And the group is its OWN capped query (S-12): a lexicon hit is never a truncation artefact of
// a higher-ranked commentary's page.

import { getDb } from './db';
import { FORBIDDEN_PROVENANCE_DOMAINS } from './forbidden-provenance.mjs';
import type { SectionSearchResult } from './search-sections';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const COUNT_CAP = 1000;
const MAX_OFFSET = 100_000;

export async function searchLexicons(opts: {
  query: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: SectionSearchResult[]; total: number; totalCapped: boolean }> {
  const q = opts.query.trim();
  if (!q) return { results: [], total: 0, totalCapped: false };

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.min(Math.max(0, opts.offset ?? 0), MAX_OFFSET);
  const sql = getDb();

  // Two parameter numberings, one predicate text (the search-sections.ts pattern): an UNUSED
  // bound parameter is a Postgres error (42P18, "could not determine data type"), so the count
  // query cannot simply reuse the page query's slots.
  const whereWith = (forbiddenParam: string) => `
      sec.tsv @@ websearch_to_tsquery('english', $1)
      AND s.status = 'published'
      AND s.source_type = 'lexicon'
      AND (sec.source_url IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(${forbiddenParam}::text[]) d
             WHERE lower(sec.source_url) LIKE '%' || d || '%'))`;
  const WHERE = whereWith('$3');        // page query binds [q, limit, FORBIDDEN, offset]
  const WHERE_COUNT = whereWith('$2');  // count query binds [q, FORBIDDEN]

  const [results, countRows] = await Promise.all([
    // Snippet LAST, same as the engine: rank and page on the cheap columns, ts_headline only
    // for the rows actually returned (the 17x lesson is documented in search-sections.ts).
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
         SELECT id, rank FROM ranked ORDER BY rank DESC, id LIMIT $2 OFFSET $4
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
      [q, limit, FORBIDDEN_PROVENANCE_DOMAINS, offset],
    ),
    sql.query(
      `SELECT count(*)::int AS total FROM (
         SELECT DISTINCT sec.source_id, COALESCE(sec.unit_ordinal, -sec.ordinal) AS unit
         FROM sections sec
         JOIN sources s ON s.id = sec.source_id
         WHERE ${WHERE_COUNT}
         LIMIT ${COUNT_CAP}
       ) capped`,
      [q, FORBIDDEN_PROVENANCE_DOMAINS],
    ),
  ]);

  const total = (countRows as unknown as { total: number }[])[0]?.total ?? 0;
  return {
    results: results as unknown as SectionSearchResult[],
    total,
    totalCapped: total >= COUNT_CAP,
  };
}
