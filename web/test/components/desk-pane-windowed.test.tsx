// @vitest-environment jsdom
//
// UX-3 — THE DESK PANE'S DOM IS BOUNDED AT SPURGEON SCALE.
//
// THE DEFECT. `WorkPaneView` used to APPEND every fetched keyset page to `sections` and render
// all of them: a reader who kept scrolling `spurgeon-sermons` (118,371 sections — MASTER.md
// UX-3's standing caveat: "an uncapped grid over spurgeon-sermons is a virtualisation problem
// before it is a layout one") mounted every section they had ever passed. Lifting the 3-pane
// cap to a 4x4 grid multiplies that by the pane count. This file pins the fix's contract:
//
//   * mounted `article[id^="s"]` count NEVER exceeds the render window
//     (WINDOW_BEHIND 8 + WINDOW_AHEAD 16 = 24), no matter how many pages have streamed in;
//   * the stream still reaches the end of the work (windowing is a render bound, not a read
//     bound — "the book is the whole book" stands);
//   * content that has been read and scrolled past is UNMOUNTED (section 1 is gone by the end).
//
// HOW IT IS DRIVEN. jsdom has no layout: every rect is zero, which is exactly the reader's
// documented "scrollbar drag went past the window" case, so the pane's chase loop walks the
// window to the tail and prefetches until the work is exhausted — no synthetic scroll events
// needed. (The proximity/scroll path with controlled rects is pinned in
// desk-pane-continuous-read.test.tsx; this file pins the BOUND.)
//
// RED-PROOF (THE_LOOP rule 4): this test was watched RED against the pre-UX-3 pane, which
// mounted all 250 fixture sections (transcript:
// docs/evidence/swarm-2026-08-22/w-ux3/RED-desk-pane-windowed.md), and again with the window
// slice seeded out of the new renderer (RED-PROOF-window-bypassed.md).

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }));

import { DeskPane } from '@/components/desk-pane';

const SLUG = 'spurgeon-sermons';
const META = {
  source: { slug: SLUG, title: 'Sermons on the Psalms', author: 'Charles Spurgeon', tradition: 'Baptist', source_type: 'sermon' },
  toc: [],
};

// 250 sections in 25-section pages: ten times the render window, small next to the real
// 118,371 and large enough that an unbounded renderer fails by an order of magnitude.
const TOTAL = 250;
const PAGE = 25;
const PAGES = TOTAL / PAGE;

const sectionCalls: string[] = [];

beforeEach(() => {
  sectionCalls.length = 0;
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/sections')) {
      sectionCalls.push(url);
      const after = Number(new URL(url, 'http://x').searchParams.get('after'));
      const from = after + 1;
      const sections = Array.from({ length: Math.min(PAGE, TOTAL - after) }, (_, i) => ({
        id: from + i, ordinal: from + i, heading: `Section ${from + i}`, body: `Body of section ${from + i}.`,
      }));
      const nextAfter = after + PAGE < TOTAL ? after + PAGE : null;
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ sections, nextAfter }) } as unknown as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => META } as unknown as Response);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a desk work pane at 250-section scale', () => {
  it('mounts at most one render window of sections, however many pages stream in', async () => {
    const { container } = render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    // The whole work streams in (jsdom's zero rects take the pane's documented chase path:
    // the window walks to the tail, prefetching, until nextAfter is null).
    await waitFor(() => expect(sectionCalls.length).toBe(PAGES), { timeout: 15_000 });
    // And it settles — the chase must stop at the end of the work, not loop.
    await waitFor(() => expect(screen.getByText('Body of section 250.')).toBeTruthy());

    const mounted = container.querySelectorAll('article[id^="s"]');
    // THE bound (verdict condition 5): WINDOW_BEHIND 8 + WINDOW_AHEAD 16 = 24, exact.
    expect(mounted.length).toBeLessThanOrEqual(24);
    expect(mounted.length).toBeGreaterThan(0); // a bound of zero would pass the line above vacuously

    // The tail is mounted, the long-scrolled-past head is NOT — the window actually moved.
    expect(container.querySelector('article[id="s250"]')).toBeTruthy();
    expect(container.querySelector('article[id="s1"]')).toBeNull();
    expect(screen.queryByText('Body of section 1.')).toBeNull();
  }, 20_000);
});
