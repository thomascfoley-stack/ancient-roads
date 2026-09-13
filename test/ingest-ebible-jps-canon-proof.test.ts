// CANON-EXACT PROOF hardening (THE_LOOP rule 4 — "a check that has never been
// seen RED proves nothing"). The JPS 1917 ingest's sole ingest-time safety gate
// shipped with a comment/algorithm mismatch: the map was documented
// `// book -> ch -> verse count` but the code stored Math.max(verseNumbers) per
// chapter. Those are equal only under the unstated assumption that every
// integer 1..N appears exactly once — which the proof never verified. The gate
// correctly caught absent books, wrong chapter COUNT, absent interior
// chapters, and out-of-range / truncated-tail verses (max exceeds or subceeds
// canon), but it was BLIND to an interior gap (a verse missing from the middle
// of 1..N) and to a same-integer duplicate (two rows with the same verse
// number), because max() is insensitive to both. So the script could write a
// non-canon-exact JPS OT while still logging that it "PROVES canon-exactness."
//
// Introduced in 9b4cb087 (PR #235). The fix replaces the max accumulator with a
// true ROW COUNT plus a per-chapter Set<number> of seen verse numbers, and
// verifies each integer 1..canon is present. The proof loop is extracted into
// the exported `canonExactDiffs(verses, canonOt)` pure function so it can be
// exercised against known-bad fixtures without standing up a USFM tree or the
// gitignored KJV corpus.
//
// RED-PROOF: every RED case below produced [] (no diff) under the old
// Math.max accumulator — i.e. the gate GREEN'd a non-canon-exact source. Under
// the row-count + seen-set accumulator the same fixture produces a diff.

import { describe, expect, it } from 'vitest';
import { canonExactDiffs, type CanonOtBook } from '../src/ingest/ingest-ebible-jps.js';

// ── fixtures ── a single-book canon ("gen", book 1, one 8-verse chapter) is
// the smallest canon that exercises the per-chapter interior-verse path.
const GEN: CanonOtBook = { book: 1, slug: 'gen', verses: [8] };

// verses for one chapter of one book, given the verse numbers present.
const row = (book: number, ch: number, nums: number[]): { book: number; chapter: number; verse: number }[] =>
  nums.map((n) => ({ book, chapter: ch, verse: n }));

const oneTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('canonExactDiffs — a complete chapter is canon-exact (GREEN, no regression)', () => {
  it('8 contiguous verses 1..8 against a canon of [8] produce no diff', () => {
    expect(canonExactDiffs(row(1, 1, oneTo(8)), [GEN])).toEqual([]);
  });

  it('a single-verse chapter (canon [1]) produces no diff', () => {
    expect(canonExactDiffs(row(1, 1, [1]), [{ book: 1, slug: 'oba', verses: [1] }])).toEqual([]);
  });

  it('a larger chapter (Obadiah, 21 verses) produces no diff', () => {
    expect(canonExactDiffs(row(31, 1, oneTo(21)), [{ book: 31, slug: 'oba', verses: [21] }])).toEqual([]);
  });

  it('a multi-chapter book with every chapter complete produces no diff', () => {
    const jon: CanonOtBook = { book: 32, slug: 'jon', verses: [17, 10, 10, 11] };
    const verses = [
      ...row(32, 1, oneTo(17)),
      ...row(32, 2, oneTo(10)),
      ...row(32, 3, oneTo(10)),
      ...row(32, 4, oneTo(11)),
    ];
    expect(canonExactDiffs(verses, [jon])).toEqual([]);
  });

  it('a multi-book canon with all books complete produces no diff', () => {
    const gen: CanonOtBook = { book: 1, slug: 'gen', verses: [8, 25] };
    const rut: CanonOtBook = { book: 8, slug: 'rut', verses: [22] };
    const verses = [...row(1, 1, oneTo(8)), ...row(1, 2, oneTo(25)), ...row(8, 1, oneTo(22))];
    expect(canonExactDiffs(verses, [gen, rut])).toEqual([]);
  });

  it('a chapter whose verse rows arrive out of order is still canon-exact', () => {
    // verse numbers shuffled in input order — the proof counts rows and the
    // seen-set, both of which are order-independent.
    expect(canonExactDiffs(row(1, 1, [8, 3, 1, 5, 2, 7, 4, 6]), [GEN])).toEqual([]);
  });
});

