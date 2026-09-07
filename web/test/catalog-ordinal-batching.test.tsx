// @vitest-environment jsdom
//
// THE CATALOG PAGE'S F-158 ORDINAL LOOKUP IS BATCHED OVER THE PAGE — NOT FANNED PER WORK.
//
// The shipped defect (commit 1827777, the same pass that landed F-158): when `?desk=` carried a
// Scripture pane, the page resolved the landing ordinal PER work — a slug→id query plus an
// ordinal join PER work, each its own HTTPS fetch under the Neon HTTP driver. A full page of up
// to PAGE_SIZE (100) works fired ~200 fetches in two waves where ONE fetch does the same work.
//
// The fix carries `sources.id` out of `listCatalogWorks` and batches the ordinal join into one
// grouped query. This test renders the REAL page component with its query layer mocked and
// asserts the load SHAPE (one ordinal query, no per-work fan-out) and the rendered hrefs a
// reader actually clicks — the byte-identical output the batched form must produce.
//
// SEED to watch a case RED: revert web/src/app/library/[catalog]/page.tsx to
// `Promise.all(works.map((w) => deskHrefFor(w.slug)))` with the per-work helper — the
// "ONE ordinal query" and "zero queries without a Scripture pane" cases both redden.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';

const listCatalogWorks = vi.hoisted(() => vi.fn());
const catalogTraditions = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());

vi.mock('@/lib/catalog', async (importOriginal) => ({
  // Taxonomy REAL, queries stubbed — a test that faked CATALOGS would assert against its own copy.
  ...(await importOriginal<typeof import('@/lib/catalog-defs')>()),
  listCatalogWorks,
  catalogTraditions,
}));
// The real `findWorkOrdinalsForVerseId` calls `getDb`; stubbing the driver lets the page run the
// REAL batching code while we count the fetches and shape the rows it maps back to hrefs.
vi.mock('@/lib/db', () => ({ getDb: () => ({ query }) }));

import CatalogPage from '@/app/library/[catalog]/page';

const WORKS = [
  { id: '11', slug: 'adam-clarke', title: 'Adam Clarke Commentary', author: 'Adam Clarke', tradition: 'methodist', sourceType: 'commentary', units: 8075 },
  { id: '22', slug: 'matthew-henry', title: "Matthew Henry's Commentary", author: 'Matthew Henry', tradition: 'puritan', sourceType: 'commentary', units: 9000 },
  { id: '33', slug: 'no-anchors-here', title: 'A Work Without Anchors', author: 'Anon', tradition: 'baptist', sourceType: 'commentary', units: 5 },
];

beforeEach(() => {
  listCatalogWorks.mockReset();
  catalogTraditions.mockReset();
  query.mockReset();
  query.mockResolvedValue([]); // safe default; tests with rows override it
  listCatalogWorks.mockResolvedValue({ works: WORKS, total: WORKS.length, totalCapped: false });
  catalogTraditions.mockResolvedValue([]); // empty → no tradition chip row, just the work list
});

/** Decode a "+" href into its `p=` panes (URLSearchParams percent-decodes the `:` and `/` that
 *  `deskHref`'s URLSearchParams encoded — the same parse catalog-url-facets.test.tsx uses). */
function panesOf(href: string | null): string[] {
  if (href === null) throw new Error('no + href rendered');
  return new URL(href, 'https://x.test').searchParams.getAll('p');
}

/** The "+" panes for one work row, found by its aria-label (the label the page itself documents). */
async function plusPanesFor(title: string, searchParams: Record<string, string | string[] | undefined>): Promise<string[]> {
  const jsx = await CatalogPage({
    params: Promise.resolve({ catalog: 'commentaries' }),
    searchParams: Promise.resolve(searchParams),
  });
  const container = render(jsx).container;
  return panesOf(within(container).getByRole('link', { name: `Add ${title} to your desk` }).getAttribute('href'));
}

describe('the catalog page batches the F-158 ordinal lookup over the whole page', () => {
  it('issues exactly ONE ordinal query for the page, not a per-work query-pair', async () => {
    query.mockResolvedValue([
      { source_id: '11', ordinal: 8075 },
      { source_id: '22', ordinal: 12 },
    ]);
    await plusPanesFor('Adam Clarke Commentary', { desk: 'scripture:jhn/3' });
    // The N+1 regression fires 2 × works.length fetches; the batched page fires ONE.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('issues ZERO ordinal queries when no Scripture pane is carried (the catalog-browse path)', async () => {
    // The fan-out was only ever reachable via the scripture-desk-carried flow. Browsing the shelf
    // with a work pane (or no desk) must not trigger any ordinal fetch.
    await plusPanesFor('Adam Clarke Commentary', { desk: 'work:already-open' });
    expect(query).not.toHaveBeenCalled();
    await plusPanesFor('Adam Clarke Commentary', {});
    expect(query).not.toHaveBeenCalled();
  });

  it('issues ZERO ordinal queries for an unknown Scripture book, and degrades to no ordinal', async () => {
    const panes = await plusPanesFor('Adam Clarke Commentary', { desk: 'scripture:not-a-real-book/3' });
    expect(query).not.toHaveBeenCalled();
    expect(panes).toEqual(['scripture:not-a-real-book/3', 'work:adam-clarke']);
  });

  it('lands the anchored work near the passage and the no-anchor work at its start — one query', async () => {
    query.mockResolvedValue([
      { source_id: '11', ordinal: 8075 },
      { source_id: '22', ordinal: 12 },
    ]);
    // Render the whole shelf once and read both rows; both resolve in the single batched query.
    const jsx = await CatalogPage({
      params: Promise.resolve({ catalog: 'commentaries' }),
      searchParams: Promise.resolve({ desk: 'scripture:jhn/3' }),
    });
    const container = render(jsx).container;
    const pan = (title: string) => panesOf(within(container).getByRole('link', { name: `Add ${title} to your desk` }).getAttribute('href'));
    expect(query).toHaveBeenCalledTimes(1);
    expect(pan('Adam Clarke Commentary')).toEqual(['scripture:jhn/3', 'work:adam-clarke:8075']);
    expect(pan('Matthew Henry\'s Commentary')).toEqual(['scripture:jhn/3', 'work:matthew-henry:12']);
    // The work with no anchor in range omits the ordinal — `work:slug`, never `work:slug:0`.
    expect(pan('A Work Without Anchors')).toEqual(['scripture:jhn/3', 'work:no-anchors-here']);
  });
});
