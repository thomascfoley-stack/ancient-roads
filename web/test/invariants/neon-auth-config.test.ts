// Neon equivalent of the config half of better-auth-wiring.test.ts, for the swap in
// docs/AUTH_V2_IMPLEMENTATION.md §3/§8 (ADR-107/108/109).
//
// `createNeonAuth`'s types require `baseUrl: string` and `cookies.secret: string`, but
// `process.env.X` is `string | undefined`. Nothing in the type system stops `neon-auth.ts` from
// handing the SDK `undefined` and letting it decide what to do -- which the runbook flags as a
// password-reset poisoning vector if the SDK falls back to inferring a baseUrl from the request
// Host header. This suite proves the explicit throw exists, not just that it typechecks.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = ['NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('neon-auth.ts fails closed on missing env', () => {
  it('throws when NEON_AUTH_BASE_URL is missing', async () => {
    delete process.env.NEON_AUTH_BASE_URL;
    process.env.NEON_AUTH_COOKIE_SECRET = 'x'.repeat(32);
    const { getAuth } = await import('@/lib/auth/neon-auth');
    expect(() => getAuth()).toThrow(/NEON_AUTH_BASE_URL/);
  });

  it('throws when NEON_AUTH_COOKIE_SECRET is missing', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://example.neonauth.invalid';
    delete process.env.NEON_AUTH_COOKIE_SECRET;
    const { getAuth } = await import('@/lib/auth/neon-auth');
    expect(() => getAuth()).toThrow(/NEON_AUTH_COOKIE_SECRET/);
  });
});

describe('neon-auth.ts memoizes the auth instance', () => {
  it('returns the same object on repeated calls (one construction per lambda instance)', async () => {
    process.env.NEON_AUTH_BASE_URL = 'https://example.neonauth.invalid';
    process.env.NEON_AUTH_COOKIE_SECRET = 'x'.repeat(32);
    const { getAuth } = await import('@/lib/auth/neon-auth');
    expect(getAuth()).toBe(getAuth());
  });
});