describe('canonExactDiffs — the max() blind spot: interior gap (RED-PROOF)', () => {
  it('a verse missing from the MIDDLE of 1..N is rejected (was [] under max)', () => {
    // SEED (old Math.max): max([1,2,3,4,6,7,8]) = 8 = canon → no diff.
    // ROW COUNT: 7 rows ≠ 8 → diff. This is the headline bug.
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 6, 7, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: 7 verse rows vs canon 8']);
  });

  it('the first interior verse missing (2 absent) is rejected', () => {
    const diffs = canonExactDiffs(row(1, 1, [1, 3, 4, 5, 6, 7, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: 7 verse rows vs canon 8']);
  });

  it('a missing interior verse whose ROW COUNT still matches canon is rejected by contiguity', () => {
    // versification [1,2,3,4,6,7,8,8] — verse 5 missing AND verse 8 duplicated.
    // count = 8 = canon (would pass a naive row count alone), but 5 is absent
    // from the seen-set. This is the offset-case the seen-set exists to catch.
    // SEED (old Math.max): max = 8 = canon → no diff.
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 6, 7, 8, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: missing verse 5']);
  });

  it('a gap+duplicate offset in the middle, not at the tail', () => {
    // [1,2,3,5,5,6,7,8] — verse 4 missing, verse 5 duplicated; count = 8 = canon.
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 5, 5, 6, 7, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: missing verse 4']);
  });
});

describe('canonExactDiffs — the max() blind spot: duplicate verse number (RED-PROOF)', () => {
  it('a verse number appearing TWICE (count too high) is rejected (was [] under max)', () => {
    // SEED (old Math.max): max([1,2,3,4,4,5,6,7,8]) = 8 = canon → no diff.
    // ROW COUNT: 9 rows ≠ 8 → diff.
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 4, 5, 6, 7, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: 9 verse rows vs canon 8']);
  });

  it('a triplicated verse number is rejected', () => {
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 2, 2, 3, 4, 5, 6, 7, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: 10 verse rows vs canon 8']);
  });

  it('a duplicate of verse 1 is rejected', () => {
    const diffs = canonExactDiffs(row(1, 1, [1, 1, 2, 3, 4, 5, 6, 7, 8]), [GEN]);
    expect(diffs).toEqual(['gen 1: 9 verse rows vs canon 8']);
  });
});

describe('canonExactDiffs — previously-correct checks still hold (no regression)', () => {
  it('an absent book is flagged', () => {
    const diffs = canonExactDiffs(row(2, 1, oneTo(8)), [GEN]);
    expect(diffs).toEqual(['gen: book absent from source']);
  });

  it('a wrong chapter COUNT is flagged', () => {
    const exo: CanonOtBook = { book: 2, slug: 'exo', verses: [8, 8, 8] };
    // only chapters 1 and 2 present — canon expects 3.
    const diffs = canonExactDiffs([...row(2, 1, oneTo(8)), ...row(2, 2, oneTo(8))], [exo]);
    expect(diffs).toEqual(['exo: 2 chapters vs canon 3']);
  });

  it('a missing interior chapter (no compensating extra) is caught by the chapter-count check', () => {
    // chapters 1 and 3 present, chapter 2 absent; got.size (2) ≠ canon (3), so
    // the chapter-count check fires before the per-chapter loop.
    const lev: CanonOtBook = { book: 3, slug: 'lev', verses: [8, 8, 8] };
    const verses = [...row(3, 1, oneTo(8)), ...row(3, 3, oneTo(8))];
    const diffs = canonExactDiffs(verses, [lev]);
    expect(diffs).toEqual(['lev: 2 chapters vs canon 3']);
  });

  it('an interior chapter absent despite MATCHING chapter count (out-of-range extra masks it) is caught per-chapter', () => {
    // source has chapters {1,3,5} — got.size (3) == canon.verses.length (3), so
    // the chapter-count check passes; the per-chapter loop then finds chapter 2
    // absent (got.get(2) === undefined → 0 rows). The out-of-range chapter 5 is
    // outside the 1..canon.length loop and so is its own limitation, but the
    // interior absence IS caught — the path the original :68 guarded.
    const lev: CanonOtBook = { book: 3, slug: 'lev', verses: [8, 8, 8] };
    const verses = [...row(3, 1, oneTo(8)), ...row(3, 3, oneTo(8)), ...row(3, 5, oneTo(8))];
    const diffs = canonExactDiffs(verses, [lev]);
    expect(diffs).toEqual(['lev 2: 0 verse rows vs canon 8']);
  });

  it('an out-of-range trailing verse (9 in an 8-verse canon) is flagged', () => {
    // SEED: both old max (max=9≠8) and new row count (9≠8) catch this; regression.
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9]), [GEN]);
    expect(diffs).toEqual(['gen 1: 9 verse rows vs canon 8']);
  });

  it('a truncated tail (last verse missing) is flagged', () => {
    // SEED: both old max (max=7≠8) and new row count (7≠8) catch this; regression.
    const diffs = canonExactDiffs(row(1, 1, oneTo(7)), [GEN]);
    expect(diffs).toEqual(['gen 1: 7 verse rows vs canon 8']);
  });

  it('NT verses in the source are flagged regardless of OT completeness', () => {
    // the engjps source is OT-only; any book >= 40 is the wrong artifact.
    const verses = [...row(1, 1, oneTo(8)), { book: 40, chapter: 1, verse: 1 }];
    const diffs = canonExactDiffs(verses, [GEN]);
    expect(diffs).toEqual(['source unexpectedly contains NT verses (1) — wrong artifact?']);
  });

  it('an empty source flags every canon book as absent', () => {
    const diffs = canonExactDiffs([], [GEN]);
    expect(diffs).toEqual(['gen: book absent from source']);
  });
});

