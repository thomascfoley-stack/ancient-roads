import { describe, expect, it } from 'vitest';
import {
  disambiguatePosition,
  positionBetween,
  positionForAttempt,
  positionsAfter,
  positionsAfterForAttempt,
} from '../src/lib/studies';

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

// ── retry-round disambiguation (2026-08-21, the zero-margin fix) ─────────────────────────────
// docs/pm/orders/2026-08-21-studies-position-retry-zero-margin.md: `positionBetween` is pure, so
// lockstep racers recomputed the SAME key every round — N racers needed N tries against a
// hand-typed bound of 3, and the four-racer invariant test sat exactly on the cliff. These are
// the DETERMINISTIC red-proof of that mechanism and the proof the cure removes it, with the
// random source injected so every assertion is exhaustive or reproducible — no dice in CI.

describe('disambiguatePosition', () => {
  it('stays strictly inside the gap for EVERY possible suffix, across adversarial bounds', () => {
    // Exhaustive over all 62×61 suffixes — this is the "any extension of mid(a,b) stays < b"
    // invariant the implementation's comment proves; here it is executed rather than argued.
    const gaps: [string | null, string | null][] = [
      [null, null], [null, '1'], ['z', null],
      ['a', 'a5'],          // peel case: result shares a prefix with b
      ['V', 'W'],           // consecutive first digits
      ['Vz', 'W'],          // recursion into "after the rest of a"
      ['2', '4'],           // whole-digit midpoint
    ];
    for (const [a, b] of gaps) {
      const base = positionBetween(a, b);
      for (let i = 0; i < 62; i++) {
        for (let j = 0; j < 61; j++) {
          let calls = 0;
          const key = disambiguatePosition(base, () => (calls++ === 0 ? i : j));
          if (a !== null) expect(key > a, `${key} > ${a}`).toBe(true);
          if (b !== null) expect(key < b, `${key} < ${b} (base ${base})`).toBe(true);
          expect(key.endsWith('0'), `${key} must not end in '0'`).toBe(false);
        }
      }
    }
  });

  it('produces distinct keys for racers with distinct randomness', () => {
    const base = positionBetween('V', 'W');
    const keys = [0, 1, 2, 3, 4, 5, 6, 7].map((r) => {
      let calls = 0;
      return disambiguatePosition(base, (max) => (calls++ === 0 ? r % max : (r * 7) % max));
    });
    expect(new Set(keys).size).toBe(8);
  });
});

describe('the lockstep race, simulated deterministically', () => {
  /**
   * N racers inserting after the same anchor 'V' (upper sibling 'W'), worst-case interleaving:
   * every round, ALL surviving racers re-read the same fresh state — exactly `readAnchors`'s
   * behaviour, where the effective upper bound is the lowest landed key in the gap — compute
   * their bids, and the unique index admits one copy of each novel key. This is the shape
   * studies-order.test.ts races against the real DB, minus the dice.
   */
  function race(
    n: number,
    tries: number,
    keyFor: (a: string, b: string, attempt: number, racer: number) => string,
  ): number {
    const taken: string[] = [];
    let survivors = Array.from({ length: n }, (_, r) => r);
    for (let attempt = 0; attempt < tries && survivors.length > 0; attempt++) {
      // All survivors read the SAME state (lockstep): the gap between the anchor and the
      // lowest key landed so far — the landed block became the anchor's next sibling.
      const bEff = taken.length > 0 ? taken.slice().sort()[0]! : 'W';
      const bids = survivors.map((r) => ({ r, key: keyFor('V', bEff, attempt, r) }));
      const next: number[] = [];
      const landedThisRound = new Set<string>();
      for (const { r, key } of bids) {
        if (taken.includes(key) || landedThisRound.has(key)) { next.push(r); continue; }
        landedThisRound.add(key);
        taken.push(key);
      }
      survivors = next;
    }
    return taken.length;
  }

  it('RED-PROOF of the old semantics: plain midpoints strand N−3 of N lockstep racers', () => {
    // The pre-fix behaviour, byte-for-byte: every attempt recomputes the plain midpoint of the
    // fresh gap, so every round all survivors bid the SAME key and exactly one lands. Three
    // tries, three winners — five well-formed inserts fail. This is the defect the four-racer
    // invariant test sat one racer away from proving every run.
    const landed = race(8, 3, (a, b) => positionBetween(a, b));
    expect(landed).toBe(3);
  });

  it('the shipped semantics land all 8 racers inside the same 3-try belt', () => {
    // positionForAttempt exactly as the five studies.ts loops call it, with each racer's
    // randomness injected as its identity — distinct racers, distinct suffixes: round 0 admits
    // one plain midpoint, round 1 lands every survivor at once.
    const landed = race(8, 3, (a, b, attempt, racer) => {
      let calls = 0;
      return positionForAttempt(a, b, attempt, (max) => (calls++ === 0 ? racer % max : (racer * 7) % max));
    });
    expect(landed).toBe(8);
  });

  it('attempt 0 is the plain midpoint — sequential inserts pay zero key growth', () => {
    expect(positionForAttempt('V', 'W', 0)).toBe(positionBetween('V', 'W'));
  });
});

describe('positionsAfterForAttempt', () => {
  it('attempt 0 is positionsAfter verbatim; a retry restarts from a disambiguated head', () => {
    expect(positionsAfterForAttempt('V', 3, 0)).toEqual(positionsAfter('V', 3));
    let calls = 0;
    const retried = positionsAfterForAttempt('V', 3, 1, (max) => (calls++ === 0 ? 5 : 9 % max));
    expect(retried).toHaveLength(3);
    expect(retried[0]).not.toBe(positionsAfter('V', 1)[0]); // the head moved — that's the point
    for (let i = 0; i < retried.length; i++) {
      expect(retried[i]! > (i === 0 ? 'V' : retried[i - 1]!)).toBe(true);
      expect(retried[i]!.endsWith('0')).toBe(false);
    }
  });
});
