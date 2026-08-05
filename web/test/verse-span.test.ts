// chaptersInSpan — the pure half of verse previews (web/src/lib/verse-preview.ts).
//
// Every case here is a shape the plan tables actually produce, not an invented one: a topical
// entry's verse window, the whole-chapter sentinel the topical index prints, a canonical-group
// day that straddles a book boundary, and a span long enough to hit the cap. The cap case is the
// one that matters most for honesty — a preview that silently drops chapters reads as complete.

import { describe, expect, it } from 'vitest';
import { CHAPTER_END_SENTINEL } from '@/bible/ref-parse';
import {
  chaptersInSpan,
  isWholeChapter,
  MAX_PREVIEW_CHAPTERS,
  wholeChapterSpan,
} from '@/lib/verse-preview';

const id = (book: number, chapter: number, verse: number) => book * 1_000_000 + chapter * 1000 + verse;

describe('chaptersInSpan', () => {
  it('a verse range inside one chapter yields that window only', () => {
    // Nave's cites 1 Kings 18:24-39 under PRAYER — the reference in the design sketch.
    const s = chaptersInSpan(id(11, 18, 24), id(11, 18, 39));
    expect(s.slices).toHaveLength(1);
    expect(s.slices[0]).toMatchObject({ bookSlug: '1ki', chapter: 18, fromVerse: 24, toVerse: 39 });
    expect(s.truncated).toBe(false);
    expect(s.totalChapters).toBe(1);
  });

  it('a whole-chapter reference keeps the sentinel as its end', () => {
    const s = chaptersInSpan(id(1, 1, 1), id(1, 1, CHAPTER_END_SENTINEL));
    expect(s.slices[0]!.fromVerse).toBe(1);
    expect(s.slices[0]!.toVerse).toBe(CHAPTER_END_SENTINEL);
    expect(isWholeChapter(s)).toBe(true);
  });

  it('a multi-chapter span inside one book yields every chapter, in canon order', () => {
    const s = chaptersInSpan(id(45, 1, 1), id(45, 3, CHAPTER_END_SENTINEL));
    expect(s.slices.map((x) => x.chapter)).toEqual([1, 2, 3]);
    expect(s.slices.every((x) => x.bookSlug === 'rom')).toBe(true);
  });

  it('a span crossing a book boundary continues into the next book', () => {
    // SEED: stop the loop at startBook and this returns Romans 16 alone. Canonical-group plans
    // straddle routinely — 87 Pauline chapters over 24 days guarantees it.
    const s = chaptersInSpan(id(45, 16, 1), id(46, 2, CHAPTER_END_SENTINEL));
    expect(s.slices.map((x) => `${x.bookSlug} ${x.chapter}`)).toEqual(['rom 16', '1co 1', '1co 2']);
    // The middle of a crossing keeps whole chapters; only the ends carry the cited window.
    expect(s.slices[0]).toMatchObject({ fromVerse: 1, toVerse: CHAPTER_END_SENTINEL });
  });

  it('caps a long span and SAYS it capped, carrying the true total', () => {
    const s = chaptersInSpan(id(1, 1, 1), id(1, 20, CHAPTER_END_SENTINEL));
    expect(s.slices).toHaveLength(MAX_PREVIEW_CHAPTERS);
    expect(s.truncated).toBe(true);
    expect(s.totalChapters).toBe(20);
  });

  it('clears a whole-Bible plan pace without truncating', () => {
    // 1,189 chapters over 182 days is ~7/day; a cap under that would mark the commonest long
    // plan permanently truncated.
    const s = chaptersInSpan(id(1, 1, 1), id(1, 7, CHAPTER_END_SENTINEL));
    expect(s.truncated).toBe(false);
  });

  it('refuses a backwards span rather than emitting an inverted window', () => {
    // Backwards INSIDE one chapter is the only case that reaches the guard: the chapter loop
    // still runs once, so without the check this returns a slice with fromVerse 39 > toVerse 24 —
    // a window that filters to nothing and renders as "no verses found for this reference".
    // A backwards span across chapters or books is swallowed by the loop bounds and proves
    // nothing about the guard, which is what the first version of this test did.
    const s = chaptersInSpan(id(11, 18, 39), id(11, 18, 24));
    expect(s.slices).toHaveLength(0);
    // And the cross-chapter form stays refused too.
    expect(chaptersInSpan(id(45, 3, 1), id(45, 1, 1)).slices).toHaveLength(0);
  });

  it('refuses a malformed book number rather than guessing', () => {
    expect(chaptersInSpan(id(99, 1, 1), id(99, 1, 5)).slices).toHaveLength(0);
  });

  it('does not run past the end of a book', () => {
    // Jude (65) has one chapter; an end chapter beyond it must clamp, not invent chapters.
    const s = chaptersInSpan(id(65, 1, 1), id(65, 9, CHAPTER_END_SENTINEL));
    expect(s.slices).toHaveLength(1);
  });
});

describe('wholeChapterSpan / isWholeChapter', () => {
  it('opens the chapter a cited reference starts in', () => {
    const s = wholeChapterSpan(id(11, 18, 24));
    expect(s.slices).toHaveLength(1);
    expect(s.slices[0]).toMatchObject({ chapter: 18, fromVerse: 1, toVerse: CHAPTER_END_SENTINEL });
    expect(isWholeChapter(s)).toBe(true);
  });

  it('reports a cited window as NOT a whole chapter, so the expand control has a job', () => {
    expect(isWholeChapter(chaptersInSpan(id(11, 18, 24), id(11, 18, 39)))).toBe(false);
  });
});
