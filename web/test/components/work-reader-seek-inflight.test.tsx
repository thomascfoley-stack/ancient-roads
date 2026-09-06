// @vitest-environment jsdom
//
// THE DROP. `WorkReader` reacts to external "seek" requests (the Work page's TOC drawer, the
// gold Continue chip, client-side hash navigation) — each carries an `ordinal`, a `scrollPct`
// and a `nonce`. The seek effect stamps `handledSeek.current = seek.nonce` BEFORE it dispatches
// `loadInitial(seek.ordinal)`, and `useWorkSectionPages.loadInitial` returned `null` on an
// in-flight collision — indistinguishable from "ran and returned nothing". So a seek landing
// while a prefetch `loadNext` was in flight was SILENTLY DROPPED: the nonce was consumed, no
// fetch issued for the target page, and the seek effect's later re-runs (on the next `sections`
// change) exited on the stamped nonce. The Continue chip vanishes on its own click (`page.tsx`
// calls `setContinueTarget(null)` in the same handler as `setSeek`), so a dropped Continue seek
// had no re-click — an unrecoverable silent failure.
//
// WHAT IS MOCKED AND WHY. The single data source under test is the section fetch — a keyset
// server that serves `?after=A&limit=50` as the 50 ordinals above A. The reader's selection
// engine (`useTextAnnotation`) is stubbed to `pending: null` (jsdom cannot drive a selection),
// and `next/navigation`/`auth` are stubbed because the reader imports them at module top. The
// hook under test (`useWorkSectionPages`) is the REAL hook — the bug lives in its in-flight
// guard, so mocking the hook away would mock away the bug.
//
// THE TWO CASES: a control (no prefetch → the unobstructed happy path fetches the seek page)
// and a regression that opens a prefetch `loadNext` (jsdom's all-zero rects take the reader's
// documented chase branch, which fires `loadNext` on mount), holds it in flight, seeks to an
// unloaded ordinal, and demands the seek's `after={ordinal-1}` fetch still leaves the reader
// once that prefetch settles.
//
// RED-PROOF: the regression asserts `fetchCalls` includes the seek page (`'499'` for a seek to
// ordinal 500) AND that it arrives strictly AFTER the held prefetch (`'50'`) — the queue-after-
// settle signature. Against the pre-fix hook the seek's `loadInitial(500)` short-circuits on
// `inflight.current`, `fetchCalls` stays `['0','50']`, and the assertion goes RED.

import { cleanup, render, waitFor, type RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingAnnotation } from '@/lib/use-text-annotation';
import type { WorkSectionRow, WorkSource } from '@/lib/work';

// The selection engine is jsdom-undriveable; standing in for it keeps the test about the seek
// dispatch (the `loadInitial` call), not about a selection. Read at render time, never factory
// time — same TDZ note as `work-reader-add-to-study.test.tsx`.
let mockPending: PendingAnnotation | null = null;
vi.mock('@/lib/use-text-annotation', () => ({
  useTextAnnotation: () => ({ pending: mockPending, dismiss: () => {} }),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { WorkReader, type WorkReaderSeek } from '@/components/work-reader';
import { WORK_READER_PAGE_LIMIT } from '@/lib/work-reader';

const SLUG = 'qa-seek-inflight';
const SOURCE: WorkSource = {
  slug: SLUG,
  title: 'Institutes of the Christian Religion',
  author: 'John Calvin',
  tradition: 'Reformed',
  era: '16c',
  license: 'Public Domain',
  source_type: 'commentary',
};
const LIMIT = WORK_READER_PAGE_LIMIT; // 50 — matches the hook's page size.
const TOTAL = 1000; // a 1000-section work: ordinals 1..1000, paged keyset 50 at a time.

/** Every `/sections` call's `after` value, in dispatch order. */
const fetchCalls: string[] = [];
/** `true` → every page is the LAST page (`nextAfter: null`): `hasNext` never flips on, so no
 *  scroll-driven prefetch can open. Used by the CONTROL to isolate the unobstructed happy path. */
let singlePage = false;
/** When set, the first `after=50` fetch (the prefetch) is held in flight until `resolve()` is
 *  called — reproducing a real `GET /sections` round trip during which a seek arrives. */
let prefetchDeferred: { p: Promise<void>; resolve: () => void } | null = null;

function makeSections(from: number, count: number): WorkSectionRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: from + i,
    ordinal: from + i,
    unitOrdinal: 1,
    heading: `Section ${from + i}`,
    verseStart: null,
    verseEnd: null,
    body: `Body of section ${from + i}.`,
  }));
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** A one-shot latch: `await p` blocks until `resolve()` is called. */
function deferred(): { p: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const p = new Promise<void>((r) => {
    resolve = r;
  });
  return { p, resolve };
}

