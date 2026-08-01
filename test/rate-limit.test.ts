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
  it('FAILS CLOSED (denies) when the limiter DB call throws — this is the SPEND path', async () => {
    // CHANGED 2026-08-02 (deep audit, H2). This asserted `{ ok: true }`: a limiter outage
    // ALLOWED the request, so every paid call went through unmetered. The rationale — "a
    // limiter outage must not down the product" — does not survive an open-registration launch
    // where each accepted request is five paid upstream calls, and the branch was cheap to
    // reach: the limiter shares one Neon endpoint with the unauthenticated search routes.
    // SEED: restore `return { ok: true }` in the catch -> RED.
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkAskRateLimit('u1', throwing)).toEqual({ ok: false, limited: 'unavailable', retryAfterSec: 30 });
  });

  it('a ZERO-ROW return is denied, not a TypeError swallowed into an allow', async () => {
    // bump() did `rows[0]!.count`. RLS on api_rate_limit, a missing grant or a pooler hiccup
    // returned no row, which threw, which the old catch turned into an ALLOW. So the fail-open
    // path was reachable without any outage at all.
    // SEED: restore `return rows[0]!.count` -> still denied now, but for the wrong reason;
    // restore the fail-open catch as well and this goes green, which is the pairing that matters.
    const empty = { query: async () => [] } as unknown as SqlArg;
    expect(await checkAskRateLimit('u1', empty)).toEqual({ ok: false, limited: 'unavailable', retryAfterSec: 30 });
  });

  it('the GLOBAL daily ceiling denies once all users together exceed it', async () => {
    // Per-user caps bound what ONE account spends. They bound the bill only if accounts are
    // scarce, and registration is open with no allowlist (deep audit, H1). This is the backstop.
    // SEED: delete the ask:global:day bump -> RED.
    const overGlobal = {
      query: async (_t: string, params: unknown[]) => {
        const bucket = params[1] as string;
        return [{ count: bucket === 'ask:global:day' ? 99_999 : 1 }];
      },
    } as unknown as SqlArg;
    const r = await checkAskRateLimit('u1', overGlobal);
    expect(r.ok).toBe(false);
    expect(r.limited).toBe('global');
  });

  it('the global bucket is keyed on a CONSTANT, not on the caller — one pool, not per-user', async () => {
    const seen: Array<[string, string]> = [];
    const spy = {
      query: async (_t: string, params: unknown[]) => {
        seen.push([params[0] as string, params[1] as string]);
        return [{ count: 1 }];
      },
    } as unknown as SqlArg;
    await checkAskRateLimit('some-user-id', spy);
    const globalRow = seen.find(([, bucket]) => bucket === 'ask:global:day');
    expect(globalRow, 'the global bucket was never bumped').toBeDefined();
    expect(globalRow![0], 'the global bucket must not be keyed per-user').toBe('__global__');
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
  // The site gate KEEPS failing open, deliberately and unlike the ask limiter above: here the
  // password is still required regardless, and locking real visitors out is the worse failure.
  it('FAILS OPEN (allows) when the limiter DB call throws — password still required by the caller', async () => {
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkGateRateLimit('1.2.3.4', throwing)).toEqual({ ok: true });
  });
});
