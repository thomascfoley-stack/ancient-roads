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
  listCatalogWorks.mockResolvedValue([
    { slug: 'olney-hymns', title: 'Olney Hymns', author: 'John Newton', tradition: 'anglican', sourceType: 'hymn', sections: 3 },
  ]);
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
