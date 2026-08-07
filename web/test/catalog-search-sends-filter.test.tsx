// @vitest-environment jsdom
//
// THE SEARCH BOX ACTUALLY SENDS THE FILTER.
//
// THE HOLE THIS CLOSES (2026-08-02 audit, CONFIRMED). The tradition filter's whole defect was
// this: `/api/search/works` had accepted a `tradition` param since it was written, and
// `catalog-search.tsx` never sent one. Every layer was individually correct and the feature did
// not exist.
//
// The fix added one line — `params.append('tradition', t)` — and the test written alongside it
// (`catalog-filter-wiring.test.ts`) mocks `searchSections` and drives the route with hand-built
// URLs. It never imports the component. So an auditor deleted that exact line, and the three new
// test files stayed 52/52 green, the full web suite stayed 242 passed, tsc exited 0 and eslint
// found nothing. The original defect could recur with every gate green — the guard was pointed at
// the seam that was never broken.
//
// So the subject here is the FETCH URL the component builds. No database, no route, no server:
// render, stub fetch, read what it asked for.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { CatalogSearch } from '@/components/catalog-search';

let calls: string[] = [];
let original: typeof globalThis.fetch;

beforeEach(() => {
  calls = [];
  original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ results: [], total: 0, totalCapped: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
  vi.restoreAllMocks();
});

/** Render, submit a query, and return the search params of the request that went out. */
async function search(props: Parameters<typeof CatalogSearch>[0], term = 'grace') {
  const { container } = render(<CatalogSearch {...props} />);
  const input = container.querySelector('input');
  const form = container.querySelector('form');
  if (!input || !form) throw new Error('search box shape changed');
  fireEvent.change(input, { target: { value: term } });
  fireEvent.submit(form);
  await waitFor(() => {
    if (calls.length === 0) throw new Error('no request yet');
  }, { timeout: 3000 });
  return new URL(calls.at(-1)!, 'https://x.test').searchParams;
}

