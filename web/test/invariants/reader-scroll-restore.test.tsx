// @vitest-environment jsdom

// F-144 — THE SCRIPTURE READER RESTORES YOUR SCROLL POSITION WITHIN A CHAPTER.
//
// The scroll container is AppShell's `<main id="main">` — a `flex h-dvh overflow-hidden` wrapper
// means the viewport never moves, only `<main>` does. The first version of this feature targeted
// `window`: `window.scrollY`, `window.scrollTo`, and a bubble-phase `window.addEventListener
// ('scroll', …)`. All three were no-ops on this page: `scroll` does not bubble, so a scroll on
// `<main>` never reached the window listener and nothing was ever saved; `window.scrollY` was
// always 0; and `window.scrollTo` on a non-scrolling viewport moves nothing. The feature had no
// observable effect. (Audit of commit 15c838f6; the fix that retargeted `<main>` landed in 47854bb1.)
//
// WHAT EACH LEG CATCHES IF THE BUG RETURNS, and the SEED that turns it RED:
//   - SAVE: a `scroll` dispatched on `<main>` (the non-bubbling event the real container fires)
//     reaches a listener attached to `<main>` and persists `main.scrollTop`.
//     SEED: `window.scrollY` + a `window` listener -> RED — the scroll never reaches the window
//     listener, so localStorage stays empty.
//   - RESTORE: a saved value moves `<main>.scrollTop`, not the viewport.
//     SEED: `window.scrollTo({ top: saved })` -> RED — `<main>.scrollTop` stays 0.
//   - KEYING: the record is `bible-scroll:<slug>:<chapter>`; a different chapter is untouched.
//   - DEEP LINK: a `#v<n>` hash is an explicit destination and wins over the saved position.
//   - ROBUSTNESS: corrupt or missing storage resumes at the top without throwing.
//
// jsdom lays nothing out, so it cannot prove WHERE a real reader lands — that was checked in a
// browser alongside the fix (scroll to 500, leave, come back, land at 500). What jsdom CAN prove is
// the assumption the buggy commit got wrong: WHICH element the code listens to, reads from, and
// writes to. That is exactly the bug, and it is deterministically assertible here.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── module doubles ──────────────────────────────────────────────────────────────────────────
// A mutable ref because `vi.mock` is hoisted above per-test assignment; the route drives the key.
const routeRef = vi.hoisted(() => ({
  params: { book: 'jhn', chapter: '3' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/read/jhn/3',
  useParams: () => routeRef.params,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
// The reader (via useSignedIn) reads the session; signed-out skips the annotations fetch.
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

import ReaderPage from '@/app/read/[book]/[chapter]/page';

const SCROLL_KEY = 'bible-scroll:jhn:3';

// `fetchChapter` fetches a per-translation/per-book file and reads one chapter out of it.
const JOHN_3_FILE = {
  translation: 'web',
  book: 43,
  slug: 'jhn',
  chapters: {
    '3': [
      { verse: 1, text: 'There was a man of the Pharisees, named Nicodemus.' },
      { verse: 2, text: 'The same came to Jesus by night.' },
      { verse: 16, text: 'For God so loved the world.' },
    ],
  },
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/read/jhn/3');
  routeRef.params = { book: 'jhn', chapter: '3' };
  // jsdom ships no Element.scrollIntoView, and the hash deep-link effect (`page.tsx`) calls it.
  // A no-op stub is the same accommodation the sidebar tests make for ResizeObserver: the
  // observable here is the flash ring and the absent restore, not the scroll arithmetic.
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* jsdom lays nothing out — see the file header. */
  };
  // The chapter file resolves 200; everything else (commentary/original prefetches on a
  // fetchable chapter) 404s, which both helpers degrade to null rather than throw.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/bible/web/jhn.json') {
        return new Response(JSON.stringify(JOHN_3_FILE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Render the reader INSIDE its real scroll container. AppShell puts every page in
// `<main id="main">`; both halves of F-144 address that element by id, so it must exist in the DOM
// for the feature to do anything. Waiting for a verse element confirms the chapter data has
// loaded — the restore effect is gated on `data`.
async function renderReader(): Promise<HTMLElement> {
  render(
    <main id="main">
      <ReaderPage />
    </main>,
  );
  await waitFor(() => expect(document.querySelector('[data-verse="16"]')).not.toBeNull());
  return document.getElementById('main') as HTMLElement;
}

describe('F-144 — saving the scroll position', () => {
  it('persists <main>.scrollTop when <main> scrolls', async () => {
    const main = await renderReader();
    main.scrollTop = 500;
    // `scroll` is a non-bubbling event fired AT the scrolling element. Dispatch it on <main>:
    // the buggy window listener (bubble phase) would never have seen it.
    main.dispatchEvent(new Event('scroll'));
    await waitFor(() =>
      expect(window.localStorage.getItem(SCROLL_KEY)).toBe(JSON.stringify(500)),
    );
  });

  it('reads the live <main>.scrollTop, not a stale window.scrollY of 0', async () => {
    const main = await renderReader();
    main.scrollTop = 320;
    main.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(window.localStorage.getItem(SCROLL_KEY)).toBe(JSON.stringify(320)));
    // SEED: window.scrollY -> RED — the value persisted would be 0, not 320.
  });

  it('keys the record by book and chapter, so a different chapter is untouched', async () => {
    const main = await renderReader();
    main.scrollTop = 500;
    main.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(window.localStorage.getItem(SCROLL_KEY)).toBe(JSON.stringify(500)));
    expect(window.localStorage.getItem('bible-scroll:jhn:4')).toBeNull();
    expect(window.localStorage.getItem('bible-scroll:gen:1')).toBeNull();
  });
});

describe('F-144 — restoring the scroll position', () => {
  it('restores <main>.scrollTop to the saved value when the chapter loads', async () => {
    window.localStorage.setItem(SCROLL_KEY, JSON.stringify(500));
    const main = await renderReader();
    // The restore effect defers ~300ms for layout to settle; waitFor covers that window.
    // SEED: window.scrollTo({ top: saved }) -> RED — <main>.scrollTop stays 0.
    await waitFor(() => expect(main.scrollTop).toBe(500));
  });

  it('a #v<n> deep link wins over the saved position', async () => {
    window.localStorage.setItem(SCROLL_KEY, JSON.stringify(500));
    window.history.replaceState(null, '', '/read/jhn/3#v16');
    const main = await renderReader();
    // The deep link is honoured: the hash effect flashed v16 (scrollIntoView is stubbed to a
    // no-op here — see the file header — so the flash ring is the observable that it ran).
    await waitFor(() =>
      expect(document.querySelector('#v16')?.className ?? '').toContain('ring-2'),
    );
    // Wait past the restore debounce: a removed hash guard would have applied the saved 500 by
    // now. With the guard, the restore effect returned early and `<main>` was not repositioned.
    await new Promise((r) => setTimeout(r, 450));
    expect(main.scrollTop).not.toBe(500);
  });

  it('corrupt storage resumes at the top without throwing', async () => {
    window.localStorage.setItem(SCROLL_KEY, '{not json');
    const main = await renderReader();
    expect(main.scrollTop).toBe(0);
  });

  it('no stored position leaves the reader at the top without throwing', async () => {
    const main = await renderReader();
    expect(main.scrollTop).toBe(0);
  });
});
