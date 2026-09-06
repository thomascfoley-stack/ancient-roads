// @vitest-environment jsdom
//
// F-158 REGRESSION TEST FOR THE LIBRARY CATALOG "Add to desk" LINK.
//
// THE DEFECT (commit 18277776, F-158 fix pass). When a Scripture pane is already open on the desk the
// catalog page's `+` resolves the work's first unit that anchors near that passage, so the new pane
// opens beside the passage instead of at the work's first unit. The book-slug lookup was written as
// `BOOK_BY_SLUG.get(x) ?? BOOK_BY_SLUG.get(x.replace(/-/g, ''))` — a bare Map lookup with a dead
// hyphen-strip fallback — instead of the `?? resolveBookSlug(x)` alias resolver every other URL/pane
// book-slug consumer uses. The Map is keyed only by canonical 3-letter slugs ('jhn'), so an aliased
// Scripture-pane slug ('john', '1-john', 'song-of-solomon') never resolved; the ordinal lookup was
// silently skipped and the work pane opened at its first unit.
//
// THE CANONICAL BASELINE. `UX_FIX_VERIFICATION.md:116` records the canonical case: with
// `?desk=scripture:jhn/3` the `+` href for `adam-clarke` carries `:8075`. The aliased case
// (`scripture:john/3`) must produce the SAME href shape. The bug shipped because the F-158 QA run
// only exercised the canonical slug — a key the Map hits directly — and never an aliased input.
//
// WHY THIS RENDERS THE PAGE. A unit test of `deskHrefFor` would prove the page's helper resolves the
// alias and prove nothing about whether the page USES it — the mirrored-predicate shape this repo has
// paid for repeatedly. The harness from `catalog-url-facets.test.tsx` is reused: real page component,
// taxonomy REAL, only the two query functions + the work-ordinal lookup stubbed (the ordinal lookup
// hits the Neon DB through `@/lib/work`). The assertion is over the `+` anchor's href for the input
// a reader can actually produce via a hand-edited or shared desk URL.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { encodeVerseId } from '@bible/verse-id';

const listCatalogWorks = vi.hoisted(() => vi.fn());
const catalogTraditions = vi.hoisted(() => vi.fn());
const findWorkOrdinalForVerseId = vi.hoisted(() => vi.fn());

// Taxonomy stays REAL — only the two query functions and the verse-anchored ordinal lookup are
// stubbed. `findWorkOrdinalForVerseId` lives in `@/lib/work` and runs SQL against Neon; stubbing it
// removes the DB dependency exactly as `catalog-url-facets.test.tsx` stubs `listCatalogWorks`.
vi.mock('@/lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/catalog-defs')>()),
  listCatalogWorks,
  catalogTraditions,
}));
vi.mock('@/lib/work', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/work')>()),
  findWorkOrdinalForVerseId,
}));

import CatalogPage from '@/app/library/[catalog]/page';

const WORK = {
  slug: 'adam-clarke',
  title: 'Adam Clarke Commentary',
  author: 'Adam Clarke',
  tradition: 'methodist',
  sourceType: 'commentary',
  units: 8075,
};

// `scripturePane.book` resolves to John (bookNum 43); John 3:1 is the verse ID the page must pass
// to findWorkOrdinalForVerseId for `scripture:jhn/3` and `scripture:john/3` (alias → canonical).
// `1-john` is a different book entirely (bookNum 62, not 43) — confirmed via `resolveBookSlug`.
const JOHN_3_1 = encodeVerseId({ book: 43, chapter: 3, verse: 1 });

beforeEach(() => {
  listCatalogWorks.mockReset();
  catalogTraditions.mockReset();
  findWorkOrdinalForVerseId.mockReset();
  listCatalogWorks.mockResolvedValue({ works: [WORK], total: 1, totalCapped: false });
  catalogTraditions.mockResolvedValue([]);
});

/** Render the catalog page with a `?desk=` value and return the `+` link's href. */
async function addHrefFor(desk: string): Promise<string | null> {
  const jsx = await CatalogPage({
    params: Promise.resolve({ catalog: 'commentaries' }),
    searchParams: Promise.resolve({ desk }),
  });
  const { container } = render(jsx);
  return container.querySelector<HTMLAnchorElement>('a[title="Add to desk"]')?.getAttribute('href') ?? null;
}

/** The `p=...` values from a `/desk?p=...&p=...` href, decoded. */
function paneValues(href: string): string[] {
  return new URL(href, 'https://x.test').searchParams.getAll('p');
}

