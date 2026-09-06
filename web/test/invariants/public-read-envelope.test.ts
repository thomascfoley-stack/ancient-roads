// @vitest-environment node
//
// The public-read throttle envelope must reflect WHICH cap bound (2026-09-06).
//
// `publicReadThrottle` and `publicReadPageThrottle` both reuse `checkGateRateLimit`, the site-gate
// brute-force limiter, with looser caps of their own. That limiter returns `limited:'min'` for the
// minute leg and `limited:'hour'` (retryAfterSec:3600) for the hour leg. Both throttles used to
// DISCARD `r.limited` and always emit the minute variation of the envelope — RATE_LIMIT_MINUTE +
// "try again in a moment" — regardless of which cap bound. So an hour-throttled reader was told
// "in a moment" while the effective wait was up to an hour: on the API surface the body's message
// contradicted its own Retry-After:3600 header, and on the /search HTML page (which renders only
// `message` and has no header) there was no backoff signal at all.
//
// The hour leg is REACHABLE here, not theoretical: both throttles pass PUBLIC_READ_LIMIT_PER_HOUR
// as `checkGateRateLimit`'s perHour override, so a shared IP trips it on ordinary reading.
//
// HOW THESE ARE DRIVEN. Every case but the two marked ones runs the REAL `checkGateRateLimit`
// against an INJECTED `sql` (the hermetic pattern of web/test/public-read-global-limit.test.ts,
// no DB) — so which leg binds is decided by the shipped limiter, and the hour leg is proven
// reachable rather than asserted over a stub. `apiError` is real too, so the hour leg is exercised
// through the actual envelope: the code, the Retry-After header, and the contract's message.
// Only the two "limiter omits retryAfterSec" cases substitute a limiter result, because the
// shipped limiter always sets that field and the `??` default cannot otherwise be reached.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitResult } from '@/lib/rate-limit';

// Override slot for the limiter's return. null = call the REAL implementation.
const gate = vi.hoisted(() => ({ override: null as RateLimitResult | null }));

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  // Spread the real module: public-read-limit.ts also imports `bump`, `envInt` (called at its
  // module load, for all three PUBLIC_READ_* caps) and `GLOBAL_BUCKET_USER` from here. A factory
  // returning only `checkGateRateLimit` would leave those undefined and break the import itself.
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    checkGateRateLimit: async (...args: Parameters<typeof actual.checkGateRateLimit>) =>
      gate.override ?? actual.checkGateRateLimit(...args),
  };
});
// publicReadPageThrottle reads headers() from next/headers (Server Component context); outside
// Next that throws. An empty Headers means clientIp finds no trusted origin and the throttle keys
// on 'no-trusted-ip' — irrelevant to every assertion here, which turn on bucket counts, not keys.
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { publicReadThrottle, publicReadPageThrottle } from '@/lib/public-read-limit';

type SqlArg = NonNullable<Parameters<typeof publicReadThrottle>[2]>;

// Controlled count per bucket, so one leg can be driven over its cap while the others stay under.
// web/vitest.config.ts lifts PUBLIC_READ_LIMIT_PER_MIN/PER_HOUR to 100000, so 999_999 trips a leg
// and the default of 1 keeps every other leg clear.
function mockSql(counts: Record<string, number>): SqlArg {
  return {
    query: async (_text: string, params: unknown[]) => [{ count: counts[params[1] as string] ?? 1 }],
  } as unknown as SqlArg;
}

const OVER_CAP = 999_999;
const req = () => new Request('https://x.test/api/search/works?q=grace');

afterEach(() => {
  gate.override = null;
});

describe('publicReadThrottle — envelope reflects the binding cap', () => {
  it('an HOUR-leg trip is reported as RATE_LIMIT_HOUR, not RATE_LIMIT_MINUTE', async () => {
    // SEED: drop the `r.limited === 'hour'` branch -> code is RATE_LIMIT_MINUTE and the message
    // carries "in a moment" -> RED on three assertions.
    const res = await publicReadThrottle(req(), 'search-works', mockSql({ 'gate:hour': OVER_CAP }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBe('3600');
    const body = (await res!.json()) as { error: { code: string; message: string; retryAfterSec: number } };
    expect(body.error.code).toBe('RATE_LIMIT_HOUR');
    expect(body.error.retryAfterSec).toBe(3600);
    // The regression guard: the hour message must NOT carry the minute leg's "in a moment"
    // wording — that was the active harm, telling an hour-throttled reader to retry at once.
    expect(body.error.message).not.toMatch(/in a moment/);
  });

  it('a MINUTE-leg trip is still reported as RATE_LIMIT_MINUTE (positive control)', async () => {
    const res = await publicReadThrottle(req(), 'search-works', mockSql({ 'gate:min': OVER_CAP }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBe('60');
    const body = (await res!.json()) as { error: { code: string; message: string; retryAfterSec: number } };
    expect(body.error.code).toBe('RATE_LIMIT_MINUTE');
    expect(body.error.message).toContain('in a moment');
    expect(body.error.retryAfterSec).toBe(60);
  });

  it('a clean request passes through (returns null, no envelope)', async () => {
    expect(await publicReadThrottle(req(), 'search-works', mockSql({}))).toBeNull();
  });

  it('defaults the Retry-After per binding cap when the limiter omits retryAfterSec', async () => {
    // The hour default must be 3600, not the minute leg's 60 — the old `?? 60` would produce an
    // hour code with a minute-long header. Substituted, not driven: the shipped limiter always
    // sets retryAfterSec, so this `??` branch has no other route in.
    gate.override = { ok: false, limited: 'hour' };
    const res = await publicReadThrottle(req(), 'search-works', mockSql({}));
    expect(res!.headers.get('Retry-After')).toBe('3600');
    const body = (await res!.json()) as { error: { retryAfterSec: number } };
    expect(body.error.retryAfterSec).toBe(3600);
  });
});

describe('publicReadPageThrottle — the page surface carries an honest backoff signal', () => {
  it('an HOUR-leg trip reports a longer wait, not "in a moment", and a 3600s retryAfterSec', async () => {
    // SEED: drop the hour branch -> message reverts to "in a moment" and retryAfterSec stays
    // whatever the limiter gave -> RED.
    const r = await publicReadPageThrottle('search-page', mockSql({ 'gate:hour': OVER_CAP }));
    expect(r).not.toBeNull();
    expect(r!.retryAfterSec).toBe(3600);
    // The page renders only `message` and has no Retry-After header, so the message itself must
    // convey the magnitude. "in a moment" for an hour trip was no signal at all.
    expect(r!.message).not.toMatch(/in a moment/);
    expect(r!.message).toMatch(/hour/i);
  });

  it('a MINUTE-leg trip keeps the "in a moment" wording (positive control)', async () => {
    const r = await publicReadPageThrottle('search-page', mockSql({ 'gate:min': OVER_CAP }));
    expect(r).not.toBeNull();
    expect(r!.retryAfterSec).toBe(60);
    expect(r!.message).toContain('in a moment');
  });

  it('a clean page request passes through (returns null)', async () => {
    expect(await publicReadPageThrottle('search-page', mockSql({}))).toBeNull();
  });

  it('defaults retryAfterSec to 3600 for the hour leg when the limiter omits it', async () => {
    gate.override = { ok: false, limited: 'hour' };
    expect((await publicReadPageThrottle('search-page', mockSql({})))!.retryAfterSec).toBe(3600);
  });
});
