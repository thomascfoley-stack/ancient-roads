// The fused-path `catch` in /api/user-corpus/search used to assert a single, fixed cause —
// `degraded: 'semantic search is unavailable; showing keyword matches only'` — for every
// failure inside the try, regardless of which of three structurally distinct sources threw:
//
//   (1) `embedChunks` throws `EmbeddingUnavailable`  → embedder genuinely down  → banner CORRECT
//   (2) `searchMyWorks` rejects: `semanticSearch` arm failed        → semantic down  → banner CORRECT
//   (3) `searchMyWorks` rejects: `keywordSearch` arm failed inside `Promise.all`
//        → embedder provably up (it produced the vector above), semantic search never observed
//          to fail, but `Promise.all` first-rejection-wins discarded the successful arm
//        → banner WRONG: it claims "semantic search is unavailable" when it never was
//
// This file is the first test to drive that catch (every prior search-*.test.ts mocks
// `searchMyWorks` to resolve, so the catch has never run in CI). It pins the fix: the banner
// is "semantic search is unavailable; showing keyword matches only" ONLY when the embedder
// actually threw `EmbeddingUnavailable`; for any other rejection (a `searchMyWorks` failure of
// unknown arm) the banner is the generic "search is degraded; showing keyword matches only".
//
// RED-PROOF (THE_LOOP rule 4): the mislabel test (#1) fails against the pre-fix route, which
// always emits the semantic banner; it passes only once the route branches on
// `e instanceof EmbeddingUnavailable`. The embedder-down test (#2) is a regression guard: it
// passes both before and after the fix, pinning that the genuine-embedder-down case keeps the
// "semantic" wording (the fix must not collapse both branches to the generic message).
//
// NO DATABASE. The route tier is hermetically mocked. `@/lib/user-corpus/embed`'s mock factory
// returns a REAL `EmbeddingUnavailable` class (a subclass of `Error` with `name` set, mirroring
// the production class) so the route's `e instanceof EmbeddingUnavailable` narrowing — and the
// test's `new EmbeddingUnavailable(...)` throw — bind to the same class object the route holds
// after the mock is applied. This is the standard vitest pattern for an `instanceof`-checked
// class crossing a module mock; the class signature matches `embed.ts`'s so the mock is a
// faithful stand-in.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusSearchRateLimit: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/user-corpus/embed', () => {
  // Mirror `web/src/lib/user-corpus/embed.ts`'s `EmbeddingUnavailable` so the route's
  // `e instanceof EmbeddingUnavailable` narrowing binds to the SAME class this test throws.
  class EmbeddingUnavailable extends Error {
    constructor(message: string, readonly permanent = false) {
      super(message);
      this.name = 'EmbeddingUnavailable';
    }
  }
  return { embedChunks: vi.fn(), EmbeddingUnavailable };
});
vi.mock('@/lib/user-corpus/search', () => ({
  searchMyWorks: vi.fn(),
  keywordSearch: vi.fn(),
  verseAnchorScan: vi.fn(),
}));
vi.mock('@/lib/search-outcomes', () => ({
  scheduleSearchOutcome: vi.fn(),
}));

import { POST } from '@/app/api/user-corpus/search/route';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { embedChunks, EmbeddingUnavailable } from '@/lib/user-corpus/embed';
import { searchMyWorks, keywordSearch, verseAnchorScan } from '@/lib/user-corpus/search';
import { scheduleSearchOutcome } from '@/lib/search-outcomes';

const USER = { id: 'u-1', email: 'u@example.com' };
const URL = 'http://localhost/api/user-corpus/search';

const post = (body: unknown): Promise<Response> =>
  POST(new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

const HIT = {
  documentId: 'doc-1', sectionId: 'sec-1', title: 'A Sermon', heading: null, ordinal: 0,
  text: 'body text', score: 1.5, createdAt: '2026-01-01T00:00:00Z',
};
const VEC = new Array(8).fill(0);

const SEMANTIC_BANNER = 'semantic search is unavailable; showing keyword matches only';
const GENERIC_BANNER = 'search is degraded; showing keyword matches only';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(guardUser).mockResolvedValue({ denied: null, user: USER } as never);
  // The fused-path defaults: embedder succeeds, searchMyWorks succeeds. Individual tests
  // override these with mockResolvedValueOnce / mockRejectedValueOnce to drive the catch.
  vi.mocked(embedChunks).mockResolvedValue([VEC]);
  vi.mocked(searchMyWorks).mockResolvedValue([]);
  vi.mocked(keywordSearch).mockResolvedValue([HIT]);
  vi.mocked(verseAnchorScan).mockResolvedValue([]);
});

