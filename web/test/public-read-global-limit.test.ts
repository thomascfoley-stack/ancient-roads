// The GLOBAL daily ceiling for the unauthenticated read surface (2026-08-31). /api/ask has
// had this backstop since the H1 deep-audit fix: per-IP caps bound ONE source, but a
// distributed flood is unbounded fleet-wide without a global bucket — and the public-read
// limiter deliberately fails OPEN against the same database a flood would be aiming at.
// publicReadThrottle now mirrors the ask implementation: same bump(), same __global__ pool
// key, same log shape (the owner alerts on `cap: 'global'`), same denial on trip, same
// fail-open-on-limiter-fault posture as the rest of the file.
//
// Hermetic like the root rate-limit tests: the REAL publicReadThrottle against an injected
// `sql`, no DB. The per-IP gate legs are held under their caps so the global leg is the
// only thing that can bind. The cap trip test stubs PUBLIC_READ_GLOBAL_PER_DAY and loads a
// FRESH module (the constant is read at module top) because web/vitest.config.ts lifts the
// shipped caps for the DB-backed suite — the configured limit, not the lifted one, is the
// property under test here.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicReadThrottle } from '@/lib/public-read-limit';

// publicReadPageThrottle reads headers() from next/headers (Server Component context); outside
// Next that throws, so stub it at the module level. An empty Headers means clientIp finds no
// trusted origin and the throttle keys on 'no-trusted-ip' — fine for every assertion below.
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

type SqlArg = NonNullable<Parameters<typeof publicReadThrottle>[2]>;

// Controlled count per bucket, so the global leg can be driven independently of the
// gate minute/hour legs. `seen` records (userId, bucket) for the keying assertion.
function mockSql(counts: Record<string, number>) {
  const seen: Array<[string, string]> = [];
  const sql = {
    query: async (_text: string, params: unknown[]) => {
      const [userId, bucket] = params as [string, string];
      seen.push([userId, bucket]);
      return [{ count: counts[bucket] ?? 1 }];
    },
  } as unknown as SqlArg;
  return { sql, seen };
}

const req = () => new Request('https://x.test/api/search/works?q=grace');
const logged: string[] = [];

vi.spyOn(console, 'log').mockImplementation((line: unknown) => void logged.push(String(line)));

