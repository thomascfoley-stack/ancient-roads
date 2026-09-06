// The draft-check route reuses the per-user `corpus-search` rate-limit bucket (shared with the
// paid /api/user-corpus/search route — rate-limit.ts:174-185). The limiter used to run BEFORE the
// CSRF Content-Type floor and the body validation (empty/oversize), so a wrong-Content-Type,
// empty, or oversize POST — exactly the inputs the floor and body guards exist to reject —
// returned 400/413 having already bumped the user's corpus-search:min/day buckets. A real user
// pasting a draft longer than 120k chars hit the 413 branch having already burned a
// corpus-search:day slot (web/src/components/my-works.tsx does no length pre-check).
//
// Every sibling route carrying both guards puts the floor ahead of the limiter (ask,
// ask/stream, upload-url, upload-complete, history/search); draft-check alone had them inverted
// — commit f1d36b72 placed the new floor after the already-present limiter call. This is the
// draft-check analog of test/invariants/ask-limiter-charges-valid-only.test.ts (D42.
// "charge only what could spend"), and the CSRF floor is exercised for real (not mocked) so the
// 400/413/429 envelopes are on the wire, exactly as the ask-limiter test exercises the real
// apiError 429 path.
//
// The ordering constraint this must NOT break: the limiter still runs before draftCheck() (the
// wallet-invariant shape that test/invariants/wallet.test.ts enforces for spenders — draft-check
// is anchor-only and not a spender, so this behavioral test is its only ordering ratchet).
import { describe, expect, it, vi, beforeEach } from 'vitest';

const guardUser = vi.fn();
const checkCorpusSearchRateLimit = vi.fn();
const draftCheck = vi.fn();

vi.mock('@/lib/user-corpus/route-guard', () => ({ guardUser: (...a: unknown[]) => guardUser(...a) }));
vi.mock('@/lib/rate-limit', () => ({ checkCorpusSearchRateLimit: (...a: unknown[]) => checkCorpusSearchRateLimit(...a) }));
vi.mock('@/lib/user-corpus/draft-check', () => ({
  draftCheck: (...a: unknown[]) => draftCheck(...a),
  DRAFT_MAX_CHARS: 120_000,
}));
// PREDICATE is built at module load (route.ts:16); keep the import light and deterministic.
vi.mock('@/lib/user-corpus/tradition-gap', () => ({ corpusPredicate: (s: string) => s }));
vi.mock('@/lib/teacher/routing', () => ({ LEGAL_CORPUS_FILTER: '(served)' }));
vi.mock('@/lib/observability', () => ({ logEvent: () => {} }));
// apiError is used on the 429 path; the real helper carries the Retry-After header (lib/api-error.ts:47)
// — keep it real so the 429 envelope is exercised, as in ask-limiter-charges-valid-only.test.ts.

const post = (init: { ct?: string; body: string }) =>
  new Request('http://t/api/user-corpus/draft-check', {
    method: 'POST',
    headers: init.ct === undefined ? {} : { 'content-type': init.ct },
    body: init.body,
  });

beforeEach(() => {
  vi.clearAllMocks();
  guardUser.mockResolvedValue({ denied: null, user: { id: 'u-1', email: 'e' } });
  checkCorpusSearchRateLimit.mockResolvedValue({ ok: true });
  draftCheck.mockResolvedValue({
    detection: { translation: 'kjv', confidence: 1, totalHits: 0 },
    ranges: [], overlaps: [],
    gaps: { voices: [], authorCount: 0, rangesConsidered: 0 },
  });
});

const DRAFT_MAX = 120_000;

describe('draft-check limiter ordering — the shared corpus-search bucket is charged only for requests that could spend', () => {
  it('a wrong-Content-Type POST is 400 (CSRF floor) and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ ct: 'text/plain', body: JSON.stringify({ text: 'a draft' }) }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
    expect(checkCorpusSearchRateLimit, 'a CSRF-floor-rejected request must not bump corpus-search:*').not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('a missing-Content-Type POST is 400 (CSRF floor) and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ body: JSON.stringify({ text: 'a draft' }) }) as never);
    expect(res.status).toBe(400);
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('a malformed JSON body is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ ct: 'application/json', body: '{not json' }) as never);
    expect(res.status).toBe(400);
    expect(checkCorpusSearchRateLimit, 'an unparseable body must not burn a corpus-search slot').not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('an empty draft is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: '   ' }) }) as never);
    expect(res.status).toBe(400);
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('a non-string text field is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 42 }) }) as never);
    expect(res.status).toBe(400);
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('an oversize draft is 413 and costs no quota — the reachable real-user burn path', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 'x'.repeat(DRAFT_MAX + 1) }) }) as never);
    expect(res.status).toBe(413);
    expect(checkCorpusSearchRateLimit, 'the 413 a real user hits pasting a long draft must not burn a shared corpus-search slot').not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('a draft at exactly the cap IS charged (boundary: not refused, and metered)', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 'x'.repeat(DRAFT_MAX) }) }) as never);
    expect(res.status).toBe(200);
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
    expect(draftCheck).toHaveBeenCalledWith('u-1', 'x'.repeat(DRAFT_MAX), '(served)');
  });

  // The limiter must still fire for a request that WOULD spend, and still before draftCheck().
  it('a valid draft IS charged, and charged before draftCheck() runs', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    let chargedBeforeCheck = false;
    checkCorpusSearchRateLimit.mockImplementation(async () => { chargedBeforeCheck = !draftCheck.mock.calls.length; return { ok: true }; });
    await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 'In the beginning God created the heavens and the earth' }) }) as never);
    expect(checkCorpusSearchRateLimit).toHaveBeenCalledWith('u-1');
    expect(chargedBeforeCheck, 'metered before it runs').toBe(true);
    expect(draftCheck).toHaveBeenCalled();
  });

  it('a day-limited valid draft is refused with 429 + Retry-After, and no check runs', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    checkCorpusSearchRateLimit.mockResolvedValue({ ok: false, limited: 'day', retryAfterSec: 3600 });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 'In the beginning' }) }) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMIT_DAY');
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('a minute-limited valid draft is refused with 429 + Retry-After (RATE_LIMIT_MINUTE)', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    checkCorpusSearchRateLimit.mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 'In the beginning' }) }) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMIT_MINUTE');
    expect(draftCheck).not.toHaveBeenCalled();
  });

  it('an auth-denied request is refused before the limiter (guardUser runs first, unchanged)', async () => {
    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    guardUser.mockResolvedValue({ denied: new Response('unauth', { status: 401 }), user: null });
    const res = await POST(post({ ct: 'application/json', body: JSON.stringify({ text: 'In the beginning' }) }) as never);
    expect(res.status).toBe(401);
    expect(checkCorpusSearchRateLimit).not.toHaveBeenCalled();
    expect(draftCheck).not.toHaveBeenCalled();
  });
});