describe('CatalogSearch sends the filter it is showing', () => {
  it('sends one ?tradition= per selected value — the line whose deletion nothing caught', async () => {
    // SEED: delete `params.append('tradition', t)` from catalog-search.tsx → RED here, and ONLY
    // here. Every other test in this repo stays green.
    const p = await search({ catalog: 'sermons', label: 'Sermons', traditions: ['reformed', 'patristic'] });
    expect(p.getAll('tradition').sort()).toEqual(['patristic', 'reformed']);
  });

  it('sends the catalog fence and the query', async () => {
    const p = await search({ catalog: 'hymns-poetry', label: 'Hymns & Poetry' }, 'hark');
    expect(p.get('catalog')).toBe('hymns-poetry');
    expect(p.get('q')).toBe('hark');
  });

  it('sends NO tradition param when nothing is selected — empty must not become a filter', async () => {
    const p = await search({ catalog: 'sermons', label: 'Sermons', traditions: [] });
    expect(p.getAll('tradition')).toEqual([]);
  });

  it('re-runs the search when the selection changes, so results cannot be stale against the chips', async () => {
    const { container, rerender } = render(
      <CatalogSearch catalog="sermons" label="Sermons" traditions={[]} />,
    );
    fireEvent.change(container.querySelector('input')!, { target: { value: 'grace' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      if (calls.length === 0) throw new Error('no first request');
    });
    const before = calls.length;

    rerender(<CatalogSearch catalog="sermons" label="Sermons" traditions={['reformed']} />);
    await waitFor(() => {
      if (calls.length <= before) throw new Error('filter change did not re-run the search');
    }, { timeout: 3000 });
    expect(new URL(calls.at(-1)!, 'https://x.test').searchParams.getAll('tradition')).toEqual(['reformed']);
  });

  it('sends offset=0 on a fresh search, and Load More asks for the next page', async () => {
    // First page: 25 results out of 60 total, so "Load more" should render and, on click,
    // request offset=25 (the count already shown) — not a hardcoded page number.
    const firstPage = {
      results: Array.from({ length: 25 }, (_, i) => ({
        slug: 'watts-hymns', title: `Hymn ${i}`, author: 'Isaac Watts', sourceType: 'hymn',
        tradition: null, ordinal: i, unitOrdinal: i, heading: null, snippet: 'x', rank: 1,
      })),
      total: 60,
      totalCapped: false,
    };
    const secondPage = {
      results: Array.from({ length: 25 }, (_, i) => ({
        slug: 'watts-hymns', title: `Hymn ${25 + i}`, author: 'Isaac Watts', sourceType: 'hymn',
        tradition: null, ordinal: 25 + i, unitOrdinal: 25 + i, heading: null, snippet: 'x', rank: 1,
      })),
      total: 60,
      totalCapped: false,
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const body = calls.length === 1 ? firstPage : secondPage;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const { container, findByText } = render(<CatalogSearch catalog="hymns-poetry" label="Hymns & Poetry" />);
    fireEvent.change(container.querySelector('input')!, { target: { value: 'grace' } });
    fireEvent.submit(container.querySelector('form')!);
    const loadMoreBtn = await findByText(/Load more \(25 of 60\)/);
    expect(new URL(calls[0]!, 'https://x.test').searchParams.get('offset')).toBe('0');

    fireEvent.click(loadMoreBtn);
    await findByText(/Load more \(50 of 60\)/);
    expect(new URL(calls[1]!, 'https://x.test').searchParams.get('offset')).toBe('25');

    // Appended, not replaced: both pages' items are on screen.
    expect(container.textContent).toContain('Hymn 0');
    expect(container.textContent).toContain('Hymn 49');
  });

  it('a fresh search after Load More replaces results and resets to offset 0', async () => {
    const page1 = { results: [{ slug: 'a', title: 'A', author: null, sourceType: 'sermon', tradition: null, ordinal: 1, unitOrdinal: 1, heading: null, snippet: 'x', rank: 1 }], total: 2, totalCapped: false };
    const page2 = { results: [{ slug: 'a', title: 'A2', author: null, sourceType: 'sermon', tradition: null, ordinal: 2, unitOrdinal: 2, heading: null, snippet: 'x', rank: 1 }], total: 2, totalCapped: false };
    const freshSearch = { results: [{ slug: 'b', title: 'B', author: null, sourceType: 'sermon', tradition: null, ordinal: 1, unitOrdinal: 1, heading: null, snippet: 'x', rank: 1 }], total: 1, totalCapped: false };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const body = calls.length === 1 ? page1 : calls.length === 2 ? page2 : freshSearch;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const { container, findByText } = render(<CatalogSearch catalog="sermons" label="Sermons" />);
    fireEvent.change(container.querySelector('input')!, { target: { value: 'first' } });
    fireEvent.submit(container.querySelector('form')!);
    const loadMoreBtn = await findByText(/Load more/);
    fireEvent.click(loadMoreBtn);
    await findByText('A2');

    fireEvent.change(container.querySelector('input')!, { target: { value: 'second' } });
    fireEvent.submit(container.querySelector('form')!);
    await findByText('B');
    await waitFor(() => {
      expect(container.textContent).not.toContain('A2');
    });
    expect(new URL(calls.at(-1)!, 'https://x.test').searchParams.get('offset')).toBe('0');
  });

  it('a REJECTED request renders as an error, never as "No matches."', async () => {
    // A 400 that renders as an empty result set is the unearned-green shape in UI form: the screen
    // reports a clean answer to a query the server refused.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'unknown sub-filter "hymnz"' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const { container } = render(<CatalogSearch catalog="sermons" label="Sermons" />);
    fireEvent.change(container.querySelector('input')!, { target: { value: 'grace' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => {
      if (!container.querySelector('[role="alert"]')) throw new Error('no error rendered yet');
    }, { timeout: 3000 });
    expect(container.textContent).toContain('unknown sub-filter');
    expect(container.textContent).not.toContain('No matches.');
  });
});
