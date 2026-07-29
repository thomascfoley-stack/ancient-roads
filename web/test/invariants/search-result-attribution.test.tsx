// @vitest-environment jsdom
//
// A SEARCH RESULT QUOTES THE CORPUS, SO IT MUST NAME THE AUTHOR.
//
// THE DEFECT (ship-committee LENS 2). `search-sections.ts` selects `s.author` and declares
// `author: string | null` on `SectionSearchResult` — the data is fetched, typed, and handed to the
// client. `catalog-search.tsx` then rendered title, sourceType, heading and snippet, and silently
// dropped the author. A hit on "Expositions of Holy Scripture" gave the reader no way to learn it
// was Maclaren.
//
// WHY THIS IS A GUARANTEE, NOT POLISH. Ancient Paths is a concordance: it reports what others have
// said, "quoted and attributed" (CLAUDE.md, PRINCIPLES I1–I6). The snippet IS a quotation — it is
// corpus prose with the hit wrapped in <mark>. Rendering a quotation with no attributable voice is
// the exact failure the product exists to prevent, and it is worse in search than in the reader,
// because search is where a reader meets a passage with no surrounding context to infer the source
// from. The register label already shipped for this reason ("the wall requires the reader can
// always tell what this is"); who said it is the other half of the same promise.
//
// Sibling guarantee, also asserted here: attribution must never degrade into a bare host URL
// (docs/LIBRARY_READER_DESIGN §37 — WorkHeader shows "title/author/tradition/license — never a
// host URL"). `SectionSearchResult` carries no URL field at all, which is the structural version
// of that rule; this test pins it so a future "helpful" addition has to argue with a red test.

import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import { CatalogSearch } from '@/components/catalog-search';
import type { SectionSearchResult } from '@/lib/search-sections';

function result(over: Partial<SectionSearchResult> = {}): SectionSearchResult {
  return {
    slug: 'maclaren-expositions',
    title: 'Expositions of Holy Scripture',
    author: 'Alexander Maclaren',
    sourceType: 'sermon',
    tradition: 'baptist',
    ordinal: 42,
    unitOrdinal: 7,
    heading: 'The Vision of Creation',
    snippet: 'the heavens and the <mark>earth</mark> were finished',
    rank: 0.9,
    ...over,
  };
}

/** Render the component with a stubbed fetch, then let its debounce settle. */
async function renderWithResults(results: SectionSearchResult[]) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ results, total: results.length, totalCapped: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  const utils = render(<CatalogSearch catalog="sermons" label="Sermons" />);
  const input = utils.container.querySelector('input');
  if (!input) throw new Error('search input not found — component shape changed');

  const { fireEvent, waitFor } = await import('@testing-library/react');
  // The component searches on form SUBMIT, not on change (there is no debounce) — changing the
  // input alone never calls run(), which is how the first version of this harness "failed" all
  // five cases by timeout and proved nothing.
  fireEvent.change(input, { target: { value: 'earth' } });
  const form = utils.container.querySelector('form');
  if (!form) throw new Error('search form not found — component shape changed');
  fireEvent.submit(form);
  await waitFor(() => {
    if (utils.container.querySelectorAll('li').length === 0) throw new Error('no results yet');
  }, { timeout: 3000 });

  globalThis.fetch = original;
  return utils;
}

describe('search results are attributed', () => {
  it('renders the AUTHOR of every result', async () => {
    // SEED: delete the author line from catalog-search.tsx → RED. This is the shipped defect.
    const { container } = await renderWithResults([result()]);
    const li = container.querySelector('li');
    expect(li).not.toBeNull();
    expect(within(li as HTMLElement).getByText(/Alexander Maclaren/)).toBeTruthy();
  });

  it('every result in a multi-hit list names its own author', async () => {
    const { container } = await renderWithResults([
      result(),
      result({ slug: 'spurgeon-sermons', title: 'Metropolitan Tabernacle Pulpit', author: 'Charles Haddon Spurgeon', ordinal: 9 }),
    ]);
    const items = [...container.querySelectorAll('li')];
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText(/Alexander Maclaren/)).toBeTruthy();
    expect(within(items[1]!).getByText(/Charles Haddon Spurgeon/)).toBeTruthy();
  });

  it('a null author degrades to an explicit marker, never to a blank or the slug', async () => {
    // Anonymous/compiled works exist in this corpus (a psalter has no single author). The card
    // must still SAY so rather than leaving the reader to guess, and must not leak the slug as a
    // pseudo-author.
    const { container } = await renderWithResults([result({ author: null })]);
    const li = container.querySelector('li') as HTMLElement;
    expect(within(li).getByText(/Unattributed/i)).toBeTruthy();
    expect(li.textContent).not.toMatch(/maclaren-expositions/);
  });

  it('never renders a bare host URL as attribution', async () => {
    const { container } = await renderWithResults([result()]);
    const li = container.querySelector('li') as HTMLElement;
    expect(li.textContent ?? '').not.toMatch(/https?:\/\//);
    expect(li.querySelector('a[href^="http"]')).toBeNull();
  });

  it('keeps the register label — attribution is added ALONGSIDE the wall, not instead of it', async () => {
    const { container } = await renderWithResults([result()]);
    const li = container.querySelector('li') as HTMLElement;
    expect(within(li).getByText(/sermon/i)).toBeTruthy();
  });
});
