// /api/history/search route behavior — auth, validation, limiter, fail-closed. Mock-based;
// red-proof is by MUTATION of the route (see the commit), since a mock test that has never
// failed proves nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spreads the REAL @/lib/auth-failure so this mock carries every export the route imports, not
// just the ones this file thought of — see the note in library-shelf-round-trip.test.ts. Held by
// test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')), requireUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkHistorySearchRateLimit: vi.fn() }));
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
  vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
  vi.mocked(checkHistorySearchRateLimit).mockResolvedValue({ ok: true } as never);
  vi.mocked(searchHistory).mockResolvedValue({ interpretation: { entities: [], period: null }, closest: null, results: [], coverage: { works: 0, sections: 0 } } as never);
});

describe('POST /api/history/search', () => {
  it('401 when unauthenticated — never the catch-all 500', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error('no session'));
    expect((await post({ query: 'ephesus' })).status).toBe(401);
    expect(searchHistory).not.toHaveBeenCalled();
  });
  it('400 on empty and over-cap queries — validated at the edge', async () => {
    expect((await post({ query: '' })).status).toBe(400);
    expect((await post({ query: 'x'.repeat(501) })).status).toBe(400);
    expect((await post({ nope: 1 })).status).toBe(400);
  });
  it('429 with Retry-After when limited, and no search runs', async () => {
    vi.mocked(checkHistorySearchRateLimit).mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 } as never);
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(searchHistory).not.toHaveBeenCalled();
  });
  it('500 fail-closed when retrieval throws — including the excerpt gate', async () => {
    vi.mocked(searchHistory).mockRejectedValue(new Error('excerpt is not a verbatim substring'));
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'history_unavailable' });
  });
  it('200 passes the contract through untouched', async () => {
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ coverage: { works: 0, sections: 0 } });
  });
});
