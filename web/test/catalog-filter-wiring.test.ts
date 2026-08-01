// THE FILTER MUST REACH THE QUERY. No database required — this tests the WIRING, which is
// precisely what was broken: `/api/search/works` had accepted a `tradition` filter since it was
// written, and `catalog-search.tsx` never sent one. Every layer was individually correct and the
// feature did not exist. A DB-backed test would not have caught that; it would have queried a
// filter nobody could reach from the UI.
//
// So the seam is the subject. `searchSections` is mocked and the assertions are about what the
// route HANDS it. If the route drops, renames or mangles a filter, these go red without a DB.
//
// The register fence is the reason this matters beyond convenience: a filter the server silently
// ignores shows the reader lit chips over unfiltered results.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const searchSections = vi.hoisted(() => vi.fn());
vi.mock('@/lib/search-sections', () => ({ searchSections }));

import { GET } from '@/app/api/search/works/route';
import { CATALOGS, CATALOG_IDS, typesForMany, type CatalogId } from '@/lib/catalog';

const EMPTY = { results: [], total: 0, totalCapped: false };
const call = (qs: string) => GET(new Request(`https://x.test/api/search/works?${qs}`));
const argsOf = () => searchSections.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  searchSections.mockReset();
  searchSections.mockResolvedValue(EMPTY);
});

describe('tradition filter reaches searchSections', () => {
  it('a single ?tradition= is forwarded', async () => {
    await call('q=grace&catalog=sermons&tradition=reformed');
    expect(argsOf().traditions).toEqual(['reformed']);
  });

  it('REPEATED ?tradition=a&tradition=b are unioned — the shape the search box sends', async () => {
    await call('q=grace&catalog=sermons&tradition=reformed&tradition=patristic');
    expect(argsOf().traditions).toEqual(['reformed', 'patristic']);
  });

  it('a COMMA-joined ?traditions=a,b is accepted too — the shape a shared URL may carry', async () => {
    await call('q=grace&traditions=reformed,patristic');
    expect(argsOf().traditions).toEqual(['reformed', 'patristic']);
  });

  it('mixed forms and duplicates collapse to a deduped set', async () => {
    await call('q=grace&tradition=reformed&traditions=reformed,puritan');
    expect(argsOf().traditions).toEqual(['reformed', 'puritan']);
  });

  it('blank and whitespace-only values are dropped, not passed as empty strings', async () => {
    // `?tradition=` is what an unset <select> or a stale link produces. Forwarding '' would filter
    // on a tradition no row has and return zero matches, which reads as "no results" rather than
    // "no filter" — the exact confusion this test exists to prevent.
    await call('q=grace&tradition=&tradition=%20&tradition=reformed');
    expect(argsOf().traditions).toEqual(['reformed']);
  });

  it('NO tradition param yields an empty array, which searchSections treats as unfiltered', async () => {
    await call('q=grace&catalog=sermons');
    expect(argsOf().traditions).toEqual([]);
  });
});

describe('the catalog fence cannot be widened from the URL', () => {
  it('an unknown catalog is a 400, never a silently cross-corpus search', async () => {
    const res = await call('q=grace&catalog=everything');
    expect(res.status).toBe(400);
    expect(searchSections).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string; valid: string[] };
    expect(body.error).toContain('everything');
    expect(body.valid).toEqual(CATALOG_IDS); // the valid set is reported, not guessed at
  });

  it('one bad value among good ones still refuses the whole request', async () => {
    // Dropping just the bad one would widen the fence to the remaining catalogs while the caller
    // believes it asked for something narrower.
    const res = await call('q=grace&catalogs=sermons,nonsense');
    expect(res.status).toBe(400);
    expect(searchSections).not.toHaveBeenCalled();
  });

  it('ONE catalog uses the single-catalog path, so its sub-filter still applies', async () => {
    await call('q=hark&catalog=hymns-poetry&sub=hymns');
    expect(argsOf().catalog).toBe('hymns-poetry');
    expect(argsOf().subFilter).toBe('hymns');
  });

  it('TWO catalogs pool, and the pooled type set is exactly the union', async () => {
    await call('q=grace&catalogs=commentaries,sermons');
    const passed = argsOf().catalogs as CatalogId[];
    expect([...passed].sort()).toEqual(['commentaries', 'sermons']);
    expect(argsOf().catalog).toBeUndefined(); // never both paths at once
    expect(typesForMany(passed).sort()).toEqual(['commentary', 'father', 'sermon']);
  });

  it('filter cardinality is bounded — a URL cannot build an unbounded IN-list', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `t${i}`).join(',');
    const res = await call(`q=grace&traditions=${many}`);
    expect(res.status).toBe(400);
    expect(searchSections).not.toHaveBeenCalled();
  });
});

describe('the catalog taxonomy stays disjoint as it grows', () => {
  it('Historians exists and holds only historian', () => {
    expect(CATALOGS.historians.types).toEqual(['historian']);
  });

  it('no source_type is reachable through two catalogs', () => {
    const seen = new Map<string, CatalogId>();
    for (const id of CATALOG_IDS) {
      for (const t of CATALOGS[id].types) {
        expect(seen.has(t), `type "${t}" is in both ${seen.get(t)} and ${id}`).toBe(false);
        seen.set(t, id);
      }
    }
  });

  it('lane/other content still reaches NO catalog, including the new one', () => {
    // The fail-closed default. `historian` was moved OUT of this set by an owner decision on
    // 2026-08-01; theology and confession were not, and must not drift in silently.
    const all = new Set(CATALOG_IDS.flatMap((id) => [...CATALOGS[id].types]));
    for (const t of ['theology', 'confession', 'lexicon']) {
      expect(all.has(t), `"${t}" is lane/other content and must appear in NO catalog`).toBe(false);
    }
  });

  it('typesForMany is deduped, sorted and never widens beyond the union', () => {
    expect(typesForMany([])).toEqual([]); // empty is EMPTY, not "everything"
    expect(typesForMany(['sermons', 'sermons'])).toEqual(['sermon']);
    const everything = typesForMany(CATALOG_IDS);
    expect(everything).toEqual([...everything].sort());
    expect(everything).not.toContain('theology');
    expect(everything).not.toContain('confession');
  });
});
