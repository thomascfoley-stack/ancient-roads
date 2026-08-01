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

/** One catalog's works. PUBLISHED ONLY, type-fenced, LIMIT-capped. */
export async function listCatalogWorks(opts: {
  catalog: CatalogId;
  subFilter?: string;
  tradition?: string;
  /** Multi-select tradition toggles. Unioned. Empty means unfiltered, never "match nothing". */
  traditions?: readonly string[];
  limit?: number;
}): Promise<CatalogWork[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const types = [...typesFor(opts.catalog, opts.subFilter)];
  // Same empty-means-unfiltered rule as searchSections, so the work list and the search below it
  // can never disagree about what a given chip selection means.
  const tradition = opts.traditions?.length
    ? [...new Set(opts.traditions)].sort()
    : opts.tradition
      ? [opts.tradition]
      : null;
  const sql = getDb();
  const rows = await sql.query(
    `SELECT s.slug, s.title, s.author, s.source_type AS "sourceType", s.tradition, s.era,
            (SELECT count(DISTINCT COALESCE(sec.unit_ordinal, -sec.ordinal))::int
               FROM sections sec WHERE sec.source_id = s.id) AS units
     FROM sources s
     WHERE s.status = 'published'
       AND s.source_type = ANY($1::text[])
       AND ($2::text[] IS NULL OR s.tradition = ANY($2::text[]))
     ORDER BY s.title
     LIMIT $3`,
    [types, tradition, limit],
  );
  return rows as unknown as CatalogWork[];
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
