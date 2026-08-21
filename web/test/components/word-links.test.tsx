// @vitest-environment jsdom
//
// OPTION D's second half: every Strong's chip becomes a real tap target landing on
// /word/{strongs}. The chips were <span>s nested INSIDE each row's own toggle button —
// unreachable as destinations and invalid as nested interactives had they been links. What is
// pinned:
//
//   * In Word study, each row's chip is an <a href="/word/{s}"> that is NOT inside the row's
//     toggle button (validity + the toggle keeps working beside it).
//   * In the WordPanel header, the chip links the same way.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudyPanel } from '@/components/study-panel';
import { WordPanel } from '@/components/word-panel';
import type { OWord } from '@/lib/original';

const words: OWord[] = [
  { w: 'θεὸν', l: 'θεός', tr: 'theós', s: 'G2316', m: 'N- ----ASM-', g: 'God' },
  { w: 'οὐδεὶς', l: 'οὐδείς', tr: 'oudeís', s: 'G3762', m: 'A- ----NSM-', g: 'not even one' },
];

const annotation = {
  color: null, note: '', signedIn: false,
  onSetHighlight: () => {}, onClearHighlight: () => {}, onSaveNote: () => {}, onDeleteNote: () => {},
};

beforeEach(() => {
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as unknown as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Strong’s chips are destinations', () => {
  it('Word study rows: the chip is a link beside the toggle, never nested in it', () => {
    render(
      <StudyPanel
        reference="John 1:18" verseNum={18} verseText="…" entries={[]}
        originalWords={words} lang="greek" annotation={annotation} defaultTab="word" onClose={() => {}}
      />,
    );

    const chip = screen.getByRole('link', { name: 'G2316' });
    expect(chip.getAttribute('href')).toBe('/word/G2316');
    expect(screen.getByRole('link', { name: 'G3762' }).getAttribute('href')).toBe('/word/G3762');
    // Validity: no toggle button contains a link.
    for (const b of screen.getAllByRole('button')) expect(b.querySelector('a')).toBeNull();
  });

  it('WordPanel header: the chip links to the word page', () => {
    render(
      <WordPanel
        word={words[0]!} lang="greek" reference="John 1:18"
        onShowCommentary={() => {}} onClose={() => {}}
      />,
    );

    expect(screen.getByRole('link', { name: 'G2316' }).getAttribute('href')).toBe('/word/G2316');
  });
});
