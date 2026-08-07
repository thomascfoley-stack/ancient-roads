// @vitest-environment jsdom
//
// EVERY FILTER LINK ON A CATALOG PAGE CARRIES EVERY FACET.
//
// THE DEFECT (2026-08-02 audit, CONFIRMED). The catalog page carries three independent facets in
// its URL: `?sub=`, repeated `?tradition=`, and `?desk=`. The desk carry is what makes the `+`
// button on a work APPEND to the panes already open ("adding a work appends to what is already
// open"). It was added to the page and to the `+` href, and to none of the four filter-link
// builders — so the moment a reader clicked any chip, `?desk=` was gone, `decodeDesk` returned [],
// and the next `+` replaced a three-pane desk with a one-pane desk. Silently. The tradition
// toggle's own comment said it was "preserving everything else in the URL".
//
// WHY THIS TEST RENDERS THE PAGE INSTEAD OF TESTING THE BUILDER. A unit test of `catalogHref`
// would prove the builder carries desk and prove nothing about whether the page USES it — the
// mirrored-predicate shape this repo has paid for repeatedly. So the subject here is the rendered
// anchor set: `listCatalogWorks`/`catalogTraditions` are stubbed (no database), the real page
// component is awaited and rendered, and the assertion is over the hrefs a reader can actually
// click. Delete the `desk` line from `urlState` and every case below goes red.
//
// The sibling guarantee asserted here is ARIA: these chips are anchors, so the lit state is
// `aria-current`. `aria-pressed` — which the chips shipped with — is defined only on role `button`
// and is invalid on a link, so the state was announced by nothing.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const listCatalogWorks = vi.hoisted(() => vi.fn());
const catalogTraditions = vi.hoisted(() => vi.fn());
vi.mock('@/lib/catalog', async (importOriginal) => ({
  // The taxonomy is REAL — only the two query functions are stubbed. A test that also faked
  // CATALOGS would be asserting against its own copy of the catalog definitions.
  ...(await importOriginal<typeof import('@/lib/catalog-defs')>()),
  listCatalogWorks,
  catalogTraditions,
}));

import CatalogPage from '@/app/library/[catalog]/page';

const DESK = 'work:matthew-henry';

beforeEach(() => {
  listCatalogWorks.mockReset();
  catalogTraditions.mockReset();
  listCatalogWorks.mockResolvedValue({
    works: [
      { slug: 'olney-hymns', title: 'Olney Hymns', author: 'John Newton', tradition: 'anglican', sourceType: 'hymn', sections: 3 },
    ],
    total: 1,
    totalCapped: false,
  });
  // Two traditions, because the chip row only renders when there is more than one.
  catalogTraditions.mockResolvedValue([
    { tradition: 'anglican', works: 1 },
    { tradition: 'reformed', works: 2 },
  ]);
});

/** Render the real (async) server component and hand back every anchor it produced. */
async function anchors(searchParams: Record<string, string | string[]>) {
  const jsx = await CatalogPage({
    params: Promise.resolve({ catalog: 'hymns-poetry' }),
    searchParams: Promise.resolve(searchParams),
  });
  const { container } = render(jsx);
  return [...container.querySelectorAll('a')];
}

/** The filter chips: every anchor pointing back at this catalog page, excluding the breadcrumb. */
const filterLinks = (all: HTMLAnchorElement[]) =>
  all.filter((a) => a.getAttribute('href')?.startsWith('/library/hymns-poetry'));

describe('catalog filter links carry the open desk', () => {
  it('EVERY filter link keeps ?desk= — this is the shipped defect', async () => {
    // SEED: drop `desk` from `urlState` in page.tsx → every link loses it → RED.
    const links = filterLinks(await anchors({ desk: DESK }));
    expect(links.length).toBeGreaterThan(3); // All + 2 subs + All traditions + 2 traditions
    for (const a of links) {
      const href = a.getAttribute('href')!;
      expect(new URL(href, 'https://x.test').searchParams.get('desk'), `${a.textContent} dropped ?desk=`).toBe(DESK);
    }
  });

  it('a tradition toggle keeps the sub-filter, and a sub-filter link keeps the traditions', async () => {
    // The same drift in the other direction: four builders, each preserving what its author
    // remembered. One builder over the whole state means neither can happen.
    const links = filterLinks(await anchors({ sub: 'hymns', tradition: 'reformed', desk: DESK }));
    const by = (label: string) => {
      const a = links.find((x) => (x.textContent ?? '').trim().startsWith(label));
      if (!a) throw new Error(`no "${label}" chip rendered — page shape changed`);
      return new URL(a.getAttribute('href')!, 'https://x.test').searchParams;
    };

    // Sub-filter links change ONLY the sub-filter. The tradition selection survives.
    expect(by('Poetry').get('sub')).toBe('poetry');
    expect(by('Poetry').getAll('tradition')).toEqual(['reformed']);
    expect(by('All').get('sub')).toBeNull(); // "All" is the one link that clears the sub-filter
    expect(by('All').getAll('tradition')).toEqual(['reformed']);

    // Tradition links change ONLY the traditions. The sub-filter survives.
    expect(by('anglican').get('sub')).toBe('hymns');
    expect(by('anglican').getAll('tradition')).toEqual(['anglican', 'reformed']);
    expect(by('reformed').getAll('tradition')).toEqual([]); // clicking a lit chip turns it off
    expect(by('reformed').get('sub')).toBe('hymns');
    expect(by('All traditions').getAll('tradition')).toEqual([]);
    expect(by('All traditions').get('sub')).toBe('hymns');
  });

  it('no filter link carries ?desk= when there is no desk open', async () => {
    for (const a of filterLinks(await anchors({}))) {
      expect(a.getAttribute('href')).not.toContain('desk=');
    }
  });

  it('the same selection always yields the same URL regardless of click order', async () => {
    const one = filterLinks(await anchors({ tradition: ['reformed', 'anglican'] })).map((a) => a.getAttribute('href'));
    const two = filterLinks(await anchors({ tradition: ['anglican', 'reformed'] })).map((a) => a.getAttribute('href'));
    expect(one).toEqual(two);
  });
});

