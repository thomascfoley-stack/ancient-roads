// @vitest-environment jsdom
//
// CROSS-WORK, PARAM-ONLY NAVIGATION MUST RE-RESOLVE THE LANDING.
//
// The /work/[slug] layout STAYS MOUNTED across /work/a -> /work/b (history-context-bar.tsx
// documents this, and there is no `key={slug}` or template.tsx to force a remount). WorkPage
// resolved `landing` — which decides where the reader opens a work — exactly once, in a
// `useState` initializer, and the only reactive re-resolve (`honourHash`) early-returns when
// the URL carries no `#s{ordinal}`. So a same-route, param-only soft navigation (no hash) left
// `landing.ordinal` frozen at the OLD work's value, which was passed straight through to
// WorkReader as `initialOrdinal`, opening the new work at the wrong section (or blank) and
// never reading the new work's own saved resume position.
//
// No in-app link currently triggers this (every plain /work/<slug> link lives on a different
// route, so it remounts). It is a latent contract break — the page's "On load a saved position
// restores automatically" silently fails the moment a plain cross-work link is added to the
// reader subtree. This test seeds saved positions for two works, mounts the real WorkPage on
// `foo-work`, then re-renders with `slug = bar-work` (no hash — a same-route param-only soft
// navigation) and demands the reader receive `bar-work`'s OWN saved ordinal, not `foo-work`'s
// stale one. The mutable-`useParams` + `rerender` pattern follows reader-stale-chapter-fetch.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeRef = vi.hoisted(() => ({
  slug: 'foo-work' as string,
  pathname: '/work/foo-work' as string,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: routeRef.slug }),
  usePathname: () => routeRef.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let signedIn = false;
vi.mock('@/lib/auth/use-signed-in', () => ({ useSignedIn: () => signedIn }));

// Capture the props WorkPage hands WorkReader. `initialOrdinal` is the contract under test: it
// is `landing.ordinal` passed straight through, and it drives the new work's first section
// fetch (`pageAfterContaining(initialOrdinal)`). `slug` confirms the reader subtree re-pointed.
const readerProps: { slug: string; initialOrdinal: number | null }[] = [];
vi.mock('@/components/work-reader', () => ({
  WorkReader: (props: { slug: string; initialOrdinal: number | null }) => {
    readerProps.push({ slug: props.slug, initialOrdinal: props.initialOrdinal });
    return null;
  },
}));
vi.mock('@/components/work-toc', () => ({ WorkToc: () => null }));

import WorkPage from '@/app/work/[slug]/page';

const TOC = [
  {
    unitOrdinal: 1,
    firstId: 1,
    firstOrdinal: 1,
    lastOrdinal: 100,
    sectionCount: 100,
    heading: 'One',
    verseStart: null,
    verseEnd: null,
  },
];

function workJson(slug: string): string {
  return JSON.stringify({
    source: {
      slug,
      title: slug,
      author: 'A',
      tradition: 't',
      era: 'e',
      license: 'Public Domain',
      source_type: 'book',
    },
    toc: TOC,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  routeRef.slug = 'foo-work';
  routeRef.pathname = '/work/foo-work';
  signedIn = false;
  readerProps.length = 0;
  window.localStorage.clear();
  // foo-work left off at section 50; bar-work left off at section 1.
  window.localStorage.setItem(
    'work-progress:foo-work',
    JSON.stringify({ slug: 'foo-work', ordinal: 50, scrollPct: 0, savedAt: 0 }),
  );
  window.localStorage.setItem(
    'work-progress:bar-work',
    JSON.stringify({ slug: 'bar-work', ordinal: 1, scrollPct: 0, savedAt: 0 }),
  );
  window.history.replaceState(null, '', '/');
  fetchMock = vi.fn(async (url: string) => {
    if (/\/api\/work\/[^/]+\/sections/.test(String(url)))
      return new Response(JSON.stringify([]), { status: 200 });
    if (/\/api\/work\/[^/]+\/progress/.test(String(url)))
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    const m = String(url).match(/\/api\/work\/([^/]+)$/);
    return new Response(workJson(m ? m[1] : 'foo-work'), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('cross-work navigation resume', () => {
  it('opens the new work at its OWN saved position, not the old work stale ordinal', async () => {
    const { rerender } = render(<WorkPage />);

    // foo-work mounts and restores at its saved section 50.
    await waitFor(() => {
      expect(readerProps.at(-1)?.slug).toBe('foo-work');
      expect(readerProps.at(-1)?.initialOrdinal).toBe(50);
    });

    // Same-route param-only soft navigation (no hash): mutate params and re-render, exactly as
    // Next.js does when the [slug] segment alone changes (no remount).
    routeRef.slug = 'bar-work';
    routeRef.pathname = '/work/bar-work';
    await act(async () => {
      rerender(<WorkPage />);
    });

    // Wait for the new work's fetch to resolve and WorkReader to re-render for bar-work.
    await waitFor(() => {
      expect(readerProps.at(-1)?.slug).toBe('bar-work');
    });

    // bar-work restores at its OWN saved section 1 — NOT foo-work's stale ordinal 50.
    expect(readerProps.at(-1)?.initialOrdinal).toBe(1);
  });

  it('opens the new work at the start when it has no saved position', async () => {
    // Clear bar-work's saved position: a first-time reader opens at the beginning (null ordinal).
    window.localStorage.removeItem('work-progress:bar-work');

    const { rerender } = render(<WorkPage />);
    await waitFor(() => {
      expect(readerProps.at(-1)?.slug).toBe('foo-work');
    });

    routeRef.slug = 'bar-work';
    routeRef.pathname = '/work/bar-work';
    await act(async () => {
      rerender(<WorkPage />);
    });

    await waitFor(() => {
      expect(readerProps.at(-1)?.slug).toBe('bar-work');
    });

    // No saved position → null ordinal → the work's first page (after=0).
    expect(readerProps.at(-1)?.initialOrdinal).toBe(null);
  });

  it('does not regress the deep-link path: a #s{ordinal} cross-work nav honours the hash', async () => {
    const { rerender } = render(<WorkPage />);
    await waitFor(() => {
      expect(readerProps.at(-1)?.slug).toBe('foo-work');
    });

    routeRef.slug = 'bar-work';
    routeRef.pathname = '/work/bar-work';
    // A cross-work DEEP link carries the hash: honourHash must still win over the saved position.
    window.history.replaceState(null, '', '#s77');
    await act(async () => {
      rerender(<WorkPage />);
    });

    await waitFor(() => {
      expect(readerProps.at(-1)?.slug).toBe('bar-work');
    });

    // The deep link (77) wins over bar-work's saved position (1).
    expect(readerProps.at(-1)?.initialOrdinal).toBe(77);
  });
});
