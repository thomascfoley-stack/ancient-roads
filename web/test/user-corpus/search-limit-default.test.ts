// B019 — EVERY MY WORKS SEARCH RETURNED EXACTLY ONE RESULT.
//
// `Number(params.get('limit'))` is `Number(null)` when the parameter is absent, which is `0`, and
// `Number.isFinite(0)` is true — so `limit: 0` reached `clampLimit`, which floors it to 1. The
// `scope.limit ?? DEFAULT_LIMIT` fallback in search.ts cannot rescue it, because `??` only catches
// null and undefined, and zero is neither. The shipped client never sends `limit`, so this was
// every search: fused, keyword, and verse presence alike.
//
// Measured before the fix (2026-08-20 deep dive, 30 real sermons indexed): the scope the route
// built returned 1 hit where the same call with `limit` omitted returned 20.
//
// NO DATABASE. The library is mocked to capture the scope the route hands it, because the defect
// is entirely in how the route reads a query parameter — and a DB-gated test would not run in CI
// (the credentials live in the db-invariants job, this suite runs in audit).

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => ({ denied: null, user: { id: 'u-1', email: 'u@example.com' } }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusSearchRateLimit: async () => ({ ok: true }),
}));
vi.mock('@/lib/user-corpus/embed', () => ({
  embedChunks: async (t: string[]) => t.map(() => new Array(1024).fill(0)),
}));

interface Scope { documentId?: string; limit?: number }
const seen: { fn: string; scope: Scope }[] = [];

vi.mock('@/lib/user-corpus/search', () => ({
  searchMyWorks: async (_u: string, _v: number[], _q: string, scope: Scope) => {
    seen.push({ fn: 'searchMyWorks', scope });
    return [];
  },
  keywordSearch: async (_u: string, _q: string, scope: Scope) => {
    seen.push({ fn: 'keywordSearch', scope });
    return [];
  },
  verseAnchorScan: async (_u: string, _r: unknown, scope: Scope) => {
    seen.push({ fn: 'verseAnchorScan', scope });
    return [];
  },
}));

const GET = (await import('@/app/api/user-corpus/search/route')).GET;

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/user-corpus/search?${qs}`));

beforeEach(() => { seen.length = 0; });

describe('search route — the limit the client does not send', () => {
  it('leaves limit unset for a fused search, so DEFAULT_LIMIT applies', async () => {
    await call('q=grace');
    expect(seen).toHaveLength(1);
    // The assertion that matters: NOT 0. A 0 here is the bug, because clampLimit floors it to 1.
    expect(seen[0]!.scope.limit).toBeUndefined();
  });

  it('leaves limit unset for keyword mode', async () => {
    await call('q=grace&mode=keyword');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.fn).toBe('keywordSearch');
    expect(seen[0]!.scope.limit).toBeUndefined();
  });

  it('leaves limit unset for the verse-presence scan', async () => {
    await call(`ref=${encodeURIComponent('Romans 8')}`);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.fn).toBe('verseAnchorScan');
    expect(seen[0]!.scope.limit).toBeUndefined();
  });

  it('still honours an explicit limit', async () => {
    await call('q=grace&limit=5');
    expect(seen[0]!.scope.limit).toBe(5);
  });

  it('treats a non-numeric or empty limit as unset rather than as zero', async () => {
    await call('q=grace&limit=abc');
    expect(seen[0]!.scope.limit).toBeUndefined();
    seen.length = 0;
    await call('q=grace&limit=');
    expect(seen[0]!.scope.limit).toBeUndefined();
  });

  it('passes documentId through unchanged', async () => {
    await call('q=grace&documentId=doc-7');
    expect(seen[0]!.scope.documentId).toBe('doc-7');
  });
});
