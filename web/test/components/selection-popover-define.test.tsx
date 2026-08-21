// @vitest-environment jsdom
//
// OPTION A — THE ANSWER IN THE POPOVER (owner ruling 2026-08-21: "do A + C now"). "Define"
// stops being a verb whose label hides what it does: the popover itself shows the original
// word(s) that can stand behind a single-word selection. What is pinned:
//
//   * ONE match renders the word row — surface, transliteration, Strong's chip, and the
//     concordance count when known — and tapping it hands the match to onPickDefine (the full
//     entry). The answer is VISIBLE, not labeled.
//   * SEVERAL matches render every candidate (the product never guesses — original.ts's
//     standing rule), plus a "compare in word study"路 into Option C. John 21:15 "lovest"
//     really matches both agapáō and philéō; that honesty is the feature.
//   * ZERO matches renders the quiet word-study line, not nothing and not a lie.
//   * No define data (phrase selection, interlinear not loaded) renders NONE of it, and the
//     old "Define" text button is gone — the row replaced it.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockSession: { data: { user: { id: string } } | null } = { data: null };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));

import { SelectionPopover } from '@/components/selection-popover';
import type { PendingAnnotation } from '@/lib/use-text-annotation';
import type { DefineResolution } from '@/lib/original';

const pending: PendingAnnotation = {
  kind: 'verse',
  key: '18',
  start: 16,
  end: 19,
  text: 'God',
  rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20 },
};

const theos = { w: 'θεὸν', l: 'θεός', tr: 'theós', s: 'G2316', m: 'N- ----ASM-', g: 'God' };
const agapas = { w: 'ἀγαπᾷς', l: 'ἀγαπάω', tr: 'agapáō', s: 'G25', m: 'V- 2PAI-S--', g: 'to love' };
const philo = { w: 'φιλῶ', l: 'φιλέω', tr: 'philéō', s: 'G5368', m: 'V- 1PAI-S--', g: 'to be a friend' };

const one: DefineResolution = {
  english: 'God', lang: 'greek', lexiconDown: false, count: 1148,
  matches: [{ word: theos, index: 0 }],
};
const two: DefineResolution = {
  english: 'lovest', lang: 'greek', lexiconDown: false,
  matches: [{ word: agapas, index: 3 }, { word: philo, index: 9 }],
};
const none: DefineResolution = { english: 'selah', lang: 'greek', lexiconDown: false, matches: [] };

function mount(define: DefineResolution | null, handlers: { pick?: (m: unknown) => void; study?: () => void } = {}) {
  return render(
    <SelectionPopover
      pending={pending}
      contextLabel="John 1:18 · ASV"
      signedIn={false}
      define={define}
      onPickDefine={handlers.pick as never}
      onOpenWordStudy={handlers.study}
      onDismiss={() => {}}
    />,
  );
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); mockSession = { data: null }; });

describe('Option A — the original word in the popover', () => {
  it('one match: shows the word, the count, the chip — and picking it hands over the match', () => {
    const pick = vi.fn();
    mount(one, { pick });

    expect(screen.getAllByText('θεὸν').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/theós/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('G2316').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,148 verses/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /θεὸν/ })[0]!);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick.mock.calls[0]![0]).toMatchObject({ index: 0, word: { s: 'G2316' } });
  });

  it('two matches: both candidates render, never a guess, and word study offers the comparison', () => {
    const pick = vi.fn();
    const study = vi.fn();
    mount(two, { pick, study });

    expect(screen.getAllByText('ἀγαπᾷς').length).toBeGreaterThan(0);
    expect(screen.getAllByText('φιλῶ').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 Greek words/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /compare in word study/i })[0]!);
    expect(study).toHaveBeenCalledTimes(1);
    expect(pick).not.toHaveBeenCalled();
  });

  it('zero matches: the quiet word-study line, not silence', () => {
    const study = vi.fn();
    mount(none, { study });

    fireEvent.click(screen.getAllByRole('button', { name: /no greek match/i })[0]!);
    expect(study).toHaveBeenCalledTimes(1);
  });

  it('no define data: none of it renders, and the old Define button is gone for good', () => {
    mount(null);

    expect(screen.queryByText('θεὸν')).toBeNull();
    expect(screen.queryByText(/no greek match/i)).toBeNull();
    expect(screen.queryByText(/^Define$/)).toBeNull();
  });
});
