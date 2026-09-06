// @vitest-environment node
//
// The public-read throttle envelope must reflect WHICH cap bound (2026-09-06).
//
// `publicReadThrottle` and `publicReadPageThrottle` both reuse `checkGateRateLimit`, the site-gate
// brute-force limiter, with a looser per-minute cap. That limiter returns `limited:'min'` for the
// minute leg and `limited:'hour'` (retryAfterSec:3600) for the hour leg. Both throttles used to
// DISCARD `r.limited` and always emit the minute variation of the envelope — RATE_LIMIT_MINUTE +
// "try again in a moment" — regardless of which cap bound. So an hour-throttled reader was told
// "in a moment" while the effective wait was up to an hour: on the API surface the body's message
// contradicted its own Retry-After:3600 header, and on the /search HTML page (which renders only
// `message` and has no header) there was no backoff signal at all.
//
// These cases mock only `checkGateRateLimit` (to drive each leg deterministically) and `clientIp`
// (a deterministic IP). `apiError` is left REAL so the hour leg is exercised through the actual
// envelope — the code, the Retry-After header, and the message the contract promises.
import { describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => vi.fn());
const ipFor = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  checkGateRateLimit: (...a: unknown[]) => gate(...a),
}));
vi.mock('@/lib/client-ip', () => ({ clientIp: (...a: unknown[]) => ipFor(...a) }));
// publicReadPageThrottle reads headers() from next/headers; an empty Headers() resolves the IP
// through the mocked clientIp, so the limiter key is stable and irrelevant (the gate is mocked).
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { publicReadThrottle, publicReadPageThrottle } from '@/lib/public-read-limit';

const req = () => new Request('https://x.test/api/search/works?q=grace') as never;

describe('publicReadThrottle — envelope reflects the binding cap', () => {
  it('an HOUR-leg trip is reported as RATE_LIMIT_HOUR, not RATE_LIMIT_MINUTE', async () => {
    gate.mockResolvedValue({ ok: false, limited: 'hour', retryAfterSec: 3600 });
    ipFor.mockReturnValue('203.0.113.9');
    const res = await publicReadThrottle(req(), 'search-works');
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
    gate.mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 });
    const res = await publicReadThrottle(req(), 'search-works');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBe('60');
    const body = (await res!.json()) as { error: { code: string; message: string; retryAfterSec: number } };
    expect(body.error.code).toBe('RATE_LIMIT_MINUTE');
    expect(body.error.message).toContain('in a moment');
    expect(body.error.retryAfterSec).toBe(60);
  });

  it('a clean request passes through (returns null, no envelope)', async () => {
    gate.mockResolvedValue({ ok: true });
    expect(await publicReadThrottle(req(), 'search-works')).toBeNull();
  });

  it('defaults the Retry-After per binding cap when the limiter omits retryAfterSec', async () => {
    // The hour default must be 3600, not the minute leg's 60 — the old `?? 60` produced an hour
    // code with a minute-long header if the limiter ever returned no retryAfterSec.
    gate.mockResolvedValue({ ok: false, limited: 'hour' });
    const res = await publicReadThrottle(req(), 'search-works');
    expect(res!.headers.get('Retry-After')).toBe('3600');
    const body = (await res!.json()) as { error: { retryAfterSec: number } };
    expect(body.error.retryAfterSec).toBe(3600);
  });
});

describe('publicReadPageThrottle — the page surface carries an honest backoff signal', () => {
  it('an HOUR-leg trip reports a longer wait, not "in a moment", and a 3600s retryAfterSec', async () => {
    gate.mockResolvedValue({ ok: false, limited: 'hour', retryAfterSec: 3600 });
    const r = await publicReadPageThrottle('search-page');
    expect(r).not.toBeNull();
    expect(r!.retryAfterSec).toBe(3600);
    // The page renders only `message` and has no Retry-After header, so the message itself must
    // convey the magnitude. "in a moment" for an hour trip was no signal at all.
    expect(r!.message).not.toMatch(/in a moment/);
    expect(r!.message).toMatch(/hour/i);
  });

  it('a MINUTE-leg trip keeps the "in a moment" wording (positive control)', async () => {
    gate.mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 });
    const r = await publicReadPageThrottle('search-page');
    expect(r).not.toBeNull();
    expect(r!.retryAfterSec).toBe(60);
    expect(r!.message).toContain('in a moment');
  });

  it('a clean page request passes through (returns null)', async () => {
    gate.mockResolvedValue({ ok: true });
    expect(await publicReadPageThrottle('search-page')).toBeNull();
  });

  it('defaults retryAfterSec to 3600 for the hour leg when the limiter omits it', async () => {
    gate.mockResolvedValue({ ok: false, limited: 'hour' });
    expect((await publicReadPageThrottle('search-page'))!.retryAfterSec).toBe(3600);
  });
});
