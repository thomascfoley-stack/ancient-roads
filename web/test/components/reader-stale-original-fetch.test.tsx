// @vitest-environment jsdom
//
// B4-original (#118) — THE READER'S ORIGINAL-LANGUAGE FETCH HAD NO CLEANUP, so a slow STALE
// chapter's Greek/Hebrew words overwrote the fresh chapter's on the interlinear surface. Same
// race class as reader-stale-chapter-fetch.test.tsx, one effect down: `original` is one
// un-keyed useState slot, the original-language effect had no `cancelled` flag, and each
// chapter is its own static JSON file (`/original/jhn/1.json`, `/original/jhn/2.json`) so
// nothing dedupes two in-flight fetches during rapid navigation. When the stale chapter's file
// resolves LAST, its bare `.then(setOriginal)` wins and overwrites the chapter on screen.
//
// This surface is the interlinear view (opt-in). Interlinear renders `original` directly
// (interlinear.tsx): each word's gloss plus a `{bookName} {data.chapter}` heading. On the
// losing order, chapter N-1's words render under chapter N — a heading-number tell exists at
// the top of the view ("John 1" while the URL/header/nav say John 2), but the wrong words
// themselves carry no error or loading signal.
//
// The fix mirrors the chapter fetch's `cancelled` flag (and word-study's lexicon load).
//
// RED-PROOF: against the unfixed effect (no cleanup return), the last leg below goes RED — the
// stale chapter's gloss renders (`expected <span>gloss-ch1</span> to be null`).
//
// The race is driven by hand, not by timers: both original fetches are distinct per-chapter
// files, so the stub hands out one deferred per request and the test resolves them in the
// losing order — fresh (chapter 2) first, stale (chapter 1) last.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** Per-book file the chapter fetch reads. Contains both chapters' English verses; a fresh
 *  Response per call because a Response body can be consumed only once. */
function bookFile(): Response {
  return new Response(
    JSON.stringify({
      translation: 'web',
      book: 43,
      slug: 'jhn',
      chapters: {
        '1': [{ verse: 1, text: 'chapter one' }],
        '2': [{ verse: 1, text: 'chapter two' }],
      },
    }),
    { status: 200 },
  );
}

/** Per-chapter original-language file. The gloss is a per-chapter marker so the rendered text
 *  names the response that won. A fresh Response per call (body is single-use). */
function originalFile(chapter: number): Response {
  return new Response(
    JSON.stringify({
      book: 43,
      chapter,
      lang: 'greek',
      verses: {
        '1': [
          {
            w: `word-ch${chapter}`,
            l: `lemma-ch${chapter}`,
            tr: `translit-ch${chapter}`,
            s: 'G3056',
            m: 'N- ----NSM-',
            g: `gloss-ch${chapter}`,
          },
        ],
      },
    }),
    { status: 200 },
  );
}

let bibleRequests: Deferred<Response>[];
let originalRequests: Deferred<Response>[];

beforeEach(() => {
  routeRef.params = { book: 'jhn', chapter: '1' };
  bibleRequests = [];
  originalRequests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/bible/')) {
        const d = deferred<Response>();
        bibleRequests.push(d);
        return d.promise;
      }
      if (url.includes('/original/')) {
        const d = deferred<Response>();
        originalRequests.push(d);
        return d.promise;
      }
      // Commentary, lexicon, concordance and annotation files are not what this leg is about;
      // 404 sends the real code down its own no-data/empty branches.
      return Promise.resolve(new Response('', { status: 404 }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('reader original-language stale fetch', () => {
  it('does not overwrite the fresh chapter original with a stale one (interlinear surface)', async () => {
    routeRef.params = { book: 'jhn', chapter: '1' };
    const { rerender } = render(<ReaderPage />);
    // Both the chapter fetch (after hydration) and the original-language fetch fire for jhn/1.
    await waitFor(() => {
      expect(bibleRequests.length).toBe(1);
      expect(originalRequests.length).toBe(1);
    });

    // Turn the interlinear view ON (opt-in). Toggling it does not refire the original effect
    // (`interlinear` is not in its deps), so no new original fetch starts here.
    fireEvent.click(screen.getByRole('button', { name: 'Greek and Hebrew interlinear' }));

    // Rapid navigation: jhn/1 -> jhn/2 before anything resolves. Both effects refire on the
    // chapter change, so a SECOND original fetch (chapter 2) is now in flight alongside the
    // still-pending chapter 1 fetch.
    routeRef.params = { book: 'jhn', chapter: '2' };
    rerender(<ReaderPage />);
    await waitFor(() => {
      expect(bibleRequests.length).toBe(2);
      expect(originalRequests.length).toBe(2);
    });

    // LOSING ORDER — the whole test. Resolve the FRESH (chapter 2) responses first so the
    // reader is on John 2, then resolve the STALE (chapter 1) responses LAST. Without the
    // cancelled guard, the stale original's `.then(setOriginal)` runs last and overwrites
    // `original` with chapter 1's words. (The chapter-1 data fetch's setData is the B4
    // sibling's concern — its own cancelled flag ignores it; data stays chapter 2.)
    await act(async () => { bibleRequests[1]!.resolve(bookFile()); });
    await act(async () => { originalRequests[1]!.resolve(originalFile(2)); });
    await act(async () => { bibleRequests[0]!.resolve(bookFile()); });
    await act(async () => { originalRequests[0]!.resolve(originalFile(1)); });

    // The interlinear view renders `original` (page.tsx `interlinear ? original ? <Interlinear
    // data={original} .../>`). The fresh chapter 2 gloss must be on screen, and the stale
    // chapter 1 gloss must not have overwritten it.
    expect(
      screen.queryByText('gloss-ch1'),
      'stale chapter 1 gloss overwrote the fresh chapter on the interlinear surface',
    ).toBeNull();
    expect(screen.getByText('gloss-ch2')).toBeTruthy();

    // The interlinear heading (`{bookName} {data.chapter}` in interlinear.tsx) is the one tell
    // this surface carries. With the fix it reads the fresh chapter; unfixed it reads "John 1"
    // while the URL/header/nav say John 2.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/John 2/);
  });
});
