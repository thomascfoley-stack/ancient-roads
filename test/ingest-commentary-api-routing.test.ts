// ingestSource routing regression: the per-chapter loop counted a permanent-404
// chapter against `errors` (after 3 wasted retries), which the D44 gate summed to
// exit 1 with "Re-run to fill the gaps." This file pins the routing that the unit
// tests above the loop cannot reach — that `ingestSource` increments `absent`
// (not `errors`) for a 404, increments `errors` for a real failure, writes a file
// only on `ok`, and that the gate input (`countFailedChapters`) is 0 when the
// only gaps are permanent coverage gaps.
//
// RED-PROOF: against the unfixed loop, a 404 increments `errors`, so the
// "permanent 404s are absent" test sees `r.errors === TOTAL` (RED) instead of
// `r.errors === 0`. And `SourceResult` had no `absent` field, so the import/type
// would not compile either.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { ingestSource, countFailedChapters, type CommentarySource } from '../src/ingest/ingest-commentary-api';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOOKS } from '../src/bible/books';

const SOURCE: CommentarySource = {
  id: 'john-gill',
  author: 'John Gill',
  year: 1763,
  tradition: 'Reformed Baptist',
};

// Total canonical chapters the loop iterates (the standard 66-book canon).
const TOTAL = BOOKS.reduce((n, b) => n + b.chapterCount, 0);

function mockResponse(status: number, body?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function okBody(): { chapter: { content: { type: string; number: number; content: unknown[] }[] } } {
  return { chapter: { content: [{ type: 'verse', number: 1, content: ['A verse with real text.'] }] } };
}

describe('ingestSource — absent / error / ok routing', () => {
  const noSleep = async () => {};
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('permanent 404s are absent (not errors): errors=0, absent=canonical, gate does NOT fire', async () => {
    fetchMock.mockResolvedValue(mockResponse(404));
    const r = await ingestSource(SOURCE, { sleepFn: noSleep });

    expect(r.errors).toBe(0);
    expect(r.absent).toBe(TOTAL);
    expect(r.totalChapters).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
    // one request per chapter — no wasted 3× retries on permanent gaps
    expect(fetchMock).toHaveBeenCalledTimes(TOTAL);
    // the D44 gate would NOT fire
    expect(countFailedChapters([r])).toBe(0);
  });

  it('persistent 5xxs are errors with retries preserved: gate WOULD fire', async () => {
    fetchMock.mockResolvedValue(mockResponse(503));
    const r = await ingestSource(SOURCE, { sleepFn: noSleep });

    expect(r.absent).toBe(0);
    expect(r.errors).toBe(TOTAL);
    expect(r.totalChapters).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
    // 3 attempts per chapter — retries preserved for transient failures
    expect(fetchMock).toHaveBeenCalledTimes(TOTAL * 3);
    expect(countFailedChapters([r])).toBe(TOTAL);
  });

  it('happy-path 200s are written and counted; no errors, no absent (no regression)', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, okBody()));
    const r = await ingestSource(SOURCE, { sleepFn: noSleep });

    expect(r.errors).toBe(0);
    expect(r.absent).toBe(0);
    expect(r.totalChapters).toBe(TOTAL);
    expect(writeFileSync).toHaveBeenCalledTimes(TOTAL);
  });

  it('mixed coverage within one source: absent (404) and ok (200) coexist, still no errors', async () => {
    let odd = 0;
    for (const b of BOOKS) for (let ch = 1; ch <= b.chapterCount; ch++) if (ch % 2 === 1) odd++;
    const even = TOTAL - odd;

    fetchMock.mockImplementation(async (url: string) => {
      const m = url.match(/(\d+)\.json$/);
      const ch = m ? Number(m[1]) : 0;
      return ch % 2 === 1 ? mockResponse(404) : mockResponse(200, okBody());
    });
    const r = await ingestSource(SOURCE, { sleepFn: noSleep });

    expect(r.errors).toBe(0);
    expect(r.absent).toBe(odd);
    expect(r.totalChapters).toBe(even);
    expect(writeFileSync).toHaveBeenCalledTimes(even);
    expect(countFailedChapters([r])).toBe(0);
  });

  it('cached chapters are skipped via existsSync (resume-by-checkpoint, no fetch)', async () => {
    // everything already on disk → nothing fetched, all chapters counted
    vi.mocked(existsSync).mockReturnValue(true);
    fetchMock.mockResolvedValue(mockResponse(200, okBody()));
    const r = await ingestSource(SOURCE, { sleepFn: noSleep });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(r.totalChapters).toBe(TOTAL);
    expect(r.errors).toBe(0);
    expect(r.absent).toBe(0);
  });
});
