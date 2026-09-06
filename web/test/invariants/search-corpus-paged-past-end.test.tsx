// @vitest-environment jsdom
//
// Search — a corpus group paged past its end shows its TRUE count and a "First page" link, not a
// self-contradictory "No matches".
//
// THE DEFECT, a missed third case of S-12. Each corpus group is its OWN capped query (S-12), and
// the per-group page window applies `LIMIT $5 OFFSET $6` while the count subquery applies only
// `LIMIT ${COUNT_CAP}` — it deliberately does NOT apply offset (search-sections.ts:156,171-180).
// So a paged URL with `off_<group>` past the distinct-unit total returns the real shape
// `{ results: [], total: N>0 }`. The corpus render branch keyed only on `results.length === 0`
// and rendered `SearchGroupEmpty` ("No matches in {label}.") no matter that the same group's
// header truthfully showed `N matches` — a visible self-contradiction, and it dropped the only
// recovery affordance (the pager's "First page" link), so recovery needed a URL edit or the back
// button. The personal-group branch in the SAME file kept the pager on empty rows for exactly
// this; the corpus branch was the asymmetry (introduced in de38bbbd).
//
// REACHABILITY (two paths, both produce the same `{ results: [], total: N>0 }` shape):
//   (a) a hand-edited `off_<group>` past the group's distinct-unit total — one URL edit, no
//       backend change (the test below, Path A);
//   (b) a shared paged URL whose target later shrank by a work-level quarantine — the module's
//       contract is that a paged URL "survives a refresh and a share" (search-groups.ts:15-16).
//       `s.status = 'published'` is re-asserted in BOTH the page predicate and the count
//       predicate, so quarantining a source drops its units from `total` at read time.
//
// WHAT IS AND ISN'T PINNED HERE. This is a pure RENDER-BRANCH test: it stubs `searchSections` to
// the real paged-past-end shape for the `commentaries` catalog and renders the SHIPPED `SearchPage`.
// It does not exercise the engine — the SQL argument for why `{ results: [], total: 4 }` is the
// real shape at `offset > total` is in search-sections.ts (the count subquery omits offset). The
// engine layer is pinned by search-register-groups.test.ts (S-12's first two cases).
//
// Red-proof: the assertions below are the inverted bug. To watch them fail, restore the buggy
// branch `result.value.results.length === 0 ? <SearchGroupEmpty …/>` in page.tsx — the
// paged-past-end test then renders "No matches in commentaries." with no "First page" link, and
// the assertions on the absence of "No matches" and the presence of "First page" both go red.

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── module mocks (no DB, no auth, no next/headers, no ref parser) ─────────────────────────────
vi.mock('@/lib/session', () => ({
  // signed-out: no personal groups, so the personal fan-out is never issued.
  currentUser: async () => null,
}));
vi.mock('@/lib/public-read-limit', () => ({
  // no throttle: the corpus fan-out runs unconditionally for a non-empty `q`.
  publicReadPageThrottle: async () => null,
}));
vi.mock('@bible/ref-parse', () => ({
  // a non-reference query ("grace"): no "Go to …" jump above the groups.
  parseRef: () => null,
}));

