// @vitest-environment jsdom
//
// B4-original word-study (#118) — THE WORD-STUDY PANEL HAS NO CHAPTER-IDENTIFICATION TELL, so a
// stale original-language fetch corrupts it silently. Same race as reader-stale-original-
// fetch.test.tsx and reader-stale-chapter-fetch.test.tsx, but this surface is the worse one
// because the panel's OWN header uses the FRESH URL `chapterNum`, never `original.chapter`.
//
// The flow: interlinear OFF (the default) does not stop the original-language effect — its
// deps are `[book, fetchSlug, chapterNum]`, not `interlinear` — so `original` is fetched for
// every fetchable chapter and the race corrupts it in the background. The reader then taps a
// verse handle on the FRESH chapter-N VerseDisplay (English `data` is B4-guarded), opening
// the study panel. The panel header is `reference={`${book.name} ${chapterNum}:${study.verse}`}`
// (page.tsx) — `chapterNum` is the FRESH URL chapter — and the Word-study tab renders
// `original.verses[String(study.verse)]`. On the losing order the header reads "John 2:1"
// while the words are chapter 1's, and the panel NEVER names chapter 1: no error, no loading
// signal, and no chapter-identification tell.
//
// This test reproduces the ordering where the stale chapter-1 fetch has already settled BEFORE
// the panel opens — the reader sees the wrong words from the moment the tab appears. (The race
// also admits a flip: panel open on fresh words, then the stale fetch settles and the rows
// visibly flip — still under the same stable "John 2:1" header. Both orderings need the guard.)
//
// The fix mirrors the chapter fetch's `cancelled` flag (and word-study's lexicon load).
//
// RED-PROOF: against the unfixed effect (no cleanup return), the last leg below goes RED — the
// Word-study tab renders `<span>gloss-ch1</span>` under a "John 2:1" header
// (`expected <span>gloss-ch1</span> to be null`).
//
// The race is driven by hand: each chapter is its own `/original/<slug>/<n>.json` file, so the
// stub hands out one deferred per request and the test resolves them in the losing order —
// fresh (chapter 2) first, stale (chapter 1) last — so the stale fetch has settled before the
// verse handle is tapped.

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

describe('reader original-language stale fetch — word-study panel (no tell)', () => {
  it('serves the stale chapter words under a fresh-chapter study-panel header', async () => {
    // Interlinear stays OFF (the default): the original-language effect fires anyway, which is
    // the silent-corruption precondition. The reader never knows `original` is being fetched.
    routeRef.params = { book: 'jhn', chapter: '1' };
    const { rerender } = render(<ReaderPage />);
    await waitFor(() => {
      expect(bibleRequests.length).toBe(1);
      expect(originalRequests.length).toBe(1);
    });

    // Rapid navigation: jhn/1 -> jhn/2 before anything resolves.
    routeRef.params = { book: 'jhn', chapter: '2' };
    rerender(<ReaderPage />);
    await waitFor(() => {
      expect(bibleRequests.length).toBe(2);
      expect(originalRequests.length).toBe(2);
    });

    // LOSING ORDER — fresh (chapter 2) first, stale (chapter 1) LAST. Resolving the stale
    // original LAST settles the corruption BEFORE the panel opens: `original` now holds
    // chapter 1's words while the URL/header/English `data` all say chapter 2. The chapter-1
    // data fetch's setData is the B4 sibling's concern — its own cancelled flag ignores it.
    await act(async () => { bibleRequests[1]!.resolve(bookFile()); });
    await act(async () => { originalRequests[1]!.resolve(originalFile(2)); });
    await act(async () => { bibleRequests[0]!.resolve(bookFile()); });
    await act(async () => { originalRequests[0]!.resolve(originalFile(1)); });

    // The fresh chapter-2 English VerseDisplay must be on screen (B4-guarded `data`). The verse
    // handle is the reader's standard gesture into the study panel, and it is fresh — so the
    // reader has no cue anything is wrong until the wrong words appear under a matching header.
    const verse1Handle = await screen.findByRole('button', { name: 'Verse 1, read commentary' });
    fireEvent.click(verse1Handle);

    // Open the Word-study tab. Its rows come from `original.verses[String(study.verse)]`
    // (page.tsx), so a stale `original` serves the previous chapter's words.
    fireEvent.click(screen.getByRole('tab', { name: 'Word study' }));

    // The panel header — the one element a reader looking at the panel reads — uses the FRESH
    // URL `chapterNum`, so it says "John 2:1" in BOTH the fixed and unfixed cases. That is the
    // "no tell": the header matches the chapter the reader thinks they are on.
    expect(screen.getByText(/John 2:1/)).toBeTruthy();

    // The Word-study rows must describe the chapter on screen. With the fix, the fresh
    // chapter 2 gloss renders; without it, the stale chapter 1 gloss renders under the same
    // "John 2:1" header and the panel never names chapter 1.
    expect(
      screen.queryByText('gloss-ch1'),
      'stale chapter 1 words served under the fresh-chapter Word-study header',
    ).toBeNull();
    expect(screen.getByText('gloss-ch2')).toBeTruthy();
  });
});
