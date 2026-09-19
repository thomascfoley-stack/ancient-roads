// @vitest-environment jsdom
//
// ONE ESCAPE CLOSED EVERY STACKED useDialog OVERLAY — OUTER FIRST.
//
// `lib/use-dialog.tsx` is the shared hook behind every sheet, drawer and popover: focus moves
// in on open, Tab cycles inside, Escape closes, focus returns to the trigger. Ten overlays use
// it (six call `useDialog` directly, four use `<DialogPanel>`). The hook's author wrote at
// use-dialog.tsx:20-21 that "Escape is bound in the CAPTURE phase so a sheet opened over another
// surface closes itself first, and `stopPropagation` keeps one Escape from closing two things."
// The code did not deliver that, on two counts a real keyboard would hit but no test had exercised:
//
//   1. EVERY useDialog instance registers its Escape listener on the SAME node (`document`, capture
//      phase — use-dialog.tsx:127) and the handler calls only `e.stopPropagation()` (use-dialog.tsx:86).
//      `stopPropagation` does NOT stop other listeners on the SAME node — only `stopImmediatePropagation`
//      does (DOM Standard §2.7). So when two overlays are stacked, every stacked dialog's Escape
//      handler fires.
//   2. Capture-phase listeners on a single node fire in REGISTRATION order (DOM Standard §2.9
//      dispatch algorithm). The first-mounted (outer) dialog registers first, so its `onClose` runs
//      BEFORE the inner's — the opposite of "closes itself first".
//
// The reachable path: a signed-in reader opens SaveToStudy's study picker (`useDialog`,
// save-to-study.tsx:352), then presses `Cmd/Ctrl+K`. The study picker's `useDialog` capture handler
// returns early for any non-Escape, non-Tab key (`if (e.key !== 'Tab' || !panel) return;`), so the
// chord falls through to the Omnibox's own `window`-bubble listener (omnibox.tsx:23) which opens it.
// Both overlays are now `useDialog` instances on `document`-capture. Press Escape: BOTH close,
// outer first, instead of just the Omnibox.
//
// WHAT THIS FILE ASSERTS. Mount two or three stacked `useDialog` panels, dispatch a REAL
// `KeyboardEvent('keydown', { key: 'Escape' })` (so capture-phase `document` listeners fire in
// registration order, jsdom's dispatch matching the DOM Standard), and assert that exactly the
// topmost (last-mounted) dialog's `onClose` is called — once — and no underlying dialog closes.
// The reachability test reproduces the report's actual path — study picker outer (bare
// `useDialog`) + omnibox-pattern inner (`<DialogPanel>` PLUS its own `window`-bubble Escape
// handler) — and proves that window-bubble handler is inert under both bug and fix (Evidence §2
// of the report): the `useDialog` document-capture handler's `stopPropagation`/
// `stopImmediatePropagation` blocks the event before it bubbles up to `window`.
//
// jsdom has no layout, so `visibleFocusable`'s `offsetParent` filter is emulated the way the other
// dialog suites do it — connected means visible — so the focus-in branch is not vacuous. The
// Escape-stack behaviour itself does not depend on focus position (the listeners are on `document`),
// but the emulation keeps this file honest about the same seam the sibling tests rely on.

import { StrictMode, useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogPanel, useDialog } from '@/lib/use-dialog';

// jsdom reports offsetParent as null for every element, so useDialog's visibility filter would treat
// an attached panel as hidden. Same emulation as the sibling dialog suites: connected is visible.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    return this.isConnected ? document.body : null;
  },
});

afterEach(cleanup);

/** Dispatch a real Escape as the browser would: from the currently focused element (or the panel
 *  host) so the capture-phase `document` listeners and any `window`-bubble listeners are exercised
 *  for real. A `KeyboardEvent` (not testing-library's `fireEvent` shorthand) because the assertion
 *  depends on the DOM Standard dispatch order of same-node capture listeners. */
function pressEscape(): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true }),
  );
}

/** A bare `useDialog` panel — the shape of every direct consumer (save-to-study, mobile-nav,
 *  book-picker, study-panel, work-toc, word-study). Its `onClose` is the controlled mock the tests
 *  count. Renders an inner button so the focus-in branch has a real target. */
function Layer({
  onClose,
  label,
  testId,
}: {
  onClose: () => void;
  label: string;
  testId: string;
}) {
  const { ref, dialogProps } = useDialog(onClose, label);
  return (
    <div ref={ref} {...dialogProps} data-testid={testId}>
      <button data-testid={`${testId}-item`}>{label}</button>
    </div>
  );
}

/** Renders a fixed stack of `Layer`s in order. Each layer mounts before the next, so each layer's
 *  `useDialog` effect (and its `document`-capture listener + OPEN_STACK push) runs in mount order:
 *  the FIRST element is the OUTER (earliest-mounted) and the LAST is the INNER/topmost. */
function Stack({
  layers,
}: {
  layers: Array<{ onClose: () => void; label: string; testId: string }>;
}) {
  return (
    <>
      {layers.map((l) => (
        <Layer key={l.testId} onClose={l.onClose} label={l.label} testId={l.testId} />
      ))}
    </>
  );
}

