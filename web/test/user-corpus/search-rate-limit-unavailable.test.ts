// Pins the corpus-search limiter → apiError mapping on /api/user-corpus/search.
//
// Commit 60a43f14 (2026-08-17) added the limiter with a two-way `limited === 'day' ? DAY : MINUTE`
// ternary that dropped 'unavailable' (the limiter DB failing, fail-closed in rate-limit.ts) into the
// MINUTE branch — returning 429 (user quota) for an infrastructure outage instead of 503. The
// correct three-way split (unavailable → UPSTREAM_UNAVAILABLE) already existed in /api/ask since
// 2026-08-01 (commit 10023675); this pins it here so the incomplete ternary cannot recur silently.
//
// NO DATABASE: the limiter is hermetically mocked, so this runs in the qa gate (no DB, no
// embeddings, no bible corpus). The limiter's own FAIL-CLOSED behavior is pinned by
// upload-rate-limit.test.ts; this file pins the route's status-code mapping only.

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitResult } from '@/lib/rate-limit';

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => ({ denied: null, user: { id: 'u-1', email: 'u@example.com' } }),
}));

let searchLimit: RateLimitResult = { ok: true };
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusSearchRateLimit: async () => searchLimit,
}));

// The route imports these at module load. Mock them so it loads without DEEPINFRA_API_KEY or a
// database; the limiter short-circuits before they are reached on every !ok case here.
vi.mock('@/lib/user-corpus/embed', () => ({ embedChunks: async () => [new Array(8).fill(0)] }));
vi.mock('@/lib/user-corpus/search', () => ({
  searchMyWorks: async () => [],
  keywordSearch: async () => [],
  verseAnchorScan: async () => [],
}));

const GET = (await import('@/app/api/user-corpus/search/route')).GET;

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/user-corpus/search?${qs}`));

beforeEach(() => { searchLimit = { ok: true }; });

describe('search route — limiter → apiError mapping', () => {
  it('maps a limiter DB outage (unavailable) to 503 UPSTREAM_UNAVAILABLE, not 429', async () => {
    searchLimit = { ok: false, limited: 'unavailable', retryAfterSec: 30 };
    const res = await call('q=grace');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.retryAfterSec).toBe(30);
  });

  it('still maps the per-minute cap to 429 RATE_LIMIT_MINUTE (regression guard)', async () => {
    searchLimit = { ok: false, limited: 'min', retryAfterSec: 60 };
    const res = await call('q=grace');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect((await res.json()).error.code).toBe('RATE_LIMIT_MINUTE');
  });

  it('still maps the daily cap to 429 RATE_LIMIT_DAY (regression guard)', async () => {
    searchLimit = { ok: false, limited: 'day', retryAfterSec: 3600 };
    const res = await call('q=grace');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect((await res.json()).error.code).toBe('RATE_LIMIT_DAY');
  });
});
