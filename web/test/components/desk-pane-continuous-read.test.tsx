// @vitest-environment jsdom
//
// CONTINUOUS READING ON THE DESK (order 2026-08-20-historians-study-entrance): the ruling is
// "the book is the whole book" — no page-at-a-time. The full reader (/work) already streams
// continuously; the desk pane was the surface that did not: it rendered a "Read more" button
// after every 25 sections and waited. What is pinned:
//
//   * When the end-of-page control scrolls into view, the NEXT page loads by itself — the
//     IntersectionObserver path, no click.
//   * The manual button SURVIVES as the fallback: environments without IntersectionObserver
//     (and keyboard readers who reach it before the observer fires) still have a working
//     control. Auto-load augments the button; it must not replace it.
//   * An observer that fires while a load is already in flight does not stack a second one
//     (the busy guard) — observers re-fire on layout shifts, and each duplicate is a real
//     query against a 100k-section work.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

/** Captures every IntersectionObserver the component creates, so the test can fire them. */
class FakeIO {
  static instances: FakeIO[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  fire(isIntersecting: boolean) {
    this.callback(
      this.observed.map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

const sectionCalls: string[] = [];

beforeEach(() => {
  FakeIO.instances.length = 0;
  sectionCalls.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/sections')) {
      sectionCalls.push(url);
      const after = Number(new URL(url, 'http://x').searchParams.get('after'));
      const body = after === 0 ? page(1, 25, 25) : page(after + 1, 25, null);
      return Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => META } as unknown as Response);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the desk work pane reads continuously', () => {
  it('loads the next page when the end of the current one scrolls into view — no click', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);

    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());
    expect(sectionCalls.length).toBe(1);

    // The fallback control is still there…
    const button = screen.getByRole('button', { name: /read more/i });
    expect(button).toBeTruthy();

    // …and an observer is watching it.
    await waitFor(() => expect(FakeIO.instances.some((io) => io.observed.includes(button))).toBe(true));
    FakeIO.instances.forEach((io) => io.fire(true));

    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(sectionCalls.length).toBe(2);
  });

  it('does not stack loads when the observer fires mid-flight', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG }} onClose={() => {}} onReplace={() => {}} />);
    await waitFor(() => expect(screen.getByText('Body of section 1.')).toBeTruthy());

    const button = screen.getByRole('button', { name: /read more/i });
    await waitFor(() => expect(FakeIO.instances.some((io) => io.observed.includes(button))).toBe(true));

    // Two rapid fires: the second lands while the first page is still in flight.
    FakeIO.instances.forEach((io) => io.fire(true));
    FakeIO.instances.forEach((io) => io.fire(true));

    await waitFor(() => expect(screen.getByText('Body of section 26.')).toBeTruthy());
    expect(sectionCalls.length).toBe(2); // initial page + exactly one more
  });
});
