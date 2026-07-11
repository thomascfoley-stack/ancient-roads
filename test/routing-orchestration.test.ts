// Guards the reference-routing orchestration that production retrieveCommentary
// and the accuracy eval SHARE (web/src/lib/teacher/routing.ts). Both call these
// exact functions, so the measured number can't drift from the shipped floor/merge.

import { describe, expect, it } from 'vitest';
import { floorOnRange, mergeById, selectDiverse } from '../web/src/lib/teacher/routing';

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

describe('selectDiverse (author cap for the top-K)', () => {
  type V = { id: string; author: string; ref: boolean };
  const author = (v: V) => v.author;
  const onRef = (v: V) => v.ref;
  it('caps off-reference entries at `cap` per author, forcing a 2nd distinct voice', () => {
    // Gill dominates the rerank; cap=2 must let the 3rd Gill be displaced by JFB.
    const ranked: V[] = [
      { id: 'g1', author: 'Gill', ref: false }, { id: 'g2', author: 'Gill', ref: false },
      { id: 'g3', author: 'Gill', ref: false }, { id: 'jfb', author: 'JFB', ref: false },
      { id: 'g4', author: 'Gill', ref: false }, { id: 'clarke', author: 'Clarke', ref: false },
    ];
    const out = selectDiverse(ranked, 3, author, onRef, 2).map((v) => v.id);
    expect(out).toEqual(['g1', 'g2', 'jfb']); // g3 deferred by the cap; JFB pulled up
  });
  it('exempts on-reference items from the cap (routing guarantee preserved)', () => {
    const ranked: V[] = [
      { id: 'r1', author: 'Gill', ref: true }, { id: 'r2', author: 'Gill', ref: true },
      { id: 'r3', author: 'Gill', ref: true }, { id: 'x', author: 'JFB', ref: false },
    ];
    expect(selectDiverse(ranked, 3, author, onRef, 2).map((v) => v.id)).toEqual(['r1', 'r2', 'r3']);
  });
  it('backfills deferred items rather than returning fewer than k', () => {
    const ranked: V[] = [
      { id: 'a', author: 'Gill', ref: false }, { id: 'b', author: 'Gill', ref: false },
      { id: 'c', author: 'Gill', ref: false }, { id: 'd', author: 'Gill', ref: false },
    ];
    expect(selectDiverse(ranked, 3, author, onRef, 2).map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeById (shared pool merge)', () => {
  it('places injected ahead of base and de-dupes by id (injected win)', () => {
    const injected = items(['x', 1], ['y', 2]);
    const base = items(['y', 9], ['z', 3]);
    expect(mergeById(injected, base, (i) => i.id).map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });
});
