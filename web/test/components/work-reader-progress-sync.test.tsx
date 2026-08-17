// @vitest-environment jsdom
//
// N1 — THE READER ACTUALLY CALLS THE ROUTE.
//
// This is the test that would have caught the original defect, and the other two would not.
// `saveReadingProgress` was always correct; `reading_progress` had a table, an RLS policy and a
// passing invariant suite. Every one of those checks was green for the entire life of the bug,
// because the missing thing was a CALLER. A round-trip test that drives the route directly (see
// `test/invariants/reading-progress-round-trip.test.ts`) proves the server half and would ALSO
// have stayed green with nothing on the client calling it.
//
// So this asserts the join: mount the real reader page, report a position the way the reader
// component does, and demand that a request actually leaves for the progress endpoint with the
// right body. The two mocks are the reader's DATA SOURCES (the work fetch, the session), never
// the thing under test — the page's own effects, refs and throttle all run for real.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'qa-sync-work';

// The session, flipped per-case. Signed-out readers must never call the route at all.
let signedIn = true;
vi.mock('@/lib/auth/use-signed-in', () => ({ useSignedIn: () => signedIn }));
vi.mock('next/navigation', () => ({ useParams: () => ({ slug: SLUG }) }));

// The reader component is DOM-and-scroll machinery (IntersectionObserver, rAF, a live scroller)
// that jsdom cannot drive meaningfully. Standing in for it with something that reports a position
// on demand keeps this test about the wiring under test — the page's sync policy — rather than
// about whether jsdom can simulate a scroll. `onProgress` is captured and called directly, which
// is exactly what the real component does from `updateActive`.
let report: ((ordinal: number, scrollPct: number) => void) | null = null;
vi.mock('@/components/work-reader', () => ({
  WorkReader: (props: { onProgress: (o: number, p: number) => void }) => {
    report = props.onProgress;
    return null;
  },
}));
vi.mock('@/components/work-toc', () => ({ WorkToc: () => null }));

import WorkPage from '@/app/work/[slug]/page';

const TOC = [{ unitOrdinal: 1, firstId: 1, firstOrdinal: 1, lastOrdinal: 100, sectionCount: 100, heading: 'One', verseStart: null, verseEnd: null }];
const WORK = { source: { slug: SLUG, title: 'A work', author: 'QA', tradition: 'qa', era: 'qa', license: 'Public Domain', source_type: 'sermon' }, toc: TOC };

/** Every progress POST that has left the page, in order. */
function progressCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/progress'))
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  signedIn = true;
  report = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes('/progress')
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify(WORK), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/** Mount the page and wait until the work has loaded and the reader is reporting. */
async function mountReader() {
  const view = render(<WorkPage />);
  await waitFor(() => expect(report).not.toBeNull());
  return view;
}

describe('N1 — the Book Reader syncs a signed-in reader’s position to their account', () => {
  it('posts the position to the progress route', async () => {
    await mountReader();
    await act(async () => report!(10, 0.5));

    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));
    const [call] = progressCalls(fetchMock);
    expect(call!.url).toBe(`/api/work/${SLUG}/progress`);
    expect(call!.body.ordinal).toBe(10);
    // 10th of 100 sections, half way through it → (10 - 1 + 0.5) / 100.
    expect(call!.body.percent).toBeCloseTo(0.095, 5);
  });

  it('does not post for a signed-out reader', async () => {
    signedIn = false;
    await mountReader();
    await act(async () => report!(10, 0.5));

    // Give any stray async write a chance to land before asserting its absence.
    await act(async () => {
      await Promise.resolve();
    });
    expect(progressCalls(fetchMock)).toHaveLength(0);
  });

  // THE THROTTLE, exercised through the page rather than through the pure helper: a fast scroll
  // must not become a write per section.
  it('collapses a burst of sections into a single write', async () => {
    await mountReader();
    for (let ordinal = 2; ordinal <= 40; ordinal++) {
      await act(async () => report!(ordinal, 0));
    }
    await waitFor(() => expect(progressCalls(fetchMock).length).toBeGreaterThan(0));
    expect(progressCalls(fetchMock)).toHaveLength(1);
  });

  it('writes again once the floor has elapsed', async () => {
    await mountReader();
    await act(async () => report!(2, 0));
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));

    await act(async () => {
      vi.advanceTimersByTime(31_000);
      report!(20, 0);
    });
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(2));
    expect(progressCalls(fetchMock)[1]!.body.ordinal).toBe(20);
  });

  // Leaving the reader is the position most worth keeping, and it must not wait on the floor.
  it('flushes the final position when the reader leaves the page', async () => {
    const view = await mountReader();
    await act(async () => report!(2, 0));
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));

    await act(async () => report!(37, 0.25)); // inside the floor — held
    expect(progressCalls(fetchMock)).toHaveLength(1);

    await act(async () => {
      view.unmount();
    });
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(2));
    expect(progressCalls(fetchMock)[1]!.body.ordinal).toBe(37);
  });

  it('a failed sync never surfaces to the reader', async () => {
    // The route is down. The page must not throw, and must keep rendering.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/progress')
        ? Promise.reject(new Error('network down'))
        : new Response(JSON.stringify(WORK), { status: 200 }),
    );
    await mountReader();
    await act(async () => report!(10, 0.5));
    await act(async () => {
      await Promise.resolve();
    });
    expect(progressCalls(fetchMock)).toHaveLength(1);
  });
});