describe('library [catalog] F-158: add-to-desk lands near the open Scripture passage', () => {
  it('canonical scripture:jhn/3 carries :ordinal (UX_FIX_VERIFICATION.md:116 baseline)', async () => {
    findWorkOrdinalForVerseId.mockResolvedValue(8075);
    const href = await addHrefFor('scripture:jhn/3');
    expect(href).not.toBeNull();
    const panes = paneValues(href!);
    expect(panes).toContain('scripture:jhn/3');
    expect(panes).toContain('work:adam-clarke:8075');
    // John 3:1 = book 43 * 1_000_000 + 3 * 1_000 + 1 = 43003001.
    expect(findWorkOrdinalForVerseId).toHaveBeenCalledWith('adam-clarke', JOHN_3_1);
  });

  it('aliased scripture:john/3 now RESOLVES and carries the same :ordinal (regression for F-158)', async () => {
    // SEED to watch this fail: revert page.tsx to
    // `?? BOOK_BY_SLUG.get(scripturePane.book.replace(/-/g, ''))` → RED: 'john' is not a key in
    // BOOK_BY_SLUG and the hyphen-strip fallback leaves it as 'john' (no hyphen), so the lookup
    // misses, findWorkOrdinalForVerseId is never called, and the href is bare `work:adam-clarke`.
    findWorkOrdinalForVerseId.mockResolvedValue(8075);
    const href = await addHrefFor('scripture:john/3');
    expect(href).not.toBeNull();
    const panes = paneValues(href!);
    // The Scripture pane is forwarded unchanged — the page never canonicalizes a desk pane.
    expect(panes).toContain('scripture:john/3');
    // The work pane carries the SAME ordinal the canonical case produced (UX_FIX_VERIFICATION.md:116).
    expect(panes).toContain('work:adam-clarke:8075');
    expect(panes.some((p) => p === 'work:adam-clarke'), 'no bare work:adam-clarke (ordinal dropped)').toBe(false);
    // The page called findWorkOrdinalForVerseId with the SAME (slug, verseId) pair as the canonical
    // case: alias resolution normalizes 'john' to Book { bookNum: 43 } before the verseId encode.
    expect(findWorkOrdinalForVerseId).toHaveBeenCalledWith('adam-clarke', JOHN_3_1);

    // Behavioral parity: alias and canonical inputs produce the same set of panes (the Scripture
    // pane itself differs in slug only — both decode to John 3 — and the work pane must be identical).
    const canonicalHref = await addHrefFor('scripture:jhn/3');
    // Both inputs drive findWorkOrdinalForVerseId -> 8075, so the resulting work pane matches.
    expect(paneValues(canonicalHref!)).toContain('work:adam-clarke:8075');
    expect(paneValues(href!)).toEqual(paneValues(canonicalHref!).map((p) =>
      p === 'scripture:jhn/3' ? 'scripture:john/3' : p,
    ));
  });

  it('hyphenated alias scripture:1-john/1 resolves (normalizeBookInput rescues hyphens)', async () => {
    // `1-john` → '1 john' → '1jn' (bookNum 62). The previous `?? BOOK_BY_SLUG.get(x.replace(/-/g, ''))`
    // fallback reduces '1-john' to '1john', which is also NOT a key (canonical '1jn'), so the lookup
    // missed; the fix uses `resolveBookSlug` which normalizes via `normalizeBookInput`.
    findWorkOrdinalForVerseId.mockResolvedValue(42);
    const href = await addHrefFor('scripture:1-john/1');
    expect(href).not.toBeNull();
    const panes = paneValues(href!);
    expect(panes).toContain('scripture:1-john/1');
    expect(panes).toContain('work:adam-clarke:42');
    // 1 John (62) chapter 1 verse 1 = 62_001_001.
    expect(findWorkOrdinalForVerseId).toHaveBeenCalledWith('adam-clarke', 62_001_001);
  });

  it('unrecognized Scripture book falls back to bare work:<slug>, no throw, no ordinal lookup call',
  async () => {
    // No book lookup hit, no resolveBookSlug match → book is undefined → the F-158 branch is skipped
    // and the `+` href is the bare work pane appended to the open desk. Exactly as before the fix.
    const href = await addHrefFor('scripture:qwx/1');
    expect(href).not.toBeNull();
    const panes = paneValues(href!);
    expect(panes).toContain('scripture:qwx/1');
    expect(panes).toContain('work:adam-clarke');
    expect(panes.some((p) => /^work:adam-clarke:\d+$/.test(p)), 'no work:adam-clarke:<ordinal>').toBe(false);
    expect(findWorkOrdinalForVerseId).not.toHaveBeenCalled();
  });

  it('null ordinal from findWorkOrdinalForVerseId falls back to bare work:<slug> but still carries the desk',
  async () => {
    // Book resolves; the work has no commentary at that passage → ordinal null. The page MUST still
    // append the work pane (bare) and preserve the open Scripture pane (F-011 "adds, not replaces").
    findWorkOrdinalForVerseId.mockResolvedValue(null);
    const href = await addHrefFor('scripture:john/3');
    expect(href).not.toBeNull();
    const panes = paneValues(href!);
    expect(panes).toContain('scripture:john/3');
    expect(panes).toContain('work:adam-clarke');
    expect(panes.some((p) => /^work:adam-clarke:\d+$/.test(p)), 'no work:adam-clarke:<ordinal>').toBe(false);
    expect(findWorkOrdinalForVerseId).toHaveBeenCalledOnce();
  });

  it('no Scripture pane: + href is bare work:<slug>, no ordinal lookup called', async () => {
    const href = await addHrefFor('work:matthew-henry');
    expect(href).not.toBeNull();
    const panes = paneValues(href!);
    expect(panes).toContain('work:matthew-henry');
    expect(panes).toContain('work:adam-clarke');
    expect(findWorkOrdinalForVerseId).not.toHaveBeenCalled();
  });
});
