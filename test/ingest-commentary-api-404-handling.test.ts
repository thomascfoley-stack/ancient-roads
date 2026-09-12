// 404 coverage-gap handling regression: ingest-commentary-api treated a permanent
// 404 (a commentary that simply doesn't cover a chapter) the same as a transient
// fetch failure — `fetchJson` threw on any non-2xx, the per-chapter loop retried
// the throw 3× with backoff, counted it in `errors`, and the D44 fail-loud gate
// then exited 1 with "Re-run to fill the gaps." For matthew-henry + adam-clarke,
// 358 canonical chapters permanently 404, so the default run exited 1 forever
// and each resume wasted ~18 min retrying gaps that can never be filled.
//
// The fix mirrors adapter-helloao.ts (same HelloAO chapter endpoint) by classifying
// the fetch result ok | absent | error and skipping absent chapters without retry
// or error accounting, while real errors still retry and trip the gate.
//
// RED-PROOF: against the unfixed script `fetchJson` is the only fetcher and it
// throws `${res.status}` on any non-2xx — neither `fetchChapterResult` nor
// `fetchChapterWithRetry` exists, so the imports below fail at module load and
// every test in this file is RED. The retry-policy tests additionally pin that a
// 404 is fetched exactly once (vs. the old 3×), which is the wasted-18-min fix.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchChapterResult,
  fetchChapterWithRetry,
  countFailedChapters,
  type ApiVerse,
} from '../src/ingest/ingest-commentary-api';

function mockResponse(status: number, body?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function okBody(): { chapter: { content: ApiVerse[] } } {
  return { chapter: { content: [{ type: 'verse', number: 1, content: ['A verse with real text.'] }] } };
}

describe('fetchChapterResult — status classification', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('200 with valid JSON → ok', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, okBody()));
    const r = await fetchChapterResult('https://x/MAT/1.json');
    expect(r).toEqual({ status: 'ok', data: okBody() });
  });

  it('404 → absent (the load-bearing classification)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(404));
    const r = await fetchChapterResult('https://x/MAT/19.json');
    expect(r).toEqual({ status: 'absent' });
  });

  it('500 → error carrying the status code as the message', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(500));
    const r = await fetchChapterResult('https://x/MAT/1.json');
    expect(r).toEqual({ status: 'error', message: '500' });
  });

  it('503 → error (treated as transient, NOT absent)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(503));
    const r = await fetchChapterResult('https://x/MAT/1.json');
    expect(r).toEqual({ status: 'error', message: '503' });
  });

  it('network exception → error carrying the thrown message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    const r = await fetchChapterResult('https://x/MAT/1.json');
    expect(r).toEqual({ status: 'error', message: 'fetch failed' });
  });

  it('200 with an unparseable body → error (a bad body does not crash the loop)', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => { throw new Error('Unexpected token <'); },
    } as unknown as Response);
    const r = await fetchChapterResult('https://x/MAT/1.json');
    expect(r).toEqual({ status: 'error', message: 'Unexpected token <' });
  });
});

describe('fetchChapterWithRetry — retry policy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const noSleep = async () => {};

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('404 → absent, fetched exactly ONCE (no wasted retries on a permanent gap)', async () => {
    fetchMock.mockResolvedValue(mockResponse(404));
    const sleepSpy = vi.fn(noSleep);
    const r = await fetchChapterWithRetry('https://x/MAT/19.json', sleepSpy);
    expect(r).toEqual({ status: 'absent' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('200 → ok, fetched exactly ONCE', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, okBody()));
    const r = await fetchChapterWithRetry('https://x/MAT/1.json', noSleep);
    expect(r.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('persistent 5xx → error, fetched 3× with 1s/2s backoff (retries preserved)', async () => {
    fetchMock.mockResolvedValue(mockResponse(503));
    const sleepSpy = vi.fn(noSleep);
    const r = await fetchChapterWithRetry('https://x/MAT/1.json', sleepSpy);
    expect(r.status).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // backoff fires only on attempts 2 and 3 (attempt 0 has no wait)
    expect(sleepSpy.mock.calls).toEqual([[1000], [2000]]);
  });

  it('5xx then 200 → ok on retry, fetched 2× (transient failure recovers)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200, okBody()));
    const sleepSpy = vi.fn(noSleep);
    const r = await fetchChapterWithRetry('https://x/MAT/1.json', sleepSpy);
    expect(r.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepSpy.mock.calls).toEqual([[1000]]);
  });

  it('network exception then 200 → ok on retry', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(mockResponse(200, okBody()));
    const r = await fetchChapterWithRetry('https://x/MAT/1.json', noSleep);
    expect(r.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a 404 surfaced after a prior 5xx resolves to absent, not error', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(404));
    const r = await fetchChapterWithRetry('https://x/MAT/19.json', noSleep);
    expect(r).toEqual({ status: 'absent' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('countFailedChapters — D44 gate input', () => {
  it('counts only errors: absent (coverage-gap) chapters do not contribute', () => {
    expect(countFailedChapters([
      { source: 'matthew-henry', totalEntries: 1, totalChapters: 1, errors: 0, absent: 23 },
      { source: 'adam-clarke', totalEntries: 1, totalChapters: 1, errors: 0, absent: 335 },
    ])).toBe(0);
  });

  it('sums real errors across sources regardless of their absent counts', () => {
    expect(countFailedChapters([
      { source: 'a', totalEntries: 0, totalChapters: 0, errors: 2, absent: 0 },
      { source: 'b', totalEntries: 0, totalChapters: 0, errors: 3, absent: 100 },
    ])).toBe(5);
  });

  it('is zero when every source is clean', () => {
    expect(countFailedChapters([
      { source: 'a', totalEntries: 5, totalChapters: 5, errors: 0, absent: 0 },
    ])).toBe(0);
  });
});
