// @vitest-environment jsdom
// D15 (DEEP_SWEEP, P2) — BookPicker's chapter stage was a KEYBOARD TRAP.
//
// useDialog's effect runs once (deps []) and captures `const node = ref.current` — the book-stage
// div. Pick any multi-chapter book and the component renders a DIFFERENT div for the chapter
// stage, but the keydown closure still holds the old, now-detached node. visibleFocusable() on a
// detached element returns [] (offsetParent is null), so the handler takes its
// `e.preventDefault(); node.focus()` branch on EVERY Tab — and focus() on a detached element does
// nothing. Keyboard users could not reach a single chapter cell, the jump input, or Close.
// Only Escape worked.
//
// The ref OBJECT updates; the closure never does. That is the whole bug, and no guard elsewhere
// can see it.
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useDialog } from '@/lib/use-dialog';

// jsdom reports offsetParent as null for EVERY element, so useDialog's visibility filter
// (`el.offsetParent !== null || el === document.activeElement`) would treat an attached panel and
// a detached one identically — and the test could not tell the bug from the fix. Emulate the real
// semantics: connected elements are visible, detached ones are not. That distinction IS the bug.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) { return this.isConnected ? document.body : null; },
});

/** Two mutually exclusive stages behind ONE useDialog — BookPicker's shape.
 *
 *  The distinct `key`s are load-bearing: without them React reconciles the two returns as the
 *  SAME div and updates its children in place, so ref.current never changes and the bug does not
 *  reproduce. A first version of this test omitted them and passed against the UNFIXED hook — a
 *  test that proved nothing. BookPicker's real stages differ enough to remount; the keys make
 *  that explicit here rather than depending on it. */
function TwoStage() {
  const [stage, setStage] = useState<'a' | 'b'>('a');
  const { ref, dialogProps } = useDialog(() => {}, 'test dialog');
  return stage === 'a' ? (
    <div key="a" ref={ref} {...dialogProps}>
      <button onClick={() => setStage('b')}>to stage b</button>
    </div>
  ) : (
    <div key="b" ref={ref} {...dialogProps}>
      <button data-testid="first">chapter 1</button>
      <button data-testid="last">chapter 2</button>
    </div>
  );
}

describe('D15 — useDialog follows a stage swap', () => {
  it('Tab reaches the SECOND stage’s controls after the panel node is replaced', () => {
    const { getByText, getByTestId } = render(<TwoStage />);
    fireEvent.click(getByText('to stage b'));

    const first = getByTestId('first');
    const last = getByTestId('last');
    // jsdom reports offsetParent null for everything, so drive the wrap explicitly: focus the
    // LAST control and Tab — a working trap wraps to the first control of the CURRENT panel.
    last.focus();
    expect(document.activeElement, 'focus should be inside the new stage').toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(
      document.activeElement,
      'with the stale captured node the handler no-ops and focus never moves into the new stage',
    ).toBe(first);
  });
});
