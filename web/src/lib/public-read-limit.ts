import 'server-only';
import { bump, checkGateRateLimit, envInt, GLOBAL_BUCKET_USER, type Sql } from './rate-limit';
import { getDb } from './db';
import { logEvent } from './observability';
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
const PUBLIC_READ_PER_MIN = envInt('PUBLIC_READ_LIMIT_PER_MIN', 120);
/** The hour leg of the same loosening: 120/minute against the gate's 60/hour was a
 *  hard stop one busy shared IP away, so public reads carry their own hour cap. */
const PUBLIC_READ_PER_HOUR = envInt('PUBLIC_READ_LIMIT_PER_HOUR', 600);
// GLOBAL daily ceiling across ALL callers — the H1 backstop the ask limiter has, for the
// same reason: per-IP caps bound one source, but a distributed flood is unbounded fleet-wide
// without this, and the limiter fails OPEN against the very database the flood is aiming at.
const PUBLIC_READ_GLOBAL_PER_DAY = envInt('PUBLIC_READ_GLOBAL_PER_DAY', 20_000);

function throttleKey(ip: string | null, bucket: string): string {
  // No trusted origin: share ONE bucket rather than handing out a free one per unknown caller.
  // `clientIp` returns null instead of the old shared 'unknown' string precisely so this is a
  // decision each caller makes rather than an accident.
  return `read:${bucket}:${ip ?? 'no-trusted-ip'}`;
}

// True backoff for the fleet-wide daily ceiling: the 'search:global:day' window keys on UTC
// midnight (see globalDayCapTripped's dayStart), so the remaining wait is until next UTC
// midnight — not a flat 3600, which understates by up to ~23h. The day leg names that reset in
// the prose AND in Retry-After, the magnitude-honesty principle the hour leg already follows.
function secondsToUtcMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
}

// Global ceiling check, shared by the request-level and page-level throttles (it was the SAME
// code twice: the page variant shipped without it, so SSR search-page loads escaped the
// fleet-wide ceiling). Bumps the ONE 'search:global:day' pool keyed on the __global__ constant
// LAST, after the per-IP legs, so a single source's burst is attributed to it before it counts
// against everyone (the ask limiter's ordering). Same log shape the owner alerts on
// (`cap: 'global'`), and a limiter FAULT fails open, logged — the posture of this whole file.
//
// @returns true when the fleet-wide daily ceiling tripped and the caller must deny.
async function globalDayCapTripped(sql: Sql, key: string): Promise<boolean> {
  try {
    const d = new Date();
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
    const globalCount = await bump(sql, GLOBAL_BUCKET_USER, 'search:global:day', dayStart);
    if (globalCount > PUBLIC_READ_GLOBAL_PER_DAY) {
      logEvent('rate_limit_hit', { userId: key, cap: 'global', count: globalCount, limit: PUBLIC_READ_GLOBAL_PER_DAY });
      return true;
    }
  } catch (e) {
    logEvent('rate_limit_fail_open', { userId: key, error: (e as Error).message });
  }
  return false;
}

/**
 * @returns a 429 Response to return immediately, or null to proceed.
 */
export async function publicReadThrottle(req: Request, bucket: string, sql: Sql = getDb()): Promise<Response | null> {
  const key = throttleKey(clientIp(req), bucket);
  const r = await checkGateRateLimit(key, sql, PUBLIC_READ_PER_MIN, PUBLIC_READ_PER_HOUR);
  if (!r.ok) {
    // Branch on the binding cap, like the ask / user-corpus limiters (api/ask/route.ts,
    // api/user-corpus/search/route.ts). The reused gate limiter returns limited:'hour' with
    // retryAfterSec:3600 when its HOUR leg binds; squashing that into RATE_LIMIT_MINUTE + "in a
    // moment" told an hour-throttled reader to retry at once while Retry-After: 3600 — the code
    // (the contract's branch field, docs/API_ERRORS.md) and the human message both lied.
    //
    // The hour leg is REACHABLE on this surface, not theoretical: this call passes
    // PUBLIC_READ_LIMIT_PER_HOUR (600) as the perHour override, so a shared IP — carrier NAT,
    // church wifi, a library — trips the hour cap on ordinary reading.
    //
    // The hour branch takes api-error.ts's registered message rather than repeating it here.
    // The minute branch keeps this surface's own wording, which deliberately differs from the
    // registry's question-oriented default.
    if (r.limited === 'hour') {
      return apiError('RATE_LIMIT_HOUR', { retryAfterSec: r.retryAfterSec ?? 3600 });
    }
    return apiError('RATE_LIMIT_MINUTE', {
      message: 'Too many requests. Please slow down and try again in a moment.',
      retryAfterSec: r.retryAfterSec ?? 60,
    });
  }
  if (await globalDayCapTripped(sql, key)) {
    // RATE_LIMIT_DAY, not MINUTE: this is a DAILY ceiling (resets midnight UTC), and the ask
    // route maps its own global cap to RATE_LIMIT_DAY — clients branching on `code` see the
    // same semantics for the same window. The cap is fleet-wide, so the reader is collateral
    // from aggregate load, not a personal quota: the message names the midnight-UTC reset (not
    // the minute leg's "in a moment", which is mechanically false for a fixed-window reset)
    // and Retry-After is the true remaining wait. Still 429 either way.
    return apiError('RATE_LIMIT_DAY', {
      message: 'The library is under heavy use right now. Please try again after midnight UTC.',
      retryAfterSec: secondsToUtcMidnight(),
    });
  }
  return null;
}

export interface PageThrottleResult {
  message: string;
  retryAfterSec: number;
}

/**
 * Page-level variant. Server Components cannot easily hand a Request around, but the IP resolution
 * only needs headers. Returns a throttle result or null.
 */
export async function publicReadPageThrottle(bucket: string, sql: Sql = getDb()): Promise<PageThrottleResult | null> {
  const h = await headers();
  const ip = clientIp({ headers: { get: (name) => h.get(name) ?? null } });
  const key = throttleKey(ip, bucket);
  const r = await checkGateRateLimit(key, sql, PUBLIC_READ_PER_MIN, PUBLIC_READ_PER_HOUR);
  if (!r.ok) {
    // Same branch as publicReadThrottle. The page surface is the worse case for the unbranched
    // shape: an HTML page has no Retry-After header, and /search renders only `message` (drops
    // retryAfterSec), so an hour trip reported as "in a moment" gave NO backoff signal at all.
    // The hour message names the magnitude ("about an hour") so the page carries an honest signal
    // in the prose itself, not just in the dropped retryAfterSec field.
    const hour = r.limited === 'hour';
    return {
      message: hour
        ? 'You’ve reached the hourly limit. Please try again in about an hour.'
        : 'Too many searches. Please slow down and try again in a moment.',
      retryAfterSec: r.retryAfterSec ?? (hour ? 3600 : 60),
    };
  }
  // Same fleet-wide ceiling as the request-level throttle — an SSR page load runs the same
  // searches against the same database, so it counts against (and is bound by) the same pool.
  // The page renders only `message` (no Retry-After header), so the prose must carry the
  // midnight-UTC magnitude on its own — the same shape as the hour leg on this surface.
  if (await globalDayCapTripped(sql, key)) {
    return {
      message: 'The library is under heavy use right now. Please try again after midnight UTC.',
      retryAfterSec: secondsToUtcMidnight(),
    };
  }
  return null;
}
