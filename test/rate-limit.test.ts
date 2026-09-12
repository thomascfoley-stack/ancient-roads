// Guards the per-user rate limiter (web/src/lib/rate-limit.ts) for /api/ask.
// Exercises the REAL checkAskRateLimit with an injected `sql` so the threshold
// logic and the deliberate FAIL-OPEN path are tested hermetically (no DB). A
// real-DB atomic-upsert check is run separately (seed-and-confirm rail).

import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkAskRateLimit, checkGateRateLimit, envInt } from '../web/src/lib/rate-limit';

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
  it('honours the perHour override — the completed H3 loosening for public reads', async () => {
    // The loosening first landed on the minute leg only: public readers got 120/minute and
    // still hard-stopped at the gate's 60/hour, so one busy shared IP (carrier NAT, library
    // wifi) was throttled like a brute-force script. With the override, 70/hour passes.
    // SEED: restore `hourCount > GATE_LIMIT_PER_HOUR` in checkGateRateLimit -> RED.
    const r = await checkGateRateLimit('1.2.3.4', mockGateSql({ min: 2, hour: 70 }), 120, 600);
    expect(r).toEqual({ ok: true });
  });
  it('the hour cap DEFAULT is unchanged at 60 for the gate callers (no override)', async () => {
    // Same shape as the override case, one call short of the loosened cap — the default
    // must still bind, or the gate's brute-force posture silently loosened with the fix.
    const r = await checkGateRateLimit('1.2.3.4', mockGateSql({ min: 2, hour: 61 }), 120);
    expect(r).toEqual({ ok: false, limited: 'hour', retryAfterSec: 3600 });
  });
  // The site gate KEEPS failing open, deliberately and unlike the ask limiter above: here the
  // password is still required regardless, and locking real visitors out is the worse failure.
  it('FAILS OPEN (allows) when the limiter DB call throws — password still required by the caller', async () => {
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkGateRateLimit('1.2.3.4', throwing)).toEqual({ ok: true });
  });
});