describe('canonExactDiffs — multi-chapter / multi-book independence', () => {
  it('a gap+dup in chapter 2 only is reported for chapter 2, chapter 1 stays clean', () => {
    const gen: CanonOtBook = { book: 1, slug: 'gen', verses: [8, 8] };
    const verses = [...row(1, 1, oneTo(8)), ...row(1, 2, [1, 2, 4, 4, 5, 6, 7, 8])];
    // ch 2: verse 3 missing, verse 4 duplicated → count 8 == canon, but 3 absent.
    const diffs = canonExactDiffs(verses, [gen]);
    expect(diffs).toEqual(['gen 2: missing verse 3']);
  });

  it('independent defects in two chapters produce two diffs', () => {
    const gen: CanonOtBook = { book: 1, slug: 'gen', verses: [8, 8] };
    const verses = [...row(1, 1, [1, 2, 3, 4, 6, 7, 8]), ...row(1, 2, [1, 2, 3, 4, 5, 6, 7, 8, 9])];
    const diffs = canonExactDiffs(verses, [gen]);
    expect(diffs).toEqual(['gen 1: 7 verse rows vs canon 8', 'gen 2: 9 verse rows vs canon 8']);
  });

  it('a defect in one book does not mask a clean book', () => {
    const gen: CanonOtBook = { book: 1, slug: 'gen', verses: [8] };
    const exo: CanonOtBook = { book: 2, slug: 'exo', verses: [8] };
    const verses = [...row(1, 1, [1, 2, 3, 4, 6, 7, 8]), ...row(2, 1, oneTo(8))];
    const diffs = canonExactDiffs(verses, [gen, exo]);
    expect(diffs).toEqual(['gen 1: 7 verse rows vs canon 8']);
  });

  it('only the FIRST missing verse per chapter is reported (one diff per chapter)', () => {
    // two gaps can't cancel a duplicate into matching count, so this exercises
    // the contiguity loop stopping at the first absent number.
    const gen: CanonOtBook = { book: 1, slug: 'gen', verses: [8] };
    // [1,2,3,4,5,5,7,8] — verse 6 missing, verse 5 duplicated; count 8 == canon.
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 5, 5, 7, 8]), [gen]);
    expect(diffs).toEqual(['gen 1: missing verse 6']);
  });
});

describe('canonExactDiffs — diff wording locks the count-based contract', () => {
  // Guards against a quiet revert to a max-based accumulator: the message must
  // name ROW COUNT, not a max verse number. "verse rows" / "missing verse" only
  // appear under the fixed accumulator; max-based code said "X verses vs canon".
  it('a row-count diff message names "verse rows"', () => {
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 6, 7, 8]), [GEN]);
    expect(diffs[0]).toMatch(/verse rows vs canon/);
  });

  it('a contiguity diff message names "missing verse"', () => {
    const diffs = canonExactDiffs(row(1, 1, [1, 2, 3, 4, 6, 7, 8, 8]), [GEN]);
    expect(diffs[0]).toMatch(/missing verse/);
  });
});
