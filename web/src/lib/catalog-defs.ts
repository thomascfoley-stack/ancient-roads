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

export type CatalogId = 'commentaries' | 'sermons' | 'hymns-poetry' | 'historians' | 'devotionals' | 'theology';

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
  // Added 2026-08-01 by owner decision. `historian` was previously in NO catalog under the
  // fail-closed default above — not because it breaches the wall, but because nobody had decided
  // where it goes. It is not lane content (it is neither exegesis nor devotional register), so it
  // gets its own shelf rather than being folded into Commentaries, which a reader would read as
  // "commentary on this passage". `theology` and `confession` remain uncatalogued, deliberately.
  historians: { id: 'historians', label: 'Historians', types: ['historian'] },
  // Added 2026-08-02. `devotional` is migration 038's new source_type and would otherwise land in
  // the fail-closed default below — ingested, published, and on no shelf.
  devotionals: { id: 'devotionals', label: 'Devotionals', types: ['devotional'] },
  // Added 2026-08-02, and it CORRECTS the note above rather than contradicting it. That note
  // argues theology and confession must not be folded INTO Commentaries, which remains true and
  // is why they are not in that catalog's types. But "not in Commentaries" was silently doing
  // duty as "on no shelf at all", and the consequence was that calvin-institutes, hodge-systematic,
  // owen-works and schaff-creeds were published, lane-served, and unbrowsable — 33,578 sections a
  // reader had no route to. The Historians row directly above already established the remedy: a
  // register that is not exegesis gets its OWN shelf. Same reasoning, same fix.
  theology: { id: 'theology', label: 'Theology & Creeds', types: ['theology', 'confession'] },
} as const;

export const CATALOG_IDS = Object.keys(CATALOGS) as CatalogId[];
export function isCatalogId(v: unknown): v is CatalogId {
  return typeof v === 'string' && (CATALOG_IDS as string[]).includes(v);
}

/**
 * Is `sub` a real sub-filter of `catalog`?
 *
 * `Object.hasOwn`, not `in` and not truthy indexing. `def.subFilters?.['constructor']` walks the
 * prototype chain and returns the Object constructor — a truthy value that is not an array, so
 * every caller that spread it threw a TypeError and, having no try/catch above it, returned a 500
 * (2026-08-02 audit). `__proto__` did the same via Object.prototype. Own-key membership is the only
 * test that answers the question actually being asked.
 */
export function isSubFilterOf(catalog: CatalogId, sub: string): boolean {
  const subs = CATALOGS[catalog].subFilters;
  return subs !== undefined && Object.hasOwn(subs, sub);
}

/** The types a catalog request resolves to, honouring an optional sub-filter. Never widens. */
export function typesFor(catalog: CatalogId, subFilter?: string): readonly string[] {
  const def = CATALOGS[catalog];
  // Fail-closed on anything that is not an own key: an unknown sub-filter falls through to the
  // catalog's own types, which is a WIDENING relative to what the caller asked for. Callers that
  // can refuse (the route) validate with `isSubFilterOf` first and 400; this fallback is the last
  // line, and it never reaches outside the catalog.
  if (subFilter && isSubFilterOf(catalog, subFilter)) return def.subFilters![subFilter]!;
  return def.types;
}

/**
 * The union of several catalogs' types — the POOLED search case (commentaries + sermons together).
 *
 * Deduped, because the union goes into `source_type = ANY($n::text[])` and a repeated value would
 * be dead weight in the predicate. Sorted, so the parameter array is stable across calls with the
 * same catalogs in a different order — that stability is what lets Postgres reuse a plan, and it
 * makes the query cacheable at every layer above.
 *
 * WIDENING IS THE HAZARD HERE, so note what this does NOT do: an empty list returns an empty array
 * and the caller must treat that as "no catalog filter was requested", never as "match everything".
 * `searchSections` enforces that distinction — see the `types` binding there. The disjointness of
 * CATALOGS means the union of all catalogs is still strictly narrower than the corpus, so pooling
 * can never reach `theology`, `confession` or `lexicon`.
 *
 * Sub-filters are deliberately not accepted: a sub-filter is a within-catalog narrowing and has no
 * meaning across a union. Pool at the catalog grain, narrow inside one catalog.
 */
export function typesForMany(catalogs: readonly CatalogId[]): string[] {
  return [...new Set(catalogs.flatMap((c) => [...CATALOGS[c].types]))].sort();
}

