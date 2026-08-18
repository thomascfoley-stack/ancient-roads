// @vitest-environment jsdom
//
// A079 — AT 390px A MULTI-PANE DESK GAVE NO SIGN THE SECOND PANE EXISTED.
// (docs/evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md:385 — "no swipe hint, dots, or counter,
// though no horizontal overflow occurs".)
//
// THE FINDING NAMED THREE POSSIBLE TREATMENTS AND TWO OF THEM WOULD HAVE BEEN LIES. Measured in a
// real browser at 390x844 before anything was written (`/desk?p=scripture:jhn/3&p=scripture:psa/23`,
// 2026-08-17):
//
//     scrollWidth === clientWidth          — nothing scrolls sideways
//     pane 1 "John 3 (Scripture)"          — top 12px,   height 3165px
//     pane 2 "Psalms 23 (Scripture)"       — top 3189px, height  541px
//
// The panes STACK (`flex-col`, going side-by-side only at `lg:`), so a swipe hint or a dot-pager
// would point at a horizontal gesture the layout does not have — an affordance for a carousel that
// is not there. The honest treatment is the third one, a counter, and the measurement also decides
// WHERE it goes: pane 1 alone is 3.8 viewport-heights tall, so a single line at the top of the page
// scrolls away and is gone for the remaining ~2300px. Each pane therefore carries its own position,
// which is also what orients a reader who lands mid-stack.
//
// WHAT IS ASSERTED, and why each leg is here:
//   * the count appears, and the non-final pane says the next one is BELOW (not "swipe") — the
//     finding, closed, in the direction the layout actually goes;
//   * a one-pane desk says nothing — a counter that is always on screen is wallpaper, and would
//     pass a "says something" assertion while telling the reader nothing;
//   * the line is not a `role="status"` — the trap this page has already been through. Two other
//     files (desk-cap-notice, desk-nav-and-session-note) read `getByRole('status')` as THE A078 cap
//     notice; a second status role passes every assertion about the counter and breaks both of them.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => params.current,
}));

import DeskPage from '@/app/desk/page';

/** Render the desk at a given `?p=` query. */
function renderDesk(query: string) {
  params.current = new URLSearchParams(query);
  return render(<DeskPage />);
}

beforeEach(() => {
  // Work panes fetch on mount; a promise that never settles holds them in their loading state. The
  // subject here is the page's own chrome around the panes, not what is inside them.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  params.current = new URLSearchParams();
  vi.unstubAllGlobals();
});

describe('a stacked desk says how many panes there are and which one you are on', () => {
  it('two panes: each is numbered, and the first says the next is below it', () => {
    renderDesk('p=work:a&p=work:b');
    expect(screen.getAllByRole('region'), 'expected two panes').toHaveLength(2);

    const first = screen.getByText(/^Pane 1 of 2/);
    // "scroll down" and not "swipe": the measurement above is what makes this the right word, and
    // this assertion is where a future carousel-shaped rewrite gets caught.
    expect(first.textContent, 'the first pane must point DOWN — the panes stack, they do not page').toMatch(
      /scroll down/i,
    );
    expect(first.textContent).not.toMatch(/swipe/i);

    const last = screen.getByText('Pane 2 of 2');
    expect(last, 'the last pane still needs its number — it is where a mid-stack reader lands').toBeTruthy();
  });

  it('three panes: the numbering follows the desk, it is not hardcoded to two', () => {
    renderDesk('p=work:a&p=work:b&p=work:c');
    expect(screen.getByText(/^Pane 1 of 3/)).toBeTruthy();
    expect(screen.getByText(/^Pane 2 of 3/)).toBeTruthy();
    expect(screen.getByText('Pane 3 of 3')).toBeTruthy();
  });

  it('one pane: nothing is said, because nothing is hidden', () => {
    renderDesk('p=work:a');
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(
      screen.queryByText(/pane 1 of/i),
      'a single-pane desk hides nothing — a counter there is noise that trains the reader to skip it',
    ).toBeNull();
  });

  it('the counter is not a status role — it must not collide with the A078 cap notice', () => {
    // Two panes is under the cap, so the ONLY thing that could claim a status role here is the new
    // line. desk-cap-notice.test.tsx asserts exactly this and would go red too; it is repeated here
    // because this is the file whose change would cause it.
    renderDesk('p=work:a&p=work:b');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is carried by the stacked layout only — it is hidden where the panes are side by side', () => {
    // HONEST ABOUT WHAT THIS PROVES: jsdom loads no stylesheet, so this asserts the MECHANISM
    // (the `lg:` variant that switches the desk to columns is the same breakpoint that hides this
    // line), not the rendered result. The rendered result was checked the only way it can be — in a
    // browser at 390px and at 1280px, 2026-08-17. Without this leg the counter could silently start
    // shipping to desktop, where three visible columns make it a caption stating the obvious.
    renderDesk('p=work:a&p=work:b');
    expect(screen.getByText('Pane 2 of 2').className).toContain('lg:hidden');
  });
});