describe('[user-corpus] /api/user-corpus/search — the degraded banner blames the right cause', () => {
  it('happy fused path: embedder up + searchMyWorks up → mode "fused", no degraded banner, no keyword fallback', async () => {
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; degraded?: string };
    expect(body.mode).toBe('fused');
    expect(body.degraded).toBeUndefined();
    expect(keywordSearch).not.toHaveBeenCalled();
    // Audit row records the FUSED outcome, not a degraded one.
    expect(scheduleSearchOutcome).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleSearchOutcome).mock.calls[0]![0]).toMatchObject({
      params: { mode: 'fused' },
      query: 'grace',
      userId: USER.id,
    });
  });

  // ── THE MISLABEL (bug report Evidence §1, red-proof) ──────────────────────────────────────
  it('embedder SUCCEEDED + searchMyWorks rejected (FTS-arm cause) + keyword retry SUCCEEDED → generic banner, NOT "semantic … unavailable" (red-proof of the fix)', async () => {
    // The embedder provably came up (embedChunks resolved with a vector). searchMyWorks' FTS arm
    // threw inside Promise.all (first-rejection-wins), discarding the successful semantic arm.
    // The standalone keywordSearch retry then succeeds on a fresh pooled connection.
    vi.mocked(searchMyWorks).mockRejectedValueOnce(new Error('fts_connection_reset'));
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; q?: string; degraded?: string; hits?: unknown[] };
    expect(body.mode).toBe('keyword');
    expect(body.q).toBe('grace');
    // The FIX: the banner must NOT claim semantic search is down — the embedder succeeded and the
    // failure was inside searchMyWorks' Promise.all, so the cause is unknown, not "semantic down".
    expect(body.degraded).toBe(GENERIC_BANNER);
    expect(body.degraded).not.toBe(SEMANTIC_BANNER);
    // The keyword retry is what produced the hits.
    expect(keywordSearch).toHaveBeenCalledTimes(1);
    expect(searchMyWorks).toHaveBeenCalledTimes(1);
    expect(body.hits).toEqual([HIT]);
    // The OUTCOME audit tag is preserved: a degraded run is still distinguishable from ordinary
    // keyword-mode usage in the query log (the bug report: honest-as-outcome, misleading-as-cause).
    expect(vi.mocked(scheduleSearchOutcome).mock.calls[0]![0]).toMatchObject({
      params: { mode: 'keyword-degraded' },
      query: 'grace',
      resultCount: 1,
    });
  });

  it('embedder SUCCEEDED + searchMyWorks rejected (semantic-arm cause) + keyword retry SUCCEEDED → same generic banner (the route cannot tell which arm of Promise.all failed)', async () => {
    // Symmetric to the FTS-arm test: a semanticSearch rejection also surfaces here as a non-
    // EmbeddingUnavailable error, indistinguishable from the FTS arm. The route conservatively
    // reports the generic banner rather than over-claiming "semantic down", because an
    // EmbeddingUnavailable is the ONLY signal that proves the embedder itself was the failure.
    vi.mocked(searchMyWorks).mockRejectedValueOnce(new Error('cosine scan timeout'));
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; degraded?: string };
    expect(body.mode).toBe('keyword');
    expect(body.degraded).toBe(GENERIC_BANNER);
    expect(keywordSearch).toHaveBeenCalledTimes(1);
  });

  it('embedder returned an empty vector (route guard `no query vector`) + keyword retry SUCCEEDED → generic banner (a non-EmbeddingUnavailable error from the embedder region)', async () => {
    // embedChunks resolved with no vector → the route's `if (!vector) throw new Error('no query
    // vector')` guard fires. This is a non-EmbeddingUnavailable error; the route does not claim
    // semantic search was down (the embedder returned an HTTP 200, just a malformed body).
    vi.mocked(embedChunks).mockResolvedValueOnce([]);
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; degraded?: string };
    expect(body.mode).toBe('keyword');
    expect(body.degraded).toBe(GENERIC_BANNER);
    expect(searchMyWorks).not.toHaveBeenCalled();
    expect(keywordSearch).toHaveBeenCalledTimes(1);
  });

  // ── THE EMBEDDER-DOWN CASE (regression guard: the "semantic" banner is RETAINED here) ─────
  it('embedder threw EmbeddingUnavailable + keyword retry SUCCEEDED → semantic banner (genuine embedder-down keeps the "semantic … unavailable" wording)', async () => {
    // The embedder is genuinely down (missing API key, provider 5xx after retries, model
    // mismatch). This is the one case the old catch was correct about, and the fix preserves it.
    vi.mocked(embedChunks).mockRejectedValueOnce(new EmbeddingUnavailable('DEEPINFRA_API_KEY is not set', true));
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; degraded?: string; hits?: unknown[] };
    expect(body.mode).toBe('keyword');
    expect(body.degraded).toBe(SEMANTIC_BANNER);
    // searchMyWorks never ran — the embedder failed before it.
    expect(searchMyWorks).not.toHaveBeenCalled();
    expect(keywordSearch).toHaveBeenCalledTimes(1);
    expect(body.hits).toEqual([HIT]);
    expect(vi.mocked(scheduleSearchOutcome).mock.calls[0]![0]).toMatchObject({
      params: { mode: 'keyword-degraded' },
      query: 'grace',
      resultCount: 1,
    });
  });

  it('embedder permanently down (EmbeddingUnavailable.permanent) + keyword retry SUCCEEDED → still the semantic banner (the permanent flag does not change the banner choice)', async () => {
    // The branch is on the CLASS, not on `permanent`; a permanent embedder failure is still an
    // embedder failure, so the "semantic" wording applies.
    vi.mocked(embedChunks).mockRejectedValueOnce(new EmbeddingUnavailable('embed 503: upstream', false));
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { degraded?: string }).degraded).toBe(SEMANTIC_BANNER);
    expect(searchMyWorks).not.toHaveBeenCalled();
    expect(keywordSearch).toHaveBeenCalledTimes(1);
  });

  // ── FALLBACK ALSO FAILS → INTERNAL envelope (D35 / e4542c97: never a raw 500) ──────────────
  it('embedder SUCCEEDED + searchMyWorks rejected + keyword retry FAILED → apiError INTERNAL (no banner, no raw 500)', async () => {
    vi.mocked(searchMyWorks).mockRejectedValueOnce(new Error('fts_connection_reset'));
    vi.mocked(keywordSearch).mockRejectedValueOnce(new Error('db down again'));
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INTERNAL');
    // No degraded banner — the degrade itself failed, so the user gets the error envelope, not a
    // misleading "showing keyword matches only" with no matches.
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  it('embedder threw EmbeddingUnavailable + keyword retry FAILED → apiError INTERNAL (embedder-down does not bypass the fallback-failure envelope)', async () => {
    vi.mocked(embedChunks).mockRejectedValueOnce(new EmbeddingUnavailable('down'));
    vi.mocked(keywordSearch).mockRejectedValueOnce(new Error('db down'));
    const res = await post({ q: 'grace' });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe('INTERNAL');
    expect(searchMyWorks).not.toHaveBeenCalled();
    expect(scheduleSearchOutcome).not.toHaveBeenCalled();
  });

  // ── NON-FUSED MODES ARE UNAFFECTED (no embedder, no fused catch, no banner) ──────────────
  it('explicit keyword mode stays banner-free (a separate code path, unaffected by the fused catch)', async () => {
    const res = await post({ q: 'grace', mode: 'keyword' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; degraded?: string };
    expect(body.mode).toBe('keyword');
    expect(body.degraded).toBeUndefined();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(searchMyWorks).not.toHaveBeenCalled();
    expect(keywordSearch).toHaveBeenCalledTimes(1);
  });

  it('verse mode stays banner-free (verseAnchorScan, unaffected by the fused catch)', async () => {
    const res = await post({ ref: 'Romans 8' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode?: string; degraded?: string };
    expect(body.mode).toBe('verse');
    expect(body.degraded).toBeUndefined();
    expect(embedChunks).not.toHaveBeenCalled();
    expect(searchMyWorks).not.toHaveBeenCalled();
  });
});
