// @vitest-environment jsdom

// EVERY CLOSE BUTTON INSIDE A DRAG HANDLE WAS DEAD — reported by the owner, 2026-08-02.
//
// `useDragDismiss` called `setPointerCapture` on the element carrying `handleProps`. Pointer
// capture retargets every subsequent pointer event, `pointerup` included, to the capture element.
// The browser derives the click target from where pointerdown and pointerup landed, so with the
// header capturing, the click resolved to the HEADER and never to the button inside it. Four
// sheets spread `handleProps` onto a header that contains their X: study-panel, work-toc,
// mobile-nav, and the word-study sheet. All four X buttons did nothing, in every browser.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. It cannot reproduce the bug. jsdom does not implement
// pointer capture at all, let alone its retargeting rules, so a jsdom click on the X fired
// normally BOTH BEFORE AND AFTER the fix — a test asserting "the X closes the sheet" here would
// have passed against the broken code and proved nothing. That is the false-green this repo keeps
// finding, so it is not what is asserted below.
//
// What is checkable without a browser is the guard itself: a pointerdown that originates on a
// control must not begin a drag and must not capture the pointer, while one on the header's own
// surface still must. That is a property of our code, not of the DOM. The browser-level proof is
// the live verification recorded in the WORKLOG for this change: X clicked, sheet closed, and
// drag-to-dismiss re-confirmed working on the same build.
//
// The second test is the one that matters over time: it DERIVES the set of files that spread
// `handleProps`, rather than listing the four known today, because a fifth sheet added later would
// reintroduce the bug and a hand-typed list is the failure mode this repo has logged eleven times.

import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDragDismiss } from '@/lib/use-drag-dismiss';

const capture = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  capture.mockClear();
  // jsdom implements neither; the hook calls setPointerCapture unconditionally on the drag path.
  (Element.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
  (Element.prototype as unknown as { releasePointerCapture: unknown }).releasePointerCapture = vi.fn();
});

function Sheet({ onDismiss }: { onDismiss: () => void }) {
  const drag = useDragDismiss(onDismiss);
  return (
    <div style={drag.style}>
      <div data-testid="header" {...drag.handleProps}>
        <span data-testid="title">John 3:3</span>
        <button data-testid="close" aria-label="Close" onClick={onDismiss}>
          x
        </button>
      </div>
    </div>
  );
}

/** React listens for the native event; jsdom has no PointerEvent constructor, and MouseEvent
 *  carries the clientX/clientY the hook reads. */
function pointerDownOn(el: Element) {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
}

describe('a press that starts on a control does not become a sheet drag', () => {
  it('does not capture the pointer when the press starts on the close button', () => {
    const { getByTestId } = render(<Sheet onDismiss={() => {}} />);
    pointerDownOn(getByTestId('close'));
    // Red-proof: delete the `closest(...)` guard in use-drag-dismiss.ts and this goes to 1.
    expect(capture).not.toHaveBeenCalled();
  });

  it('still captures the pointer when the press starts on the header itself', () => {
    const { getByTestId } = render(<Sheet onDismiss={() => {}} />);
    pointerDownOn(getByTestId('header'));
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('still captures when the press starts on inert content inside the header', () => {
    const { getByTestId } = render(<Sheet onDismiss={() => {}} />);
    pointerDownOn(getByTestId('title'));
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('no sheet spreads handleProps onto a container holding a control without the guard', () => {
  const WEB_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
    });
  }

  it('derives the call sites and confirms the guard is the shared one', () => {
    const callSites = walk(WEB_SRC).filter((f) => readFileSync(f, 'utf8').includes('handleProps'));
    // Not a hand-typed list: whatever spreads handleProps today is what gets checked. A fifth
    // sheet added next month is covered without editing this test.
    const consumers = callSites.filter((f) => !f.endsWith('use-drag-dismiss.ts'));
    expect(consumers.length).toBeGreaterThan(0);

    // The guard must live in the hook, not be re-implemented per sheet. If a consumer ever stops
    // routing through useDragDismiss, this is the line that notices.
    for (const f of consumers) {
      expect(readFileSync(f, 'utf8')).toContain('useDragDismiss');
    }
    const hook = readFileSync(path.join(WEB_SRC, 'lib/use-drag-dismiss.ts'), 'utf8');
    expect(hook).toMatch(/closest\(['"].*button/);
  });
});
