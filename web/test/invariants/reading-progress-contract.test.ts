// N1, the pure half — the progress contract and the sync cadence (lib/work-reader.ts).
//
// These run with no database and no DOM, which is the point: the round-trip test next door
// (`reading-progress-round-trip.test.ts`) proves the loop end to end but SKIPS wherever no DB is
// configured — which is the main `audit` CI job. So the rules that decide what the route accepts,
// and how often a reader's scroll is allowed to reach the database, are proven here too, on every
// run, everywhere.
//
// `parseProgressBody` is also tested through the route over real HTTP. That is not duplication:
// HTTP can only deliver what JSON can express, and this is the level at which the guards against
// what JSON CANNOT express (NaN, Infinity, -0) are reachable at all.

import { describe, expect, it } from 'vitest';
import {
  PROGRESS_SYNC_MIN_MS,
  parseProgressBody,
  shouldSyncProgress,
} from '@/lib/work-reader';

describe('N1 — the wire contract for a reading position', () => {
  it('accepts an ordinary position', () => {
    expect(parseProgressBody({ ordinal: 12, percent: 0.25 })).toEqual({ ordinal: 12, percent: 0.25 });
  });

  it('accepts both ends of the percent range', () => {
    expect(parseProgressBody({ ordinal: 1, percent: 0 })).toEqual({ ordinal: 1, percent: 0 });
    expect(parseProgressBody({ ordinal: 1, percent: 1 })).toEqual({ ordinal: 1, percent: 1 });
  });

  it('treats a null or absent percent as "length not yet known"', () => {
    expect(parseProgressBody({ ordinal: 3, percent: null })).toEqual({ ordinal: 3, percent: null });
    expect(parseProgressBody({ ordinal: 3 })).toEqual({ ordinal: 3, percent: null });
  });

  // The cases HTTP cannot deliver, which is exactly why they are asserted here. `Number.isFinite`
  // is the only thing standing between these and a CHECK-constraint violation at the database.
  it.each([
    ['NaN percent', { ordinal: 1, percent: Number.NaN }],
    ['Infinity percent', { ordinal: 1, percent: Number.POSITIVE_INFINITY }],
    ['NaN ordinal', { ordinal: Number.NaN, percent: 0.5 }],
    ['Infinity ordinal', { ordinal: Number.POSITIVE_INFINITY, percent: 0.5 }],
  ])('rejects %s', (_label, body) => {
    expect(parseProgressBody(body)).toBeNull();
  });

  it.each([
    ['ordinal 0', { ordinal: 0, percent: 0.5 }],
    ['a negative ordinal', { ordinal: -3, percent: 0.5 }],
    ['a fractional ordinal', { ordinal: 1.5, percent: 0.5 }],
    ['a numeric string ordinal', { ordinal: '4', percent: 0.5 }],
    ['percent just above 1', { ordinal: 1, percent: 1.0001 }],
    ['a negative percent', { ordinal: 1, percent: -0.5 }],
    ['a string percent', { ordinal: 1, percent: '0.5' }],
    ['a boolean percent', { ordinal: 1, percent: true }],
  ])('rejects %s', (_label, body) => {
    expect(parseProgressBody(body)).toBeNull();
  });

  it.each([['null', null], ['a string', 'ordinal=1'], ['a number', 7], ['an array', [1, 2]]])(
    'rejects %s as a body',
    (_label, body) => {
      expect(parseProgressBody(body)).toBeNull();
    },
  );

  // A body carrying extra keys is accepted, but only the two contract fields survive — nothing a
  // caller invents reaches `saveReadingProgress`.
  it('narrows to the contract fields and drops everything else', () => {
    expect(parseProgressBody({ ordinal: 2, percent: 0.5, userId: 'someone-else', charOffset: 99 })).toEqual({
      ordinal: 2,
      percent: 0.5,
    });
  });
});

describe('N1 — how often a reader’s scroll reaches the database', () => {
  const at = (ms: number) => ({ ordinal: 1, at: ms });

  it('syncs the first position it is ever given', () => {
    expect(shouldSyncProgress(null, at(0))).toBe(true);
  });

  it('does not sync while the reader is still in the same section', () => {
    // Even a long way past the floor: `percent` moved, the cursor did not.
    expect(shouldSyncProgress({ ordinal: 4, at: 0 }, { ordinal: 4, at: 10 * PROGRESS_SYNC_MIN_MS })).toBe(false);
  });

  it('holds a new section until the floor has elapsed', () => {
    const last = { ordinal: 4, at: 1_000 };
    expect(shouldSyncProgress(last, { ordinal: 5, at: 1_000 + PROGRESS_SYNC_MIN_MS - 1 })).toBe(false);
    expect(shouldSyncProgress(last, { ordinal: 5, at: 1_000 + PROGRESS_SYNC_MIN_MS })).toBe(true);
  });

  // THE POINT OF THE FLOOR. A fast scroll through a commentary changes section many times a
  // second; without this, each one is a per-user write on the reader's scroll path.
  it('collapses a fast scroll to one write', () => {
    let last: { ordinal: number; at: number } | null = null;
    let writes = 0;
    for (let i = 0; i < 400; i++) {
      const next = { ordinal: i + 1, at: i * 50 }; // a section every 50ms for 20 seconds
      if (shouldSyncProgress(last, next)) {
        writes++;
        last = next;
      }
    }
    expect(writes).toBe(1);
  });

  it('a departing reader flushes past the floor', () => {
    const last = { ordinal: 4, at: 1_000 };
    expect(shouldSyncProgress(last, { ordinal: 9, at: 1_100 })).toBe(false);
    expect(shouldSyncProgress(last, { ordinal: 9, at: 1_100 }, { force: true })).toBe(true);
  });

  // `force` skips the CLOCK, not the "nothing new to say" rule — a flush that would rewrite the
  // same ordinal is still a wasted write, and pagehide fires on every navigation.
  it('a flush with nothing new to say still does not write', () => {
    expect(shouldSyncProgress({ ordinal: 4, at: 0 }, { ordinal: 4, at: 99_999 }, { force: true })).toBe(false);
  });

  it('the floor is a real interval, not zero', () => {
    // A zero/NaN floor would make every rule above vacuously true and this whole policy inert.
    expect(PROGRESS_SYNC_MIN_MS).toBeGreaterThanOrEqual(5_000);
  });
});
