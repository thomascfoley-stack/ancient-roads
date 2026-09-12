// The rerank leg is a paid DeepInfra call. Before this fix it ran with a standalone
// AbortSignal.timeout(30_000) and ignored the reader's Stop, so pressing Stop during
// retrieval could not abort the in-flight cross-encoder fetch — the socket stayed open
// until the provider completed or the 30s timer fired. These tests pin the fix:
//
//   - rerank composes the caller's signal with its 30s timeout (Stop reaches the fetch).
//   - retrieveCommentary threads the signal to rerank and RE-THROWS AbortError instead of
//     silently falling back to candidates, mirroring embed/compose abort semantics.
//   - a non-abort rerank failure still falls back (the graceful-degrade contract is kept).
//   - an un-aborted caller signal leaves the normal retrieval path intact (no regression).
//
// The REAL rerank and REAL retrieveCommentary are exercised; only the provider fetch, the
// DB pool, and pericope routing are mocked, so the signal travels the production call path.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rerank } from '@/lib/teacher/rerank';
import { retrieveCommentary } from '@/lib/teacher/retrieve';
import { legalBasePool } from '@/lib/teacher/routing';

vi.mock('@/lib/teacher/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/teacher/routing')>();
  return { ...actual, legalBasePool: vi.fn() };
});

vi.mock('@/lib/db', () => ({
  // legalBasePool is mocked, so sql.query is only reached by the on-passage backfill leg —
  // return no backfill rows and let the real routing pure functions take the happy path.
  getDb: () => ({ query: vi.fn(async () => []) }),
}));

vi.mock('../src/bible/pericopes', () => ({
  resolveIntent: vi.fn(() => ({ inject: [], floor: [] })),
}));

// A base pool larger than the default `limit` (6) so retrieveCommentary always reaches the
// rerank call. Distinct chapter keys keep the diversity-aware top-K from collapsing.
const ROWS = Array.from({ length: 7 }, (_, i) => ({
  source_id: `s${i}`,
  score: 0.5,
  content: `Commentary on the passage, voice ${i}.`,
  metadata: {
    author: `Author ${i}`,
    year: null,
    tradition: 'Reformed',
    sourceTitle: 'Exposition',
    sourceUrl: null,
    verseId: 43001001 + i * 100_000,
    verseEnd: 43001001 + i * 100_000,
    model: 'bge',
    work: `work-${i}`,
  },
}));

// A fetch that models a provider call pending until aborted: rejects immediately if the
// signal is already aborted, otherwise stays open and rejects the moment the signal fires.
function pendingUntilAbort(_url: string, init?: { signal?: AbortSignal }): Promise<never> {
  return new Promise((_resolve, reject) => {
    const sig = init?.signal;
    const err = new DOMException('The operation was aborted.', 'AbortError');
    if (sig?.aborted) return reject(err);
    sig?.addEventListener('abort', () => reject(err), { once: true });
  });
}