describe('the work list is paged, and the cap is visible', () => {
  /** A page of `n` works out of `total`, so the pagination controls have something to render. */
  const pageOf = (n: number, total: number) => ({
    works: Array.from({ length: n }, (_, i) => ({
      slug: `w${i}`, title: `Work ${i}`, author: 'A', tradition: 'anglican', sourceType: 'hymn', units: 1,
    })),
    total,
    totalCapped: false,
  });

  it('offsets the query by the requested page — the cap becomes passable', async () => {
    // SEED: drop `offset` from the listCatalogWorks call in page.tsx → RED. Without it every page
    // renders page one, which is the silent-truncation defect wearing a Next button.
    listCatalogWorks.mockResolvedValue(pageOf(100, 250));
    await anchors({ page: '3' });
    expect(listCatalogWorks).toHaveBeenCalledWith(expect.objectContaining({ offset: 200, limit: 100 }));
  });

  it('a bad or absent ?page= degrades to the first page rather than 400ing', async () => {
    listCatalogWorks.mockResolvedValue(pageOf(100, 250));
    for (const bad of ['0', '-4', 'abc', '2.5', '', undefined]) {
      listCatalogWorks.mockClear();
      await anchors(bad === undefined ? {} : { page: bad });
      expect(listCatalogWorks, `?page=${bad}`).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
    }
  });

  it('bounds the MAGNITUDE of ?page=, not just its integer-ness', async () => {
    // SEED: drop the Math.min in parsePage → RED. `Number('1e9')` IS an integer, so a validity
    // check alone emits a 99-billion OFFSET — the H10 defect, one surface over.
    listCatalogWorks.mockResolvedValue(pageOf(0, 250));
    for (const huge of ['1e9', '99999999999999999999', '2147483647']) {
      listCatalogWorks.mockClear();
      await anchors({ page: huge });
      const { offset } = listCatalogWorks.mock.calls[0]![0] as { offset: number };
      expect(offset, `?page=${huge} produced an unbounded offset`).toBeLessThanOrEqual(100_000);
    }
  });

  it('renders Next but not Previous on page one, and both in the middle', async () => {
    listCatalogWorks.mockResolvedValue(pageOf(100, 250));
    const first = (await anchors({})).map((a) => (a.textContent ?? '').trim());
    expect(first).toContain('Next →');
    expect(first).not.toContain('← Previous');

    const middle = (await anchors({ page: '2' })).map((a) => (a.textContent ?? '').trim());
    expect(middle).toContain('Next →');
    expect(middle).toContain('← Previous');
  });

  it('renders NO pagination when everything fits on one page', async () => {
    listCatalogWorks.mockResolvedValue(pageOf(4, 4));
    const labels = (await anchors({})).map((a) => (a.textContent ?? '').trim());
    expect(labels).not.toContain('Next →');
    expect(labels).not.toContain('← Previous');
  });

  it('a paging link keeps every filter, and a FILTER link resets the page', async () => {
    // The two halves of the same rule. Carrying "page 4" through a chip click lands the reader on
    // an empty page of a shorter list; dropping a filter on a page click silently widens the shelf.
    listCatalogWorks.mockResolvedValue(pageOf(100, 250));
    const links = filterLinks(await anchors({ page: '2', sub: 'hymns', tradition: 'reformed', desk: DESK }));
    const paramsOf = (label: string) => {
      const a = links.find((x) => (x.textContent ?? '').trim().startsWith(label));
      if (!a) throw new Error(`no "${label}" link rendered`);
      return new URL(a.getAttribute('href')!, 'https://x.test').searchParams;
    };

    const next = paramsOf('Next');
    expect(next.get('page')).toBe('3');
    expect(next.get('sub')).toBe('hymns');
    expect(next.getAll('tradition')).toEqual(['reformed']);
    expect(next.get('desk')).toBe(DESK);

    // Every filter chip drops ?page= entirely (page 0 is never serialised).
    for (const label of ['All traditions', 'anglican', 'Poetry']) {
      expect(paramsOf(label).get('page'), `${label} kept the page`).toBeNull();
    }
  });
});

describe('chip state is announced with a valid ARIA attribute', () => {
  it('lit chips use aria-current, and NOTHING uses aria-pressed on a link', async () => {
    // SEED: change aria-current back to aria-pressed → RED. aria-pressed is a property of role
    // `button`; on an anchor it is nonconforming and axe flags aria-allowed-attr.
    const all = await anchors({ sub: 'hymns', tradition: 'reformed' });
    expect(all.some((a) => a.hasAttribute('aria-pressed'))).toBe(false);
    const current = all.filter((a) => a.getAttribute('aria-current') === 'true');
    expect(current.map((a) => (a.textContent ?? '').trim())).toEqual(
      expect.arrayContaining(['Hymns', expect.stringContaining('reformed')]),
    );
  });
});
