import 'server-only';
import { checkGateRateLimit } from './rate-limit';
import { clientIp } from './client-ip';
import { apiError } from './api-error';
import { headers } from 'next/headers';

// PER-IP THROTTLE FOR THE UNAUTHENTICATED READ SURFACES (2026-08-02 deep audit, H3).
//
// Four public routes — /api/search/works, /api/search/commentaries, /api/work/[slug] and
// /api/work/[slug]/sections — had no `requireUser`, no rate limit, no Cache-Control and nothing
// CDN-cacheable. Each request is a full-text or keyset query over 72,863 sections;
// `searchSections` issues TWO per call, and its own header records the measured cost of the
// pre-optimisation shape (3,781 ms for "grace", 20 s+ cross-corpus). Even optimised, one client
// at modest concurrency saturates the database — the same database the paid /api/ask pipeline
// depends on, whose limiter now fails CLOSED. So a flood on the free routes takes the paid one
// down with it, which is the coupling that makes this worth fixing before launch rather than after.
//
// Audited on the assumption the site password is already gone, because `middleware.ts:10` says it
// will be.
//
// WHY IT REUSES THE GATE LIMITER. Same table, same fixed-window mechanism, and deliberately the
// same FAIL-OPEN posture: these routes serve public-domain text, so a limiter outage should not
// black out the library. That is the opposite of the ask limiter's fail-closed posture, and the
// difference is the point — one protects a bill, this one protects a database, and the right
// answer to "the limiter is broken" differs accordingly.

/** Generous for a reader, hostile to a scraper. Env-tunable without a deploy. */
const PUBLIC_READ_PER_MIN = Number(process.env.PUBLIC_READ_LIMIT_PER_MIN ?? 120);

function throttleKey(ip: string | null, bucket: string): string {
  // No trusted origin: share ONE bucket rather than handing out a free one per unknown caller.
  // `clientIp` returns null instead of the old shared 'unknown' string precisely so this is a
  // decision each caller makes rather than an accident.
  return `read:${bucket}:${ip ?? 'no-trusted-ip'}`;
}

/**
 * @returns a 429 Response to return immediately, or null to proceed.
 */
export async function publicReadThrottle(req: Request, bucket: string): Promise<Response | null> {
  const key = throttleKey(clientIp(req), bucket);
  const r = await checkGateRateLimit(key, undefined, PUBLIC_READ_PER_MIN);
  if (r.ok) return null;
  // Branch on the binding cap, like the ask / user-corpus limiters (api/ask/route.ts,
  // api/user-corpus/search/route.ts). The reused gate limiter returns limited:'hour' with
  // retryAfterSec:3600 when its HOUR leg binds; squashing that into RATE_LIMIT_MINUTE + "in a
  // moment" told an hour-throttled reader to retry at once while Retry-After: 3600 — the code
  // (the contract's branch field, docs/API_ERRORS.md:23) and the human message both lied.
  const hour = r.limited === 'hour';
  return apiError(hour ? 'RATE_LIMIT_HOUR' : 'RATE_LIMIT_MINUTE', {
    message: hour
      ? 'You’ve reached the hourly limit for this page. Please try again in a while.'
      : 'Too many requests. Please slow down and try again in a moment.',
    retryAfterSec: r.retryAfterSec ?? (hour ? 3600 : 60),
  });
}

export interface PageThrottleResult {
  message: string;
  retryAfterSec: number;
}

/**
 * Page-level variant. Server Components cannot easily hand a Request around, but the IP resolution
 * only needs headers. Returns a throttle result or null.
 */
export async function publicReadPageThrottle(bucket: string): Promise<PageThrottleResult | null> {
  const h = await headers();
  const ip = clientIp({ headers: { get: (name) => h.get(name) ?? null } });
  const key = throttleKey(ip, bucket);
  const r = await checkGateRateLimit(key, undefined, PUBLIC_READ_PER_MIN);
  if (r.ok) return null;
  // Same branch as publicReadThrottle. The page surface is the worse case for the unbranched
  // shape: an HTML page has no Retry-After header, and /search renders only `message` (drops
  // retryAfterSec), so an hour trip reported as "in a moment" gave NO backoff signal at all.
  // The hour message names the magnitude ("about an hour") so the page carries an honest signal
  // in the prose itself, not just in the dropped retryAfterSec field.
  const hour = r.limited === 'hour';
  const retryAfterSec = r.retryAfterSec ?? (hour ? 3600 : 60);
  return {
    message: hour
      ? 'You’ve reached the hourly limit. Please try again in about an hour.'
      : 'Too many searches. Please slow down and try again in a moment.',
    retryAfterSec,
  };
}
