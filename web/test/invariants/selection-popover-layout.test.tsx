// @vitest-environment jsdom

// THE SWATCH ROW AND THE ACTION ROW MUST NOT SHARE ONE LINE — owner-reported (screenshot),
// 2026-08-03.
//
// highlight-colors.ts grew from 5 ids to 10. The desktop card was `w-max max-w-[560px]` with
// every child `shrink-0` and no wrap on the row holding swatches + Note + Bookmark + Ask + the
// commentaries button. Ten 28px swatches alone run ~350px; sharing a line with the action buttons
// pushed the total past 560px, and because nothing in that row could shrink or wrap, the overflow
// rendered OUTSIDE the opaque card, on the page background — "Ask" and the commentaries icon
// looked faded/cut off in the screenshot because they were unstyled text sitting on a light page,
// not dark buttons on the card. Verified live: at the exact reported scenario (Revelation 21:1,
// "heaven" selected, 10 real swatches injected into the live card) there were 0 overflowing
// elements after the fix, at both the card's natural width and a width forced down to 220px,
// where the swatch row correctly wraps to 2 lines instead of spilling.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. jsdom lays out nothing — every element reports 0x0, so no
// test here can compute overflow the way the browser pass above did. What jsdom CAN see is the
// STRUCTURE that prevents the defect: swatches and actions must be in separate flex containers
// (so one section's width can never squeeze the other off the card), and both must carry
// `flex-wrap` (so a card narrower than its content wraps instead of clipping). If a future edit
// puts them back on one un-wrapped line, this goes red; whether that specific width overflows on
// screen is, as it was here, a browser question.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionPopover } from '@/components/selection-popover';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
// SelectionPopover renders null until it has MEASURED a placement, and jsdom reports every
// element as 0x0 — without this the component renders nothing and every assertion below would be
// vacuously true for a reason that has nothing to do with the layout being tested.
vi.mock('@/lib/popover-position', async (orig) => ({
  ...(await orig<typeof import('@/lib/popover-position')>()),
  placePopover: () => ({ top: 10, left: 10, side: 'below' as const }),
}));
afterEach(cleanup);

const pending = {
  kind: 'verse' as const,
  key: '1',
  start: 0,
  end: 6,
  text: 'heaven',
  rect: { top: 10, left: 10, width: 60, height: 20, bottom: 30, right: 70 },
};

function renderPopover() {
  return render(
    <SelectionPopover
      pending={pending}
      contextLabel="Revelation 21:1 · WEB"
      signedIn
      onHighlight={() => {}}
      onAddNote={() => {}}
      onAsk={() => {}}
      onOpenCommentaries={() => {}}
      onDismiss={() => {}}
    />,
  );
}

// Both the desktop card and the mobile bar mount at once — CSS toggles VISIBILITY
// (`hidden md:block` / `md:hidden`), not presence — so every query in this file scopes to the
// desktop card specifically (`role="toolbar"`), which is where the defect lived. An unscoped
// `document.body.querySelectorAll(...)` would silently double-count across both copies, or (worse)
// compare a desktop element's parent against a mobile element's parent — two different cards that
// were never going to share a row regardless of the bug.
function desktopCard(): HTMLElement {
  return document.body.querySelector('[role="toolbar"][aria-label="Annotate selection"]')!;
}

describe('the desktop card: swatches and actions are structurally isolated', () => {
  it('all ten colours render — the count that exposed the defect', () => {
    renderPopover();
    const swatches = desktopCard().querySelectorAll('[aria-label^="Highlight "]');
    expect(swatches.length).toBe(HIGHLIGHT_COLORS.length);
    expect(swatches.length).toBeGreaterThanOrEqual(10);
  });

  it('swatches and the action buttons are NOT in the same flex row', () => {
    // RED-PROOF: put {swatches}{divider}{actionButtons} back in one <div className="flex ..."> ->
    // the first swatch and "Ask" share a parentElement -> RED.
    renderPopover();
    const card = desktopCard();
    const firstSwatch = card.querySelector('[aria-label^="Highlight "]');
    const ask = [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ask');
    expect(firstSwatch).toBeTruthy();
    expect(ask).toBeTruthy();
    expect(
      firstSwatch!.parentElement,
      'a swatch and an action button share a row — the exact shape that overflowed',
    ).not.toBe(ask!.parentElement);
  });

  it('both the swatch row and the action row wrap rather than clip', () => {
    // RED-PROOF: drop `flex-wrap` from either row's className -> RED. This is the property that
    // turns "too many colours" into a second line instead of invisible overflow.
    renderPopover();
    const card = desktopCard();
    const firstSwatch = card.querySelector('[aria-label^="Highlight "]')!;
    const ask = [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ask')!;
    expect(firstSwatch.parentElement!.className).toMatch(/\bflex-wrap\b/);
    expect(ask.parentElement!.className).toMatch(/\bflex-wrap\b/);
  });

  it('the commentaries button — the one that looked faded/cut off in the report — is in the wrapping action row too', () => {
    renderPopover();
    const card = desktopCard();
    const quote = [...card.querySelectorAll('button')].find((b) => b.textContent?.includes('❝'))!;
    expect(quote).toBeTruthy();
    expect(quote.parentElement!.className).toMatch(/\bflex-wrap\b/);
  });
});
