// @vitest-environment jsdom

// A NOTE MUST LINK TO ITS VERSE, NOT ITS CHAPTER — A7b defect, 2026-08-02.
//
// `/library/notes` built its "jump back to it" href as `/read/<slug>/<chapter>`, so a note on
// John 3:16 dropped the reader at John 3:1 and left them to find their own note in a chapter that
// runs to 36 verses. Psalm 119 would be 176.
//
// Two halves, and they fail differently, so they are asserted separately:
//   1. the link carries the verse       — a pure function, tested here
//   2. the verse is addressable + can be emphasised — rendered markup, tested here
// The SCROLL itself is layout behaviour and was verified in a browser (v16 at 80px under the
// sticky header, v1 at -638 above it); it is not asserted here because a jsdom scroll assertion
// would be asserting that a stub was called, which proves nothing about where the reader lands.
//
// WHY THE EMPHASIS IS A PROP AND NOT classList.add: the first version added the ring imperatively
// and it never appeared. The verse is React-controlled and several effects re-render after load
// (commentary prefetch, original-language prefetch, annotations), each rewriting className from
// the JSX and dropping anything added underneath. Found by reading the live DOM, not the code.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// VerseDisplay calls useRouter (the "ask about this selection" path). Outside a Next app there is
// no router context, so it is stubbed — nothing under test here navigates.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
import { VerseDisplay } from '@/components/verse-display';
import { verseHref } from '@/lib/verse-link';
import type { ChapterData } from '@/lib/bible';

afterEach(cleanup);

const JOHN_3_16 = 43_003_016;



const chapter: ChapterData = {
  book: 43,
  chapter: 3,
  verses: [
    { verse: 15, text: 'That whosoever believeth in him should not perish.' },
    { verse: 16, text: 'For God so loved the world.' },
    { verse: 17, text: 'For God sent not his Son to condemn the world.' },
  ],
};

const renderVerses = (flashVerse: number | null) =>
  render(
    <VerseDisplay
      data={chapter}
      bookName="John"
      translation="kjv"
      selectedVerse={null}
      flashVerse={flashVerse}
      onVerseClick={() => {}}
    />,
  );

describe('the notes link targets the verse', () => {
  it('carries a #v fragment, not just the chapter', () => {
    // SEED: drop the `#v${verse}` suffix -> RED. That is the defect exactly.
    expect(verseHref(JOHN_3_16)).toBe('/read/jhn/3#v16');
  });

  it('still degrades to "#" for a verse id whose book does not resolve', () => {
    expect(verseHref(999_003_016)).toBe('#');
  });
});

describe('the verse is addressable and can be emphasised', () => {
  it('every verse renders with its own id, so a fragment has something to target', () => {
    // SEED: remove `id={`v${v.verse}`}` -> RED. Without an id the fragment names nothing.
    const { container } = renderVerses(null);
    expect(container.querySelector('#v16')).not.toBeNull();
    expect(container.querySelector('#v15')).not.toBeNull();
    expect(container.querySelector('#v16')?.getAttribute('data-verse')).toBe('16');
  });

  it('ONLY the flashed verse gets the ring', () => {
    // SEED: revert to classList.add in the reader effect -> RED, because the class would not be
    // in the rendered markup at all.
    const { container } = renderVerses(16);
    expect(container.querySelector('#v16')?.className).toContain('ring-2');
    expect(container.querySelector('#v15')?.className).not.toContain('ring-2');
    expect(container.querySelector('#v17')?.className).not.toContain('ring-2');
  });

  it('no verse is ringed when nothing was deep-linked', () => {
    // The default path is every page load that did not come from a note; a ring on all of them
    // would be worse than none.
    const { container } = renderVerses(null);
    expect(container.querySelectorAll('[class*="ring-2"]')).toHaveLength(0);
  });

  it('carries scroll-margin so the sticky header does not cover the landing verse', () => {
    // Verified in a browser at 80px under the header; pinned here so a class rename is caught.
    const { container } = renderVerses(null);
    expect(container.querySelector('#v16')?.className).toContain('scroll-mt-20');
  });
});
