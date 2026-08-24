// B5 (#117): the Bible API ingest trusted the chapter response shape with a
// TypeScript `as` cast and iterated `data.chapter.content` blind. A 200 with a
// different JSON shape threw a bare `TypeError` inside the retry loop — the
// retry re-fetched the same bad body, and the chapter was silently never
// written. The guard must be LOUD: throw naming the URL and the missing field.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, parseChapterResponse } from '../src/ingest/ingest-api.js';

const CHAPTER_URL = 'https://bible.helloao.org/api/BSB/GEN/1.json';

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ingest-api response shape guard', () => {
  it('throws naming the URL when the chapter object is missing', async () => {
    // RED-PROOF: the unfixed code has no guard — iterating `data.chapter.content`
    // on this body throws a bare `TypeError` that names no URL.
    stubFetch({ translation: {}, book: {} });
    const data = await fetchJson(CHAPTER_URL);
    expect(() => parseChapterResponse(CHAPTER_URL, data)).toThrow(CHAPTER_URL);
    expect(() => parseChapterResponse(CHAPTER_URL, data)).toThrow(/chapter/);
  });

  it('throws naming the URL when chapter.content is not an array', async () => {
    stubFetch({ chapter: { number: 1, content: 'not-an-array' } });
    const data = await fetchJson(CHAPTER_URL);
    expect(() => parseChapterResponse(CHAPTER_URL, data)).toThrow(CHAPTER_URL);
    expect(() => parseChapterResponse(CHAPTER_URL, data)).toThrow(/chapter\.content/);
  });
});
