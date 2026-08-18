// B015 — A DEAD `running` DOES NOT BRICK THE DOCUMENT, AND A CORRUPT ROW FAILS CLOSED.
//
// See readingsRunRefused's own header for the mechanism. What is pinned here, boundary by
// boundary, is the decision table — because the fix inverted a comparison to get NaN right, and
// an inverted comparison is exactly the kind of edit a later "simplification" flips back.
import { describe, expect, it } from 'vitest';
import { READINGS_STALE_MS, readingsRunRefused } from '../../src/lib/user-corpus/readings-store';

const NOW = 1_755_000_000_000; // fixed; the predicate takes `now` so no Date.now stubbing
const iso = (ageMs: number) => new Date(NOW - ageMs).toISOString();

describe('B015 — readingsRunRefused', () => {
  it('refuses a FRESH running job — re-entering doubles the work', () => {
    expect(readingsRunRefused('running', iso(5_000), NOW)).toBe(true);
    expect(readingsRunRefused('running', iso(READINGS_STALE_MS - 1), NOW)).toBe(true);
  });

  it('allows a STALE running job — the corpse case the QA session hit', () => {
    // SEED: restore the unconditional `status === 'running'` refusal -> RED here.
    expect(readingsRunRefused('running', iso(READINGS_STALE_MS + 1), NOW)).toBe(false);
    expect(readingsRunRefused('running', iso(60 * 60_000), NOW)).toBe(false);
  });

  it('refuses on a CORRUPT timestamp — NaN must read as "still running", not as a corpse', () => {
    // SEED: flip the negated comparison to `age <= READINGS_STALE_MS` -> RED here and ONLY here,
    // which is why this leg exists: the other legs cannot tell the two spellings apart.
    expect(readingsRunRefused('running', 'not-a-date', NOW)).toBe(true);
  });

  it('never refuses a non-running status, whatever the clock says', () => {
    for (const s of ['pending', 'ready', 'failed', null] as const) {
      expect(readingsRunRefused(s, iso(0), NOW)).toBe(false);
      expect(readingsRunRefused(s, 'not-a-date', NOW)).toBe(false);
    }
  });
});