afterEach(() => {
  logged.length = 0;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('publicReadThrottle — global daily ceiling', () => {
  it('proceeds (null) when the global count is under the cap', async () => {
    const { sql } = mockSql({ 'search:global:day': 5 });
    expect(await publicReadThrottle(req(), 'search-works', sql)).toBeNull();
  });

  it('DENIES with a 429 once the configured global cap trips, and logs cap: global', async () => {
    // SEED: delete the search:global:day bump/check in publicReadThrottle -> RED.
    vi.stubEnv('PUBLIC_READ_GLOBAL_PER_DAY', '100');
    vi.resetModules();
    const fresh = await import('@/lib/public-read-limit');
    const { sql } = mockSql({ 'search:global:day': 101 });
    const res = await fresh.publicReadThrottle(req(), 'search-works', sql);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBe('3600');
    // A DAILY ceiling trips here, and the error code must say so: the ask route maps its own
    // global cap to RATE_LIMIT_DAY (web/src/app/api/ask/route.ts), and clients branching on
    // `code` must see the same semantics for the same window. RATE_LIMIT_MINUTE would tell the
    // reader to retry in a moment against a cap that resets at midnight UTC.
    // SEED: return apiError('RATE_LIMIT_MINUTE', ...) for the global trip -> RED.
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMIT_DAY');
    // The owner alerts on this field shape — the same line the ask global cap logs.
    const hit = logged.find((l) => l.includes('"rate_limit_hit"'));
    expect(hit, 'the global cap trip was not logged').toBeDefined();
    expect(hit).toContain('"cap":"global"');
  });

  it('bumps ONE pool keyed on the __global__ constant, not per-IP', async () => {
    const { sql, seen } = mockSql({});
    await publicReadThrottle(req(), 'search-works', sql);
    const globalRow = seen.find(([, bucket]) => bucket === 'search:global:day');
    expect(globalRow, 'the global bucket was never bumped').toBeDefined();
    expect(globalRow![0], 'the global bucket must not be keyed per-IP').toBe('__global__');
  });

  it('FAILS OPEN (proceeds, logged) when the global bucket read throws — a limiter fault must not black out the library', async () => {
    // The per-IP gate legs still answer; only the global read faults. This is the file's
    // documented posture, not an accident.
    // SEED: let the throw propagate (drop the try/catch) -> RED.
    const sql = {
      query: async (_t: string, params: unknown[]) => {
        if (params[1] === 'search:global:day') throw new Error('db down');
        return [{ count: 1 }];
      },
    } as unknown as SqlArg;
    expect(await publicReadThrottle(req(), 'search-works', sql)).toBeNull();
    expect(logged.some((l) => l.includes('"rate_limit_fail_open"'))).toBe(true);
  });
});

// The PAGE-level variant (app/search/page.tsx) ran with only the per-IP legs: SSR search-page
// loads escaped the fleet-wide ceiling entirely, which was the whole point of the global
// bucket. It now runs the same 'search:global:day' bump through the same helper, with the same
// fail-open posture — only the denial SHAPE differs (PageThrottleResult, not a Response),
// because that is what the page already renders.
describe('publicReadPageThrottle — same global daily ceiling as the request-level throttle', () => {
  const pageThrottle = async (sql: SqlArg) =>
    (await import('@/lib/public-read-limit')).publicReadPageThrottle('search-page', sql);

  it('proceeds (null) when the global count is under the cap', async () => {
    const { sql } = mockSql({ 'search:global:day': 5 });
    expect(await pageThrottle(sql)).toBeNull();
  });

  it('bumps the SAME pool as the request-level throttle: __global__ + search:global:day', async () => {
    // SEED: drop the global bump from publicReadPageThrottle -> RED.
    const { sql, seen } = mockSql({});
    await pageThrottle(sql);
    const globalRow = seen.find(([, bucket]) => bucket === 'search:global:day');
    expect(globalRow, 'the page throttle never bumped the global bucket').toBeDefined();
    expect(globalRow![0], 'the global bucket must not be keyed per-IP').toBe('__global__');
  });

  it('DENIES in the page denial shape (retryAfterSec 3600) once the cap trips, and logs cap: global', async () => {
    vi.stubEnv('PUBLIC_READ_GLOBAL_PER_DAY', '100');
    vi.resetModules();
    const { sql } = mockSql({ 'search:global:day': 101 });
    const res = await pageThrottle(sql);
    expect(res).not.toBeNull();
    expect(res!.retryAfterSec).toBe(3600);
    expect(res!.message).toBe('Too many searches. Please slow down and try again in a moment.');
    const hit = logged.find((l) => l.includes('"rate_limit_hit"'));
    expect(hit, 'the global cap trip was not logged').toBeDefined();
    expect(hit).toContain('"cap":"global"');
  });

  it('FAILS OPEN (proceeds, logged) when the global bucket read throws', async () => {
    const sql = {
      query: async (_t: string, params: unknown[]) => {
        if (params[1] === 'search:global:day') throw new Error('db down');
        return [{ count: 1 }];
      },
    } as unknown as SqlArg;
    expect(await pageThrottle(sql)).toBeNull();
    expect(logged.some((l) => l.includes('"rate_limit_fail_open"'))).toBe(true);
  });

  it('checks the global ceiling LAST — a per-IP-limited burst never touches the global pool', async () => {
    const buckets: string[] = [];
    const sql = {
      query: async (_t: string, params: unknown[]) => {
        const bucket = params[1] as string;
        buckets.push(bucket);
        return [{ count: bucket === 'gate:min' ? 999_999 : 1 }]; // per-IP minute leg way over
      },
    } as unknown as SqlArg;
    const res = await pageThrottle(sql);
    expect(res).not.toBeNull();
    expect(res!.retryAfterSec).toBe(60);
    expect(buckets).not.toContain('search:global:day');
  });
});
