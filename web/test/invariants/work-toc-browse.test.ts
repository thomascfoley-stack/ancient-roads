// BROWSING A LARGE WORK — filter and factual grouping.
//
// The corpus made this necessary rather than nice: 30 of 42 works exceed 150 units and
// spurgeon-sermons is 3,540. A flat list that long is not navigation. These are the two answers
// that require no classification of any kind — a substring filter over the labels the reader can
// already see, and a grouping derived from what the work itself states.
//
// The grouping's ABSENCES are as load-bearing as its presences, so they are asserted too: a
// sermon collection gets no grouping, because grouping sermons by theme is an interpretive claim
// in the product's own voice and that is the one thing it promises not to make.

import { describe, expect, it } from 'vitest';
import { filterTocUnits, tocGroups, tocUnitLabel } from '@/lib/work-reader';

type U = { heading: string | null; verseStart: number | null; verseEnd: number | null; firstOrdinal: number };
const u = (heading: string | null, verseStart: number | null = null, firstOrdinal = 1): U => ({
  heading,
  verseStart,
  verseEnd: verseStart,
  firstOrdinal,
});

// John 3:16 / Genesis 1:1 / Revelation 1:1 as book*1e6 + chapter*1e3 + verse.
const JOHN_3_16 = 43 * 1_000_000 + 3 * 1_000 + 16;
const GEN_1_1 = 1 * 1_000_000 + 1 * 1_000 + 1;
const REV_1_1 = 66 * 1_000_000 + 1 * 1_000 + 1;

describe('filterTocUnits', () => {
  const units = [u('Sermon 1. The Immutability of God'), u('Sermon 2. Sweet Comfort'), u('Sermon 3. GRACE Abounding')];

  it('an empty or whitespace query returns everything, not nothing', () => {
    // SEED: treat '' as "matches nothing" -> the drawer opens empty, which reads as a broken work.
    expect(filterTocUnits(units, '')).toHaveLength(3);
    expect(filterTocUnits(units, '   ')).toHaveLength(3);
  });

  it('matches case-insensitively on the visible label', () => {
    expect(filterTocUnits(units, 'grace').map((x) => x.heading)).toEqual(['Sermon 3. GRACE Abounding']);
    expect(filterTocUnits(units, 'COMFORT')).toHaveLength(1);
  });

  it('filters on the LABEL, so an unheaded unit is findable by its reference', () => {
    // A commentary unit has heading NULL and is labelled from its verse anchor. Filtering the raw
    // heading instead of the label would make every such unit permanently unmatchable.
    const withRef = [u(null, JOHN_3_16), u('Preface')];
    expect(tocUnitLabel(withRef[0]!)).toContain('John');
    expect(filterTocUnits(withRef, 'john')).toHaveLength(1);
  });

  it('returns a copy, never the caller’s array', () => {
    const out = filterTocUnits(units, '');
    out.pop();
    expect(units).toHaveLength(3);
  });
});

