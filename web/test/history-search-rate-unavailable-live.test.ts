// LIVE limiter-DB-outage reproduction against the REAL route + REAL limiter + REAL neon() driver.
// Unlike history-search-rate-unavailable.test.ts (which hermetically mocks the limiter), this file
// leaves `@/lib/rate-limit` and `@/lib/db` UNMOCKED and points APP_DATABASE_URL at an endpoint the
// HTTP serverless driver cannot reach — the limiter's `bump()` throws on the failed fetch, the
// fail-closed catch returns `{ ok: false, limited: 'unavailable', retryAfterSec: 30 }`, and the
// route (the fix) must map it to 503 UPSTREAM_UNAVAILABLE and never call searchHistory. Only the
// auth (requireUser, no Neon Auth here) and the downstream history deps are mocked so the module
// loads; the limiter path is fully real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')), requireUser: vi.fn() }));
// ONLY the database-backed history deps are mocked; @/lib/rate-limit and @/lib/db stay REAL.
vi.mock('@/lib/history-search-db', () => ({ searchHistory: vi.fn() }));
vi.mock('@/lib/history-threads', () => ({ createHistoryThread: vi.fn() }));
vi.mock('@/lib/search-outcomes', () => ({ scheduleSearchOutcome: vi.fn() }));

import { POST } from '@/app/api/history/search/route';
import { requireUser } from '@/lib/session';
import { searchHistory } from '@/lib/history-search-db';

const saved = { app: process.env.APP_DATABASE_URL, db: process.env.DATABASE_URL };

const post = (body: unknown): Promise<Response> =>
  POST(new Request('http://x/api/history/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: 'u-live' } as never);
  // Point at a host:port the serverless HTTP driver will FAIL to reach fast (connection refused).
  process.env.APP_DATABASE_URL = 'postgresql://nobody:nobody@127.0.0.1:1/none?sslmode=disable';
  process.env.DATABASE_URL = 'postgresql://nobody:nobody@127.0.0.1:1/none?sslmode=disable';
});

afterEach(() => {
  process.env.APP_DATABASE_URL = saved.app;
  process.env.DATABASE_URL = saved.db;
});

describe('POST /api/history/search — LIVE limiter DB outage (real neon() driver, unreachable DB)', () => {
  it('maps an unreachable limiter DB to 503 UPSTREAM_UNAVAILABLE, never 429, no retrieval', async () => {
    const res = await post({ query: 'ephesus' });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.retryAfterSec).toBe(30);
    expect(searchHistory).not.toHaveBeenCalled();
  });
});
