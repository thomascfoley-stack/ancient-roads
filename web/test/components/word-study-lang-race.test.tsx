// @vitest-environment jsdom
//
// Q3d — SWITCHING LANGUAGE MUST NOT LEAVE THE OTHER LANGUAGE'S LEXICON ON SCREEN.
//
// A QA-fleet session reported the standalone lexicon's Hebrew tab "intermittently searching stale
// Greek data, with no error and no loading indicator, on the first switch after page load". The
// word "intermittently" is the tell: it is a RACE, and the mechanism is visible in the effect.
//
//   useEffect(() => { setLex(null); loadFullLexicon(lang).then(setLex) }, [lang])
//
// There was no cleanup, so an in-flight load was never disowned. Open the page (Greek load starts),
// switch to Hebrew before it settles (effect re-runs, `lex` nulled, Hebrew load starts), and then
// the GREEK promise resolves and writes itself into state. `lang` is now 'hebrew' while `lex`
// holds Greek. Nothing looks wrong — `lex` is non-null, so the loading line is gone and no error
// shows — and the page cheerfully searches the wrong language, labelling the count "hebrew
// entries". That is exactly the reported symptom, and it is only intermittent because it depends
// on which fetch wins.
//
// The test drives the race deterministically with two hand-resolved promises, in the order that
// produces the bug: switch first, then resolve the ABANDONED load last. A test that resolved them
// in the natural order would pass against the broken code.
//
// `selected` is covered too: a Greek entry left open while the page says Hebrew is the same
// staleness one layer up, and clearing it is part of the same fix.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadFullLexicon = vi.fn();
vi.mock('../../src/lib/original', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/original')>();
  return { ...actual, loadFullLexicon: (lang: 'greek' | 'hebrew') => loadFullLexicon(lang) };
});

import WordStudyPage from '../../src/app/library/word-study/page';

afterEach(() => { cleanup(); vi.restoreAllMocks(); loadFullLexicon.mockReset(); });

// jsdom implements no media queries; the page asks `(hover: hover)` to decide whether to autofocus
// the search. Stubbing an API jsdom simply lacks is not stubbing away the behaviour under test —
// `matches: false` takes the touch branch, which does nothing, and the race below is untouched.
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

const GREEK = { G26: { lemma: 'ἀγάπη', translit: 'agapē', def: 'love', kjv: 'love' } };
const HEBREW = { H430: { lemma: 'אֱלֹהִים', translit: 'elohim', def: 'God', kjv: 'God' } };

/** A promise plus its resolver, so the test decides when — and in what order — each load lands. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('Q3d — an abandoned lexicon load cannot write itself into state', () => {
  it('resolving the Greek load AFTER switching to Hebrew does not show Greek', async () => {
    // SEED: remove the `cancelled` guard from the effect's cleanup -> RED.
    const greek = deferred<typeof GREEK>();
    const hebrew = deferred<typeof HEBREW>();
    loadFullLexicon.mockImplementationOnce(() => greek.promise).mockImplementationOnce(() => hebrew.promise);

    render(<WordStudyPage />);

    // Switch before the Greek load settles — the reported "first switch after page load".
    fireEvent.click(screen.getByRole('button', { name: /hebrew/i }));

    // ORDER IS THE WHOLE TEST. The CURRENT (Hebrew) load settles first, then the ABANDONED
    // (Greek) one lands on top of it. Resolved the other way round the bug hides completely —
    // the correct value simply happens to be written last — and a first draft of this test did
    // exactly that and passed against the unfixed code.
    hebrew.resolve(HEBREW);
    greek.resolve(GREEK);

    // The count line names the entries it is about to search. It must never say "hebrew" over a
    // Greek table — that is the defect stated exactly.
    await waitFor(() => {
      const body = document.body.textContent ?? '';
      expect(/Start typing to search/.test(body), 'still loading — the race left it stuck').toBe(true);
    });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'agap' } });
    expect(
      screen.queryByText(/ἀγάπη/),
      'the Hebrew tab is searching the Greek lexicon — the abandoned load won',
    ).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'elohim' } });
    await waitFor(() => expect(screen.getByText(/אֱלֹהִים/)).toBeTruthy());
  });

  it('the ordinary case still works — this is a guard, not a block', async () => {
    // Without this, "never call setLex at all" would pass the test above.
    loadFullLexicon.mockResolvedValue(GREEK);
    render(<WordStudyPage />);
    await waitFor(() => expect(screen.getByText(/Start typing to search/)).toBeTruthy());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'agap' } });
    await waitFor(() => expect(screen.getByText(/ἀγάπη/)).toBeTruthy());
  });
});
