// @vitest-environment jsdom
//
// B023 — THE BOOKMARK CONTROL SAYS WHICH WAY IT WILL GO.
//
// The 2026-08-17 authenticated QA pass filed "Bookmark button is stateless — no way to see or
// remove an existing bookmark". Half of that was already wrong when filed and is worth stating,
// because it changes the fix: bookmarked verses DO carry a visible `⚑` indicator
// (`verse-display.tsx:341`), and `onToggleBookmark` is a TOGGLE, so pressing it a second time
// already removes the bookmark.
//
// What was true is that the control never said so. It read "Bookmark" whether or not the verse was
// already bookmarked, so removal existed and was invisible — the reader had no way to know a second
// press would undo rather than duplicate. Same family as B046 (un-highlight exists, in a surface
// nobody looked in): the capability is there, the affordance does not admit it.
//
// So the fix is a label, not a feature, and this test pins the label to the state rather than
// pinning that some button exists.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionPopover } from '../../src/components/selection-popover';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  // jsdom has no layout; the popover measures the live selection rect to place itself.
  vi.stubGlobal('getSelection', () => null);
});

const pending = {
  key: '16',
  text: 'For God so loved the world',
  rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20, x: 10, y: 100 } as DOMRect,
};

function renderPopover(bookmarked: boolean) {
  render(
    <SelectionPopover
      pending={pending}
      contextLabel="John · Gospel of John · 3:16"
      copyLineNo={false}
      signedIn
      bookmarked={bookmarked}
      onHighlight={() => {}}
      onAddNote={() => {}}
      onAsk={() => {}}
      onBookmark={() => {}}
      onDismiss={() => {}}
    />,
  );
}

describe('B023 — the bookmark control reflects the verse it is on', () => {
  it('offers to ADD when the verse is not bookmarked', () => {
    renderPopover(false);
    expect(screen.getByRole('button', { name: /^Bookmark$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /remove bookmark/i })).toBeNull();
  });

  it('offers to REMOVE when the verse already is', () => {
    // SEED: hardcode the label back to "Bookmark" -> RED. Removal would still work and still be
    // invisible, which is the defect as filed.
    renderPopover(true);
    expect(screen.getByRole('button', { name: /remove bookmark/i })).toBeTruthy();
  });
});
