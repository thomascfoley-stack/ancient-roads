// @vitest-environment node
//
// Regression — the waitlist↔gate rate-limit bucket collision (2026-09-12).
//
// `checkGateRateLimit` (web/src/lib/rate-limit.ts) hardcodes the `gate:<ip>` row key. The waitlist
// route is PUBLIC (it sits OUTSIDE the SITE_PASSWORD gate — gate.ts `isPublicPath`), and it reuses
// that limiter for its own throttle. Passing the RAW client IP landed its counters on `gate:<ip>` —
// the site gate's OWN brute-force bucket, the ONLY barrier on the pre-launch site — so waitlist
// signups from a shared IP (carrier NAT, office / conference wifi) exhausted the gate's per-IP
// budget and 429-locked password-holders on the same IP out of the site, with no fallback. The fix
// namespaces the key (`waitlist:<ip>`) so the row becomes `gate:waitlist:<ip>`, distinct from the
// gate's `gate:<ip>` — the same namespacing the public-read throttle already uses (`read:<bucket>:<ip>`).
//
// This is the ROUTE-LEVEL guard: it spies on the first argument the waitlist POST passes to
// `checkGateRateLimit` and asserts it is namespaced, so a future "simplification" back to the raw
// IP (the exact bug) goes RED. The limiter-level cross-caller store — the integration test the
// isolated fakes could not see — lives in test/rate-limit.test.ts' cross-caller namespace block.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Result = { ok: boolean; limited?: string; retryAfterSec?: number };

// Hoisted so the mock factory (which vitest runs before the module body) closes over a slot that
// already exists. `calls` records every `ip` argument the route passes; `override` lets one test
// drive the 429 path without re-mocking.
const gate = vi.hoisted(() => ({
  override: null as Result | null,
  calls: [] as string[],
}));

vi.mock('@/lib/rate-limit', () => ({
  // The route imports ONLY checkGateRateLimit from this module, so a minimal factory is enough —
  // no need to spread the real module the way public-read-envelope.test.ts does. Capture the `ip`
  // argument so the namespace is observable; default to allow so the happy path runs to completion.
  checkGateRateLimit: async (ip: string): Promise<Result> => {
    gate.calls.push(ip);
    return gate.override ?? { ok: true };
  },
}));

// The route's getDb() is a NEON TAGGED TEMPLATE for the waitlist INSERT (no `.query` method). No-op
// it so the happy path runs without a DB; the route discards the INSERT result (no RETURNING).
vi.mock('@/lib/db', () => ({ getDb: () => async () => [] }));

// Silence the route's structured-log call so the suite output stays clean. The observer is not the
// property under test here.
vi.mock('@/lib/observability', () => ({ logEvent: () => {} }));

import { POST } from '@/app/api/waitlist/route';

function post(headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ email: 'person@example.com', consent: 'ok' }),
    }),
  );
}

afterEach(() => {
  gate.calls.length = 0;
  gate.override = null;
});

describe('waitlist route — namespaced rate-limit key (no gate collision)', () => {
  it('passes `waitlist:<ip>` to checkGateRateLimit, NOT the raw client IP', async () => {
    await post({ 'x-vercel-forwarded-for': '203.0.113.7' });
    expect(gate.calls).toHaveLength(1);
    // Namespaced: the limiter prefixes `gate:` itself, so the row becomes `gate:waitlist:203.0.113.7`,
    // DISTINCT from the gate route's `gate:203.0.113.7`.
    expect(gate.calls[0]).toBe('waitlist:203.0.113.7');
  });

  it('does NOT pass the bare gate row key — `gate:<ip>` is the gate\'s own brute-force bucket', async () => {
    // SEED: revert the route to `checkGateRateLimit(clientIp(req) ?? 'no-trusted-ip')` (drop the
    // `waitlist:` prefix) -> gate.calls[0] === '203.0.113.7', identical to the gate route's key ->
    // RED on the test above and this one.
    await post({ 'x-vercel-forwarded-for': '203.0.113.7' });
    expect(gate.calls[0]).not.toBe('203.0.113.7');
  });

  it('the no-trusted-origin fallback is namespaced — shares ONE waitlist bucket, not the gate\'s', async () => {
    // No trusted headers -> clientIp returns null -> the route applies its `?? 'no-trusted-ip'`
    // fallback. The namespace keeps that shared fallback on `waitlist:no-trusted-ip` (row
    // `gate:waitlist:no-trusted-ip`), NOT `gate:no-trusted-ip`.
    // SEED: drop the `waitlist:` prefix AND call with no headers -> 'no-trusted-ip' (the gate's key).
    await post();
    expect(gate.calls[0]).toBe('waitlist:no-trusted-ip');
  });

  it('still surfaces a limiter denial as 429 + Retry-After — the waitlist KEEPS its own throttle', async () => {
    // Namespacing fixes the COLLISION, not the waitlist's own cap. A denied limiter must still
    // produce a 429 with a Retry-After header so the client backs off — and it must do so on the
    // namespaced key, never on the gate's.
    gate.override = { ok: false, limited: 'min', retryAfterSec: 60 };
    const res = await post({ 'x-vercel-forwarded-for': '203.0.113.7' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(gate.calls[0]).toBe('waitlist:203.0.113.7');
  });

  it('a successful signup completes on the namespaced key — the fix does not block the happy path', async () => {
    const res = await post({ 'x-vercel-forwarded-for': '203.0.113.7' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/on the list/i);
  });
});
