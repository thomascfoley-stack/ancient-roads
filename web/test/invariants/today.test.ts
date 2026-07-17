// The "Today" seam invariants (build task §3 date + §4 grounding). No verifier runs on this
// read path (no generation), so the guarantee has to live in these mechanical checks:
//   §3  the day is keyed by the LOCAL MM-DD, never an ordinal day-of-year, and 02-29 survives.
//   §4  voices are grounded (verse-range intersects the passage) and license-filtered
//       (a MUST_NOT_SERVE / non-allowlisted author can never render).
// Each block has a seeded-bug note: what to break to watch it go RED (THE_LOOP.md discipline).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeVerseId } from '@/bible/verse-id';
import {
  mmddOf,
  halfOf,
  spurgeonSource,
  voicesForPassage,
  type DevotionalData,
} from '@/lib/today';
import type { CommentaryEntry } from '@/lib/bible';

// ---- helpers ---------------------------------------------------------------------------------
function entry(over: Partial<CommentaryEntry> & Pick<CommentaryEntry, 'author' | 'verseStart' | 'verseEnd'>): CommentaryEntry {
  return {
    year: 1700,
    sourceTitle: 'Test Commentary',
    sourceUrl: 'https://example.test',
    text: 'A grounded comment on the passage.',
    ...over,
  };
}
function devEntry(ref: string) {
  return { ref, refDisplay: ref, verseText: 'verbatim verse text', body: 'x'.repeat(120), attribution: 'C. H. Spurgeon, Morning and Evening' };
}
// Exodus 16:21 (book 2). Verse-relative math lives in voicesForPassage via `% 1000`.
const EX16_21 = { start: encodeVerseId({ book: 2, chapter: 16, verse: 21 }), end: encodeVerseId({ book: 2, chapter: 16, verse: 21 }) };
const EX_BOOK = 2;

// ============================================================ §3 DATE RESOLUTION ==============
describe('§3 date is keyed by LOCAL MM-DD, never an ordinal day-of-year', () => {
  it('the SAME calendar day resolves the SAME entry in a leap year and a common year', () => {
    // March 1 is day-of-year 61 in leap 2024 but 60 in common 2023. An ordinal key would
    // resolve two DIFFERENT entries for the same date across years; an MM-DD key resolves one.
    const data: DevotionalData = {
      '03-01': { am: devEntry('John 3:16'), pm: devEntry('Psalm 23:1') },
      '02-29': { am: devEntry('Genesis 1:1'), pm: devEntry('Exodus 3:14') },
    };
    const leap = spurgeonSource(new Date(2024, 2, 1, 9, 0), data); // Mar 1 2024 (leap), morning
    const common = spurgeonSource(new Date(2023, 2, 1, 9, 0), data); // Mar 1 2023 (common), morning
    expect(leap?.lead.refDisplay).toBe('John 3:16');
    expect(common?.lead.refDisplay).toBe('John 3:16'); // SEED: an ordinal resolver drifts to a different day here
    expect(mmddOf(new Date(2024, 2, 1, 12))).toBe('03-01');
    expect(mmddOf(new Date(2023, 2, 1, 12))).toBe('03-01');
  });

  it('keeps 02-29 and resolves it in a leap year (never dropped or ordinal-shifted)', () => {
    const data: DevotionalData = { '02-29': { am: devEntry('Genesis 1:1'), pm: devEntry('Exodus 3:14') } };
    expect(mmddOf(new Date(2024, 1, 29, 20))).toBe('02-29');
    const feb29 = spurgeonSource(new Date(2024, 1, 29, 20, 0), data); // 8pm → evening
    expect(feb29?.lead.refDisplay).toBe('Exodus 3:14');
    expect(feb29?.half).toBe('pm');
  });

  it('AM before local midday, PM after', () => {
    expect(halfOf(new Date(2025, 0, 1, 6, 0))).toBe('am');
    expect(halfOf(new Date(2025, 0, 1, 11, 59))).toBe('am');
    expect(halfOf(new Date(2025, 0, 1, 12, 0))).toBe('pm');
    expect(halfOf(new Date(2025, 0, 1, 23, 0))).toBe('pm');
  });
});

