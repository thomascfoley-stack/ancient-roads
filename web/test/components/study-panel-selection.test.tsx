// @vitest-environment jsdom
//
// OPTION C — THE TAB ANSWERS THE SELECTION (owner ruling 2026-08-21: "do A + C now"). Arrive at
// Word study with a selection and the matching word is PINNED on top, already open, with the
// rest of the verse folded below a hairline — instead of an undifferentiated original-order
// list the reader must hunt through. What is pinned (in both senses):
//
//   * With a selection whose match is index 0 (θεὸν for "God"): a "Matches your selection"
//     header naming the word; the matched row first and auto-expanded; a "twice in the Greek"
//     caption when the same Strong's occurs again in the verse; and the remainder under
//     "The rest of the verse · N words" with same-word siblings NOT double-listed.
//   * With a selection that matched NOTHING: an honest "No direct match" header over the full
//     list — the reader still gets the verse's words, never a dead end.
//   * With NO selection: exactly today's behavior — plain list, no headers. The conditional is
//     the feature; an always-on header would be noise on every ordinary open.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudyPanel } from '@/components/study-panel';
import type { OWord } from '@/lib/original';

const words: OWord[] = [
  { w: 'θεὸν', l: 'θεός', tr: 'theós', s: 'G2316', m: 'N- ----ASM-', g: 'God' },
  { w: 'οὐδεὶς', l: 'οὐδείς', tr: 'oudeís', s: 'G3762', m: 'A- ----NSM-', g: 'not even one' },
  { w: 'ἑώρακεν', l: 'ὁράω', tr: 'horáō', s: 'G3708', m: 'V- 3XAI-S--', g: 'to see' },
  { w: 'θεὸς', l: 'θεός', tr: 'theós', s: 'G2316', m: 'N- ----NSM-', g: 'God' },
];

const annotation = {
  color: null, note: '', signedIn: false,
  onSetHighlight: () => {}, onClearHighlight: () => {}, onSaveNote: () => {}, onDeleteNote: () => {},
};

function mount(selection?: { english: string; indices: number[] }) {
  return render(
    <StudyPanel
      reference="John 1:18"
      verseNum={18}
      verseText="No man hath seen God at any time…"
      entries={[]}
      originalWords={words}
      lang="greek"
      annotation={annotation}
      defaultTab="word"
      selection={selection}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  // WordRow's expansion fetches the lexicon; an empty object = "no entry linked", which renders.
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as unknown as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Document order of the two theós surfaces + a control word, for pin-ordering assertions. */
function orderOf(...texts: string[]): number[] {
  const html = document.body.innerHTML;
  return texts.map((t) => html.indexOf(t));
}

describe('Option C — Word study pins the selection', () => {
  it('pins the match on top, expanded, with the twice-in-the-Greek caption and a deduped rest', () => {
    mount({ english: 'God', indices: [0] });

    expect(screen.getByText(/matches your selection/i)).toBeTruthy();
    expect(screen.getByText(/“God”/)).toBeTruthy();
    // Same Strong's occurs twice — said once, in the caption, instead of listed twice.
    expect(screen.getByText(/twice in the greek/i)).toBeTruthy();
    // The rest excludes BOTH θεός occurrences: 4 words − 2 = 2.
    expect(screen.getByText(/the rest of the verse/i).textContent).toMatch(/2 words/);
    const [pinned, rest1] = orderOf('θεὸν', 'οὐδεὶς');
    expect(pinned).toBeGreaterThan(-1);
    expect(pinned).toBeLessThan(rest1); // matched word renders before the rest
    // Auto-expanded: the pinned row's lookup ran (the "no entry linked" body renders async).
    return screen.findByText(/no dictionary entry linked/i);
  });

  it('a selection that matched nothing says so over the full list', () => {
    mount({ english: 'selah', indices: [] });

    expect(screen.getByText(/no direct match/i)).toBeTruthy();
    expect(screen.getByText(/“selah”/)).toBeTruthy();
    // Full list, nothing hidden: all four words render.
    for (const w of ['θεὸν', 'οὐδεὶς', 'ἑώρακεν', 'θεὸς']) expect(screen.getByText(w)).toBeTruthy();
  });

  it('no selection: exactly the plain list — no headers, original order intact', () => {
    mount(undefined);

    expect(screen.queryByText(/matches your selection/i)).toBeNull();
    expect(screen.queryByText(/the rest of the verse/i)).toBeNull();
    const [a, b] = orderOf('θεὸν', 'οὐδεὶς');
    expect(a).toBeLessThan(b);
  });
});
