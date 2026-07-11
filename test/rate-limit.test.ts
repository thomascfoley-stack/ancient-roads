// Guards the per-user rate limiter (web/src/lib/rate-limit.ts) for /api/ask.
// Exercises the REAL checkAskRateLimit with an injected `sql` so the threshold
// logic and the deliberate FAIL-OPEN path are tested hermetically (no DB). A
// real-DB atomic-upsert check is run separately (seed-and-confirm rail).

import { describe, expect, it } from 'vitest';
import { checkAskRateLimit } from '../web/src/lib/rate-limit';

type SqlArg = NonNullable<Parameters<typeof checkAskRateLimit>[1]>;

// Mock returns a controlled `count` per bucket ('ask:min' | 'ask:day'), so we
// can drive the min/day thresholds independently.
const mockSql = (counts: { min: number; day: number }): SqlArg =>
  ({
    query: async (_text: string, params: unknown[]) => {
      const bucket = params[1] as string;
      return [{ count: bucket === 'ask:min' ? counts.min : counts.day }];
    },
  }) as unknown as SqlArg;

describe('checkAskRateLimit', () => {
  it('allows when under both caps', async () => {
    expect(await checkAskRateLimit('u1', mockSql({ min: 5, day: 20 }))).toEqual({ ok: true });
  });
  it('allows exactly at the per-minute cap (10), blocks the 11th', async () => {
    expect((await checkAskRateLimit('u1', mockSql({ min: 10, day: 20 }))).ok).toBe(true);
    const r = await checkAskRateLimit('u1', mockSql({ min: 11, day: 20 }));
    expect(r).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
  });
  it('blocks over the per-day cap (100)', async () => {
    const r = await checkAskRateLimit('u1', mockSql({ min: 3, day: 101 }));
    expect(r).toEqual({ ok: false, limited: 'day', retryAfterSec: 3600 });
  });
  it('FAILS OPEN (allows) when the limiter DB call throws', async () => {
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkAskRateLimit('u1', throwing)).toEqual({ ok: true });
  });
});