// Wraps a fetch impl so each call's `init` (the options carrying the signal) is captured,
// without reaching into the mock's typed call tuple.
function capturingFetch(
  impl: (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>,
): { fn: ReturnType<typeof vi.fn>; captured: () => { signal?: AbortSignal } | undefined } {
  let init: { signal?: AbortSignal } | undefined;
  const fn = vi.fn((url: string, i?: { signal?: AbortSignal }) => {
    init = i;
    return impl(url, i);
  });
  return { fn, captured: () => init };
}

beforeEach(() => {
  process.env.DEEPINFRA_API_KEY = 'test-key';
  vi.unstubAllGlobals();
  vi.mocked(legalBasePool).mockReset();
  vi.mocked(legalBasePool).mockResolvedValue(ROWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rerank — Stop reaches the paid fetch', () => {
  it('composes an already-aborted caller signal so the fetch aborts immediately', async () => {
    const { fn: fetchFn, captured } = capturingFetch(pendingUntilAbort);
    vi.stubGlobal('fetch', fetchFn);

    await expect(rerank('q', ['d1', 'd2'], 2, AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(
      captured()?.signal?.aborted,
      'the reader Stop must reach the rerank fetch, not just the 30s timer',
    ).toBe(true);
  });

  it('still bounds the call with the 30s timeout when no caller signal is provided', async () => {
    const { fn: fetchFn, captured } = capturingFetch(async () => ({
      ok: true,
      json: async () => ({ scores: [0.4, 0.9] }),
    }));
    vi.stubGlobal('fetch', fetchFn);

    await expect(rerank('q', ['d1', 'd2'], 2)).resolves.toEqual([
      { index: 1, relevance_score: 0.9 },
      { index: 0, relevance_score: 0.4 },
    ]);
    expect(
      captured()?.signal,
      'a timeout signal still guards the call when there is no reader signal',
    ).toBeTruthy();
    expect(captured()?.signal?.aborted).toBe(false);
  });

  it('aborting a live caller signal aborts the in-flight rerank fetch', async () => {
    const { fn: fetchFn, captured } = capturingFetch(pendingUntilAbort);
    vi.stubGlobal('fetch', fetchFn);

    const controller = new AbortController();
    const p = rerank('q', ['d1', 'd2'], 2, controller.signal);
    const signal = captured()?.signal;
    expect(signal, 'the rerank fetch opened with the composite signal').toBeTruthy();
    expect(signal!.aborted).toBe(false);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(
      signal!.aborted,
      'aborting the reader signal aborts the composite fetch signal',
    ).toBe(true);
  });

  it('skips the API for the trivial 0/1-doc case (unchanged)', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);

    expect(await rerank('q', ['only'], 1)).toEqual([{ index: 0, relevance_score: 1 }]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('retrieveCommentary — Stop propagates through rerank (no silent fallback)', () => {
  it('threads the caller signal into the rerank fetch', async () => {
    let captured: { signal?: AbortSignal } | undefined;
    const fetchFn = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
      captured = init;
      return pendingUntilAbort(url, init);
    });
    vi.stubGlobal('fetch', fetchFn);

    const controller = new AbortController();
    const p = retrieveCommentary([0.1], 6, { signal: controller.signal });
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(captured, 'rerank must be reached for a pool larger than the limit').toBeTruthy();
    expect(captured!.signal?.aborted).toBe(false);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(
      captured!.signal?.aborted,
      'the caller Stop reaches the rerank fetch via retrieveCommentary',
    ).toBe(true);
  });

  it('re-throws AbortError instead of falling back to candidates when the caller aborts', async () => {
    const fetchFn = vi.fn(pendingUntilAbort);
    vi.stubGlobal('fetch', fetchFn);

    const controller = new AbortController();
    const p = retrieveCommentary([0.1], 6, { signal: controller.signal });
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled());
    controller.abort();
    // SEED: if the catch swallows AbortError and returns candidates.slice(0, limit), this
    // RESOLVES (does not reject) and the assertion goes red — the post-abort work the
    // embed/compose guards exist to prevent.
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('still falls back to candidates when rerank fails for a non-abort reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rerank 500'); }));

    const res = await retrieveCommentary([0.1], 6, { signal: new AbortController().signal });
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(6);
    expect(res.every((c) => ROWS.some((r) => r.source_id === c.sourceId))).toBe(true);
  });

  it('an un-aborted caller signal does not change the normal retrieval path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ scores: ROWS.map(() => 0.5) }) })),
    );

    const controller = new AbortController();
    const res = await retrieveCommentary([0.1], 6, { signal: controller.signal });
    expect(Array.isArray(res), 'the happy path still returns retrieved chunks').toBe(true);
    expect(res, 'the normal path returns the full limit').toHaveLength(6);
    expect(controller.signal.aborted).toBe(false);
  });
});
