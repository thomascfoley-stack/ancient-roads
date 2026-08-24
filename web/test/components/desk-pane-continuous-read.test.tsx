// @vitest-environment jsdom
//
// CONTINUOUS READING ON THE DESK (order 2026-08-20-historians-study-entrance): the ruling is
// "the book is the whole book" — no page-at-a-time. RE-EXPRESSED for the UX-3 windowed pane
// (verdict condition 1): the mechanism changed (the sentinel-button proximity check is gone;
// the render window's own prefetch trigger replaces it — the next page loads when the ACTIVE
// section comes within PREFETCH_AHEAD of the loaded tail), the behaviors did not. What is
// pinned, now against the new mechanism:
//
//   * With the active section near the loaded tail, the next page loads by itself on a scroll
//     frame — no click. With the active section at the head, it does NOT: the prefetch
//     trigger is positional, not a load-on-mount loop.
//   * The manual "Read more" button SURVIVES as the keyboard fallback and — proven by a real
//     click, not by presence — still loads (deep-audit finding 9: the button stays focusable).
//   * A burst of scroll events mid-flight does not stack duplicate loads.
//   * A load-MORE FAILURE keeps the sections already read, shows an inline Retry, and does
//     NOT storm on repeated scroll frames — the deep-audit HIGH. Its shape changed with
//     windowing: the old storm was a detached sentinel's zeroed rect reading "always near";
//     the new one would be the prefetch branch re-firing a failed loadNext on every scroll
//     frame. The guard pinned here is that the prefetch branch does not fire while an error
//     stands, and Retry re-arms it.
//
// HOW POSITION IS CONTROLLED. jsdom rects are all zeros, so "where is the reader" is made an
// input: section articles report their top from `topForOrdinal`, a per-test function. Head
// position (every section below the line) must NOT prefetch; tail position (the active
// section within PREFETCH_AHEAD of the loaded end) must. The bounded-mount contract itself
// lives in desk-pane-windowed.test.tsx.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }));

import { DeskPane } from '@/components/desk-pane';

const SLUG = 'hort-ecclesia';
const META = {
  source: { slug: SLUG, title: 'The Christian Ecclesia', author: 'F. J. A. Hort', tradition: null, source_type: 'historian' },
  toc: [],
};

function page(from: number, count: number, nextAfter: number | null) {
  return {
    sections: Array.from({ length: count }, (_, i) => ({
      id: from + i, ordinal: from + i, heading: `Section ${from + i}`, body: `Body of section ${from + i}.`,
    })),
    nextAfter,
  };
}

const sectionCalls: string[] = [];
/** Where each section's top sits, per test. Default: every section below the line (head position). */
let topForOrdinal: (ord: number) => number = (ord) => (ord - 1) * 200;
/** When true, every /sections?after=… (the load-more legs) fails; the initial after=0 still works. */
let failMore = false;

/** Head position: the active section is the first one — far from any tail. */
const headTops = () => {
  topForOrdinal = (ord) => (ord - 1) * 200;
};
/** Tail position: section 20 of the first 25 straddles the line — within PREFETCH_AHEAD of the end. */
const tailTops = () => {
  topForOrdinal = (ord) => (ord - 20) * 200;
};

function scroller(): HTMLElement {
  const el = screen.getByRole('region').querySelector('[data-pane-scroll]');
  expect(el, 'the pane must expose its own scroll container').not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  sectionCalls.length = 0;
  headTops();
  failMore = false;
  // Section articles report a controllable top; every other element (the scroll container
  // included) stays at jsdom's zero rect, which puts the pane's reading line at top 0.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const m = /^s(\d+)$/.exec(this.id);
    const top = m ? topForOrdinal(Number(m[1])) : 0;
    const height = m ? 180 : 0;
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/sections')) {
      sectionCalls.push(url);
      const after = Number(new URL(url, 'http://x').searchParams.get('after'));
      if (after !== 0 && failMore) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
      const body = after === 0 ? page(1, 25, 25) : after === 25 ? page(26, 25, 50) : page(after + 1, 25, null);
      return Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => META } as unknown as Response);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const moreCount = () => sectionCalls.filter((u) => u.includes('after=25')).length;

describe('the desk work pane reads continuously', () => {
  it('loads the next page when the active section nears the loaded tail — no click', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    // Head position: the prefetch trigger must NOT have fired on mount alone.
    expect(moreCount()).toBe(0);

    tailTops();
    fireEvent.scroll(scroller());
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('keeps a working manual fallback — proven by a real click, not by presence', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    expect(moreCount()).toBe(0); // head position: the auto-path cannot mask a dead onClick

    fireEvent.click(screen.getByRole('button', { name: /read more/i }));
    // The click itself fetched page 2 — nothing else can have (the auto-path is quiet at the head).
    await waitFor(() => expect(moreCount()).toBe(1));

    // And the fetched page is really there: scrolling toward it moves the WINDOW onto section 26
    // with no further fetch — proving the page landed in the loaded range, not just the log.
    tailTops();
    fireEvent.scroll(scroller());
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('a head-position scroll frame does not trigger a load; a tail-position one does', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    fireEvent.scroll(scroller());
    await new Promise((r) => setTimeout(r, 120));
    expect(sectionCalls.length).toBe(1); // the initial page only

    tailTops();
    fireEvent.scroll(scroller());
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('a burst of scroll events mid-flight does not stack duplicate loads', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    tailTops();
    fireEvent.scroll(scroller());
    fireEvent.scroll(scroller());
    fireEvent.scroll(scroller());
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('a failed load-more keeps the read, shows Retry, and does NOT storm', async () => {
    failMore = true;
    tailTops(); // near the tail, so the prefetch branch WOULD keep firing if unguarded
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    // The active section at the tail position is s20 — anchoring on s1 would race the window,
    // which legitimately unmounts s1 the moment the reader is this far down.
    await waitFor(() => expect(screen.getByText('Body of section 20.')).toBeTruthy());

    // The attach-time window evaluation fires the first (failing) prefetch by itself.
    await waitFor(() => expect(screen.getByText(/could not load more/i)).toBeTruthy());
    // The already-read sections are STILL mounted — a load-more failure is not a pane failure.
    expect(screen.getByText('Body of section 20.')).toBeTruthy();

    // The storm test: many scroll frames against a tail position must NOT re-fire while errored.
    const afterError = moreCount();
    for (let i = 0; i < 5; i++) fireEvent.scroll(scroller());
    await new Promise((r) => setTimeout(r, 150));
    expect(moreCount()).toBe(afterError); // no additional requests — the prefetch branch is stopped

    // Retry is a DIRECT call. The proof is the storm phase above: while the error stood, five
    // scroll frames produced zero requests — the auto-path was stopped, and nothing re-arms it
    // except a loadNext call. So the fetch that follows this click can only be the click.
    failMore = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
  });
});
