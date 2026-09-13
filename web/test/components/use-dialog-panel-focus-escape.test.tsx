// @vitest-environment jsdom
//
// useDialog's Tab-wrap handler was DEAD when focus rested on the panel HOST.
//
// `dialogProps` puts `tabIndex: -1` on every panel (use-dialog.tsx:137) so the host can hold focus
// (a click on its own background/padding lands it there). But `visibleFocusable`'s selector
// (FOCUSABLE) excludes `[tabindex="-1"]`, so the host is never in `items`. The wrap branches only
// fire for `active === first`, `active === last`, or `!inside`; the host is `inside`
// (`panel.contains(panel)` is true) yet neither `first` nor `last`, so neither branch ran:
// `preventDefault()` was not called and no `.focus()` moved focus — the un-prevented Shift+Tab
// escaped the trap for one keystroke (predicted from the HTML Living Standard, which does not
// include `tabIndex: -1` elements in the sequential focus navigation scope). The document-level
// capture listener re-trapped on the next keystroke, so the contract was broken for exactly one
// backward keystroke. See the bug report's full consumer survey: `book-picker`'s full-bleed
// `fixed inset-0` host is the unambiguous primary reachability case (no scrim, no background
// dismiss, wide empty margins outside the centered content column on >=tablet widths).
//
// WHAT THIS HARNESS CAN AND CANNOT SHOW (same epistemic limits as the other dialog suites):
// jsdom does not perform native sequential-focus navigation on a synthetic `keyDown`, so the only
// thing that can move focus in this file is the hook's own wrap code. Before the fix, focus stayed
// on the panel after Tab/Shift+Tab — proving the dead branch, not reproducing the real-browser
// escape. After the fix, the hook focuses `first` on forward Tab and `last` on Shift+Tab, which
// is the contract the trap should hold for the host-focused state. The real-browser escape leg
// (open book-picker, click the background, Shift+Tab to a reader-header control behind the
// overlay) is the UI/DoD verification described in the test plan, not reproducible here.
//
// RED-PROOF: against the UNFIXED hook, the "focus moves off the host" assertions below fail
// (focus stays on `panel`); with the fix they pass. Run with --no-cache to avoid the stale-cache
// artifact that bit an earlier red proof in this suite (see commit eda01a3e).

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { DialogPanel } from '@/lib/use-dialog';

// jsdom reports offsetParent as null for every element, so useDialog's visibility filter would
// treat an attached panel as hidden and its Tab branch would be untestable. Same emulation as
// the other dialog suites: connected is visible.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    return this.isConnected ? document.body : null;
  },
});

afterEach(cleanup);

/** A trigger + a DialogPanel with two focusable children, bracketed by focusable controls
 *  outside the panel that the trap must never hand focus to. Mirrors the consumer shape
 *  (reader-header controls before the panel, dialog controls inside it). */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="outside-before">outside before</button>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <DialogPanel label="a panel" onClose={() => setOpen(false)}>
          <button data-testid="first">first</button>
          <button data-testid="last">last</button>
        </DialogPanel>
      )}
      <button data-testid="outside-after">outside after</button>
    </div>
  );
}

/** The panel host — the `role="dialog"` div with `tabIndex: -1` that `dialogProps` spreads on it. */
function hostPanel(): HTMLElement {
  return document.querySelector('[role="dialog"]')!;
}

describe('useDialog traps Tab when focus rests on the panel host (tabIndex=-1)', () => {
  it('Shift+Tab from the host moves focus to the LAST tab-stop, not off the panel', () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.click(getByTestId('trigger'));

    const panel = hostPanel();
    const first = getByTestId('first');
    const last = getByTestId('last');
    expect(panel.contains(first)).toBe(true);
    expect(panel.contains(last)).toBe(true);

    // Mirror a click on the host's own background: focus the tabIndex=-1 host directly. This is
    // exactly the state `book-picker` reaches when the reader clicks its full-bleed overlay.
    panel.focus();
    expect(document.activeElement, 'PRECONDITION: focus is on the host itself').toBe(panel);

    // Before the fix: the host is `inside` but not in `items`, so neither wrap branch fires,
    // no preventDefault()/.focus() runs, and focus stays on the panel (in jsdom). The real-browser
    // consequence is an un-prevented Shift+Tab escaping backwards off the open dialog.
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });
    expect(
      document.activeElement,
      'Shift+Tab from the host must wrap to the last tab-stop, not escape the trap',
    ).toBe(last);
    // And the outside-before control (the proximate Shift+Tab escape target in a real browser)
    // must NOT have received focus.
    expect(document.activeElement).not.toBe(getByTestId('outside-before'));
  });

  it('forward Tab from the host moves focus to the FIRST tab-stop, not off the panel', () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.click(getByTestId('trigger'));

    const panel = hostPanel();
    const first = getByTestId('first');

    panel.focus();
    expect(document.activeElement).toBe(panel);

    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(
      document.activeElement,
      'forward Tab from the host must wrap to the first tab-stop',
    ).toBe(first);
    expect(document.activeElement).not.toBe(getByTestId('outside-after'));
  });

  it('an intermediate tab-stop still advances naturally within the trap (no wrap)', () => {
    // The fix is scoped by `!items.includes(active)`, so the by-design intermediate-stop path
    // (active is a real tab-stop that is neither first nor last) is untouched: Tab moves the
    // browser focus forward naturally rather than wrapping. This is the case the bug report
    // explicitly marks out of scope, asserted here so the fix cannot regress it.
    const { getByTestId } = render(<Harness />);
    fireEvent.click(getByTestId('trigger'));

    const first = getByTestId('first');
    first.focus();
    expect(document.activeElement).toBe(first);

    // From `first` (not the last stop), forward Tab must NOT wrap back to `first` — the trap
    // lets the browser advance focus. In jsdom no native focus navigation occurs, so the hook
    // does nothing and focus stays put; the load-bearing assertion is that it does NOT wrap.
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });
});