describe('§3 the day/half are the user LOCAL clock, not the server UTC clock', () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    process.env.TZ = original;
  });
  it('a UTC instant that is the NEXT day in UTC still resolves the local day/half', () => {
    // 2025-03-01T05:00Z is 2025-02-28 21:00 in Los Angeles. The user's local day is Feb 28,
    // evening. A getUTC*-based resolver would say 03-01, morning — the exact §3 bug.
    const d = new Date('2025-03-01T05:00:00Z');
    expect(mmddOf(d)).toBe('02-28'); // SEED: swap to getUTCMonth/getUTCDate → '03-01' (RED)
    expect(halfOf(d)).toBe('pm'); //    SEED: swap to getUTCHours → 'am' (RED)
  });
});

// ============================================================ §4 GROUNDING + LICENSE =========
describe('§4 voices are grounded — the verse-range must intersect the passage', () => {
  it('at the verse rung, every returned voice intersects the passage verse; off-verse ones are dropped', () => {
    // Gill is off-verse (30-40, passage is v21) and placed FIRST with its own tradition so a
    // broken intersect filter would surface it first via pickDiverse. Henry + Calvin are on-verse.
    const entries = [
      entry({ author: 'John Gill', year: 1746, tradition: 'A', verseStart: 30, verseEnd: 40 }),
      entry({ author: 'Matthew Henry', year: 1710, tradition: 'B', verseStart: 20, verseEnd: 25 }),
      entry({ author: 'John Calvin', year: 1540, tradition: 'C', verseStart: 21, verseEnd: 21 }),
    ];
    const { voices, rung } = voicesForPassage(EX16_21, entries, EX_BOOK);
    expect(rung).toBe('verse');
    expect(voices.some((v) => v.author === 'John Gill')).toBe(false); // SEED: intersectsVerses→true (RED)
    expect(voices.every((v) => v.verseStart <= 21 && 21 <= v.verseEnd)).toBe(true);
    expect(voices.map((v) => v.author).sort()).toEqual(['John Calvin', 'Matthew Henry']);
  });

  it('degrades verse → chapter → lead-only, never a blank morning', () => {
    // No verse-exact entry, but the chapter has two → widen to the chapter (same location).
    const chapterOnly = [
      entry({ author: 'Matthew Henry', verseStart: 30, verseEnd: 35 }),
      entry({ author: 'John Calvin', verseStart: 40, verseEnd: 45 }),
    ];
    const widened = voicesForPassage(EX16_21, chapterOnly, EX_BOOK);
    expect(widened.rung).toBe('chapter');
    expect(widened.voices).toHaveLength(2);
    // Nothing in the chapter → the Spurgeon lead stands alone (never blank, never fabricated).
    expect(voicesForPassage(EX16_21, [], EX_BOOK)).toEqual({ voices: [], rung: 'lead-only' });
  });
});

describe('§4 ★ a MUST_NOT_SERVE / non-allowlisted author can never render (the Tyndale flag)', () => {
  it('excludes Tyndale Study Notes even when it is on-verse and would be picked first', () => {
    const entries = [
      entry({ author: 'Tyndale Study Notes', year: 2007, tradition: 'A', verseStart: 21, verseEnd: 21 }),
      entry({ author: 'Matthew Henry', year: 1710, tradition: 'B', verseStart: 21, verseEnd: 21 }),
      entry({ author: 'John Calvin', year: 1540, tradition: 'C', verseStart: 21, verseEnd: 21 }),
    ];
    const { voices } = voicesForPassage(EX16_21, entries, EX_BOOK);
    // SEED: drop the isPublishedCommentaryEntry filter in voicesForPassage → Tyndale renders (RED).
    expect(voices.some((v) => v.author === 'Tyndale Study Notes')).toBe(false);
    expect(voices.map((v) => v.author).sort()).toEqual(['John Calvin', 'Matthew Henry']);
  });
});