describe('useDialog — one Escape closes only the topmost stacked dialog', () => {
  it('one Escape closes exactly the topmost dialog (2-deep)', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <Stack
        layers={[
          { onClose: outerClose, label: 'outer', testId: 'outer' },
          { onClose: innerClose, label: 'inner', testId: 'inner' },
        ]}
      />,
    );

    // PRECONDITION: both panels mounted and registered their Escape listeners on `document`.
    expect(screen.getByTestId('outer')).toBeTruthy();
    expect(screen.getByTestId('inner')).toBeTruthy();

    pressEscape();

    // Only the topmost (inner / last-mounted) dialog closes.
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it('3-deep stack: one Escape closes only the topmost, the two underlying stay open', () => {
    // Generalises beyond a coincidence-of-two: with N stacked dialogs one Escape must close exactly
    // one — the topmost — and leave the N-1 beneath open. Against the buggy source all three fire.
    const bottomClose = vi.fn();
    const middleClose = vi.fn();
    const topClose = vi.fn();
    render(
      <Stack
        layers={[
          { onClose: bottomClose, label: 'bottom', testId: 'bottom' },
          { onClose: middleClose, label: 'middle', testId: 'middle' },
          { onClose: topClose, label: 'top', testId: 'top' },
        ]}
      />,
    );

    pressEscape();

    expect(topClose).toHaveBeenCalledTimes(1);
    expect(middleClose).not.toHaveBeenCalled();
    expect(bottomClose).not.toHaveBeenCalled();
  });

  it('holds under React StrictMode', () => {
    // useDialog's effect is deps-[] and the fix keeps a module-level OPEN_STACK. StrictMode runs
    // every effect as setup→cleanup→setup on mount, so a naive push-without-cleanup would leave two
    // entries per panel and corrupt the topmost check. The fix's cleanup splices the first `self`
    // before the second setup pushes a new one, so the steady-state stack is [outer, inner] exactly
    // as in the non-StrictMode case — and this is the reproduction for that property, the same trick
    // use-dialog-focus-restore.test.tsx plays for `restoreTo`: wrap both panels in <StrictMode> or the
    // double-invoke cannot be observed.
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <StrictMode>
        <Stack
          layers={[
            { onClose: outerClose, label: 'outer', testId: 'outer' },
            { onClose: innerClose, label: 'inner', testId: 'inner' },
          ]}
        />
      </StrictMode>,
    );

    pressEscape();

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it('reachability reproduction (real config): study picker stays, omnibox-pattern closes, window-bubble inert', () => {
    // Reproduces the report's actual path. The study picker is a bare `useDialog` panel (outer); the
    // Omnibox is `<DialogPanel>` PLUS its own `window`-bubble Escape handler (omnibox.tsx:21-28) that
    // calls `setOpen(false)` independently of `useDialog`. That window-bubble Escape branch is DEAD
    // today (the `useDialog` document-capture handler stops the event before it bubbles to `window`)
    // and the fix keeps it dead — the bug is the EXTRA close of the study picker, not this handler.
    // This test asserts all three: topmost closes, outer stays, window-bubble does not fire.

    const studyPickerClose = vi.fn();
    const omniboxClose = vi.fn();
    const omniboxWindowBubbleClose = vi.fn();

    /** The study picker: a bare useDialog panel, opened first. */
    function StudyPicker() {
      const { ref, dialogProps } = useDialog(studyPickerClose, 'Choose a study');
      return (
        <div ref={ref} {...dialogProps} data-testid="study-picker">
          <button>Rahab</button>
        </div>
      );
    }

    /** The Omnibox: always mounted, with the SAME window-bubble keydown listener the real component
     *  registers on `window` (omnibox.tsx:21-28): Cmd/Ctrl+K toggles open, Escape calls its own
     *  close. The `<DialogPanel>` mounts only while open, so its `useDialog` effect registers AFTER
     *  the study picker's — making the omnibox the topmost of the two. */
    function OmniboxSurface() {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
          if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setOpen((p) => !p);
          }
          if (e.key === 'Escape') {
            omniboxWindowBubbleClose();
            setOpen(false);
          }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, []);
      if (!open) return null;
      return (
        <DialogPanel
          label="Go to a passage"
          onClose={() => {
            omniboxClose();
            setOpen(false);
          }}
        >
          <button>John 3:16</button>
        </DialogPanel>
      );
    }

    // Joint harness: study picker (outer, open from the start) + always-mounted omnibox surface
    // (opened later via the same Cmd/Ctrl+K chord the reader uses).
    function Harness() {
      return (
        <div>
          <StudyPicker />
          <OmniboxSurface />
        </div>
      );
    }

    const { getByText, queryByRole } = render(<Harness />);

    // Step 1 — the study picker is already open (outer useDialog registered first).
    expect(getByText('Rahab')).toBeTruthy();

    // Step 2 — Cmd/Ctrl+K opens the omnibox over it. The chord reaches `window` even though the
    // study picker's `useDialog` capture handler is on `document`: that handler returns early for
    // any non-Escape, non-Tab key (`if (e.key !== 'Tab' || !panel) return;`), so the event falls
    // through to `window` and the omnibox's own listener opens it.
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(queryByRole('dialog', { name: 'Go to a passage' })).not.toBeNull();

    // Step 3 — one Escape.
    pressEscape();

    // The topmost (omnibox) closes via its `useDialog` handler.
    expect(omniboxClose).toHaveBeenCalledTimes(1);
    // The underlying study picker stays open — the bug's extra close, gone.
    expect(studyPickerClose).not.toHaveBeenCalled();
    // The omnibox's own window-bubble Escape handler is inert (the `useDialog` document-capture
    // handler stops the event before it can bubble up to `window`).
    expect(omniboxWindowBubbleClose).not.toHaveBeenCalled();
  });
});
