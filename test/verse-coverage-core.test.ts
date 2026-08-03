// Pure-core invariants for the verse_coverage rebuild
// (scripts/lib/verse-coverage-core.ts). No DB — the sweep is a function.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sweepCoverage, verseUniverse, EXEGETICAL_SOURCE_TYPES } from '../scripts/lib/verse-coverage-core.js';

const v = (book: number, ch: number, vs: number) => book * 1_000_000 + ch * 1000 + vs;

describe('verseUniverse', () => {
  it('holds only real verses — no 999 sentinels, no phantom gap verses', () => {
    // SEED: build the universe with generate_series over anchor ranges and
    // the sentinel/gap ids appear; Ps 119 has 176 verses, none higher.
    const u = verseUniverse();
    expect(u.some((id) => id % 1000 > 200)).toBe(false);
    expect(u).toContain(v(19, 119, 176));
    expect(u).not.toContain(v(19, 119, 177));
    // Genesis 1 has 31 verses; verse 32 must not exist.
    expect(u).toContain(v(1, 1, 31));
    expect(u).not.toContain(v(1, 1, 32));
    // Sorted ascending, unique.
    expect(u.length).toBe(new Set(u).size);
  });
});

describe('sweepCoverage', () => {
  const universe = [v(43, 3, 15), v(43, 3, 16), v(43, 3, 17), v(43, 3, 18)];

  it('a voice is an AUTHOR: many sections by one author count 1', () => {
    // SEED: count entries instead of distinct authors and this reads 2 —
    // the exact today.ts G1 defect (100 two-card single-author sets).
    const rows = sweepCoverage([
      { author: 'John Gill', sectionId: 1, verseIdStart: v(43, 3, 16), verseIdEnd: v(43, 3, 16) },
      { author: 'John Gill', sectionId: 2, verseIdStart: v(43, 3, 16), verseIdEnd: v(43, 3, 16) },
    ], universe);
    expect(rows).toEqual([{ verseId: v(43, 3, 16), authorCount: 1, sectionCount: 2 }]);
  });

  it('distinct authors on an overlapping range count separately per verse', () => {
    const rows = sweepCoverage([
      { author: 'John Gill', sectionId: 1, verseIdStart: v(43, 3, 15), verseIdEnd: v(43, 3, 17) },
      { author: 'Matthew Henry', sectionId: 2, verseIdStart: v(43, 3, 16), verseIdEnd: v(43, 3, 18) },
    ], universe);
    expect(rows).toEqual([
      { verseId: v(43, 3, 15), authorCount: 1, sectionCount: 1 },
      { verseId: v(43, 3, 16), authorCount: 2, sectionCount: 2 },
      { verseId: v(43, 3, 17), authorCount: 2, sectionCount: 2 },
      { verseId: v(43, 3, 18), authorCount: 1, sectionCount: 1 },
    ]);
  });

  it('an uncovered verse yields NO row (absence, not a zero row)', () => {
    const rows = sweepCoverage([
      { author: 'John Gill', sectionId: 1, verseIdStart: v(43, 3, 16), verseIdEnd: v(43, 3, 16) },
    ], universe);
    expect(rows.map((r) => r.verseId)).toEqual([v(43, 3, 16)]);
  });

  it('anchors NEVER leak across their end id', () => {
    // SEED: forget the active-set eviction and coverage smears to the whole
    // rest of the universe after the first anchor.
    const rows = sweepCoverage([
      { author: 'A', sectionId: 1, verseIdStart: v(43, 3, 15), verseIdEnd: v(43, 3, 15) },
    ], universe);
    expect(rows).toHaveLength(1);
  });
});

describe('EXEGETICAL_SOURCE_TYPES', () => {
  it('is the routing.ts owner-decision-(c) pool: commentary + fathers only', () => {
    // Guard derived FROM the shipped source, not a copy of my own constant:
    // routing.ts's comment block names the pool; if the decision moves, the
    // source text moves and this goes red with it.
    expect([...EXEGETICAL_SOURCE_TYPES].sort()).toEqual(['commentary', 'father']);
    const routing = readFileSync('web/src/lib/teacher/routing.ts', 'utf8');
    expect(routing).toMatch(/EXEGETICAL pool[\s\S]{0,120}commentary \+ fathers ONLY/);
  });
});
