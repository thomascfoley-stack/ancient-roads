// The search route reuses the per-user `corpus-search` rate-limit bucket — the SAME bucket
// `/api/user-corpus/draft-check` reaches via the same `checkCorpusSearchRateLimit` call
// (rate-limit.ts:224 / :229 bump `corpus-search:min` and `corpus-search:day` unconditionally).
// The limiter used to run BEFORE `req.json()` and the body validation, so a request the route
// was about to reject at body validation — a malformed JSON body, an empty `{}`, an over-500-char
// `q`, or an unparseable `ref` — returned 400 / INVALID_REQUEST having ALREADY bumped the user's
// `corpus-search:min`/`:day` counters. Because the bucket is SHARED, those burned slots also
// gated the sibling draft-check route: a user (or a buggy/automated client of theirs) could 429
// their own draft-check by posting a stream of rejected searches.
//
// This is the search-route analog of test/invariants/ask-limiter-charges-valid-only.test.ts
// (D42, "charge only what could spend") and test/invariants/draft-check-limiter-charges-valid-only.test.ts
// (the same contract on the other holder of the `corpus-search:*` bucket, fixed by 358f73b1).
// The CSRF floor (`requireJsonContentType`), `apiError` (the 400/429/503 envelopes), and `parseRef`
// (the verse-branch ref validation) are exercised for REAL — not mocked — so the on-the-wire
// status codes and bodies are asserted exactly as the ask/draft-check siblings assert them. Only
// the limiter, the auth guard, the spend (`embedChunks` / `verseAnchorScan` / `keywordSearch` /
// `searchMyWorks`) and the audit write (`scheduleSearchOutcome`) are mocked, so a 400 that
// "costs no quota" is observed as the limiter spy NOT being called and the spend/audit spies NOT
// being called.
//
// The ordering constraint this must NOT break: the limiter still runs before any spend
// (`embedChunks`/`verseAnchorScan`/`keywordSearch`/`searchMyWorks`), which the wallet shape test
// (test/invariants/wallet.test.ts) enforces for `teach()` spenders and this behavioral test
// enforces for the search route's own spend by asserting the limiter fires before the spend.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const guardUser = vi.fn();
const checkCorpusSearchRateLimit = vi.fn();
const embedChunks = vi.fn();
const searchMyWorks = vi.fn();
const keywordSearch = vi.fn();
const verseAnchorScan = vi.fn();
const scheduleSearchOutcome = vi.fn();

vi.mock('@/lib/user-corpus/route-guard', () => ({ guardUser: (...a: unknown[]) => guardUser(...a) }));
vi.mock('@/lib/rate-limit', () => ({ checkCorpusSearchRateLimit: (...a: unknown[]) => checkCorpusSearchRateLimit(...a) }));
vi.mock('@/lib/user-corpus/embed', () => ({ embedChunks: (...a: unknown[]) => embedChunks(...a) }));
vi.mock('@/lib/user-corpus/search', () => ({
  searchMyWorks: (...a: unknown[]) => searchMyWorks(...a),
  keywordSearch: (...a: unknown[]) => keywordSearch(...a),
  verseAnchorScan: (...a: unknown[]) => verseAnchorScan(...a),
}));
vi.mock('@/lib/search-outcomes', () => ({ scheduleSearchOutcome: (...a: unknown[]) => scheduleSearchOutcome(...a) }));
// requireJsonContentType (csrf-floor), apiError, and parseRef are REAL — exercise the on-the-wire
// 400/429/503 envelopes and the verse-branch ref validation, the same as the ask/draft-check
// siblings exercise the real apiError 429 path.

const URL = 'http://t/api/user-corpus/search';
const post = (init: { ct?: string; body: string }) =>
  new Request(URL, {
    method: 'POST',
    headers: init.ct === undefined ? {} : { 'content-type': init.ct },
    body: init.body,
  });

beforeEach(() => {
  vi.clearAllMocks();
  guardUser.mockResolvedValue({ denied: null, user: { id: 'u-1', email: 'e' } });
  checkCorpusSearchRateLimit.mockResolvedValue({ ok: true });
  embedChunks.mockResolvedValue([new Array(8).fill(0)]);
  searchMyWorks.mockResolvedValue([]);
  keywordSearch.mockResolvedValue([]);
  verseAnchorScan.mockResolvedValue([]);
});

