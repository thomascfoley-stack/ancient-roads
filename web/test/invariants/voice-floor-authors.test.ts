// ≥2 VOICES MUST MEAN ≥2 DISTINCT AUTHORS.
//
// THE DEFECT. `voicesForPassage` gated its rungs on ENTRY COUNT, and `pickDiverse` bucketed by
// TRADITION and never by author:
//   verse rung:   `if (verseExact.length >= 2)`    ← two entries, possibly one author
//   chapter rung: `if (published.length >= 1)`     ← ONE entry satisfies a "≥2 voices" rung
// and `pickDiverse` round-robins across tradition buckets, so two entries by the same author sit
// in the same bucket and are drawn on successive rounds. Measured over the whole served corpus
// (`src/scripts/measure-voice-floor.mts`, 229,292 non-empty sets): **100 sets rendered two cards
// carrying ONE author** (all John Wesley, all Song of Solomon) and **17 rendered a single card** —
// 117 sets reporting a satisfied floor while failing it.
//
// WHY IT MATTERS MORE THAN THE COUNT. Song of Solomon is a KNOWN coverage hole (GO_LIVE_STATUS:
// "0 rows in the served exegetical pool for the entire book"). Rendering Wesley twice does not
// merely miscount — it CONCEALS that hole behind an apparently-satisfied floor. Degrading to
// `lead-only` is the truthful outcome: it does not restore coverage, it stops overstating it.
//
// NOT COVERED BY THE HELD-OUT EVAL. v4 measures /ask retrieval via `legalBasePool` →
// `selectDiverse` (caps by CHAPTER). Today runs `voicesForPassage` → `pickDiverse` (buckets by
// TRADITION). No shared function, so v4 can neither detect a regression here nor certify a fix.
// The corpus census in `measure-voice-floor.mts` is the measurement of record for this surface.
//
// Each case below states what to break to watch it go RED (THE_LOOP.md).

import { describe, expect, it } from 'vitest';
import { encodeVerseId } from '@/bible/verse-id';
import { voicesForPassage } from '@/lib/today';
import { pickDiverse } from '@/components/commentary-panel';
import type { CommentaryEntry } from '@/lib/bible';

function entry(over: Partial<CommentaryEntry> & Pick<CommentaryEntry, 'author' | 'verseStart' | 'verseEnd'>): CommentaryEntry {
  return {
    year: 1700,
    tradition: 'reformed',
    sourceTitle: 'Test Commentary',
    sourceUrl: '',
    text: 'A grounded comment on the passage.',
    ...over,
  };
}

const GEN1_1 = { start: encodeVerseId({ book: 1, chapter: 1, verse: 1 }), end: encodeVerseId({ book: 1, chapter: 1, verse: 1 }) };
const GEN_BOOK = 1;

// Two PUBLISHED whole-Bible authors, so isPublishedCommentaryEntry admits them for any book.
const WESLEY = 'John Wesley';
const HENRY = 'Matthew Henry';

describe('the ≥2-voices floor counts AUTHORS, not entries', () => {
  it('VERSE rung: two entries by the SAME author do not satisfy the floor', () => {
    // SEED: revert the verse rung to `verseExact.length >= 2` → this returns rung 'verse'
    // with two Wesley cards (RED).
    const entries = [
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1, text: 'first Wesley note' }),
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1, text: 'second Wesley note' }),
    ];
    const { voices, rung } = voicesForPassage(GEN1_1, entries, GEN_BOOK);
    expect(new Set(voices.map((v) => v.author)).size).not.toBe(1);
    expect(rung).toBe('lead-only');
    expect(voices).toEqual([]);
  });

  it('VERSE rung: two entries by DIFFERENT authors do satisfy it', () => {
    const entries = [
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1 }),
      entry({ author: HENRY, verseStart: 1, verseEnd: 1 }),
    ];
    const { voices, rung } = voicesForPassage(GEN1_1, entries, GEN_BOOK);
    expect(rung).toBe('verse');
    expect(new Set(voices.map((v) => v.author)).size).toBe(2);
  });

  it('CHAPTER rung: a SINGLE entry does not satisfy a ≥2-voices rung', () => {
    // SEED: revert the chapter rung to `published.length >= 1` → returns rung 'chapter'
    // with ONE card while claiming the floor is met (RED).
    const entries = [entry({ author: WESLEY, verseStart: 9, verseEnd: 9 })]; // same chapter, other verse
    const { voices, rung } = voicesForPassage(GEN1_1, entries, GEN_BOOK);
    expect(rung).toBe('lead-only');
    expect(voices).toEqual([]);
  });

  it('CHAPTER rung: the real Song-of-Solomon shape — many entries, ONE author — degrades honestly', () => {
    // This is the measured production case: 100 sets, all Wesley, all SoS. Rendering him twice
    // concealed a known zero-coverage book behind a satisfied-looking floor.
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry({ author: WESLEY, verseStart: i + 5, verseEnd: i + 5, text: `Wesley on verse ${i + 5}` }));
    const { voices, rung } = voicesForPassage(GEN1_1, entries, GEN_BOOK);
    expect(rung).toBe('lead-only');
    expect(voices).toEqual([]);
  });

  it('CHAPTER rung: two authors elsewhere in the chapter still satisfy it', () => {
    const entries = [
      entry({ author: WESLEY, verseStart: 9, verseEnd: 9 }),
      entry({ author: HENRY, verseStart: 12, verseEnd: 12 }),
    ];
    const { voices, rung } = voicesForPassage(GEN1_1, entries, GEN_BOOK);
    expect(rung).toBe('chapter');
    expect(new Set(voices.map((v) => v.author)).size).toBe(2);
  });
});

describe('pickDiverse prefers a NEW author over a second entry by one already picked', () => {
  it('does not spend both slots on one author when another is available', () => {
    // SEED: remove the per-author dedupe from pickDiverse → returns two Wesley entries,
    // because both sit in the same tradition bucket and are drawn on successive rounds (RED).
    const entries = [
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1, tradition: 'methodist', year: 1750, text: 'W1' }),
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1, tradition: 'methodist', year: 1751, text: 'W2' }),
      entry({ author: HENRY, verseStart: 1, verseEnd: 1, tradition: 'methodist', year: 1710, text: 'H1' }),
    ];
    const picked = pickDiverse(entries, 2);
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((p) => p.author)).size).toBe(2);
  });

  it('still fills up to `max` from one author when there is genuinely no one else', () => {
    // Dedupe must not STARVE a surface that legitimately has one author with several notes:
    // the reader panels call pickDiverse(entries, 10) to show a work in depth. Only the
    // ≥2-voices FLOOR is an author question; the panel is not.
    const entries = Array.from({ length: 4 }, (_, i) =>
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1, year: 1750 + i, text: `W${i}` }));
    expect(pickDiverse(entries, 3)).toHaveLength(3);
  });

  it('keeps its existing contract: <= max, and returns everything when it has less than max', () => {
    const entries = [
      entry({ author: WESLEY, verseStart: 1, verseEnd: 1 }),
      entry({ author: HENRY, verseStart: 1, verseEnd: 1 }),
    ];
    expect(pickDiverse(entries, 10)).toHaveLength(2);
    expect(pickDiverse(entries, 1)).toHaveLength(1);
  });
});
