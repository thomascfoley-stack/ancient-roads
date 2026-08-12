import { describe, expect, it } from 'vitest';
import { positionBetween, positionsAfter } from '../src/lib/studies';

// The base-62 fractional position key (design §6.1, review S-I; S-14 is the P2 invariant this
// underpins). Properties that must hold for block order to be total and stable:
//   - the result of positionBetween(a, b) sorts strictly between a and b as a STRING —
//     lexicographic order is the index's btree order;
//   - keys never end in '0' (a '…0' key would leave no room strictly before it at that depth);
//   - malformed input throws rather than emitting a key that would corrupt order.
// Red-proofed by mutation (docs/evidence/study-docs-p1/): flip the midpoint floor to round —
// first-key and dense-insert cases go red; drop the a<b guard — the throw cases go red.

describe('positionBetween', () => {
  it('starts an empty document at the alphabet midpoint', () => {
    expect(positionBetween(null, null)).toBe('V');
  });

  it('returns a key strictly between its bounds', () => {
    const cases: Array<[string | null, string | null]> = [
      [null, null],
      ['V', null],
      [null, 'V'],
      ['V', 'W'],
      ['V', 'VV'],
      ['V0V', 'V1'],
      ['9', 'A'],
      ['z', null],
      ['Az', 'B'],
    ];
    for (const [a, b] of cases) {
      const m = positionBetween(a, b);
      if (a !== null) expect(m > a, `${m} > ${String(a)}`).toBe(true);
      if (b !== null) expect(m < b, `${m} < ${String(b)}`).toBe(true);
    }
  });

  it('never emits a key ending in the minimum digit', () => {
    // Dense repeated bisection is where a trailing '0' would appear if it could.
    let lo: string | null = null;
    let hi: string | null = 'V';
    for (let i = 0; i < 200; i++) {
      const m: string = positionBetween(lo, hi);
      expect(m.endsWith('0')).toBe(false);
      if (i % 2 === 0) hi = m;
      else lo = m;
    }
  });

  it('stays ordered under a long append chain without pathological growth', () => {
    const keys = positionsAfter(null, 1000);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!, `${keys[i - 1]!} < ${keys[i]!}`).toBe(true);
    }
    // Appends add one character per ~31 keys (the single-digit-increment path); the naive
    // midpoint-toward-infinity bug this pins against produced 167 characters here.
    expect(keys[999]!.length).toBeLessThan(40);
  });

  it('interleaves inserts at arbitrary gaps and keeps total order', () => {
    // Deterministic pseudo-random insertion (no Math.random — reproducible failures only).
    const keys: string[] = [positionBetween(null, null)];
    let seed = 42;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const gap = next() % (keys.length + 1);
      const a = gap === 0 ? null : keys[gap - 1]!;
      const b = gap === keys.length ? null : keys[gap]!;
      keys.splice(gap, 0, positionBetween(a, b));
    }
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('throws on malformed input instead of corrupting order', () => {
    expect(() => positionBetween('W', 'V')).toThrow(); // a must sort before b
    expect(() => positionBetween('V', 'V')).toThrow(); // equal is not between
    expect(() => positionBetween('', null)).toThrow(); // empty is not a key
    expect(() => positionBetween('a-b', null)).toThrow(); // outside the alphabet
    expect(() => positionBetween(null, 'ключ')).toThrow();
    expect(() => positionBetween(null, 'V0')).toThrow(); // '…0' is never generated; refuse it
    expect(() => positionBetween('V0', null)).toThrow();
  });
});

describe('positionsAfter', () => {
  it('produces n ascending keys strictly after the anchor', () => {
    const after = 'V';
    const keys = positionsAfter(after, 50);
    expect(keys).toHaveLength(50);
    expect(keys[0]! > after).toBe(true);
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
  });

  it('returns an empty list for n = 0', () => {
    expect(positionsAfter('V', 0)).toEqual([]);
  });
});
