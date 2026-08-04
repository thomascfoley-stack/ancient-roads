// readingLabel — how a topical day's passages are named to the reader.
// Written after a review found "Numbers 17:1-999" shipping the internal
// CHAPTER_END_SENTINEL to users as if it were a verse number.

import { describe, expect, it } from 'vitest';
import { readingLabel, type PlanReading } from '@/components/plans-client';

const r = (verse_start: number, verse_end: number): PlanReading =>
  ({ day_index: 1, ordinal: 1, verse_start, verse_end, label: null });

describe('readingLabel', () => {
  it('names a whole chapter as a chapter, never with the 999 sentinel', () => {
    // SEED: drop the sentinel branch and this reads "Numbers 17:1-999".
    expect(readingLabel(r(4_017_001, 4_017_999))).toBe('Numbers 17');
  });

  it('names a whole-chapter RANGE as chapters', () => {
    expect(readingLabel(r(1_001_001, 1_002_999))).toBe('Genesis 1–2');
  });

  it('renders a single verse, a same-chapter span, and a cross-chapter span', () => {
    expect(readingLabel(r(43_003_016, 43_003_016))).toBe('John 3:16');
    expect(readingLabel(r(43_003_016, 43_003_018))).toBe('John 3:16-18');
    expect(readingLabel(r(43_003_016, 43_004_002))).toBe('John 3:16–John 4:2');
  });

  it('does not collapse a cross-BOOK span into one chapter range', () => {
    // SEED: compare only chapter numbers (the pre-fix shape) and Romans 16:1
    // → 1 Corinthians 16:2 renders as "Romans 16:1-2".
    expect(readingLabel(r(45_016_001, 46_016_002))).toBe('Romans 16:1–1 Corinthians 16:2');
  });
});
