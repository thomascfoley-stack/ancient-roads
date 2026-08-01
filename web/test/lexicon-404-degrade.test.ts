import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLexEntry, loadFullLexicon } from '@/lib/original';

// A missing /lexicon/ directory serves the host's HTML 404 page, not JSON.
// loadLexicon historically had neither a res.ok check nor a try/catch, so
// res.json() on that body threw and took word-study + word-panel down while
// the sibling fetchers beside them degraded quietly (DEPLOY_PREFLIGHT.md §4).
// These tests pin the guarded behaviour: resolve, never throw.
const html404 = () =>
  new Response('<!DOCTYPE html><html><body>404 Not Found</body></html>', {
    status: 404,
    headers: { 'content-type': 'text/html' },
  });

describe('lexicon fetchers degrade on a missing lexicon', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadFullLexicon resolves null on an HTML 404 instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html404()));
    await expect(loadFullLexicon('greek')).resolves.toBeNull();
  });

  it('fetchLexEntry reports the lexicon unavailable instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html404()));
    await expect(fetchLexEntry('G26')).resolves.toBe('unavailable');
  });

  it('loadFullLexicon resolves null when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(loadFullLexicon('hebrew')).resolves.toBeNull();
  });
});
