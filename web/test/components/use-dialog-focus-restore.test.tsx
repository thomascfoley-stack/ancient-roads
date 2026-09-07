// @vitest-environment jsdom
//
// useDialog GAVE FOCUS BACK TO AN ELEMENT IT WAS ABOUT TO REMOVE.
//
// FOUND BY LOOKING, NOT BY TESTING. The jsdom suite for the reader's translation dropdown was
// green — Escape closed the panel and `document.activeElement` was the trigger — so the same
// interaction was walked in Chrome at 375px (2026-09-06, `next dev`) to look at it. Focus landed
// on `<body>`. Patching `HTMLElement.prototype.focus` for the duration of the Escape logged
// exactly one call:
//
//     BUTTON:World English BibleWEB connected=false
//
// That is the panel's FIRST TRANSLATION, already detached — not the "WEB" trigger. So the restore
// ran; it just held the wrong element.
//
// THE MECHANISM: `previouslyFocused` was read inside the effect, and an effect can run more than
// once on one mount. React StrictMode does it deliberately in development — mount, clean up, mount
// again — and Next.js turns StrictMode on by default, so this is what every developer and every
// `next dev` session sees. By that second run the panel has focus, because the FIRST run put it
// there; re-reading `document.activeElement` therefore captured one of the panel's own buttons.
// Closing then "restored" focus to a node being removed in the same commit, and the reader was
// left on `<body>` with no way back but to tab from the top of the document.
//
// Production does not double-invoke, so this was a development-mode fault in behaviour — and a
// real fragility in the hook either way: React documents that an effect must survive being
// mounted, torn down and mounted again, and this one silently corrupted its own state when it was.
// The fix is to capture the restore target ONCE and never re-read it while focus is inside the
// panel we ourselves moved it into.
//
// WHY THE PLAIN TEST COULD NOT SEE IT: without StrictMode the effect runs once, the capture is
// correct, and the bug has no way to appear. The `<StrictMode>` wrapper below is not decoration —
// it IS the reproduction, and it is the same trick `use-dialog-stage-swap.test.tsx` plays with
// `offsetParent`: make the environment behave the way the browser does, or the test cannot tell
// the bug from the fix.

import { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DialogPanel } from '@/lib/use-dialog';

// jsdom reports offsetParent as null for everything; connected-means-visible, as in the D15 test.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    return this.isConnected ? document.body : null;
  },
});

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <DialogPanel label="a panel" onClose={() => setOpen(false)}>
          <button data-testid="first">first</button>
          <button data-testid="last">last</button>
        </DialogPanel>
      )}
    </div>
  );
}

describe('useDialog returns focus to the trigger, not to its own first item', () => {
  it('survives the effect running twice — StrictMode, and every developer’s dev server', () => {
    // SEED THE DEFECT: put `const previouslyFocused = document.activeElement` back inside the
    // effect body in lib/use-dialog.tsx -> RED here, with document.activeElement ending up on
    // <body>, which is the Chrome measurement quoted in the header reproduced exactly.
    const { getByTestId } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const trigger = getByTestId('trigger');
    trigger.focus();
    fireEvent.click(trigger);

    // Focus moved into the panel on open — the precondition for the bug, asserted so a future
    // change that stops moving focus in does not make this test pass for the wrong reason.
    expect(document.activeElement).toBe(getByTestId('first'));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('still restores when the effect runs once', () => {
    const { getByTestId } = render(<Harness />);
    const trigger = getByTestId('trigger');
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('does not steal focus back from somewhere the reader has since moved it', () => {
    // The guard this hook has always carried, kept honest while the capture changed around it: if
    // focus is no longer inside the panel when it closes, whatever has it keeps it.
    const { getByTestId } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const trigger = getByTestId('trigger');
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);

    trigger.focus();
    fireEvent.click(trigger);
    elsewhere.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
