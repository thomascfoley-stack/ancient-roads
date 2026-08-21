// @vitest-environment jsdom
//
// CONTINUOUS READING ON THE DESK (order 2026-08-20-historians-study-entrance): the ruling is
// "the book is the whole book" — no page-at-a-time. The full reader (/work) already streams
// continuously; the desk pane was the surface that did not. What is pinned:
//
//   * When the end of the current page is NEAR the viewport, the next page loads by itself.
//     (Scroll + rect math, work-reader's own idiom; IntersectionObserver could not be watched
//     firing in the QA browser, so it does not ship.)
//   * The manual "Read more" button SURVIVES as the fallback and — proven by a real click, not by
//     mere presence — still loads (false-confidence finding: a dead onClick was green on presence).
//   * A button far below the viewport does NOT trigger a load: the proximity check is real.
//   * A burst of scroll events mid-flight does not stack duplicate loads (the in-flight ref).
//   * A load-MORE FAILURE keeps the sections already read, shows an inline Retry, and does NOT
//     storm — the deep-audit HIGH: `error` used to wipe the pane, after which the detached button's
//     zeroed rect read as "always near" and every scroll frame re-fired a failing request forever.

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
/** jsdom rects are all zeros; this makes "how far away is the button" a controllable input. */
let buttonTop = 0;
/** When true, every /sections?after=… (the load-more legs) fails; the initial after=0 still works. */
let failMore = false;

beforeEach(() => {
  sectionCalls.length = 0;
  buttonTop = 0;
  failMore = false;
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ top: buttonTop, bottom: buttonTop + 44, left: 0, right: 0, width: 0, height: 44, x: 0, y: buttonTop, toJSON: () => ({}) }) as DOMRect,
  );
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
  it('loads the next page when the end nears the viewport — no click', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    // The attach-time check alone must press the button — a short first page never scrolls.
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('keeps a working manual fallback — proven by a real click, not by presence', async () => {
    buttonTop = 99_999; // far, so the auto-path cannot mask a dead onClick
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    expect(moreCount()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /read more/i }));
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('a button far below the viewport does not trigger a load; scrolling near does', async () => {
    buttonTop = 99_999;
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    fireEvent.scroll(document);
    await new Promise((r) => setTimeout(r, 120));
    expect(sectionCalls.length).toBe(1);

    buttonTop = 400;
    fireEvent.scroll(document);
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('a burst of scroll events mid-flight does not stack duplicate loads', async () => {
    buttonTop = 99_999;
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    buttonTop = 400;
    fireEvent.scroll(document);
    fireEvent.scroll(document);
    fireEvent.scroll(document);
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(moreCount()).toBe(1);
  });

  it('a failed load-more keeps the read, shows Retry, and does NOT storm', async () => {
    failMore = true;
    buttonTop = 0; // "near", so the auto-loader would keep firing if unguarded
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    // The attach check fires the first (failing) load-more.
    await waitFor(() => expect(screen.getByText(/could not load more/i)).toBeTruthy());
    // The already-read sections are STILL mounted — the pane was not wiped.
    expect(screen.getByText('Body of section 1.')).toBeTruthy();

    // The storm test: many scroll frames against a "near" position must NOT re-fire while errored.
    const afterError = moreCount();
    for (let i = 0; i < 5; i++) fireEvent.scroll(document);
    await new Promise((r) => setTimeout(r, 150));
    expect(moreCount()).toBe(afterError); // no additional requests — the auto-loader is stopped

    // Retry clears the error and re-arms; with the failure lifted, the page loads.
    failMore = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
  });
});
