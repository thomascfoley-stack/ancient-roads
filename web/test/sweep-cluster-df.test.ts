// DEEP_SWEEP clusters D and F — the deterministic fixes, each provable without a DOM or a DB.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { century } from '@/components/history-results';
import { errorMessage } from '@/lib/api-error-message';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

describe('D29 — B.C. century buckets', () => {
  // The old formula was Math.ceil(mid/100), which rounds NEGATIVE fractions toward zero.
  it('200–101 B.C. is the 2nd century B.C., not the 1st', () => {
    expect(century([-200, -101])).toBe(-2);
  });

  it('100–1 B.C. is the 1st century B.C., and never renders as "0c"', () => {
    expect(century([-100, -1])).toBe(-1);
    expect(Object.is(century([-100, -1]), -0)).toBe(false);
  });

  it('A.D. buckets are unchanged — the old formula was right for positives', () => {
    expect(century([1, 100])).toBe(1);
    expect(century([101, 200])).toBe(2);
    expect(century([1500, 1599])).toBe(16);
  });

  it('null period stays null', () => {
    expect(century(null)).toBeNull();
  });
});

describe('D28 — the two error shapes one route can return', () => {
  it('reads a plain-string error (the route’s own 400)', () => {
    expect(errorMessage({ error: 'q is required' }, 'fallback')).toBe('q is required');
  });

  it('reads an envelope error (the shared throttle’s 429) instead of "[object Object]"', () => {
    const throttled = { error: { code: 'RATE_LIMIT_MINUTE', message: 'Too many requests. Please slow down.' } };
    expect(errorMessage(throttled, 'fallback')).toBe('Too many requests. Please slow down.');
    expect(errorMessage(throttled, 'fallback')).not.toMatch(/object Object/);
  });

  it('falls back on anything else, including a null body', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage({ error: {} }, 'fallback')).toBe('fallback');
    expect(errorMessage({ error: '   ' }, 'fallback')).toBe('fallback');
  });
});

describe('D20 — paginated commentary search cannot skip a tied row', () => {
  // A source check, named as one: proving the skip behaviourally needs a Postgres planner and a
  // tied corpus. The property is that the ORDER BY carries a unique tiebreaker at all.
  it('the page query orders by a unique key as well as rank', () => {
    const src = readFileSync(path.join(SRC, 'lib/commentary-search.ts'), 'utf8');
    expect(src, 'ts_rank_cd ties heavily; without a unique key a row can fall between pages')
      .toMatch(/ORDER BY\s+rank DESC,\s*id/);
  });
});

describe('D48 — /api/search/works bounds its query', () => {
  it('caps q, and does so with the surrogate-safe helper rather than slice()', () => {
    const src = readFileSync(path.join(SRC, 'app/api/search/works/route.ts'), 'utf8');
    expect(src).toMatch(/truncateCodePoints\(/);
    expect(src, 'slice() would split a surrogate pair — BUG_SWEEP B2').not.toMatch(/get\('q'\).*\.slice\(/);
  });
});
