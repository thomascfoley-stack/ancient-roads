// Catalog QUERIES. The taxonomy itself lives in `catalog-defs.ts`, which imports nothing.
//
// WHY THE SPLIT (2026-08-01): the sidebar derives its catalog links from CATALOG_IDS, and the
// sidebar is a client component. Importing this module from the client would pull `./db` — and
// with it the Neon driver — into the browser bundle. The taxonomy is a handful of string
// constants and belongs where both sides can read it; the queries stay server-only here.
//
// Re-exported below so every existing `from '@/lib/catalog'` import keeps working unchanged.

import { getDb } from './db';
import { typesFor, type CatalogId } from './catalog-defs';

export * from './catalog-defs';

export interface CatalogWork {
  /** `sources.id`. Carried out of `listCatalogWorks` so the F-158 ordinal lookup on the catalog
   *  page can batch by id instead of re-resolving slug→id per work via `publishedSourceId` —
   *  the pre-batch page issued that lookup once per work (up to PAGE_SIZE), as a separate HTTPS
   *  fetch each. BIGINT; the Neon driver returns it as a string. */
  id: string | number;
  slug: string;
  title: string;
  author: string | null;
  sourceType: string;
  tradition: string | null;
  era: string | null;
  /** Reading units (ADR-026), not raw chunks — "23 sermons", not "300 sections". */
  units: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** Upper bound on the reported work count — never an unbounded aggregate scan (CLAUDE.md).
 *  The UI renders "N+" when the cap is hit, exactly as searchSections does. */
const COUNT_CAP = 1000;
/** Upper bound on `offset`, for the same reason searchSections bounds its own: an unbounded value
 *  reaches `OFFSET $n` and a large/exponential literal is a Postgres error, i.e. a 500 from a URL. */
const MAX_OFFSET = 100_000;

export interface CatalogPage {
  works: CatalogWork[];
  /** Total matching works, capped at COUNT_CAP. */
  total: number;
  totalCapped: boolean;
}

/**
 * One catalog's works. PUBLISHED ONLY, type-fenced, LIMIT-capped, and PAGED.
 *
 * The page was previously a bare `limit: 100` with no offset and no total, so a catalog holding
 * more than 100 published works had no route to the rest and — worse — no indication that a
 * remainder existed. That is the silent-truncation shape this repo's watchlist names: a capped
 * list reads as a complete one. The count makes the cap visible; the offset makes it passable.
 */
export async function listCatalogWorks(opts: {
  catalog: CatalogId;
  subFilter?: string;
  tradition?: string;
  /** Multi-select tradition toggles. Unioned. Empty means unfiltered, never "match nothing". */
  traditions?: readonly string[];
  limit?: number;
  offset?: number;
}): Promise<CatalogPage> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.min(Math.max(0, opts.offset ?? 0), MAX_OFFSET);
  const types = [...typesFor(opts.catalog, opts.subFilter)];
  // Same empty-means-unfiltered rule as searchSections, so the work list and the search below it
  // can never disagree about what a given chip selection means.
  const tradition = opts.traditions?.length
    ? [...new Set(opts.traditions)].sort()
    : opts.tradition
      ? [opts.tradition]
      : null;
  const sql = getDb();
  // The predicate is written ONCE and shared by the page and the count, so the number under the
  // list can never describe a different set than the list itself.
  const WHERE = `s.status = 'published'
       AND s.source_type = ANY($1::text[])
       AND ($2::text[] IS NULL OR s.tradition = ANY($2::text[]))`;
  const [rows, countRows] = await Promise.all([
    sql.query(
      `SELECT s.id, s.slug, s.title, s.author, s.source_type AS "sourceType", s.tradition, s.era,
              (SELECT count(DISTINCT COALESCE(sec.unit_ordinal, -sec.ordinal))::int
                 FROM sections sec WHERE sec.source_id = s.id) AS units
       FROM sources s
       WHERE ${WHERE}
       ORDER BY s.title, s.slug
       LIMIT $3 OFFSET $4`,
      [types, tradition, limit, offset],
    ),
    sql.query(
      `SELECT count(*)::int AS total FROM (
         SELECT 1 FROM sources s WHERE ${WHERE} LIMIT ${COUNT_CAP}
       ) capped`,
      [types, tradition],
    ),
  ]);
  const total = (countRows as unknown as { total: number }[])[0]?.total ?? 0;
  return { works: rows as unknown as CatalogWork[], total, totalCapped: total >= COUNT_CAP };
}

/** Facet counts for a catalog's tradition chips. Bounded by the number of traditions. */
export async function catalogTraditions(catalog: CatalogId, subFilter?: string): Promise<{ tradition: string; works: number }[]> {
  const types = [...typesFor(catalog, subFilter)];
  const sql = getDb();
  const rows = await sql.query(
    `SELECT COALESCE(s.tradition, 'unknown') AS tradition, count(*)::int AS works
     FROM sources s
     WHERE s.status = 'published' AND s.source_type = ANY($1::text[])
     GROUP BY 1 ORDER BY works DESC, tradition`,
    [types],
  );
  return rows as unknown as { tradition: string; works: number }[];
}