// The engine. `state.commentary` is the shape returned FOR THE `commentaries` CATALOG ONLY; every
// other catalog returns an honest empty so its offset-0 render is the consistent
// "0 matches" + "No matches", not the contradiction the bug produces when a paged-past-end shape
// is stubbed onto a group whose offset is 0. Calls are recorded so a test can prove the paged
// offset from the URL actually reaches the engine (the entry path is real, not a vacuous render).
const state = vi.hoisted(() => ({
  commentary: { results: [], total: 0, totalCapped: false } as {
    results: { slug: string; title: string; author: string | null; sourceType: string; tradition: string | null; ordinal: number; unitOrdinal: number | null; heading: string | null; snippet: string; rank: number }[];
    total: number;
    totalCapped: boolean;
  },
  calls: [] as { catalog?: string; offset: number }[],
}));
vi.mock('@/lib/search-sections', () => ({
  searchSections: async (opts: { catalog?: string; offset?: number }) => {
    state.calls.push({ catalog: opts.catalog, offset: opts.offset ?? 0 });
    return opts.catalog === 'commentaries' ? state.commentary : { results: [], total: 0, totalCapped: false };
  },
}));
vi.mock('@/lib/search-lexicons', () => ({
  searchLexicons: async () => ({ results: [], total: 0, totalCapped: false }),
}));
// Signed-out means these are never called, but they are still stubbed so the import graph holds
// without a database or an auth backend.
vi.mock('@/lib/search-personal', () => ({
  searchStudies: async () => ({ rows: [], total: 0, totalCapped: false }),
  searchPrayers: async () => ({ rows: [], total: 0, totalCapped: false }),
  searchNotes: async () => ({ rows: [], total: 0, totalCapped: false }),
}));
vi.mock('@/lib/user-corpus/search', () => ({ keywordSearch: async () => [] }));
vi.mock('@/lib/user-corpus/access', () => ({ uploadDenial: () => null }));

import SearchPage from '@/app/search/page';
import type { RawSearchParams } from '@/lib/search-groups';

/** Render the SHIPPED async SearchPage against stubbed engine modules. Calling the page
 *  directly and awaiting its JSX (the catalog-row-affordances.test.tsx harness) bypasses the
 *  server-component boundary while still exercising the real render branches. */
async function searchPage(params: RawSearchParams): Promise<HTMLElement> {
  const jsx = await SearchPage({ searchParams: Promise.resolve(params) });
  return render(jsx).container;
}

beforeEach(() => {
  state.calls.length = 0;
  state.commentary = { results: [], total: 0, totalCapped: false };
});
afterEach(cleanup);