describe('search limiter ordering — the shared corpus-search bucket is charged only for requests that could spend (D42)', () => {
  it('a wrong-Content-Type POST is 400 (CSRF floor) and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'text/plain', body: JSON.stringify({ q: 'grace' }) }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
    expect(checkCorpusSearchRateLimit, 'a CSRF-floor-rejected request must not bump corpus-search:*').not.toHaveBeenCalled();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(verseAnchorScan).not.toHaveBeenCalled();
    expect(keywordSearch).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('a missing-Content-Type POST is 400 (CSRF floor) and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ body: JSON.stringify({ q: 'grace' }) }) as never);
    expect(res.status).toBe(400);
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('a malformed JSON body is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: '{not json' }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Provide q or ref.');
    expect(checkCorpusSearchRateLimit, 'an unparseable body must not burn a corpus-search slot').not.toHaveBeenCalled();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(verseAnchorScan).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('an empty body (no q, no ref) is 400 ("Provide q or ref.") and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({}) }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Provide q or ref.');
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('a non-object JSON body (e.g. a bare primitive/array) parses to {} and is 400, costing no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify([1, 2, 3]) }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Provide q or ref.');
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('an oversize q (over the 500 cap) is INVALID_REQUEST and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'x'.repeat(501) }) }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string; message: string } }).error.code).toBe('INVALID_REQUEST');
    expect(checkCorpusSearchRateLimit, 'an oversize-q 400 must not burn a corpus-search slot').not.toHaveBeenCalled();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('a q at exactly the 500 cap IS valid (boundary: not refused, and metered)', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'x'.repeat(500) }) }) as never);
    expect(res.status).toBe(200);
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
    expect(embedChunks).toHaveBeenCalledWith(['x'.repeat(500)]);
  });

  it('an unparseable ref is 400 ("Could not read … as a passage.") and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ ref: '@@@ not a passage' }) }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Could not read "@@@ not a passage" as a passage.');
    expect(checkCorpusSearchRateLimit, 'an unparseable-ref 400 must not burn a corpus-search slot').not.toHaveBeenCalled();
    expect(verseAnchorScan).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('{ ref, q } answers verse (ref parsed before q) — q is neither length-validated nor required when ref is present', async () => {
    // Regression guard: the reorder must preserve the prior query-string order (`?ref=` before
    // `?q=`), pinned by search-csrf.test.ts. An OVERSIZE q alongside a valid ref must answer verse
    // (200) and NOT 400 on the q cap — proving q validation is skipped on the verse branch, exactly
    // as before the limiter was moved.
    const { POST } = await import('@/app/api/user-corpus/search/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ ref: 'Romans 8', q: 'x'.repeat(501) }) }) as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('verse');
    expect(verseAnchorScan).toHaveBeenCalledTimes(1);
    expect(embedChunks).not.toHaveBeenCalled();
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
  });

  it('a valid fused q IS charged, and charged before embedChunks() runs (metered before it spends)', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    let chargedBeforeSpend = false;
    checkCorpusSearchRateLimit.mockImplementation(async () => { chargedBeforeSpend = embedChunks.mock.calls.length === 0; return { ok: true }; });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'what is grace' }) }) as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('fused');
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
    expect(chargedBeforeSpend, 'the wallet invariant: metered before it spends').toBe(true);
    expect(embedChunks).toHaveBeenCalledWith(['what is grace']);
    expect(scheduleSearchOutcome).toHaveBeenCalledTimes(1);
  });

  it('a valid verse ref IS charged, and charged before verseAnchorScan() runs', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    let chargedBeforeSpend = false;
    checkCorpusSearchRateLimit.mockImplementation(async () => { chargedBeforeSpend = verseAnchorScan.mock.calls.length === 0; return { ok: true }; });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ ref: 'Romans 8' }) }) as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('verse');
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
    expect(chargedBeforeSpend).toBe(true);
    expect(verseAnchorScan).toHaveBeenCalledTimes(1);
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).toHaveBeenCalledTimes(1);
  });

  it('a valid keyword q IS charged, and charged before keywordSearch() runs', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    let chargedBeforeSpend = false;
    checkCorpusSearchRateLimit.mockImplementation(async () => { chargedBeforeSpend = keywordSearch.mock.calls.length === 0; return { ok: true }; });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'grace', mode: 'keyword' }) }) as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode?: string }).mode).toBe('keyword');
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
    expect(chargedBeforeSpend).toBe(true);
    expect(keywordSearch).toHaveBeenCalledTimes(1);
    expect(embedChunks).not.toHaveBeenCalled();
  });

  it('a day-limited valid q is refused with 429 + Retry-After (RATE_LIMIT_DAY), and no spend runs', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    checkCorpusSearchRateLimit.mockResolvedValue({ ok: false, limited: 'day', retryAfterSec: 3600 });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'what is grace' }) }) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMIT_DAY');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(searchMyWorks).not.toHaveBeenCalled();
    expect(verseAnchorScan).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('a minute-limited valid q is refused with 429 + Retry-After (RATE_LIMIT_MINUTE), and no spend runs', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    checkCorpusSearchRateLimit.mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'what is grace' }) }) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMIT_MINUTE');
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('a limiter DB outage (unavailable) on a valid q is 503 UPSTREAM_UNAVAILABLE, not 429', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    checkCorpusSearchRateLimit.mockResolvedValue({ ok: false, limited: 'unavailable', retryAfterSec: 30 });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'what is grace' }) }) as never);
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = (await res.json()) as { error: { code: string; retryAfterSec?: number } };
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.retryAfterSec).toBe(30);
    expect(embedChunks).not.toHaveBeenCalled();
  });

  it('an auth-denied request is refused before the limiter (guardUser runs first, unchanged)', async () => {
    const { POST } = await import('@/app/api/user-corpus/search/route');
    guardUser.mockResolvedValue({ denied: new Response('unauth', { status: 401 }), user: null });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ q: 'what is grace' }) }) as never);
    expect(res.status).toBe(401);
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });
});
