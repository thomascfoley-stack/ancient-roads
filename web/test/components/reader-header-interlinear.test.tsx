// @vitest-environment jsdom

// B14 (#109) — THE INTERLINEAR TOGGLE MUST EXPOSE ITS STATE TO SCREEN READERS.
//
// The highlight-mode toggle two buttons up carries `aria-pressed`; the interlinear toggle lost
// its `aria-pressed` AND its `aria-label` in the Visual Redesign restyle (e171de8), leaving a
// button whose only name is the glyph "אα" and whose on/off state is colour alone. A toggle
// that does not announce its state is not a toggle to a screen reader.
//
// This drives the real ReaderHeader (same argument as work-header-save-shelf next door) and
// demands both: an accessible name, and `aria-pressed` tracking the `interlinear` prop.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/reader-settings', () => ({ ReaderSettings: () => null }));

import { ReaderHeader } from '@/components/reader-header';
import { TRANSLATIONS, type Book } from '@/lib/bible';

const BOOK: Book = { bookNum: 43, slug: 'jhn', name: 'John', testament: 'NT', chapterCount: 21 };

const renderHeader = (interlinear: boolean) =>
  render(
    <ReaderHeader
      book={BOOK}
      chapter={3}
      translation={TRANSLATIONS[0]}
      onTranslationChange={() => {}}
      interlinear={interlinear}
      onToggleInterlinear={() => {}}
    />,
  );

afterEach(cleanup);

describe('B14 — the interlinear toggle announces itself and its state', () => {
  it('has an accessible name, not just the אα glyph', () => {
    renderHeader(false);
    expect(screen.getByRole('button', { name: 'Greek and Hebrew interlinear' })).toBeTruthy();
  });

  it('reports aria-pressed=false when interlinear is off', () => {
    renderHeader(false);
    const btn = screen.getByRole('button', { name: 'Greek and Hebrew interlinear' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('reports aria-pressed=true when interlinear is on', () => {
    renderHeader(true);
    const btn = screen.getByRole('button', { name: 'Greek and Hebrew interlinear' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
