// Pins the corpus-search limiter → apiError mapping on /api/user-corpus/draft-check.
//
// Same incomplete-ternary bug as the search route (commit 60a43f14, 2026-08-17): 'unavailable'
// (the limiter DB failing, fail-closed in rate-limit.ts) was dropped into the MINUTE branch,
// returning 429 (user quota) for an infrastructure outage instead of 503 UPSTREAM_UNAVAILABLE.
// The correct three-way split already existed in /api/ask; this pins it here.
//
// NO DATABASE: the limiter and downstream modules are hermetically mocked; this runs in the
// qa gate with no DB / no bible corpus. The limiter's own FAIL-CLOSED behavior is pinned by
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

// The route evaluates `PREDICATE = corpusPredicate(LEGAL_CORPUS_FILTER)` at module load, which
// would need the gitignored bible corpus if imported for real. Mock these so the module loads
// hermetically; the limiter short-circuits before any of them are reached on every !ok case.
vi.mock('@/lib/csrf-floor', () => ({ requireJsonContentType: () => null }));
vi.mock('@/lib/user-corpus/draft-check', () => ({
  DRAFT_MAX_CHARS: 20000,
  draftCheck: async () => ({ ranges: [], overlaps: [], gaps: { voices: [], authorCount: 0, rangesConsidered: 0 } }),
}));
vi.mock('@/lib/user-corpus/tradition-gap', () => ({ corpusPredicate: () => () => true }));
vi.mock('@/lib/teacher/routing', () => ({ LEGAL_CORPUS_FILTER: {} }));

const POST = (await import('@/app/api/user-corpus/draft-check/route')).POST;

const post = (text: string) =>
  POST(new NextRequest('http://localhost/api/user-corpus/draft-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));

beforeEach(() => { searchLimit = { ok: true }; });

describe('draft-check route — limiter → apiError mapping', () => {
  it('maps a limiter DB outage (unavailable) to 503 UPSTREAM_UNAVAILABLE, not 429', async () => {
    searchLimit = { ok: false, limited: 'unavailable', retryAfterSec: 30 };
    const res = await post('My draft on Romans 8:28.');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.retryAfterSec).toBe(30);
  });

  it('still maps the per-minute cap to 429 RATE_LIMIT_MINUTE (regression guard)', async () => {
    searchLimit = { ok: false, limited: 'min', retryAfterSec: 60 };
    const res = await post('My draft on Romans 8:28.');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect((await res.json()).error.code).toBe('RATE_LIMIT_MINUTE');
  });

  it('still maps the daily cap to 429 RATE_LIMIT_DAY (regression guard)', async () => {
    searchLimit = { ok: false, limited: 'day', retryAfterSec: 3600 };
    const res = await post('My draft on Romans 8:28.');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect((await res.json()).error.code).toBe('RATE_LIMIT_DAY');
  });
});
