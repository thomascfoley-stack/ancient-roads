// The corpus catalogs (docs/LIBRARY_READER_DESIGN.md §10.2): Commentaries · Sermons ·
// Hymns & Poetry. Each catalog is a work list over `sources`, and each work opens in the Book
// Reader.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE REGISTER WALL IS ENCODED HERE, STRUCTURALLY.
//
// The wall (A5 / `register-wall-check.mts`) says hymns, poems, sermons and theology must NEVER be
// treated as exegesis — they ride as their own labeled lanes and can never satisfy the ≥2-voices
// exegetical floor. The catalogs are a NEW DOOR into exactly that content, so the wall has to hold
// here too, not just in retrieval.
//
// It is enforced by construction: each catalog names an EXPLICIT, disjoint set of source_types.
// There is no "everything else" bucket, deliberately —
//   * `theology` and `confession` are NOT folded into Commentaries. They are lane content; putting
//     them under a heading a reader reads as "commentary on this passage" would breach the wall in
//     the UI even while retrieval stayed clean.
//   * `lexicon` belongs to Word Study, which is its own existing surface.
// So a source_type that is not listed below appears in NO catalog. That is a deliberate
// fail-closed default: adding a type to a catalog must be a decision someone makes, not something
// that happens because a bucket swallowed it.
// Enforced by test/invariants/register-wall-surfaces.test.ts, which fails if any catalog admits a
// type outside its own set.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Every query here is published-only and LIMIT-capped — see lib/library.ts for why the
// `status='published'` predicate is load-bearing rather than decorative.

import { getDb } from './db';

export type CatalogId = 'commentaries' | 'sermons' | 'hymns-poetry';

export interface CatalogDef {
  id: CatalogId;
  label: string;
  /** The ONLY source_types this catalog may ever show. Disjoint across catalogs by construction. */
  types: readonly string[];
  /** Optional within-catalog split (design §10.2: "Hymns/Poetry sub-filter"). */
  subFilters?: Readonly<Record<string, readonly string[]>>;
}

export const CATALOGS: Readonly<Record<CatalogId, CatalogDef>> = {
  commentaries: { id: 'commentaries', label: 'Commentaries', types: ['commentary', 'father'] },
  sermons: { id: 'sermons', label: 'Sermons', types: ['sermon'] },
  'hymns-poetry': {
    id: 'hymns-poetry',
    label: 'Hymns & Poetry',
    types: ['hymn', 'poetry'],
    subFilters: { hymns: ['hymn'], poetry: ['poetry'] },
  },
} as const;

export const CATALOG_IDS = Object.keys(CATALOGS) as CatalogId[];
export function isCatalogId(v: unknown): v is CatalogId {
  return typeof v === 'string' && (CATALOG_IDS as string[]).includes(v);
}

/** The types a catalog request resolves to, honouring an optional sub-filter. Never widens. */
export function typesFor(catalog: CatalogId, subFilter?: string): readonly string[] {
  const def = CATALOGS[catalog];
  if (subFilter && def.subFilters?.[subFilter]) return def.subFilters[subFilter]!;
  return def.types;
}

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
  limit?: number;
}): Promise<CatalogWork[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const types = [...typesFor(opts.catalog, opts.subFilter)];
  const tradition = opts.tradition ?? null;
  const sql = getDb();
  const rows = await sql.query(
    `SELECT s.slug, s.title, s.author, s.source_type AS "sourceType", s.tradition, s.era,
            (SELECT count(DISTINCT COALESCE(sec.unit_ordinal, -sec.ordinal))::int
               FROM sections sec WHERE sec.source_id = s.id) AS units
     FROM sources s
     WHERE s.status = 'published'
       AND s.source_type = ANY($1::text[])
       AND ($2::text IS NULL OR s.tradition = $2)
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
