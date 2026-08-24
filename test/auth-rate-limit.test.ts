// Red-proof for the auth-path rate limiter (owner directive 2026-08-15, "fix rate
// limites"; finding: docs/UX_REMEDIATION.md §9, filed 2026-08-08 — A1-2's limiter has
// had ZERO call sites since the Neon Auth cutover, so sign-in/sign-up/password-reset
// were unthrottled at fleet width).
//
// Guards `checkAuthRateLimit` + `isAuthLimitedPath` (web/src/lib/rate-limit.ts) the way
// rate-limit.test.ts guards the ask/gate limiters: the REAL decision function against an
// injected `sql`, hermetic (no DB). The hammer test uses a STATEFUL fake store that
// reproduces the atomic upsert of migration 008's api_rate_limit table, so "past the
// limit fires 429" is proven against accumulated state, not a frozen count.

import { describe, expect, it } from 'vitest';
import { checkAuthRateLimit, isAuthLimitedPath } from '../web/src/lib/rate-limit';

type SqlArg = NonNullable<Parameters<typeof checkAuthRateLimit>[2]>;

// A stateful stand-in for api_rate_limit: the same (user_id, bucket, window_start) keying
// and INSERT ... ON CONFLICT DO UPDATE ... RETURNING count semantics as bump()'s SQL.
// `bumped` records (key, bucket) in call order so tests can assert which buckets burned.
function fakeStore() {
  const rows = new Map<string, number>();
  const bumped: Array<[string, string]> = [];
  const sql = {
    query: async (text: string, params: unknown[] = []) => {
      if (/^\s*DELETE/i.test(text)) return []; // the ~1% opportunistic sweep
      const [userId, bucket, windowStart] = params as [string, string, string];
      bumped.push([userId, bucket]);
      const k = `${userId}|${bucket}|${windowStart}`;
      const count = (rows.get(k) ?? 0) + 1;
      rows.set(k, count);
      return [{ count }];
    },
  } as unknown as SqlArg;
  return { sql, bumped };
}

// Defaults under test (module constants, env-overridable in production):
//   per-IP 10/min + 60/hour; per-email 5/min + 30/hour.
describe('checkAuthRateLimit — the hammer (red-proof)', () => {
  it('allows a human-rate burst (under every cap)', async () => {
    const { sql } = fakeStore();
    for (let i = 0; i < 3; i++) {
      expect(await checkAuthRateLimit('1.2.3.4', 'a@b.c', sql)).toEqual({ ok: true });
    }
  });

  it('fires 429 semantics past the per-minute IP cap: 10 pass, the 11th and beyond are denied', async () => {
    const { sql } = fakeStore();
    const results = [];
    for (let i = 0; i < 15; i++) results.push(await checkAuthRateLimit('6.6.6.6', null, sql));
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
    expect(results.slice(10).every((r) => !r.ok)).toBe(true);
  });

  it('a slow drip past the hourly IP cap is denied with the hour retry', async () => {
    // One wall clock serves the whole test, so the hour leg is driven with a fixed-count
    // mock (same pattern as rate-limit.test.ts's gate cases) rather than 61 real calls.
    const hour61 = {
      query: async (_t: string, params: unknown[]) => [
        { count: params[1] === 'auth:hour' ? 61 : 1 },
      ],
    } as unknown as SqlArg;
    const r = await checkAuthRateLimit('1.2.3.4', null, hour61);
    expect(r).toEqual({ ok: false, limited: 'hour', retryAfterSec: 3600 });
  });

  it('H4: a minute-refused request does NOT burn the hourly bucket', async () => {
    const buckets: string[] = [];
    const spy = {
      query: async (_t: string, params: unknown[]) => {
        buckets.push(params[1] as string);
        return [{ count: params[1] === 'auth:min' ? 11 : 1 }]; // minute over cap
      },
    } as unknown as SqlArg;
    const r = await checkAuthRateLimit('1.2.3.4', null, spy);
    expect(r.limited).toBe('min');
    expect(buckets).toEqual(['auth:min']); // hour bucket never bumped
  });

  it('rotating IPs do NOT evade the cap when the email is constant (credential stuffing)', async () => {
    const { sql, bumped } = fakeStore();
    const results = [];
    for (let i = 0; i < 8; i++) {
      results.push(await checkAuthRateLimit(`10.0.0.${i}`, 'victim@example.com', sql));
    }
    // Per-IP caps never bind (each IP is fresh); the per-email minute cap (5) does.
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
    expect(bumped.some(([k]) => k === 'auth:email:victim@example.com')).toBe(true);
  });

  it('keys the IP counter auth:ip:<ip> and lowercases the email key', async () => {
    const { sql, bumped } = fakeStore();
    await checkAuthRateLimit('9.9.9.9', 'Mixed.Case@Example.com', sql);
    const keys = bumped.map(([k]) => k);
    expect(keys).toContain('auth:ip:9.9.9.9');
    expect(keys).toContain('auth:email:mixed.case@example.com');
  });

  it('FAILS OPEN (allows, logged) when the limiter DB call throws', async () => {
    // Deliberate, and the same posture as the site-gate throttle (rate-limit.ts header):
    // auth endpoints spend nothing, and a limiter-DB outage failing CLOSED here would lock
    // every user out of sign-in while Neon's hosted auth service is itself still up.
    // SEED: return { ok: false } from the catch -> RED.
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkAuthRateLimit('1.2.3.4', 'a@b.c', throwing)).toEqual({ ok: true });
  });

  it('a ZERO-ROW upsert return fails open too, not a TypeError into a denial', async () => {
    const empty = { query: async () => [] } as unknown as SqlArg;
    expect(await checkAuthRateLimit('1.2.3.4', null, empty)).toEqual({ ok: true });
  });
});

describe('isAuthLimitedPath — which auth subpaths the proxy throttles', () => {
  it('throttles the credential endpoints', () => {
    for (const p of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-up/email',
      '/api/auth/forget-password',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
      // D18 — change-password is CREDENTIAL-BEARING: better-auth verifies `currentPassword`
      // server-side, so anyone holding a live session (shared device, stolen cookie) had
      // unlimited online guesses at the account password. Exactly the brute-force class this
      // limiter was built for, and it was outside the allowlist.
      '/api/auth/change-password',
      // D50 — unthrottled verification mail is mail-spend and mailbox harassment keyed to any
      // registered address. Whether the hosted config enables it is not knowable from this
      // repo, so it is throttled regardless: the cost of throttling an unused endpoint is zero.
      '/api/auth/send-verification-email',
    ]) {
      expect(isAuthLimitedPath(p), p).toBe(true);
    }
  });
  it('leaves session reads and unrelated routes alone', () => {
    for (const p of ['/api/auth/get-session', '/api/auth/list-sessions', '/api/ask', '/gate']) {
      expect(isAuthLimitedPath(p), p).toBe(false);
    }
  });
});
