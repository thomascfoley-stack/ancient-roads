// Pins the history-search limiter → apiError mapping on POST /api/history/search.
//
// Commit e3f0e172 (2026-08-19) added the route's `!rl.ok` branch as a single bare-string
// `NextResponse.json({ error: 'rate_limited', retryAfterSec }, { status: 429 })` with no read of
// `rl.limited`, so a limiter DB outage (`limited: 'unavailable'`, fail-closed in rate-limit.ts)
// was misclassified as 429 user-quota instead of 503 UPSTREAM_UNAVAILABLE — unlike the four
// sibling fail-closed-limiter routes (/api/ask, /api/ask/stream, /api/user-corpus/search,
// /api/user-corpus/draft-check) which all use the same three-way apiError split. The later sibling
// fix 308cf9ce (2026-09-06) patched the corpus route's two-way ternary but left this route's
// omission untouched. This pins the three-way split here so the misclassification cannot recur.
//
// NO DATABASE: the limiter is hermetically mocked, so this runs in the qa gate (no DB, no
// embeddings). The limiter's own FAIL-CLOSED behavior is pinned by test/rate-limit.test.ts; this
// file pins the route's status-code mapping only.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spreads the REAL @/lib/auth-failure so this mock carries every export the route imports, not
// just the ones this file thought of — see the note in library-shelf-round-trip.test.ts. Held by
// test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')), requireUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkHistorySearchRateLimit: vi.fn() }));
// history-search-db is mocked so the route loads without a DB AND we can assert the limiter
// short-circuits before any retrieval (the wallet-DoS invariant the fail-closed posture serves).
vi.mock('@/lib/history-search-db', () => ({ searchHistory: vi.fn() }));

import { POST } from '@/app/api/history/search/route';
import { requireUser } from '@/lib/session';
import { checkHistorySearchRateLimit } from '@/lib/rate-limit';
import { searchHistory } from '@/lib/history-search-db';

const post = (body: unknown): Promise<Response> =>
  POST(new Request('http://x/api/history/search', {
    method: 'POST',
    // The CSRF floor (lib/csrf-floor.ts) requires this header; a bare string body would
    // arrive as text/plain and 400 before any of the behavior under test runs.
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
  vi.mocked(searchHistory).mockResolvedValue({ interpretation: { entities: [], period: null }, closest: null, results: [], coverage: { works: 0, sections: 0 } } as never);
});

describe('POST /api/history/search — limiter → apiError mapping', () => {
  it('maps a limiter DB outage (unavailable) to 503 UPSTREAM_UNAVAILABLE, not 429', async () => {
    vi.mocked(checkHistorySearchRateLimit).mockResolvedValue({ ok: false, limited: 'unavailable', retryAfterSec: 30 } as never);
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.retryAfterSec).toBe(30);
    // The fail-closed SPEND invariant: a denied search never reaches retrieval.
    expect(searchHistory).not.toHaveBeenCalled();
  });

  it('still maps the per-minute cap to 429 RATE_LIMIT_MINUTE (regression guard)', async () => {
    vi.mocked(checkHistorySearchRateLimit).mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 } as never);
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMIT_MINUTE');
    expect(body.error.retryAfterSec).toBe(60);
    expect(searchHistory).not.toHaveBeenCalled();
  });

  it('still maps the daily cap to 429 RATE_LIMIT_DAY with the 3600s window (regression guard)', async () => {
    vi.mocked(checkHistorySearchRateLimit).mockResolvedValue({ ok: false, limited: 'day', retryAfterSec: 3600 } as never);
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMIT_DAY');
    // The 3600s window is the field the sole client (history-ask.tsx) reads via
    // `body.error.retryAfterSec`; a route-only apiError change that dropped it would regress the
    // day-cap message from 3600s to the client's 60s fallback, so pin it here.
    expect(body.error.retryAfterSec).toBe(3600);
    expect(searchHistory).not.toHaveBeenCalled();
  });

  // Commit 6daff0e7 (2026-09-16) added the fleet-wide `corpus:global:day` ceiling across the
  // corpus/history limiters, making `checkHistorySearchRateLimit` newly able to return
  // `limited: 'global'` (retryAfterSec: 3600). The route's ternary only branched on 'unavailable'
  // and 'day', so 'global' fell through to the `RATE_LIMIT_MINUTE` branch — reporting a fleet-wide
  // daily cap as a per-minute cap, and emitting an internally inconsistent 429 (code/message say
  // sub-minute while `Retry-After: 3600`). /api/ask has carried `rl.limited === 'day' ||
  // rl.limited === 'global'` since 10023675; this pins the same arm here. The sole client
  // (history-ask.tsx) reads `retryAfterSec` and ignores `code`/`message`, so this is a
  // wire-consistency guard as much as a user-facing one — but the 3600s window it reads is still
  // asserted below.
  it('maps a fleet-wide global trip (global) to 429 RATE_LIMIT_DAY, not RATE_LIMIT_MINUTE', async () => {
    vi.mocked(checkHistorySearchRateLimit).mockResolvedValue({ ok: false, limited: 'global', retryAfterSec: 3600 } as never);
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMIT_DAY');
    expect(body.error.retryAfterSec).toBe(3600);
    // The fail-closed SPEND invariant: a denied search never reaches retrieval.
    expect(searchHistory).not.toHaveBeenCalled();
  });
});
