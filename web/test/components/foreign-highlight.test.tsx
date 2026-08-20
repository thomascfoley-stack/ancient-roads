// @vitest-environment jsdom

// A HIGHLIGHT MADE IN ANOTHER TRANSLATION WAS EFFECTIVELY INVISIBLE.
//
// The translation pin (§1.3) is right that a sub-verse span cannot render exactly outside the
// translation it was anchored in — the offsets address a different text. But the degradation
// shipped as a 6px superscript dot and nothing else: a KJV highlight viewed in WEB was, for
// every practical purpose, gone. A reader who highlights in one translation and reads in
// another loses their marks silently.
//
// The repair keeps the pin and loses the invisibility: a foreign span paints the WHOLE VERSE in
// a clearly lighter wash of its colour (the mark is approximate — it cannot point at the exact
// words — but it is present), and the small indicator stays, now naming the translation on
// hover. Native spans must render EXACTLY as before; the second test pins that path so this
// change cannot widen.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// VerseDisplay calls useRouter (the "ask about this selection" path). Outside a Next app there is
// no router context, so it is stubbed — nothing under test here navigates.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
import { VerseDisplay, type StoredSpan } from '@/components/verse-display';
import { HIGHLIGHT_BG, HIGHLIGHT_WASH } from '@/lib/highlight-colors';
import type { ChapterData } from '@/lib/bible';

afterEach(cleanup);

const chapter: ChapterData = {
  book: 43,
  chapter: 3,
  verses: [
    { verse: 15, text: 'That whosoever believeth in him should not perish.' },
    { verse: 16, text: 'For God so loved the world.' },
  ],
};

const renderWith = (spans: StoredSpan[], translation = 'web') =>
  render(
    <VerseDisplay
      data={chapter}
      bookName="John"
      translation={translation}
      selectedVerse={null}
      onVerseClick={() => {}}
      highlights={new Map([[16, spans]])}
    />,
  );

const verseEl = (container: HTMLElement, verse: number) => {
  const el = container.querySelector(`[data-verse="${verse}"]`);
  expect(el, `verse ${verse} did not render`).not.toBeNull();
  return el!;
};

describe('a span anchored in another translation', () => {
  it('washes the whole verse in a lighter shade of its colour', () => {
    // RED-PROOF: revert verse-display to the dot-only degradation -> RED; no wash class is
    // anywhere in the markup.
    const { container } = renderWith([{ start: 4, end: 7, color: 'yellow', translation: 'kjv' }]);
    expect(verseEl(container, 16).className).toContain(HIGHLIGHT_WASH['yellow']);
    // The wash is a LIGHTER presence of the same colour, not the native mark.
    expect(verseEl(container, 16).className).not.toContain(HIGHLIGHT_BG['yellow']);
    // A verse with no foreign span carries no wash.
    expect(verseEl(container, 15).className).not.toContain(HIGHLIGHT_WASH['yellow']);
  });

  it('keeps an indicator that names the translation it belongs to', () => {
    // RED-PROOF: drop the `title` -> RED. Hover was the whole ask: the dot alone cannot say
    // WHICH translation holds the highlight.
    const { container } = renderWith([{ start: 4, end: 7, color: 'sky', translation: 'kjv' }]);
    const dot = verseEl(container, 16).querySelector('[title]');
    expect(dot?.getAttribute('title')).toBe('Highlighted in KJV');
  });

  it('does not paint foreign offsets onto this translation’s text', () => {
    // The pin still holds: no word of the WEB verse wears the foreign colour as a native mark.
    const { container } = renderWith([{ start: 4, end: 7, color: 'yellow', translation: 'kjv' }]);
    const text = verseEl(container, 16).querySelector('[data-verse-text]')!;
    expect(text.querySelector(`[class*="${HIGHLIGHT_BG['yellow']}"]`)).toBeNull();
  });
});

describe('a span anchored in the active translation', () => {
  it('renders exactly as a native mark — no wash, no indicator', () => {
    const { container } = renderWith([{ start: 4, end: 7, color: 'yellow', translation: 'web' }]);
    expect(verseEl(container, 16).className).not.toContain(HIGHLIGHT_WASH['yellow']);
    expect(verseEl(container, 16).querySelector('[title]')).toBeNull();
    const text = verseEl(container, 16).querySelector('[data-verse-text]')!;
    const mark = text.querySelector(`[class*="${HIGHLIGHT_BG['yellow']}"]`);
    expect(mark?.textContent).toBe('God');
  });
});
