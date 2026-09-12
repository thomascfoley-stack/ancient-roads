// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }) }));
import { DeskPane } from '@/components/desk-pane';

const SLUG = 'historia';
const META = { source: { slug: SLUG, title: 'Historia', author: 'A', tradition: null, source_type: 'historian' }, toc: [] };

function pageFor(after: number, limit = 50, total = 200) {
  const from = after + 1;
  const to = Math.min(from + limit - 1, total);
  const nextAfter = to < total ? to : null;
  return {
    sections: Array.from({ length: to - from + 1 }, (_, i) => {
      const ord = from + i;
      return { id: ord, ordinal: ord, heading: `Section ${ord}`, body: `Body of section ${ord}.` };
    }),
    nextAfter,
  };
}

const SECTION_HEIGHT = 200;

function scroller(): HTMLElement {
  return screen.getByRole('region').querySelector('[data-pane-scroll]') as HTMLElement;
}

function topSpacerPx(): number {
  const wrapper = scroller().querySelector('.space-y-4');
  if (!wrapper) return 0;
  const prev = (wrapper as HTMLElement).previousElementSibling;
  if (prev && prev.tagName === 'DIV' && prev.getAttribute('aria-hidden') === 'true') {
    return parseInt((prev as HTMLElement).style.height, 10) || 0;
  }
  return 0;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const m = /^s(\d+)$/.exec(this.id);
    if (m) {
      const articles = Array.from(scroller().querySelectorAll('article')) as HTMLElement[];
      const idx = articles.indexOf(this);
      const top = (idx >= 0 ? idx * SECTION_HEIGHT : 0) + topSpacerPx() - scroller().scrollTop;
      return { top, bottom: top + SECTION_HEIGHT, left: 0, right: 0, width: 0, height: SECTION_HEIGHT, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    }
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return /^s\d+$/.test(this.id) ? SECTION_HEIGHT : 0;
  });
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/sections')) {
      const after = Number(new URL(url, 'http://x').searchParams.get('after'));
      return Promise.resolve({ ok: true, status: 200, json: async () => pageFor(after) } as unknown as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => META } as unknown as Response);
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("loadPrev preserves the reader's place across a full backward page", () => {
  // Contract (desk-pane.tsx:466): "After a prepend, keep the same section under the viewport
  // and hold the window on it." This test encodes the VIEWPORT-POSITION invariant: the anchor
  // section's getBoundingClientRect().top must be the same before and after the click.
  it('the anchor section stays mounted at its pre-click viewport position', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG, ordinal: 60 }} onClose={() => {}} onReplace={() => {}} />);

    // Wait for the initial page (sections 60-109) to land and the window to settle.
    await waitFor(() => expect(screen.getByText('Body of section 60.')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 100));

    // Capture the anchor's viewport position — this is what must survive the prepend.
    const anchorBefore = screen.getByText('Body of section 60.').closest('article')!;
    const topBefore = anchorBefore.getBoundingClientRect().top;

    fireEvent.click(screen.getByRole('button', { name: /earlier in this work/i }));

    // Wait for the backward page fetch, the merge, and the window cascade to all settle.
    await new Promise((r) => setTimeout(r, 500));

    // CONTRACT: the anchor section must still be mounted.
    const anchorAfter = screen.queryByText('Body of section 60.')?.closest('article');
    expect(anchorAfter, 'section 60 was unmounted — the reader lost their place').toBeTruthy();

    // CONTRACT: the anchor must sit at the same viewport position it had before the click.
    const topAfter = anchorAfter!.getBoundingClientRect().top;
    expect(topAfter).toBeCloseTo(topBefore, 0);
  });
});

describe('loadPrev boundary — small prepend stays inside the window', () => {
  // The bug is latent when the prepend fits inside the 24-section window: the anchor stays
  // mounted across the prepend commit, the sectionEls lookup succeeds, and the scrollTop
  // delta is applied. Deep-linking to ordinal 20 yields a 19-section prepend (< 24), so the
  // anchor must survive on the CURRENT (unfixed) code. This pins the boundary the report
  // identifies as the latent threshold.
  it('section 20 survives a 19-section prepend (anchor stays mounted)', async () => {
    render(<DeskPane pane={{ kind: 'work', slug: SLUG, ordinal: 20 }} onClose={() => {}} onReplace={() => {}} />);

    await waitFor(() => expect(screen.getByText('Body of section 20.')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 100));

    expect(screen.queryByRole('button', { name: /earlier in this work/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /earlier in this work/i }));

    // Wait for the prepended page (sections 1-19 are new; section 19 lands in the
    // settled window {11,35} alongside the anchor at index 19).
    await waitFor(() => expect(screen.getByText('Body of section 19.')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 300));

    expect(
      screen.queryByText('Body of section 20.'),
      'section 20 must survive a small prepend',
    ).toBeTruthy();
  });
});