// CROSS-CALLER NAMESPACE — the waitlist↔gate row collision (2026-09-12).
//
// `checkGateRateLimit` hardcodes `gate:<ip>` as its row key, so any two callers passing it the SAME
// `ip` string bump the SAME `(user_id, bucket, window_start)` row. The waitlist signup route used to
// pass the raw client IP, colliding with the site gate's OWN brute-force bucket — and the gate is the
// ONLY barrier on the pre-launch site (SEC-1). The fix: the waitlist pre-prefixes its IP with
// `waitlist:`, landing its counters on `gate:waitlist:<ip>` while the gate stays on `gate:<ip>`.
//
// The mock fakes above key only on the BUCKET (`params[1] === 'gate:min'`), NOT the user_id, so a
// second caller writing under a different user_id to the same bucket is invisible to them — which is
// exactly why this collision had no test that could catch it. The fake below keys on the FULL primary
// key `(user_id, bucket, window_start)` (migration 008's unique key), running the REAL limiter through
// the exact arguments each route passes: the gate calls `checkGateRateLimit(ip)` and the waitlist
// calls `checkGateRateLimit(\`waitlist:${ip}\`)`. That integration is where the collision lived.
//
// Fake timers pin the window: a minute-boundary rollover mid-loop would otherwise split the waitlist
// burst across two `gate:min` windows and silently false-pass the SEED. The limiter only reads
// `Date.now()` (no setTimeout), so fake timers do not interfere with its async resolution.
describe('checkGateRateLimit — cross-caller namespace (gate vs waitlist)', () => {
  // A stateful in-memory api_rate_limit keyed on the table's real primary key, doing the upsert
  // the migration prescribes: insert-else-increment, returning the post-bump count.
  function statefulSql(): SqlArg {
    const rows = new Map<string, number>();
    return {
      query: async (_text: string, params: unknown[]) => {
        const [userId, bucket, windowStart] = params as [string, string, string];
        const pk = `${userId}|${bucket}|${windowStart}`;
        const next = (rows.get(pk) ?? 0) + 1;
        rows.set(pk, next);
        return [{ count: next }];
      },
    } as unknown as SqlArg;
  }

  beforeAll(() => {
    // A fixed time inside a minute that is not on a boundary, so every call in the block shares one
    // minute window and one hour window.
    vi.useFakeTimers({ now: new Date('2026-09-12T10:30:07.000Z') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  // 11 same-IP waitlist signups within a minute is the report's realistic trigger: many distinct
  // people on one shared IP (carrier NAT, office / conference wifi) each signing up once. The
  // gate's default per-minute cap is 10, blocked on the 11th bump.
  const WAITLIST_BURST = 11;

  it('waitlist signups do NOT spend the gate budget — the gate still passes after a waitlist burst', async () => {
    const sql = statefulSql();
    const ip = '203.0.113.7';
    for (let i = 0; i < WAITLIST_BURST; i++) {
      await checkGateRateLimit(`waitlist:${ip}`, sql);
    }
    const gate = await checkGateRateLimit(ip, sql);
    expect(gate).toEqual({ ok: true });
  });

  it('SEED: a raw-IP waitlist collides with the gate — the gate is 429-locked after the burst', async () => {
    // Restore the waitlist route to `checkGateRateLimit(ip)` (drop the `waitlist:` prefix) and
    // change this loop to pass the raw `ip` too -> the gate's `gate:<ip>`/`gate:min` count reaches
    // WAITLIST_BURST before the gate's own call, and the gate's bump makes it WAITLIST_BURST+1 > 10
    // -> { ok: false, limited: 'min' } -> RED (the test above goes RED; this one is the proof shape).
    const sql = statefulSql();
    const ip = '203.0.113.7';
    for (let i = 0; i < WAITLIST_BURST; i++) {
      await checkGateRateLimit(ip, sql); // BUG SHAPE: raw IP, identical key to the gate's
    }
    const gate = await checkGateRateLimit(ip, sql);
    expect(gate.ok).toBe(false);
    expect(gate.limited).toBe('min');
  });

  it('the waitlist KEEPS its own throttle — its namespaced bucket still caps a re-signup burst', async () => {
    // The fix removes the COLLISION, not the waitlist's own cap: its `gate:waitlist:<ip>` counters
    // must still bind. A burst past the cap is denied, on the minute leg.
    // SEED: have the waitlist call bypass the limiter entirely (e.g. namespace = constant '') ->
    // this stays green falsely; the meaningful seed is the test below, which proves isolation.
    const sql = statefulSql();
    const ip = '203.0.113.7';
    for (let i = 0; i < 10; i++) {
      const r = await checkGateRateLimit(`waitlist:${ip}`, sql);
      expect(r.ok, `call ${i + 1} should pass`).toBe(true);
    }
    const over = await checkGateRateLimit(`waitlist:${ip}`, sql); // 11th
    expect(over).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
  });

  it('the gate and waitlist hold SEPARATE hour budgets — a long waitlist drip does not 429 the gate', async () => {
    // The hour cap (default 60) is the other leg the collision burned. Isolate it by lifting the
    // per-minute leg (so only the hour leg can bind), then drive the waitlist past 60/hour on its
    // own namespaced row and show the gate's hour count is still 1.
    const sql = statefulSql();
    const ip = '203.0.113.7';
    const MIN_UP = 100_000;
    for (let i = 0; i < 61; i++) {
      await checkGateRateLimit(`waitlist:${ip}`, sql, MIN_UP);
    }
    // With the bug (raw IP), the waitlist would have driven `gate:<ip>`/`gate:hour` to 61 and the
    // gate's own 62nd bump would trip limited:'hour'. Namespaced, the gate sees count 1.
    const gate = await checkGateRateLimit(ip, sql, MIN_UP);
    expect(gate).toEqual({ ok: true });
  });

  it('the no-trusted-origin fallback is namespaced too — the shared waitlist bucket is not the gate\'s', async () => {
    // The route's `?? 'no-trusted-ip'` fallback is meant to share ONE bucket across unknown origins.
    // Post-fix they share `gate:waitlist:no-trusted-ip`, leaving the gate's `gate:no-trusted-ip`
    // row distinct. (The gate route returns GATE_LOCKED for a null IP before the limiter; this
    // exercises the limiter directly to show the rows are independent.)
    const sql = statefulSql();
    for (let i = 0; i < WAITLIST_BURST; i++) {
      await checkGateRateLimit('waitlist:no-trusted-ip', sql);
    }
    const gate = await checkGateRateLimit('no-trusted-ip', sql);
    expect(gate).toEqual({ ok: true });
  });
});

// envInt — every limiter env var is parsed through one guard (2026-08-31). A typo'd value
// used to parse to NaN, `count > NaN` is always false, and the cap silently passed
// EVERYTHING while looking configured. Now: unset/empty is the fallback, anything set must
// be a finite positive integer, and a bad value kills module LOAD, not a runtime request.
describe('envInt — limiter env vars fail LOUD, never NaN-open', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the fallback when the var is unset or empty', () => {
    delete process.env.THIS_VAR_IS_NOT_SET_ANYWHERE;
    expect(envInt('THIS_VAR_IS_NOT_SET_ANYWHERE', 42)).toBe(42);
    vi.stubEnv('EMPTY_LIMIT_VAR', '');
    expect(envInt('EMPTY_LIMIT_VAR', 7)).toBe(7);
  });

  it('parses a valid positive integer', () => {
    vi.stubEnv('VALID_LIMIT_VAR', '25');
    expect(envInt('VALID_LIMIT_VAR', 10)).toBe(25);
  });

  it('throws on anything that is not a positive integer, naming var AND value', () => {
    // '0x10' (16) and '1e3' (1000) PARSE as positive integers under Number() — a wrong limit
    // that passes the guard silently is the exact failure class this guard exists to kill, so
    // only decimal digits are accepted. Whitespace-only is rejected, not treated as empty.
    for (const bad of ['abc', '1.5', '-3', '0', '1e999', 'NaN', '0x10', '1e3', '10abc', '   ']) {
      vi.stubEnv('BAD_LIMIT_VAR', bad);
      expect(() => envInt('BAD_LIMIT_VAR', 10), bad).toThrowError(/BAD_LIMIT_VAR/);
      expect(() => envInt('BAD_LIMIT_VAR', 10), bad).toThrowError(new RegExp(JSON.stringify(bad)));
    }
  });

  it('accepts surrounding whitespace around decimal digits (trimmed before the digit check)', () => {
    vi.stubEnv('PADDED_LIMIT_VAR', ' 25 ');
    expect(envInt('PADDED_LIMIT_VAR', 10)).toBe(25);
  });

  it('a typo in a shipped limit var throws at MODULE LOAD (dynamic import, env stubbed)', async () => {
    // The exit test: not a unit call, the real module-top evaluation. A NaN here used to
    // mean the ask limiter allowed everything from the first request.
    // SEED: restore `Number(process.env.ASK_LIMIT_PER_MIN ?? 10)` in rate-limit.ts -> RED.
    vi.stubEnv('ASK_LIMIT_PER_MIN', 'abc');
    vi.resetModules();
    await expect(import('../web/src/lib/rate-limit')).rejects.toThrowError(/ASK_LIMIT_PER_MIN/);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
