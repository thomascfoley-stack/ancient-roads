// CSRF regression test for /api/user-corpus/search.
//
// The route was a cookie-authenticated MUTATING GET: a paid `embedChunks` on the request path PLUS a
// victim-attributed `search_outcomes` audit row via `scheduleSearchOutcome`, with no CSRF control a
// GET can reach — the project's only CSRF layer is `lib/csrf-floor.ts`, a Content-Type floor that
// forces a preflight on cross-origin callers, and a GET has no Content-Type to gate. With the
// session cookie defaulting to SameSite=Lax (Neon Auth SDK default), a cross-site TOP-LEVEL GET
// navigation carried the victim's cookie and ran the handler as the victim: one paid embedding on
// attacker-chosen text (fused `?q=`) debited from the victim's per-user quota, and/or one
// `user_id=victim` row in the operator's audit log (all three modes — verse `?ref=` and keyword
// `?mode=keyword` write the row with ZERO embedding spend).
//
// The fix converted the route to POST + `application/json` so the Content-Type floor reaches it,
// mirroring the CSRF-safe `POST /api/history/search`. This test pins the CSRF properties: no GET
// handler, the floor rejects CORS-simple Content-Types before any spend / audit write / meter, and
// a valid `application/json` POST runs the three modes. The mock idiom mirrors
// history-search-route.test.ts and the bug report's Evidence §1 probe.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusSearchRateLimit: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/user-corpus/embed', () => ({
  embedChunks: vi.fn(async (chunks: string[]) => chunks.map(() => new Array(8).fill(0))),
}));
vi.mock('@/lib/user-corpus/search', () => ({
  searchMyWorks: vi.fn(async () => []),
  keywordSearch: vi.fn(async () => []),
  verseAnchorScan: vi.fn(async () => []),
}));
vi.mock('@/lib/search-outcomes', () => ({
  scheduleSearchOutcome: vi.fn(),
}));

import { POST } from '@/app/api/user-corpus/search/route';
import * as searchRoute from '@/app/api/user-corpus/search/route';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { checkCorpusSearchRateLimit } from '@/lib/rate-limit';
import { embedChunks } from '@/lib/user-corpus/embed';
import { searchMyWorks, keywordSearch, verseAnchorScan } from '@/lib/user-corpus/search';
import { scheduleSearchOutcome } from '@/lib/search-outcomes';

const VICTIM = { id: 'victim-1', email: 'v@x' };

const URL = 'http://victim.example/api/user-corpus/search';
const post = (body: unknown, contentType = 'application/json'): Promise<Response> =>
  POST(new Request(URL, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(guardUser).mockResolvedValue({ denied: null, user: VICTIM } as never);
});

describe('CSRF — /api/user-corpus/search is a POST behind the Content-Type floor', () => {
  it('exports POST and NOT GET — a top-level cross-site GET navigation gets 405, no handler', () => {
    expect(typeof POST).toBe('function');
    expect((searchRoute as unknown as { GET?: unknown }).GET).toBeUndefined();
  });

  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
  ])('rejects a CORS-simple Content-Type (%s) before spend, audit, or meter', async (ct) => {
    const res = await post({ q: 'attacker' }, ct);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a missing Content-Type the same way (no floor bypass for a no-header post)', async () => {
    const res = await POST(new Request(URL, { method: 'POST', body: JSON.stringify({ q: 'attacker' }) }));
    expect(res.status).toBe(400);
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
  });

  it('a valid application/json POST runs ONE paid embedding on the body q and writes one attributed row', async () => {
    const res = await post({ q: 'attacker-chosen-query' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('fused');
    expect(embedChunks).toHaveBeenCalledTimes(1);
    expect(vi.mocked(embedChunks).mock.calls[0]![0]).toEqual(['attacker-chosen-query']);
    expect(searchMyWorks).toHaveBeenCalledTimes(1);
    expect(scheduleSearchOutcome).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleSearchOutcome).mock.calls[0]![0]).toMatchObject({
      surface: 'my_works',
      userId: VICTIM.id,
      query: 'attacker-chosen-query',
    });
  });

  it('the verse (ref) mode is ZERO-spend but still writes the attributed audit row', async () => {
    const res = await post({ ref: 'Romans 8' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('verse');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(verseAnchorScan).toHaveBeenCalledTimes(1);
    expect(scheduleSearchOutcome).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleSearchOutcome).mock.calls[0]![0]).toMatchObject({
      surface: 'my_works',
      userId: VICTIM.id,
      query: 'Romans 8',
    });
  });

  it('the keyword mode is ZERO-spend but still writes the attributed audit row', async () => {
    const res = await post({ q: 'grace', mode: 'keyword' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('keyword');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(keywordSearch).toHaveBeenCalledTimes(1);
    expect(scheduleSearchOutcome).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleSearchOutcome).mock.calls[0]![0]).toMatchObject({
      surface: 'my_works',
      userId: VICTIM.id,
      query: 'grace',
    });
  });

  it('ref is parsed before q — { ref, q } answers verse (matching the prior query-string order)', async () => {
    const res = await post({ ref: 'Romans 8', q: 'ignored' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('verse');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(verseAnchorScan).toHaveBeenCalledTimes(1);
  });

  it('the session cookie is the only thing between a header-valid request and the spend', async () => {
    vi.mocked(guardUser).mockResolvedValueOnce({
      denied: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    } as never);
    const res = await post({ q: 'attacker' });
    expect(res.status).toBe(401);
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('repeated cross-site-style (text/plain) POSTs spend ZERO embeddings — quota preserved', async () => {
    for (let i = 0; i < 3; i++) await post({ q: `q${i}` }, 'text/plain');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });
});
