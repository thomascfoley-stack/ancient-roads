// Guards the per-user rate limiter (web/src/lib/rate-limit.ts) for /api/ask.
// Exercises the REAL checkAskRateLimit with an injected `sql` so the threshold
// logic and the deliberate FAIL-OPEN path are tested hermetically (no DB). A
// real-DB atomic-upsert check is run separately (seed-and-confirm rail).

import { describe, expect, it } from 'vitest';
import { checkAskRateLimit, checkGateRateLimit } from '../web/src/lib/rate-limit';

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
  it('H4: a minute-refused request does NOT touch the day bucket', async () => {
    const buckets: string[] = [];
    const spy = {
      query: async (_t: string, params: unknown[]) => {
        const bucket = params[1] as string;
        buckets.push(bucket);
        return [{ count: bucket === 'ask:min' ? 11 : 1 }]; // minute over cap
      },
    } as unknown as SqlArg;
    const r = await checkAskRateLimit('u1', spy);
    expect(r.limited).toBe('min');
    expect(buckets).toEqual(['ask:min']); // day bucket never bumped
  });
});

// Site-gate brute-force throttle (LONG_NIGHT H1). Same injected-sql pattern.
const mockGateSql = (counts: { min: number; hour: number }): SqlArg =>
  ({
    query: async (_text: string, params: unknown[]) => {
      const bucket = params[1] as string;
      return [{ count: bucket === 'gate:min' ? counts.min : counts.hour }];
    },
  }) as unknown as SqlArg;

describe('checkGateRateLimit', () => {
  it('allows a human-rate attempt (under both caps)', async () => {
    expect(await checkGateRateLimit('1.2.3.4', mockGateSql({ min: 3, hour: 10 }))).toEqual({ ok: true });
  });
  it('blocks the 11th attempt in a minute (default cap 10)', async () => {
    expect((await checkGateRateLimit('1.2.3.4', mockGateSql({ min: 10, hour: 10 }))).ok).toBe(true);
    const r = await checkGateRateLimit('1.2.3.4', mockGateSql({ min: 11, hour: 10 }));
    expect(r).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
  });
  it('blocks a slow drip over the hourly cap (default 60)', async () => {
    const r = await checkGateRateLimit('1.2.3.4', mockGateSql({ min: 2, hour: 61 }));
    expect(r).toEqual({ ok: false, limited: 'hour', retryAfterSec: 3600 });
  });
  it('keys the counter by IP (gate:<ip>), not a shared key', async () => {
    const keys: string[] = [];
    const spy = {
      query: async (_t: string, params: unknown[]) => { keys.push(params[0] as string); return [{ count: 1 }]; },
    } as unknown as SqlArg;
    await checkGateRateLimit('9.9.9.9', spy);
    expect(keys.every((k) => k === 'gate:9.9.9.9')).toBe(true);
  });
  it('FAILS OPEN (allows) when the limiter DB call throws — password still required by the caller', async () => {
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkGateRateLimit('1.2.3.4', throwing)).toEqual({ ok: true });
  });
});