describe('corpus group paged past its end — the S-12 third case', () => {
  it('shows the true count and a "First page" link, not a self-contradictory "No matches"', async () => {
    // Path A: a hand-edited `off_commentaries=5` on a query whose distinct-unit total is 4. The
    // page window at offset 5 returns []; the count subquery (no offset) returns 4 — real shape.
    state.commentary = { results: [], total: 4, totalCapped: false };
    const container = await searchPage({ q: 'grace', off_commentaries: '5' });
    const text = container.textContent ?? '';

    // The header truthfully reports the group's own count (the count query, which omits offset).
    expect(text, 'the header still reports the non-zero total from the count query').toMatch(/4 matches/);
    // The body no longer says "No matches" — the window is empty ONLY because of the offset.
    expect(text, 'the body must not contradict a non-zero header with "No matches"').not.toMatch(
      /No matches in commentaries\./,
    );
    // The recovery affordance the personal branch already keeps: a "First page" link back to page 1.
    expect(text, 'the "First page" link must be reachable when paged past the end').toMatch(/First page/i);
    // The pager must not emit a malformed "Show more (5 of 4)" label: hasMore is `offset + 0 < total`
    // = `5 < 4` = false, so showMoreHref is undefined and the "Show more" link does not render.
    expect(text, 'no malformed "Show more" label past the end').not.toMatch(/Show more/i);
    // And no empty bordered <ul> — CorpusGroupRows is gated on results.length > 0.
    expect(container.querySelectorAll('ul.border-y, ul[class*="border-y"]')).toHaveLength(0);

    // The stubbed shape is the real entry path, not a vacuous render: the paged offset from the
    // URL reaches the engine for the commentaries group.
    const commCall = state.calls.find((c) => c.catalog === 'commentaries');
    expect(commCall, 'searchSections was called for the commentaries group').toBeDefined();
    expect(commCall!.offset, 'the paged offset from the URL reaches the engine').toBe(5);
  });

  it('the "First page" link targets this group\'s reset-to-zero offset, leaving the query intact', async () => {
    // The recovery link is `buildSearchHref(pagedGroup(state, id, 0))` — it zeroes ONLY this
    // group's offset, so the query the reader was running survives the recovery.
    state.commentary = { results: [], total: 4, totalCapped: false };
    const container = await searchPage({ q: 'grace', off_commentaries: '5', off_sermons: '10' });
    const firstPageLink = [...container.querySelectorAll('a')].find((a) => /First page/i.test(a.textContent ?? ''));
    expect(firstPageLink, 'a "First page" link renders').toBeTruthy();
    const href = firstPageLink!.getAttribute('href') ?? '';
    expect(href, 'the commentaries offset is reset to 0').not.toMatch(/off_commentaries=/);
    expect(href, 'the query survives the recovery').toMatch(/q=grace/);
    expect(href, 'a sibling group\'s offset is left untouched (S-12: paging is per-group)').toMatch(
      /off_sermons=10/,
    );
  });

  it('honest empty (offset 0, total 0) still says "No matches" and offers no pager — no regression', async () => {
    // The common case the buggy branch handled: a fresh empty query at offset 0. This must keep
    // rendering SearchGroupEmpty, and there is nothing to page back to, so no "First page" link.
    state.commentary = { results: [], total: 0, totalCapped: false };
    const container = await searchPage({ q: 'grace' });
    const text = container.textContent ?? '';
    expect(text, 'a genuinely empty group says so').toMatch(/No matches in commentaries\./);
    expect(text, 'the header reports the honest zero').toMatch(/0 matches/);
    expect(text, 'nothing to page back to at offset 0').not.toMatch(/First page/i);
    expect(text, 'no "Show more" link for a zero-total group').not.toMatch(/Show more/i);
  });

  it('an empty-but-total-zero group at a paged offset is still honest-empty (total === 0 wins)', async () => {
    // A hand-edited offset on a query that genuinely has zero matches: the count is 0, so the
    // empty is honest regardless of offset. The fix renders SearchGroupEmpty (no pager), because
    // there is no populated first page to recover to.
    state.commentary = { results: [], total: 0, totalCapped: false };
    const container = await searchPage({ q: 'nothinghere', off_commentaries: '5' });
    const text = container.textContent ?? '';
    expect(text, 'total === 0 is honest empty even when offset > 0').toMatch(/No matches in commentaries\./);
    expect(text, 'no "First page" link when there is no populated page to recover to').not.toMatch(/First page/i);
  });

  it('a populated group is unchanged — rows render, the count shows, no regression', async () => {
    // Regression guard for the CorpusGroupRows gate: a non-empty result still renders its bordered
    // list and row, the header counts, and at offset 0 there is no "First page" link.
    state.commentary = {
      results: [
        {
          slug: 'calvin-institutes',
          title: 'Institutes of the Christian Religion',
          author: 'John Calvin',
          sourceType: 'commentary',
          tradition: 'reformed',
          ordinal: 1,
          unitOrdinal: 1,
          heading: 'Book I',
          snippet: 'the <mark>grace</mark> of God',
          rank: 1.0,
        },
      ],
      total: 1,
      totalCapped: false,
    };
    const container = await searchPage({ q: 'grace' });
    const text = container.textContent ?? '';
    expect(text, 'the row renders').toMatch(/Institutes of the Christian Religion/);
    expect(text, 'the row names its author (attribution)').toMatch(/John Calvin/);
    expect(text, 'the singular count renders').toMatch(/1 match/);
    expect(text, 'a populated group is not honest-empty').not.toMatch(/No matches in commentaries\./);
    expect(text, 'offset 0: no "First page" link').not.toMatch(/First page/i);
    // The bordered list IS present for a populated group (the gate keeps it; it does not remove it).
    expect(
      container.querySelectorAll('ul.border-y, ul[class*="border-y"]').length,
      'the populated group renders its bordered rows list',
    ).toBeGreaterThan(0);
  });
});
