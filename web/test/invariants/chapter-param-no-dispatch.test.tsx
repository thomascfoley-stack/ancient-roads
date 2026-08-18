// @vitest-environment jsdom
//
// A084 — A MALFORMED CHAPTER DISPATCHES NOTHING. THE CALL SITES, NOT THE PREDICATE.
//
// `test/invariants/chapter-param-guard.test.ts` pins `isFetchableChapter` itself, and its header
// says the call sites are "a code-review question, not something a unit test can honestly police".
//
// THAT JUSTIFICATION WAS WRONG, and the 2026-08-17 pre-deploy audit proved it by deleting the
// guard from all three call sites and watching 71 tests across 8 files stay GREEN. The predicate
// was pinned; the thing the predicate exists to do was not. A guard nothing calls is exactly the
// defect class this repo names most often — `saveReadingProgress` with zero callers, the bookmark
// write path with zero call sites — and the fix for A084 had landed in that shape.
//
// So this drives the SHIPPED reader page at a malformed URL and asserts on the network. The
// harness is the one `bible-position.test.tsx` already uses; the assertion is the symptom the QA
// fleet actually reported — `?chapter=NaN` in the request log — rather than a property of a
// helper.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeRef = vi.hoisted(() => ({
  params: { book: 'jhn', chapter: 'abc' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/read/jhn/abc',
  useParams: () => routeRef.params,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import ReaderPage from '@/app/read/[book]/[chapter]/page';

let urls: string[] = [];

beforeEach(() => {
  urls = [];
  routeRef.params = { book: 'jhn', chapter: 'abc' };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    urls.push(typeof input === 'string' ? input : String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    onchange: null, dispatchEvent: () => false,
  }));
  class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('A084 — the call sites spend the guard', () => {
  it('/read/jhn/abc issues NO request carrying NaN', async () => {
    // SEED: delete `if (!isFetchableChapter(...)) return;` from any of the three call sites —
    // read/[book]/[chapter]/page.tsx (the commentary and original prefetches) or
    // lib/use-annotation-writes.ts (the annotations GET) -> RED, and the failure names the URL.
    render(<ReaderPage />);
    // The effects that would dispatch run on mount; give them a turn to do it.
    await waitFor(() => expect(document.body).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));

    const nan = urls.filter((u) => /NaN/i.test(u));
    expect(nan, `malformed chapter dispatched: ${nan.join(', ')}`).toEqual([]);
  });

  it('a WELL-FORMED chapter still dispatches — the guard blocks the bad case only', async () => {
    // Without this, "never fetch anything" passes the leg above forever and silently breaks the
    // reader. This is the control the predicate-only test could not provide.
    routeRef.params = { book: 'jhn', chapter: '1' };
    render(<ReaderPage />);
    await waitFor(() => expect(urls.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(urls.some((u) => /NaN/i.test(u))).toBe(false);
  });
});
