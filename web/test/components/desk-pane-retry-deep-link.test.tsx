// @vitest-environment jsdom
//
// F-158 DEEP-LINK RETRY — a work pane deep-linked to a specific section (`pane.ordinal`) must
// re-request the page CONTAINING that ordinal when the FIRST sections fetch fails and the
// reader clicks "Try again" — not the work's first page. The mount effect already calls
// `loadInitial(pane.ordinal ?? null)` (desk-pane.tsx mount effect); the first-page-error
// "Try again" handler must agree with it. Before the fix the retry called `loadInitial(null)`,
// an in-file inconsistency ~200 lines below the mount effect, which converted the deep-link
// ordinal into `after=0` (the work's first page via pageAfterContaining → 0) and silently
// relocated the reader to the top of the work on a transient-failure-then-retry.
//
// WHAT IS ASSERTED. The deep-link path AND the common (no-ordinal) path, because only the pair
// is a real check:
//   * Deep-linked pane (ordinal: 42) whose first `after=41` fetch fails once: on "Try again"
//     the pane re-requests `after=41` (never `after=0`) and mounts the deep-linked section's
//     body, not the first section's.
//   * A pane with NO deep link whose first `after=0` fetch fails once: on "Try again" the pane
//     still re-requests `after=0` (the fix's `pane.ordinal ?? null` collapses to `null` here)
//     and mounts the first section — the common path is unchanged by the fix.
//
// HOW POSITION IS CONTROLLED. Unmocked jsdom rects are all zeros, which parks the active
// section at the loaded tail and shifts the render window off the deep-linked section. So each
// test anchors `getBoundingClientRect` on the ordinal it must KEEP in view: the deep-link tests
// on ordinal 42, the no-ordinal test on ordinal 1. (Same device as
// desk-pane-continuous-read.test.tsx's `topForOrdinal`.) Section pages return `nextAfter: null`
// so hasNext is false — this test is about the retry, not continuous read, and a false hasNext
// keeps the auto-prefetch branch quiet.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }));

import { DeskPane } from '@/components/desk-pane';

const SLUG = 'spurgeon-sermons';
const ORDINAL = 42; // deep-link target; pageAfterContaining(42) === 41 (lib/work-reader.ts)

const META = {
  source: {
    slug: SLUG,
    title: 'Sermons on the Psalms',
    author: 'Charles Spurgeon',
    tradition: 'Baptist',
    source_type: 'sermon',
  },
  toc: [],
};

/** A page of `count` sections starting at ordinal `from`, with the given nextAfter. */
function page(from: number, count: number, nextAfter: number | null) {
  return {
    sections: Array.from({ length: count }, (_, i) => ({
      id: from + i,
      ordinal: from + i,
      heading: `Section ${from + i}`,
      body: `Body of section ${from + i}.`,
    })),
    nextAfter,
  };
}

/** Every section fetch URL, in order. */
const sectionCalls: string[] = [];
/** Fail the FIRST sections fetch (whatever its `after`) once, then succeed for every later one.
 *  This is the bug's asymmetric precondition: metadata succeeds while the first sections fetch
 *  fails — the only state in which the first-page-error "Try again" branch is reachable. */
let failNext = false;
/** Which ordinal sits at the top of the viewport (so the render window keeps it mounted). */
let anchorOrd = ORDINAL;

beforeEach(() => {
  sectionCalls.length = 0;
  failNext = true;
  anchorOrd = ORDINAL;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const m = /^s(\d+)$/.exec(this.id);
    const top = m ? (Number(m[1]) - anchorOrd) * 200 : 0;
    const height = m ? 180 : 0;
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/sections')) {
      sectionCalls.push(url);
      if (failNext) {
        failNext = false;
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
      }
      const after = Number(new URL(url, 'http://x').searchParams.get('after'));
      // Keyset: the page after `after` starts at ordinal `after + 1`. nextAfter null → hasNext
      // false → the auto-prefetch branch stays quiet.
      return Promise.resolve({ ok: true, status: 200, json: async () => page(after + 1, 25, null) } as unknown as Response);
    }
    // Metadata succeeds immediately — the asymmetric precondition the first-page-error branch
    // needs (loading = !source && !metaError must already be false when the sections fetch fails).
    return Promise.resolve({ ok: true, status: 200, json: async () => META } as unknown as Response);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a deep-linked work pane retrying its failed first sections fetch', () => {
  it('re-requests the deep-link page (after=ORDINAL-1), never the work first page (after=0)', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG, ordinal: ORDINAL }} onClose={() => {}} onReplace={() => {}} />);

    // The initial deep-link fetch (after=41) fails once — failNext is consumed here.
    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy());
    expect(sectionCalls.filter((u) => u.includes(`after=${ORDINAL - 1}`))).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // The retry must re-request the SAME deep-link page — NOT the work's first page (after=0).
    await waitFor(() => {
      expect(sectionCalls.filter((u) => u.includes(`after=${ORDINAL - 1}`)).length).toBeGreaterThanOrEqual(2);
    });
    expect(sectionCalls.some((u) => u.includes('after=0'))).toBe(false);
  });

  it('lands the reader on the deep-linked section, not the work first section', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG, ordinal: ORDINAL }} onClose={() => {}} onReplace={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy());
    // Before retry, the deep-linked section is NOT mounted — its first fetch failed.
    expect(screen.queryByText(`Body of section ${ORDINAL}.`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // User-visible outcome, not just the request URL: the deep-linked section's body is mounted,
    // and the work's first section is NOT.
    await waitFor(() => expect(screen.getByText(`Body of section ${ORDINAL}.`)).toBeTruthy());
    expect(screen.queryByText('Body of section 1.')).toBeNull();
  });
});

describe('a work pane with no deep link retrying its failed first sections fetch', () => {
  it('still retries from the work first page (after=0) — the common path is unchanged by the fix', async () => {
    anchorOrd = 1; // keep section 1 in the render window
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy());
    expect(sectionCalls.filter((u) => u.includes('after=0'))).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // No ordinal → `pane.ordinal ?? null` → null → after=0. The retry must re-request after=0
    // and mount the first section exactly as before the fix.
    await waitFor(() => {
      expect(sectionCalls.filter((u) => u.includes('after=0')).length).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
  });
});
