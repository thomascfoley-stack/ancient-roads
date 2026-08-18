// @vitest-environment jsdom
//
// B024 — BOOKMARK WAS HIDDEN BEHIND THE MOBILE BAR'S UNDISCOVERABLE HORIZONTAL SCROLL.
//
// The <md docked bar (selection-popover.tsx) laid out label -> TEN 28px swatches -> divider ->
// actions, inside `overflow-x-auto` with no affordance. The swatch run alone is ~350px, so at a
// 390px viewport every action after it — Bookmark included — sat off-screen with nothing visible
// to say the bar scrolls (a rounded pill shows no scrollbar on iOS).
//
// The fix is ORDER, not new chrome: actions render before the swatch run on the mobile bar, and
// Bookmark renders before the conditional "Remove highlight" inside the shared action group, so
// the widest optional control cannot push it out. The ten swatches then overflow instead — which
// is the better trade twice over: they are ten variants of ONE feature (two visible swatches
// still say "highlight colours here", where a hidden Bookmark says nothing), and the swatch cut
// mid-circle at the right edge IS the scroll affordance the bar lacked.
//
// WHAT JSDOM CAN AND CANNOT PROVE. jsdom has no layout, so "visible in the first viewport at
// 390px" is a browser measurement, not an assertion this file can make. It was TAKEN, not
// guessed — a harness reproducing the bar's exact type/spacing at 390px, Source Sans 3 loaded;
// numbers in the block comment above the bar in selection-popover.tsx. What jsdom CAN pin is the
// order that measurement relies on, which is exactly what a later "tidy-up" would revert without
// failing anything else. Queries land on the MOBILE bar because the desktop card is
// `visibility: hidden` here (no layout -> `pos` never resolves), so it is outside the
// accessibility tree — same mechanics the B023/B046 suites rely on.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionPopover } from '../../src/components/selection-popover';
import type { PendingAnnotation } from '../../src/lib/use-text-annotation';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  // jsdom has no layout; the popover measures the live selection rect to place itself.
  vi.stubGlobal('getSelection', () => null);
});

// TYPED, not shaped by hand — same fixture rationale as bookmark-state-label.test.tsx: an
// `as DOMRect` cast here would hide the PendingAnnotation drift the annotation asks tsc to catch.
const pending: PendingAnnotation = {
  kind: 'verse',
  key: '16',
  start: 0,
  end: 26,
  text: 'For God so loved the world',
  rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20 },
};

/** a precedes b in document order. */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('B024 — the mobile bar puts Bookmark ahead of the overflow', () => {
  it('Bookmark comes BEFORE the highlight swatch run', () => {
    // SEED (red-proof): the pre-fix bar renders swatches first -> every swatch precedes the
    // Bookmark button -> RED.
    render(
      <SelectionPopover
        pending={pending}
        contextLabel="John 3:16 · KJV"
        signedIn
        onHighlight={() => {}}
        onAddNote={() => {}}
        onAsk={() => {}}
        onBookmark={() => {}}
        onDismiss={() => {}}
      />,
    );
    const bookmark = screen.getByRole('button', { name: /^Bookmark$/i });
    for (const swatch of screen.getAllByRole('button', { name: /^Highlight / })) {
      expect(precedes(bookmark, swatch), 'a swatch renders before Bookmark').toBe(true);
    }
  });

  it('Bookmark comes BEFORE the conditional Remove-highlight control', () => {
    // The worst measured case is a highlighted verse (an extra ~110px control in the group):
    // rendered ahead of Bookmark it pushes it back off the first viewport, which is the filed
    // defect returning only on highlighted verses — the harder-to-notice version.
    render(
      <SelectionPopover
        pending={pending}
        contextLabel="John 3:16 · KJV"
        signedIn
        highlighted
        onClearHighlight={() => {}}
        onHighlight={() => {}}
        onAddNote={() => {}}
        onAsk={() => {}}
        onBookmark={() => {}}
        onDismiss={() => {}}
      />,
    );
    const bookmark = screen.getByRole('button', { name: /^Bookmark$/i });
    const unhighlight = screen.getByRole('button', { name: /remove highlight/i });
    expect(precedes(bookmark, unhighlight)).toBe(true);
  });
});
