// @vitest-environment jsdom
//
// B046 — REMOVING A HIGHLIGHT IS OFFERED WHERE THE HIGHLIGHT WAS MADE.
//
// Filed as "No discoverable way to remove/un-highlight a created highlight anywhere in the reading
// view", after the session tried a single click, re-selecting and re-clicking the same colour, and
// right-click. It also left one highlight stranded on the owner's real account (B045).
//
// REMOVAL WAS NEVER MISSING. `study-panel.tsx` renders a `clear` control whenever the verse
// carries a colour, wired to `clearVerse`. The defect is that removal lives on a DIFFERENT SURFACE
// from creation: you highlight from the text-selection popover and you un-highlight from the verse
// study panel, which you reach by tapping the verse number. Nobody looks there, because nothing
// says to.
//
// This is the same shape as B023 (the bookmark toggle already removed; the label never said so),
// and together they are the recurring defect on this app: not an absent capability, but an
// affordance that will not admit the capability exists.
//
// So the popover gains the remove option — conditional on the verse actually carrying a highlight,
// which is what test 2 pins. An always-present "Remove highlight" would be worse than none.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionPopover } from '../../src/components/selection-popover';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.stubGlobal('getSelection', () => null); });

const pending = {
  key: '16',
  text: 'For God so loved the world',
  rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20, x: 10, y: 100 } as DOMRect,
};

function renderPopover(opts: { highlighted: boolean; onClearHighlight?: () => void }) {
  render(
    <SelectionPopover
      pending={pending}
      contextLabel="John · Gospel of John · 3:16"
      copyLineNo={false}
      signedIn
      highlighted={opts.highlighted}
      onHighlight={() => {}}
      onClearHighlight={opts.onClearHighlight}
      onAddNote={() => {}}
      onAsk={() => {}}
      onDismiss={() => {}}
    />,
  );
}

describe('B046 — un-highlighting is offered in the popover', () => {
  it('offers removal when the verse carries a highlight', () => {
    // SEED: drop the control -> RED. Removal still exists in the study panel, and still nobody
    // finds it — which is the finding exactly as filed.
    const onClearHighlight = vi.fn();
    renderPopover({ highlighted: true, onClearHighlight });
    const btn = screen.getByRole('button', { name: /remove highlight/i });
    fireEvent.click(btn);
    expect(onClearHighlight).toHaveBeenCalledTimes(1);
  });

  it('does NOT offer it on an unhighlighted verse', () => {
    // Without this, an always-on "Remove highlight" passes test 1 forever and offers the reader
    // an action that does nothing on most verses.
    renderPopover({ highlighted: false, onClearHighlight: vi.fn() });
    expect(screen.queryByRole('button', { name: /remove highlight/i })).toBeNull();
  });

  it('does not render the control when no handler is wired', () => {
    // The popover is shared; a surface that cannot clear must not show a control that no-ops.
    renderPopover({ highlighted: true });
    expect(screen.queryByRole('button', { name: /remove highlight/i })).toBeNull();
  });
});
