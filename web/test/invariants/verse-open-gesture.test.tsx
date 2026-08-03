// @vitest-environment jsdom

// THE NUMBER IS THE HANDLE; THE VERSE TEXT IS NOT — owner-ruled 2026-08-02 (ADR-047).
//
// Before: a click anywhere in a verse opened StudyPanel, whose root is a `fixed inset-0` scrim
// that closes on `e.target === e.currentTarget`. So the FIRST click of a double-click-to-select-a-
// word opened the sheet; the second click landed on the scrim and closed it; the browser's native
// word selection never reached the text. Double-click-to-select was dead for as long as
// drag-to-dismiss has existed, and no timing guard could fix it — on click one the selection is
// collapsed, so the old `!sel.isCollapsed` guard always passed.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. It can prove WHERE the handler lives: on the verse number,
// not the verse text, not the note/bookmark markers. It cannot reproduce the double-click conflict
// itself — jsdom implements neither native double-click word selection nor a compositor, so any
// scripted reconstruction would just be B2.1 again wearing a different name, not the real race.
// THE BROWSER PASS IS THE ONLY PROOF OF THE USER-FACING BEHAVIOUR, recorded in the WORKLOG for this
// change, the same way drag-handle-swallows-clicks.test.tsx already says for pointer capture.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// VerseDisplay calls useRouter (the "ask about this selection" path). Outside a Next app there is
// no router context, so it is stubbed — nothing under test here navigates.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
import { VerseDisplay } from '@/components/verse-display';
import type { ChapterData } from '@/lib/bible';

afterEach(cleanup);

const chapter: ChapterData = {
  book: 43,
  chapter: 3,
  verses: [{ verse: 16, text: 'For God so loved the world.' }],
};

function renderVerse(opts: { hasNote?: boolean; isBookmarked?: boolean } = {}) {
  const onVerseClick = vi.fn();
  const { container } = render(
    <VerseDisplay
      data={chapter}
      bookName="John"
      translation="web"
      selectedVerse={null}
      onVerseClick={onVerseClick}
      notedVerses={opts.hasNote ? new Set([16]) : undefined}
      bookmarkedVerses={opts.isBookmarked ? new Set([16]) : undefined}
    />,
  );
  return { container, onVerseClick };
}

describe('opening the study surface from a verse', () => {
  it('a click on the verse TEXT does not open it', () => {
    // RED-PROOF: put the onClick back on the outer <span> -> RED. jsdom's getSelection() reports
    // isCollapsed === true with nothing selected, so the restored `!sel.isCollapsed` guard passes
    // and the handler fires here too. That IS the defect this change removes.
    const { container, onVerseClick } = renderVerse();
    const text = container.querySelector('[data-verse-text="16"]');
    expect(text).toBeTruthy();
    fireEvent.click(text!);
    expect(onVerseClick).not.toHaveBeenCalled();
  });

  it('a click on the verse NUMBER does', () => {
    // RED-PROOF: drop the onClick from the <sup> -> RED. This is the load-bearing case: without
    // it, a later "simplification" could silently delete the only zero-selection route into
    // commentaries and nothing here would notice.
    const { container, onVerseClick } = renderVerse();
    const verseSpan = container.querySelector('#v16')!;
    const number = verseSpan.querySelector('sup')!;
    expect(number.textContent).toBe('16');
    fireEvent.click(number);
    expect(onVerseClick).toHaveBeenCalledWith(16);
    expect(onVerseClick).toHaveBeenCalledTimes(1);
  });

  it('the note and bookmark markers are not handles', () => {
    // RED-PROOF: move the onClick onto a shared <sup> class, or up to the outer span -> RED.
    // Pins that the click lives on the NUMBER specifically, not on "any <sup> in a verse".
    const { container, onVerseClick } = renderVerse({ hasNote: true, isBookmarked: true });
    const verseSpan = container.querySelector('#v16')!;
    const sups = [...verseSpan.querySelectorAll('sup')];
    // number, note (✎), bookmark (⚑) — exactly the three markers this verse can carry.
    expect(sups.map((s) => s.textContent)).toEqual(['16', '✎', '⚑']);
    fireEvent.click(sups[1]!); // note marker
    fireEvent.click(sups[2]!); // bookmark marker
    expect(onVerseClick).not.toHaveBeenCalled();
  });
});
