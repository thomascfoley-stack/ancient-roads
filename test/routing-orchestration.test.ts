// Guards the reference-routing orchestration that production retrieveCommentary
// and the accuracy eval SHARE (web/src/lib/teacher/routing.ts). Both call these
// exact functions, so the measured number can't drift from the shipped floor/merge.

import { describe, expect, it } from 'vitest';
import { floorOnRange, mergeById, selectDiverse, chapterKeysOf, insertBackfill, hasPassageCoverage } from '../web/src/lib/teacher/routing';

type Item = { id: string; v: number };
const items = (...vs: Array<[string, number]>): Item[] => vs.map(([id, v]) => ({ id, v }));
const MATT_5_7 = [{ start: 40_005_001, end: 40_007_999 }]; // Sermon on the Mount range

describe('floorOnRange (shared on-passage floor)', () => {
  it('promotes the top 2 on-range items to the front, rest keep rank order', () => {
    // a=John15 (out), b=Matt5:3 (in), c=Rom8 (out), d=Matt6:9 (in)
    const ordered = items(['a', 43_015_001], ['b', 40_005_003], ['c', 45_008_001], ['d', 40_006_009]);
    expect(floorOnRange(ordered, MATT_5_7, (i) => i.v).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('promotes at most 2 even when more are on-range', () => {
    const ordered = items(['a', 40_005_001], ['b', 40_005_002], ['c', 40_005_003], ['d', 45_001_001]);
    const out = floorOnRange(ordered, MATT_5_7, (i) => i.v).map((i) => i.id);
    expect(out.slice(0, 2)).toEqual(['a', 'b']);
    expect(out).toEqual(['a', 'b', 'c', 'd']); // c stays, no items dropped
  });
  it('is a no-op for a topical query (no ranges)', () => {
    const ordered = items(['a', 1], ['b', 2]);
    expect(floorOnRange(ordered, [], (i) => i.v).map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('promotes the single on-range item when only one exists', () => {
    const ordered = items(['a', 45_001_001], ['b', 40_006_001], ['c', 45_002_001]);
    expect(floorOnRange(ordered, MATT_5_7, (i) => i.v).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('selectDiverse (per-PASSAGE cap for the top-K)', () => {
  type V = { id: string; ch: number; ref: boolean };
  const ch = (v: V) => v.ch;
  const onRef = (v: V) => v.ref;
  it('caps off-reference entries at `cap` per chapter, preserving cross-passage coverage', () => {
    // chapter 1 dominates the rerank; cap=2 must let the 3rd ch-1 entry be displaced by chapter 2.
    const ranked: V[] = [
      { id: 'a1', ch: 1, ref: false }, { id: 'a2', ch: 1, ref: false },
      { id: 'a3', ch: 1, ref: false }, { id: 'b1', ch: 2, ref: false },
      { id: 'a4', ch: 1, ref: false }, { id: 'c1', ch: 3, ref: false },
    ];
    expect(selectDiverse(ranked, 3, ch, onRef, 2).map((v) => v.id)).toEqual(['a1', 'a2', 'b1']);
  });
  it('exempts on-reference items from the cap (routing guarantee preserved)', () => {
    const ranked: V[] = [
      { id: 'r1', ch: 1, ref: true }, { id: 'r2', ch: 1, ref: true },
      { id: 'r3', ch: 1, ref: true }, { id: 'x', ch: 2, ref: false },
    ];
    expect(selectDiverse(ranked, 3, ch, onRef, 2).map((v) => v.id)).toEqual(['r1', 'r2', 'r3']);
  });
  it('backfills deferred items rather than returning fewer than k', () => {
    const ranked: V[] = [
      { id: 'a', ch: 1, ref: false }, { id: 'b', ch: 1, ref: false },
      { id: 'c', ch: 1, ref: false }, { id: 'd', ch: 1, ref: false },
    ];
    expect(selectDiverse(ranked, 3, ch, onRef, 2).map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('chapterKeysOf', () => {
  it('returns distinct chapter keys in first-seen order', () => {
    const entries = [5, 5, 7, 3, 7].map((c, i) => ({ id: String(i), c }));
    expect(chapterKeysOf(entries, (e) => e.c)).toEqual([5, 7, 3]);
  });
});

describe('insertBackfill (2nd-voice on surfaced passages)', () => {
  type BF = { id: string; ck: number; author: string };
  const bf = (...t: Array<[string, number, string]>): BF[] => t.map(([id, ck, author]) => ({ id, ck, author }));
  const run = (ordered: BF[], fetched: BF[]) =>
    insertBackfill(ordered, fetched, (b) => b.id, (b) => b.ck, (b) => b.author).map((b) => b.id);
  it('splices a below-pool 2nd author right behind the passage lead', () => {
    expect(run(bf(['a1', 1, 'Gill'], ['x1', 2, 'JFB']), bf(['h1', 1, 'Henry']))).toEqual(['a1', 'h1', 'x1']);
  });
  it('PROMOTES an in-pool-but-below-limit 2nd author (de-dupes its later slot)', () => {
    expect(run(bf(['a1', 1, 'Gill'], ['x1', 2, 'JFB'], ['h1', 1, 'Henry']), bf(['h1', 1, 'Henry']))).toEqual(['a1', 'h1', 'x1']);
  });
  it('does not re-add the lead author, only distinct voices', () => {
    expect(run(bf(['a1', 1, 'Gill']), bf(['a2', 1, 'Gill'], ['h1', 1, 'Henry']))).toEqual(['a1', 'h1']);
  });
  it('drops backfill on a chapter retrieval never surfaced', () => {
    expect(run(bf(['a1', 1, 'Gill']), bf(['z1', 9, 'Henry']))).toEqual(['a1']);
  });
});

describe('hasPassageCoverage (the relevance floor retrieveCommentary lacks)', () => {
  // Encoding: book·1_000_000 + chapter·1_000 + verse. SoS = book 22, John = 43.
  const chunk = (verseId: number, verseEnd = verseId) => ({ verseId, verseEnd });
  const SOS_2 = [{ start: 22_002_001, end: 22_002_999 }]; // Song of Solomon 2 (chapter range)
  const JOHN_3_16 = [{ start: 43_003_016, end: 43_003_016 }]; // a single verse

  it('reports NO coverage when the confidently-asked book is wholly absent (the SoS hole)', () => {
    // The exact off-passage pool the SoS evidence captured: Barnes/Wesley on the NT,
    // Chrysostom on Matthew/John/Acts, Augustine on Psalm 45 — nothing in Song of Solomon.
    const offPassage = [
      chunk(45_008_001), // Romans 8 (Barnes)
      chunk(43_010_011), // John 10 (Chrysostom)
      chunk(19_045_001), // Psalm 45 (Augustine)
      chunk(40_005_003), // Matthew 5
    ];
    expect(hasPassageCoverage(offPassage, SOS_2)).toBe(false);
  });

  it('reports coverage when a retrieved chunk is in the asked chapter', () => {
    const pool = [chunk(45_008_001), chunk(22_002_007)]; // one chunk IS Song of Solomon 2:7
    expect(hasPassageCoverage(pool, SOS_2)).toBe(true);
  });

  it('counts a same-chapter neighbouring verse as covered (chapter granularity, not verse)', () => {
    // Asked John 3:16; nearest chunk is John 3:2 — different verse, SAME chapter. Covered.
    expect(hasPassageCoverage([chunk(43_003_002)], JOHN_3_16)).toBe(true);
  });

  it('does NOT count a different chapter of the same book as coverage', () => {
    // Asked John 3:16; only John 1:14 retrieved — same book, wrong chapter. Not covered.
    expect(hasPassageCoverage([chunk(43_001_014)], JOHN_3_16)).toBe(false);
  });

  it('counts a chunk whose own range straddles the asked chapter as covered', () => {
    // A pericope-level chunk spanning John 3:14–3:21 covers the asked John 3:16.
    expect(hasPassageCoverage([chunk(43_003_014, 43_003_021)], JOHN_3_16)).toBe(true);
  });

  it('is always "covered" for a topical query (no floor ranges) — not a coverage question', () => {
    expect(hasPassageCoverage([chunk(45_008_001)], [])).toBe(true);
    expect(hasPassageCoverage([], [])).toBe(true);
  });

  it('reports NO coverage for an empty retrieval against a real reference', () => {
    expect(hasPassageCoverage([], SOS_2)).toBe(false);
  });
});

describe('mergeById (shared pool merge)', () => {
  it('places injected ahead of base and de-dupes by id (injected win)', () => {
    const injected = items(['x', 1], ['y', 2]);
    const base = items(['y', 9], ['z', 3]);
    expect(mergeById(injected, base, (i) => i.id).map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });
});
