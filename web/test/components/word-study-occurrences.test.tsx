// @vitest-environment jsdom
//
// A044 + A042 — THE OCCURRENCE LIST: WHERE ITS LINKS LAND, AND WHERE THE LIST EXISTS AT ALL.
//
// Two findings from the 2026-08-16 QA fleet, and they are one code path:
//
//   A044 "Word-study occurrence links jump to the top of the chapter, not the specific verse".
//        The concordance chips in the reader's word panel were built as `/read/<slug>/<chapter>`
//        with no fragment, so "also appears in John 3:16" dropped the reader at John 3:1 and left
//        them to find the word themselves. This is the SAME defect `lib/verse-link.ts` was written
//        for after the A7b walk found it in /library/notes — the report says so itself ("CONFIRMS
//        KNOWN ISSUE ... same underlying pattern on a new surface"). The cure is not a second
//        implementation of the fragment: it is the shipped `verseHref`, on this surface too.
//
//   A042 "Standalone /library/word-study is a strictly thinner tool" — of the three named gaps,
//        the cross-verse occurrence list is the one that is genuinely missing AND genuinely cheap:
//        `fetchConcordance` is keyed by a Strong's number alone, which the standalone page has in
//        `hit.strong`. The other two gaps need a verse the standalone page does not have; see the
//        report.
//
// Both assert RENDERED HREFS rather than the helper. `verseHref` already has its own unit test
// (test/invariants/verse-deep-link.test.tsx) and it was already green while this surface was
// broken — the helper was never the thing at fault. What could fail here is a surface that does
// not call it, which is precisely what a rendered assertion catches and a helper test cannot.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Concordance, LexEntry, OWord } from '../../src/lib/original';

const fetchConcordance = vi.fn();
const fetchLexEntry = vi.fn();
const loadFullLexicon = vi.fn();
vi.mock('../../src/lib/original', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/original')>();
  return {
    ...actual,
    // Arrow wrappers, not the vi.fn()s directly: the factory is hoisted above the consts above,
    // so a direct reference reads them in the temporal dead zone. Deferring to call time is what
    // the sibling word-study-lang-race.test.tsx does, for the same reason.
    fetchConcordance: (strong: string) => fetchConcordance(strong),
    fetchLexEntry: (strong: string) => fetchLexEntry(strong),
    loadFullLexicon: (lang: 'greek' | 'hebrew') => loadFullLexicon(lang),
  };
});

import { WordPanel } from '../../src/components/word-panel';
import WordStudyPage from '../../src/app/library/word-study/page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fetchConcordance.mockReset();
  fetchLexEntry.mockReset();
  loadFullLexicon.mockReset();
});

// jsdom has no media queries; the standalone page asks `(hover: hover)` to decide whether to
// autofocus its search box. Stubbing an API jsdom simply lacks is not stubbing away the behaviour
// under test — the touch branch does nothing, and nothing below depends on focus.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});

const ENTRY: LexEntry = {
  lemma: 'ποιμήν',
  translit: 'poimēn',
  pron: 'poy-mane',
  def: 'a shepherd',
  derivation: 'of uncertain affinity',
  kjv: 'shepherd, pastor',
};

// John 3:16 is not where ποιμήν occurs; it is the reference this repo's verse-link tests already
// use, and the assertion is about the SHAPE of the href, not about Greek lexicography.
const CONCORDANCE: Concordance = {
  strong: 'G4166',
  count: 2,
  verseIds: [43_003_016, 43_010_011],
};

describe('A044 — an occurrence link lands on the verse, not the top of the chapter', () => {
  it('the reader word panel links to /read/jhn/3#v16', async () => {
    // SEED: build the href as `/read/${slug}/${chapter}` again (the shipped code before this fix)
    // -> RED with '/read/jhn/3', which is the defect stated exactly.
    const word: OWord = { w: 'ποιμὴν', l: 'ποιμήν', tr: 'poimēn', s: 'G4166', m: 'N- ----NSM-', g: 'shepherd' };
    fetchLexEntry.mockResolvedValue(ENTRY);
    fetchConcordance.mockResolvedValue(CONCORDANCE);

    render(
      <WordPanel word={word} lang="greek" reference="John 10:11" onShowCommentary={() => {}} onClose={() => {}} />,
    );

    const link = await screen.findByRole('link', { name: 'John 3:16' });
    expect(link.getAttribute('href')).toBe('/read/jhn/3#v16');
  });
});

describe('A042 — the standalone lexicon carries the cross-verse occurrence list too', () => {
  it('opening an entry shows its occurrences, verse-anchored', async () => {
    // SEED: remove <ConcordanceList> from the standalone entry sheet -> RED (no link at all),
    // which is the gap the QA report named.
    loadFullLexicon.mockResolvedValue({ G4166: ENTRY });
    fetchConcordance.mockResolvedValue(CONCORDANCE);

    render(<WordStudyPage />);
    await waitFor(() => expect(screen.getByText(/Start typing to search/)).toBeTruthy());

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'poimen' } });
    // The result row, then the sheet it opens.
    fireEvent.click(await screen.findByRole('button', { name: /poimēn/ }));

    const link = await screen.findByRole('link', { name: 'John 3:16' });
    expect(link.getAttribute('href')).toBe('/read/jhn/3#v16');
    expect(fetchConcordance).toHaveBeenCalledWith('G4166');
  });
});
