// GET /api/search/works — cross-corpus + per-catalog + POOLED + in-work search over `sections`
// (docs/LIBRARY_READER_DESIGN.md §5). This is the sermon search.
//
// Every property that keeps it safe lives in lib/search-sections.ts (published-only, deduped to
// reading units, capped count, hard LIMIT); this route is the thin, validated edge. Input is
// schema-parsed rather than trusted (CLAUDE.md: validate external input at the edge) — an unknown
// catalog is a 400, not a silently-widened query, because silently dropping a bad catalog filter
// would turn a fenced search into a cross-corpus one and breach the register wall.
//
// THE REDUNDANCY IS DELIBERATE, and it is the reason this file is longer than a one-line parse.
// Filters arrive from callers that do not agree on a convention: the catalog page builds
// `?tradition=reformed` links server-side, the search box builds repeated `?tradition=` params from
// its chip state, and a hand-edited or shared URL may carry `?traditions=a,b`. All three are
// accepted and normalised to one array. What is NOT accepted is a value this route cannot resolve:
// an unknown catalog 400s. A filter that arrives in a shape the server ignores is the dangerous
// case — the user sees chips lit up and gets unfiltered results, which reads as "the filter is
// broken" at best and shows the wrong register at worst.

import { CATALOG_IDS, isCatalogId, type CatalogId } from '@/lib/catalog';
import { searchSections } from '@/lib/search-sections';

/** Upper bound on filter cardinality. A URL cannot be used to build an unbounded IN-list. */
const MAX_FILTER_VALUES = 32;

/**
 * Collect a repeatable, optionally comma-separated param into a deduped array.
 * Accepts `?k=a,b`, `?k=a&k=b`, and `?k=a,b&k=c`. Blank entries are dropped, not preserved as ''.
 */
function multiParam(url: URL, ...names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    for (const raw of url.searchParams.getAll(name)) {
      for (const part of raw.split(',')) {
        const v = part.trim();
        if (v) out.push(v);
      }
    }
  }
  return [...new Set(out)];
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  if (!query) return Response.json({ results: [], total: 0, totalCapped: false });

  // Catalogs: `catalog` (single, legacy) and `catalogs` (pooled) normalise to one list.
  const requested = multiParam(url, 'catalog', 'catalogs');
  const unknown = requested.filter((c) => !isCatalogId(c));
  if (unknown.length > 0) {
    // Refuse, naming both the bad value and the valid set. Dropping it would widen the fence.
    return Response.json(
      { error: `unknown catalog ${unknown.map((u) => `"${u}"`).join(', ')}`, valid: CATALOG_IDS },
      { status: 400 },
    );
  }
  if (requested.length > MAX_FILTER_VALUES) {
    return Response.json({ error: `too many catalog filters (max ${MAX_FILTER_VALUES})` }, { status: 400 });
  }
  const catalogs = requested as CatalogId[];

  // Traditions are FREE TEXT in the schema (`sources.tradition` has no CHECK constraint), so there
  // is no valid set to validate against and an unknown value simply matches nothing. That is the
  // honest behaviour: an empty result for "tradition=nonsense" is correct, where a 400 would
  // require this route to hold a copy of a vocabulary the database does not enforce — the
  // hand-maintained-expected-set defect this repo has paid for ten times. Only the COUNT is bounded.
  const traditions = multiParam(url, 'tradition', 'traditions');
  if (traditions.length > MAX_FILTER_VALUES) {
    return Response.json({ error: `too many tradition filters (max ${MAX_FILTER_VALUES})` }, { status: 400 });
  }

  const num = (name: string): number | undefined => {
    const raw = url.searchParams.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const page = await searchSections({
    query,
    // A single catalog keeps the `catalog` path so its sub-filter still applies; two or more go
    // through the pooled path, where sub-filters have no meaning (see typesForMany).
    ...(catalogs.length === 1 ? { catalog: catalogs[0]! } : { catalogs }),
    subFilter: url.searchParams.get('sub') ?? undefined,
    sourceSlug: url.searchParams.get('work') ?? undefined,
    traditions,
    limit: num('limit'),
    offset: num('offset'),
  });
  return Response.json(page);
}
