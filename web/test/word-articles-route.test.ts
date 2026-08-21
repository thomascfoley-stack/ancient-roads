// GET /api/word/[strongs]/articles — the reference shelf's data door
// (docs/WORD_REFERENCE_PANE_DESIGN.md). What is pinned:
//
//   * An invalid key is a 400 BEFORE any query runs — the route never asks the DB about
//     garbage.
//   * A valid key normalizes case (g2316 → G2316) before it reaches the data layer, so shared
//     lowercase links behave identically.
//   * The throttle runs first (public read route, same posture as /api/work/*).
//   * The response is exactly { articles } from the data layer — no reshaping to drift from.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWordArticles = vi.fn();
vi.mock('@/lib/word-articles', () => ({ fetchWordArticles: (...a: unknown[]) => fetchWordArticles(...a) }));
let throttled: Response | null = null;
vi.mock('@/lib/public-read-limit', () => ({ publicReadThrottle: async () => throttled }));

import { GET } from '@/app/api/word/[strongs]/articles/route';

const req = (url = 'http://x/api/word/H430/articles') => new Request(url);
const ctx = (strongs: string) => ({ params: Promise.resolve({ strongs }) });

beforeEach(() => {
  fetchWordArticles.mockReset().mockResolvedValue([{ heading: 'H430 x', body: 'b', ordinal: 1, work: { slug: 's', title: 't', author: 'a', license: 'PD' } }]);
  throttled = null;
});

describe('GET /api/word/[strongs]/articles', () => {
  it('rejects garbage before any query', async () => {
    const res = await GET(req(), ctx('DROP TABLE'));
    expect(res.status).toBe(400);
    expect(fetchWordArticles).not.toHaveBeenCalled();
  });

  it('normalizes case and returns the data layer’s rows', async () => {
    const res = await GET(req(), ctx('h430'));
    expect(res.status).toBe(200);
    expect(fetchWordArticles).toHaveBeenCalledWith('H430');
    const body = await res.json();
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].work.author).toBe('a');
  });

  it('the throttle answers first', async () => {
    throttled = new Response('slow down', { status: 429 });
    const res = await GET(req(), ctx('H430'));
    expect(res.status).toBe(429);
    expect(fetchWordArticles).not.toHaveBeenCalled();
  });
});
