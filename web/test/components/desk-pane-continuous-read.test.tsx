// @vitest-environment jsdom
//
// CONTINUOUS READING ON THE DESK (order 2026-08-20-historians-study-entrance): the ruling is
// "the book is the whole book" — no page-at-a-time. The full reader (/work) already streams
// continuously; the desk pane was the surface that did not: it rendered a "Read more" button
// after every 25 sections and waited. What is pinned:
//
//   * When the end of the current page is NEAR the viewport, the next page loads by itself —
//     no click. (Scroll + rect math, work-reader's own idiom; IntersectionObserver was tried
//     and could not be watched firing in the embedded QA browser, so it does not ship.)
//   * The manual button SURVIVES as the fallback and keeps working.
//   * Scroll events that arrive while a load is in flight do not stack a second identical
//     query — the in-flight guard is a ref precisely because two same-tick calls both read a
//     stale `busy === false` from their closures (watched red before the ref existed).
//   * A button far below the viewport does NOT trigger a load — the proximity check is real,
//     not a formality that fires on every scroll.

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
      id: from + i,
      ordinal: from + i,
      heading: `Section ${from + i}`,
      body: `Body of section ${from + i}.`,
    })),
    nextAfter,
  };
}

const sectionCalls: string[] = [];
/** jsdom rects are all zeros; this makes "how far away is the button" a controllable input. */
let buttonTop = 0;

beforeEach(() => {
  sectionCalls.length = 0;
  buttonTop = 0;
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ top: buttonTop, bottom: buttonTop + 44, left: 0, right: 0, width: 0, height: 44, x: 0, y: buttonTop, toJSON: () => ({}) }) as DOMRect,
  );
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/sections')) {
      sectionCalls.push(url);
      const after = Number(new URL(url, 'http://x').searchParams.get('after'));
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

describe('the desk work pane reads continuously', () => {
  it('loads the next page when the end of the current one nears the viewport — no click', async () => {
    // Button "near": top 0 (jsdom default), well inside viewport + 600px margin.
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    // The attach-time check alone must press the button — a short first page never scrolls.
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(sectionCalls.some((u) => u.includes('after=25'))).toBe(true);

    // The manual fallback is still rendered and still wired.
    expect(screen.getByRole('button', { name: /read more/i })).toBeTruthy();
  });

  it('a button far below the viewport does not trigger a load; scrolling near does', async () => {
    buttonTop = 99_999; // far
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    // Attach check + a scroll, both with the button far away: nothing loads.
    fireEvent.scroll(document);
    await new Promise((r) => setTimeout(r, 120));
    expect(sectionCalls.length).toBe(1);

    // The reader scrolls down; the button comes near; the next page loads by itself.
    buttonTop = 400;
    fireEvent.scroll(document);
    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(sectionCalls.filter((u) => u.includes('after=25')).length).toBe(1);
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
    // Exactly one after=25 fetch despite three scroll events landing around one flight.
    expect(sectionCalls.filter((u) => u.includes('after=25')).length).toBe(1);
  });
});
