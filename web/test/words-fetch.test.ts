// fetchWordIndex (web/src/lib/words.ts) — mirrors the fetchConcordance semantics this file's
// data shares a shape with: bucket cached per prefix, outlier verseIds fetched from a dedicated
// shard, a missing/HTML-404 body degrades to null instead of throwing (DEPLOY_PREFLIGHT.md §4,
// same guard as lexicon-404-degrade.test.ts).
//
// The module caches buckets for the life of the module, so each test below uses its OWN
// bucket prefix — reusing one across tests would assert the cache, not the fetch.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWordIndex } from '@/lib/words';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const html404 = () =>
  new Response('<!DOCTYPE html><html><body>404 Not Found</body></html>', {
    status: 404,
    headers: { 'content-type': 'text/html' },
  });

describe('fetchWordIndex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a bucket entry to { word, count, verseIds }, normalizing the query first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ charity: { count: 24, verseIds: [46_013_004, 46_013_008] } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    // "Charity," must normalize to the same key as "charity" — one fetch, clean key.
    await expect(fetchWordIndex('Charity,')).resolves.toEqual({
      word: 'charity',
      count: 24,
      verseIds: [46_013_004, 46_013_008],
    });
    expect(fetchMock).toHaveBeenCalledWith('/words/ch.json');
  });

  it('serves a second word in the same bucket from cache — one fetch for two lookups', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        love: { count: 281, verseIds: [46_016_014] },
        loved: { count: 89, verseIds: [43_003_016] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await fetchWordIndex('love');
    await expect(fetchWordIndex('loved')).resolves.toEqual({
      word: 'loved',
      count: 89,
      verseIds: [43_003_016],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a shard pointer to the "_" outlier shard, never to the bucket name itself', async () => {
    // "of" is its own 2-letter bucket key AND an outlier; an unprefixed shard URL would
    // re-fetch the bucket and parse a pointer map as a WordIndex. The "_" prefix is the fix.
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url === '/words/of.json'
          ? json({ of: { count: 18_123, shard: true } })
          : json({ word: 'of', count: 18_123, verseIds: [1_001_001] }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWordIndex('of')).resolves.toEqual({
      word: 'of',
      count: 18_123,
      verseIds: [1_001_001],
    });
    expect(fetchMock).toHaveBeenCalledWith('/words/of.json');
    expect(fetchMock).toHaveBeenCalledWith('/words/_of.json');
  });

  it('folds a possessive query before choosing the bucket', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ paul: { count: 158, verseIds: [44_013_009] } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWordIndex("Paul's")).resolves.toMatchObject({ word: 'paul', count: 158 });
    expect(fetchMock).toHaveBeenCalledWith('/words/pa.json');
  });

  it('returns null without fetching for a query with no letter-like token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchWordIndex('—')).resolves.toBeNull();
    await expect(fetchWordIndex('')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to null on an HTML 404 bucket instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html404()));
    await expect(fetchWordIndex('zzyzx')).resolves.toBeNull();
  });

  it('degrades to null when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchWordIndex('selah')).resolves.toBeNull();
  });
});
