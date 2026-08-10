// Red-proofs for scripts/lib/coverage-census-core.mts — the floor bar is
// watched break, gains are watched register, and phantom verses (the 999
// sentinel gap) are watched NOT appear.
import { describe, it, expect } from 'vitest';
import { buildCensus, diffCensus, chapterKeyOf } from '../../scripts/lib/coverage-census-core.mjs';

// A two-book fake canon: book 1 ch 1 has 3 verses, ch 2 has 2; book 2 ch 1 has 1.
const VERSE_COUNTS = { '1': { '1': 3, '2': 2 }, '2': { '1': 1 } };

const V = (book: number, ch: number, v: number) => book * 1_000_000 + ch * 1000 + v;

describe('coverage-census core', () => {
  it('counts any-voice and ≥2-author verses against the REAL verse universe', () => {
    const census = buildCensus(
      [
        { verseId: V(1, 1, 1), authors: 3 },
        { verseId: V(1, 1, 2), authors: 1 },
        { verseId: V(1, 2, 1), authors: 2 },
      ],
      VERSE_COUNTS,
    );
    expect(census).toEqual([
      { book: 1, chapter: 1, verses: 3, withVoice: 2, with2Plus: 1 },
      { book: 1, chapter: 2, verses: 2, withVoice: 1, with2Plus: 1 },
      { book: 2, chapter: 1, verses: 1, withVoice: 0, with2Plus: 0 },
    ]);
  });

  it('does not manufacture phantom verses for chapters with no coverage', () => {
    const census = buildCensus([], VERSE_COUNTS);
    expect(census.reduce((n, c) => n + c.verses, 0)).toBe(6); // 3+2+1, not 2*999+999
  });

  it('chapterKeyOf splits book/chapter/verse the way the id scheme encodes them', () => {
    expect(chapterKeyOf(V(40, 3, 16))).toBe(40003);
  });

  it('RED: the floor bar trips when a covered chapter loses ≥2-author verses', () => {
    const before = buildCensus(
      [{ verseId: V(1, 1, 1), authors: 2 }, { verseId: V(1, 1, 2), authors: 2 }],
      VERSE_COUNTS,
    );
    const after = buildCensus([{ verseId: V(1, 1, 1), authors: 2 }], VERSE_COUNTS);
    const d = diffCensus(before, after);
    expect(d.floorBreaks).toEqual([{ book: 1, chapter: 1, before: 2, after: 1 }]);
  });

  it('the floor does NOT bite where coverage never existed (a batch did not create the gap)', () => {
    const before = buildCensus([], VERSE_COUNTS);
    const after = buildCensus([{ verseId: V(1, 1, 1), authors: 2 }], VERSE_COUNTS);
    const d = diffCensus(before, after);
    expect(d.floorBreaks).toEqual([]);
    expect(d.chaptersGained2Plus).toBe(1);
    expect(d.versesGained2Plus).toBe(1);
  });

  it('a chapter missing from the after picture entirely is a floor break at zero', () => {
    const before = buildCensus([{ verseId: V(2, 1, 1), authors: 2 }], VERSE_COUNTS);
    // after built from a canon where book 2 ch 1 has no rows AND buildCensus
    // still lists it at zero — diff must see before>0, after=0.
    const after = buildCensus([], VERSE_COUNTS);
    const d = diffCensus(before, after);
    expect(d.floorBreaks).toEqual([{ book: 2, chapter: 1, before: 1, after: 0 }]);
  });

  it('gains register without tripping the floor', () => {
    const before = buildCensus([{ verseId: V(1, 1, 1), authors: 1 }], VERSE_COUNTS);
    const after = buildCensus(
      [{ verseId: V(1, 1, 1), authors: 3 }, { verseId: V(1, 1, 3), authors: 1 }],
      VERSE_COUNTS,
    );
    const d = diffCensus(before, after);
    expect(d.floorBreaks).toEqual([]);
    expect(d.versesGainedVoice).toBe(1);
    expect(d.versesGained2Plus).toBe(1);
  });
});
