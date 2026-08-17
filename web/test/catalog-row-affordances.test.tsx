// @vitest-environment jsdom
//
// WHAT A CATALOG ROW GIVES A READER WHO CANNOT SEE IT, AND ONE WHO CANNOT FIT IT.
//
// Two findings from the 2026-08-16 QA fleet land on the SAME element — the primary "open this
// work" link in a /library/[catalog] row — and only one of them is real. Both are asserted here,
// for opposite reasons.
//
// A094 (REAL). The title renders with `truncate`, so at 768px a long title is cut with an ellipsis
// and the rest of it exists nowhere on the page: no tooltip, no expansion, nothing. A reader can
// see that two Manton volumes are different rows and cannot see which volume either one is. The
// fix is a `title` attribute carrying the whole string.
//
// A066 (FALSE — pinned, not fixed). It reported this link as having "no accessible name". It has
// one: the anchor's own contents are the title, the author, the tradition, the register and the
// unit count, and name-from-contents is exactly how an anchor gets named. The check below COMPUTES
// the name (testing-library's `name` filter runs dom-accessibility-api over the rendered DOM)
// rather than grepping the source, so it goes red on the day the row becomes a bare icon — the
// state the finding described, and a state this code has never been in. A false finding is worth a
// standing check precisely because nothing else stops someone "fixing" it into existence.
//
// The subject is the REAL server component with only its two query functions stubbed — the harness
// `catalog-url-facets.test.tsx` established, and for the reason stated there: asserting over
// rendered anchors proves a reader gets the affordance, where asserting over JSX shape would only
// prove an attribute is present in a file.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';

const listCatalogWorks = vi.hoisted(() => vi.fn());
const catalogTraditions = vi.hoisted(() => vi.fn());
vi.mock('@/lib/catalog', async (importOriginal) => ({
  // Taxonomy REAL, queries stubbed — a test that also faked CATALOGS would be asserting against
  // its own copy of the catalog definitions.
  ...(await importOriginal<typeof import('@/lib/catalog-defs')>()),
  listCatalogWorks,
  catalogTraditions,
}));

import CatalogPage from '@/app/library/[catalog]/page';

/** Long enough to be truncated in the 768px column QA was looking at — which is the whole point:
 *  the row shows the first few words and the identifying part ("Volume 3") is the part cut off. */
const LONG_TITLE = 'The Complete Works of Thomas Manton, Volume 3: Sermons upon the 119th Psalm';
const SLUG = 'manton-works-3';

beforeEach(() => {
  listCatalogWorks.mockReset();
  catalogTraditions.mockReset();
  listCatalogWorks.mockResolvedValue({
    works: [
      { slug: SLUG, title: LONG_TITLE, author: 'Thomas Manton', tradition: 'puritan', sourceType: 'sermon', units: 190 },
    ],
    total: 1,
    totalCapped: false,
  });
  catalogTraditions.mockResolvedValue([{ tradition: 'puritan', works: 1 }]);
});

/** Render the real (async) server component and hand back its container. */
async function catalog(): Promise<HTMLElement> {
  const jsx = await CatalogPage({
    params: Promise.resolve({ catalog: 'sermons' }),
    searchParams: Promise.resolve({}),
  });
  return render(jsx).container;
}

describe('a catalog work row', () => {
  it('names its primary link after the work it opens (A066 reported this missing; it is not)', async () => {
    // SEED to watch this fail: put `aria-hidden` on the row link's inner spans, or replace the
    // title with an icon — the computed name empties and getByRole finds nothing.
    const container = await catalog();
    const link = within(container).getByRole('link', { name: (name) => name.startsWith(LONG_TITLE) });
    expect(link.getAttribute('href')).toBe(`/work/${SLUG}`);
  });

  it('exposes the whole title on hover, because the row truncates it (A094)', async () => {
    // SEED to watch this fail: delete `title={w.title}` from the title span in page.tsx.
    const container = await catalog();
    const tooltip = within(container).getByTitle(LONG_TITLE);
    expect(tooltip.textContent).toBe(LONG_TITLE);
    // On the row's own link, not on some detached element: the tooltip has to be attached to the
    // thing a reader points at, which is the truncated title itself.
    expect(tooltip.closest('a')?.getAttribute('href')).toBe(`/work/${SLUG}`);
  });
});
