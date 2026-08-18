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
import type { PendingAnnotation } from '../../src/lib/use-text-annotation';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.stubGlobal('getSelection', () => null); });

// TYPED, not shaped by hand. This fixture was `{ key, text, rect }` cast at `rect` with `as DOMRect`,
// which is three kinds of wrong at once: it omitted `kind`/`start`/`end`, it described the rect as a
// DOMRect when the prop wants the component's own `SelectionRect`, and the cast hid the mismatch at
// the point a reader would look for it. The suite still passed — types are erased at runtime — so
// the only thing that ever complained was `tsc -p tsconfig.test.json`, which is a separate audit leg
// nobody runs while writing a component test. Annotating it means the compiler rejects the next
// drift here instead of a gate doing it two batches later.
const pending: PendingAnnotation = {
  kind: 'verse',
  key: '16',
  // Offsets into the canonical container text. 0..text.length is the whole-span case the popover
  // is raised on here; they are real numbers rather than placeholders because `start`/`end` are
  // what persist as span_start/span_end.
  start: 0,
  end: 26,
  text: 'For God so loved the world',
  rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20 },
};

function renderPopover(opts: { highlighted: boolean; onClearHighlight?: () => void }) {
  render(
    <SelectionPopover
      pending={pending}
      contextLabel="John · Gospel of John · 3:16"
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