describe('tocGroups — derived from the work, never inferred', () => {
  it('lexicons group A–Z by first letter', () => {
    const g = tocGroups('lexicon', [u('Aaron'), u('Abaddon'), u('Baal'), u('Cain')]);
    expect(g?.map((x) => x.label)).toEqual(['A', 'B', 'C']);
    expect(g?.[0]).toMatchObject({ start: 0, count: 2 });
    expect(g?.[2]).toMatchObject({ start: 3, count: 1 });
  });

  it('a lexicon entry that does not start with a letter lands in #, not in the previous letter', () => {
    // SEED: fall through to the last-seen letter -> "1 Chronicles" files under whatever preceded
    // it, which is invisible and wrong.
    const g = tocGroups('lexicon', [u('Aaron'), u('1 Chronicles'), u('Baal')]);
    expect(g?.map((x) => x.label)).toEqual(['A', '#', 'B']);
  });

  it('leading punctuation is skipped rather than bucketed as #', () => {
    expect(tocGroups('lexicon', [u('"Amen"'), u('Baal')])?.[0]?.label).toBe('A');
  });

  it('commentaries group by the Bible book their own anchor decodes to', () => {
    const g = tocGroups('commentary', [u(null, GEN_1_1), u(null, GEN_1_1), u(null, JOHN_3_16), u(null, REV_1_1)]);
    expect(g?.map((x) => x.label)).toEqual(['Genesis', 'John', 'Revelation']);
    expect(g?.[0]?.count).toBe(2);
  });

  it('an unanchored commentary unit is Other, not silently merged into its neighbour', () => {
    const g = tocGroups('commentary', [u(null, GEN_1_1), u('Preface', null), u(null, JOHN_3_16)]);
    expect(g?.map((x) => x.label)).toEqual(['Genesis', 'Other', 'John']);
  });

  it('SERMONS GET NO GROUPING — grouping them by theme is a verdict, not metadata', () => {
    // This is the assertion that keeps the product honest. spurgeon-sermons carries zero verse
    // anchors, so no factual grouping is available; the only remaining option is an inferred
    // theme, which is an interpretive claim in the app's own voice. It needs an owner ruling,
    // not a quiet addition here.
    expect(tocGroups('sermon', [u('Sermon 1. Grace'), u('Sermon 2. The Spirit')])).toBeNull();
    expect(tocGroups('theology', [u('Book I'), u('Book II')])).toBeNull();
    expect(tocGroups('historian', [u('Antiquities — Book 1'), u('Antiquities — Book 2')])).toBeNull();
    expect(tocGroups('father', [u('Homily 1'), u('Homily 2')])).toBeNull();
  });

  it('a single group is not a grouping', () => {
    // One header over the whole list costs a row and tells the reader nothing.
    expect(tocGroups('lexicon', [u('Aaron'), u('Abaddon')])).toBeNull();
    expect(tocGroups('commentary', [u(null, GEN_1_1), u(null, GEN_1_1)])).toBeNull();
  });

  it('every unit belongs to exactly one group, and the groups tile the list in order', () => {
    // SEED: drop a unit from a run, or overlap two runs -> a reader scrolling a header lands in
    // the wrong place. The tiling property is what makes `start`/`count` usable as an index.
    const units = [u('Aaron'), u('Abel'), u('Baal'), u('Cain'), u('Cush'), u('Dan')];
    const g = tocGroups('lexicon', units)!;
    expect(g.reduce((n, x) => n + x.count, 0)).toBe(units.length);
    let next = 0;
    for (const x of g) {
      expect(x.start).toBe(next);
      next += x.count;
    }
    expect(next).toBe(units.length);
  });
});

describe('devotionals group by month, from their own headings', () => {
  // Spurgeon's Morning and Evening is 744 units: twelve month headers plus 366 mornings and 366
  // evenings, with headings "January" / "Morning, January 1" / "Evening, January 1". That is a
  // real, dated structure the work states about itself, so grouping it is recognition rather than
  // classification — which is exactly the line drawn for sermons, where no such structure exists.
  it('reads the month out of a dated devotional heading', () => {
    const g = tocGroups('devotional', [
      u('January'), u('Morning, January 1'), u('Evening, January 1'),
      u('Morning, February 1'), u('Evening, February 1'),
    ]);
    expect(g?.map((x) => x.label)).toEqual(['January', 'February']);
    expect(g?.[0]?.count).toBe(3);
  });

  it('an UNDATED devotional gets no grouping rather than an invented calendar', () => {
    // SEED: key on any leading token instead of the closed month set -> "Book I" and "Book II"
    // become groups and the work acquires a structure the month rule never claimed.
    //
    // NOT the seed this comment first named. It said "default the month to January", and that was
    // MEASURED not to fail here: defaulting every heading to January still yields ONE group, which
    // still returns null. That seed is caught by the word-boundary test below instead. A red-proof
    // that names a seed it does not actually catch is worth less than no comment at all, so the
    // claim is corrected rather than left to be believed.
    expect(tocGroups('devotional', [u('Book I, Chapter 1'), u('Book I, Chapter 2'), u('Book II, Chapter 1')])).toBeNull();
  });

  it('does not match a month inside an unrelated word', () => {
    // SEED: drop the \b word boundaries -> "Mayhew" and "Marching" file under May and March.
    const g = tocGroups('devotional', [u('On Mayhew'), u('Marching Orders'), u('Morning, May 3')]);
    expect(g?.map((x) => x.label)).toEqual(['—', 'May']);
  });
});
