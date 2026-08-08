// BETTER AUTH'S LIMITER MUST NOT LIVE IN PROCESS MEMORY — audit A1-2 (HIGH).
//
// THE DEFECT. `authOptions` set neither `rateLimit.storage` nor `secondaryStorage`, so Better Auth
// defaulted to `"memory"` — a module-level Map. One per lambda, reset on every cold start, so the
// library's 3-per-10s on sign-in/sign-up bounded ONE INSTANCE rather than one attacker. Free,
// unverified accounts made that fleet-width signup.
//
// The three properties below are what make the fix real, and each can fail independently:
//   1. the limiter is CONFIGURED at all (the default is silent, which is how this shipped),
//   2. it is ATOMIC — one statement, not read-then-write, because the attack is concurrent,
//   3. it FAILS CLOSED, because an outage on sign-in must not become an open door.

import { describe, expect, it, vi } from 'vitest';
import { createAuthRateLimitStorage, windowStart } from '@/lib/auth/rate-limit-storage';
import { authOptions } from '@/lib/auth/better-auth';

/** A stub standing in for the DB: records every statement, returns a scripted count. */
function stubSql(counts: number[]) {
  const statements: string[] = [];
  let i = 0;
  const sql = {
    query: vi.fn(async (text: string) => {
      statements.push(text);
      return [{ count: counts[Math.min(i++, counts.length - 1)] }];
    }),
  };
  return { sql, statements };
}

describe('better-auth rate limiting is database-backed', () => {
  // SEED: delete `rateLimit` from authOptions -> RED. This is the check that would have caught the
  // original defect, which was an ABSENT option rather than a wrong one.
  it('is configured with a custom storage, not left on the in-memory default', () => {
    const rl = (authOptions as { rateLimit?: { enabled?: boolean; customStorage?: unknown } }).rateLimit;
    expect(rl, 'authOptions.rateLimit is absent — Better Auth falls back to an in-memory Map').toBeDefined();
    expect(rl?.enabled, 'rate limiting must be explicitly enabled').toBe(true);
    expect(
      typeof (rl?.customStorage as { consume?: unknown } | undefined)?.consume,
      'customStorage must implement `consume`; without it Better Auth uses its own non-atomic ' +
        'check-then-increment, which its source calls "best-effort" under concurrency',
    ).toBe('function');
  });

  it('consumes in ONE statement — no read-then-write window', async () => {
    const { sql, statements } = stubSql([1]);
    const storage = createAuthRateLimitStorage(() => sql as never);
    await storage.consume('1.2.3.4', { window: 10, max: 3 });

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/INSERT INTO api_rate_limit/);
    expect(statements[0]).toMatch(/ON CONFLICT .* DO UPDATE SET count = api_rate_limit\.count \+ 1/s);
    expect(statements[0], 'a SELECT before the write is the race this exists to close').not.toMatch(/^\s*SELECT/i);
  });

  it('allows up to max and denies past it, with a retry-after inside the window', async () => {
    const { sql } = stubSql([1, 2, 3, 4]);
    const storage = createAuthRateLimitStorage(() => sql as never);
    const rule = { window: 10, max: 3 };

    expect((await storage.consume('k', rule)).allowed).toBe(true); // 1
    expect((await storage.consume('k', rule)).allowed).toBe(true); // 2
    expect((await storage.consume('k', rule)).allowed).toBe(true); // 3 — at the limit
    const fourth = await storage.consume('k', rule); // 4 — over
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfter).toBeGreaterThan(0);
    expect(fourth.retryAfter).toBeLessThanOrEqual(rule.window);
  });

  it('FAILS CLOSED when the database is unreachable', async () => {
    const sql = { query: vi.fn(async () => { throw new Error('connection refused'); }) };
    const storage = createAuthRateLimitStorage(() => sql as never);
    const out = await storage.consume('k', { window: 10, max: 3 });
    expect(out.allowed, 'a limiter outage must not become an open door on sign-in').toBe(false);
  });

  it('fails closed on a zero-row return rather than throwing past the guard', async () => {
    // The shape that previously turned a missing grant into an ALLOW elsewhere in this repo.
    const sql = { query: vi.fn(async () => []) };
    const storage = createAuthRateLimitStorage(() => sql as never);
    expect((await storage.consume('k', { window: 10, max: 3 })).allowed).toBe(false);
  });

  it('buckets by fixed window, so two calls in the same window share a counter', () => {
    const t = Date.parse('2026-08-07T12:00:03.500Z');
    const rule = { window: 10, max: 3 };
    expect(windowStart(rule, t)).toBe(windowStart(rule, t + 6000)); // same 10s window
    expect(windowStart(rule, t)).not.toBe(windowStart(rule, t + 11_000)); // next one
  });

  it('does not hold any counter in module state', async () => {
    // Two independently constructed storages — the analogue of two lambda instances — must both
    // consult the sql layer. With the in-memory default, instance B started from zero.
    const a = stubSql([5]);
    const b = stubSql([6]);
    await createAuthRateLimitStorage(() => a.sql as never).consume('k', { window: 10, max: 3 });
    await createAuthRateLimitStorage(() => b.sql as never).consume('k', { window: 10, max: 3 });
    expect(a.sql.query).toHaveBeenCalledTimes(1);
    expect(b.sql.query, 'the second instance skipped the database — state is in process memory').toHaveBeenCalledTimes(1);
  });
});
