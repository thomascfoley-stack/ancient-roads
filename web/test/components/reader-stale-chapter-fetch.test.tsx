// @vitest-environment jsdom
//
// B4 (#118) — THE READER'S CHAPTER FETCH HAD NO CLEANUP, so a slow STALE chapter overwrote the
// fresh one on screen. The dep array on the fetch effect carries `chapterNum`, so the common
// trigger is rapid chapter navigation (next-chapter pressed twice on a slow connection), not the
// translation double-switch the original report framed: two `fetchChapter` calls are in flight,
// the SECOND resolves first and renders, the FIRST resolves last and its bare `.then(setData)`
// overwrites the newer chapter. The header renders `chapterNum` (fresh) while `data` is stale —
// the page says John 2 and shows John 1.
//
// The fix is the pattern desk-pane.tsx:201-218 already carries: a `cancelled` flag set by the
// effect's cleanup, checked before either state write.
//
// RED-PROOF: against the unfixed effect (no cleanup return), the last leg below goes RED — the
// stale response's marker text is what renders. Seeded and watched: reverting the cleanup in
// web/src/app/read/[book]/[chapter]/page.tsx reproduces the failure verbatim.
//
// The race is driven by hand, not by timers: both chapter fetches hit the same per-book file
// (`/bible/web/jhn.json`, lib/bible.ts bookCache), so the stub hands out one deferred per request
// and the test resolves them in the losing order — second first, first last.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeRef = vi.hoisted(() => ({
  params: { book: 'jhn', chapter: '1' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
  useParams: () => routeRef.params,
  usePathname: () => '/read/jhn/1',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import ReaderPage from '@/app/read/[book]/[chapter]/page';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Each response carries its own marker, so the rendered text names the response that won. */
function bookFile(marker1: string, marker2: string) {
  return new Response(
    JSON.stringify({
      translation: 'web',
      book: 43,
      slug: 'jhn',
      chapters: {
        '1': [{ verse: 1, text: `chapter one ${marker1}` }],
        '2': [{ verse: 1, text: `chapter two ${marker2}` }],
      },
    }),
    { status: 200 },
  );
}

let bibleRequests: Deferred<Response>[];

beforeEach(() => {
  routeRef.params = { book: 'jhn', chapter: '1' };
  bibleRequests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/bible/')) {
        const d = deferred<Response>();
        bibleRequests.push(d);
        return d.promise;
      }
      // Commentary, original-language and annotation files are not what this leg is about;
      // 404 sends the real code down its own "no data" branches.
      return Promise.resolve(new Response('', { status: 404 }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('B4 — rapid chapter navigation never shows the stale chapter', () => {
  it('renders the SECOND chapter when its fetch resolves first and the first resolves last', async () => {
    routeRef.params = { book: 'jhn', chapter: '1' };
    const { rerender } = render(<ReaderPage />);
    // The chapter-1 fetch is in flight.
    await waitFor(() => expect(bibleRequests.length).toBe(1));

    // Next chapter before it lands: a second fetch for the same book file starts.
    routeRef.params = { book: 'jhn', chapter: '2' };
    rerender(<ReaderPage />);
    await waitFor(() => expect(bibleRequests.length).toBe(2));

    // The SECOND fetch resolves first — John 2 renders.
    await act(async () => {
      bibleRequests[1]!.resolve(bookFile('STALE-ONE', 'FRESH-TWO'));
    });
    expect(await screen.findByText(/chapter two FRESH-TWO/)).toBeTruthy();

    // The FIRST fetch resolves last. The stale chapter must NOT overwrite what is on screen:
    // the reader is on John 2, so John 1's text appearing here is the bug itself.
    await act(async () => {
      bibleRequests[0]!.resolve(bookFile('STALE-ONE', 'FRESH-TWO'));
    });
    expect(screen.queryByText(/chapter one STALE-ONE/)).toBeNull();
    expect(screen.getByText(/chapter two FRESH-TWO/)).toBeTruthy();
  });
});