beforeEach(() => {
  fetchCalls.length = 0;
  singlePage = false;
  prefetchDeferred = null;
  mockPending = null;
  // jsdom's all-zero rects are the reader's documented "scrollbar drag went past the window"
  // case: `updateActive` anchors on the last rendered section (`chasing = true`) and fires
  // `loadNext` on mount — which is exactly the inflight the regression case needs. No rect spy
  // is required; the default zeros open the chase branch that opens the prefetch.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/sections')) {
        const after = Number(new URL(url, 'http://x').searchParams.get('after'));
        fetchCalls.push(String(after));
        if (after === 0) {
          return jsonResponse({ sections: makeSections(1, LIMIT), nextAfter: singlePage ? null : LIMIT });
        }
        if (after === 50 && prefetchDeferred) {
          // The prefetch: hold it in flight until the test releases it, then hand back page 2.
          await prefetchDeferred.p;
          return jsonResponse({ sections: makeSections(51, LIMIT), nextAfter: singlePage ? null : 100 });
        }
        const from = after + 1;
        const count = Math.min(LIMIT, Math.max(0, TOTAL - after));
        const nextAfter = singlePage ? null : count === LIMIT ? from + count - 1 : null;
        return jsonResponse({ sections: makeSections(from, count), nextAfter });
      }
      // /api/work/{slug}/shelf (SaveToShelf) and any other route — kept out of the way.
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderReader(seek: WorkReaderSeek | null): RenderResult {
  return render(
    <WorkReader
      slug={SLUG}
      source={SOURCE}
      initialOrdinal={null}
      initialScrollPct={0}
      seek={seek}
      signedIn={false}
      onOpenToc={() => {}}
      onProgress={() => {}}
    />,
  );
}

const seekTo = (ordinal: number, nonce: number): WorkReaderSeek => ({ ordinal, scrollPct: 0, nonce });

/** Wait for the initial page to land so a seek doesn't hit the empty-list early-return. */
async function waitForInitialPage() {
  await waitFor(() => expect(fetchCalls).toContain('0'));
  await waitFor(() => expect(document.querySelector('section[id^="s"]')).not.toBeNull());
}

describe('WorkReader — a seek arriving mid-prefetch is not dropped', () => {
  it('CONTROL: a seek to an unloaded ordinal dispatches its page fetch when no prefetch is open', async () => {
    // No `prefetchDeferred`, `singlePage` on → `hasNext` never flips on, so no `loadNext` can open.
    // The seek's `loadInitial(500)` runs unobstructed and fetches the page containing 500.
    singlePage = true;
    const { rerender } = renderReader(null);
    await waitForInitialPage();

    rerender(
      <WorkReader
        slug={SLUG}
        source={SOURCE}
        initialOrdinal={null}
        initialScrollPct={0}
        seek={seekTo(500, 1)}
        signedIn={false}
        onOpenToc={() => {}}
        onProgress={() => {}}
      />,
    );

    await waitFor(() => expect(fetchCalls).toContain('499'));
    // No prefetch ever opened (the happy path is unobstructed), so '50' is absent and the seek
    // page is the only fetch beyond the mount.
    expect(fetchCalls).not.toContain('50');
    expect(fetchCalls).toEqual(['0', '499']);
  });

  it('REGRESSION (chase-held inflight): a seek while the chase-opened prefetch is in flight still fetches its page', async () => {
    // jsdom's all-zero rects put every rendered section above the reader's line, which is the
    // reader's documented "scrollbar drag went past the window" case: `updateActive` anchors on
    // the last rendered section (`chasing = true`) and fires `loadNext` on mount. That opens the
    // in-flight guard against the seek. This isolates the hook's guard as the leaky primitive
    // regardless of HOW the inflight was opened (the chase is just the jsdom-cheapest opener).
    prefetchDeferred = deferred();
    const { rerender } = renderReader(null);
    await waitForInitialPage();
    await waitFor(() => expect(fetchCalls).toContain('50')); // the chase opened the prefetch

    rerender(
      <WorkReader
        slug={SLUG}
        source={SOURCE}
        initialOrdinal={null}
        initialScrollPct={0}
        seek={seekTo(500, 1)}
        signedIn={false}
        onOpenToc={() => {}}
        onProgress={() => {}}
      />,
    );

    // Release the held prefetch; the queue drains `loadInitial(500)` once it settles.
    prefetchDeferred.resolve();
    await waitFor(() => expect(fetchCalls).toContain('499'));

    // The seek page is dispatched AFTER the held prefetch — the queue-after-settle signature,
    // not a simultaneous fetch. Against the pre-fix hook this stays `['0','50']` and goes RED.
    expect(fetchCalls.indexOf('499')).toBeGreaterThan(fetchCalls.indexOf('50'));
  });
});
