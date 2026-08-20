// @vitest-environment jsdom
//
// THE FLAKY HIGHLIGHTER: `useTextAnnotation` used to clear `pending` the INSTANT the selection
// collapsed or stopped resolving. Live measurement (2026-08, 60 cases on production) showed the
// popover can take >1s to mount under main-thread load, and any tap/scroll inside that window
// collapses the selection — so the popover vanished before it ever became tappable, and the
// feature felt random. The fix is a grace window (COLLAPSE_GRACE_MS): a collapse SCHEDULES the
// clear instead of performing it; a new valid selection replaces `pending` immediately and
// cancels the schedule; `dismiss()` still clears immediately.
//
// Tested against the REAL hook with a stubbed `window.getSelection` (the harness shape
// cross-verse-selection.test.tsx rejected for RANGE MATH is fine here — what is under test is the
// hook's own timer behaviour, and the control case below passes). Fake timers drive both the
// hook's 60ms selectionchange debounce and the grace window.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLLAPSE_GRACE_MS,
  useTextAnnotation,
  type ResolveTarget,
} from '@/lib/use-text-annotation';

const DEBOUNCE_MS = 60; // the hook's selectionchange debounce — advance past it after each event

const TEXT = 'For God so loved the world that he gave his only Son';

interface SelStub {
  isCollapsed: boolean;
  rangeCount: number;
  getRangeAt: (i: number) => Range;
  removeAllRanges: () => void;
}

let root: HTMLElement;
let textNode: Text;
let sel: SelStub | null;

/** The resolver verse-display.tsx writes inline, reduced to its contract: walk to the
 *  data-verse-text container. */
const resolveTarget: ResolveTarget = (node) => {
  const el = node instanceof Element ? node : node.parentElement;
  const c = el?.closest('[data-verse-text]') as HTMLElement | null;
  if (!c) return null;
  return { kind: 'verse', key: c.dataset.verseText!, textLen: (c.textContent ?? '').length, container: c };
};

function selectOffsets(start: number, end: number) {
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  // jsdom does not implement Range.getBoundingClientRect; the hook only reads it into the rect.
  range.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }) as DOMRect;
  sel = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range, removeAllRanges: () => { sel = null; } };
}

function collapse() {
  sel = { isCollapsed: true, rangeCount: 0, getRangeAt: () => { throw new Error('collapsed'); }, removeAllRanges: () => {} };
}

/** Deliver a selectionchange and run the hook's debounce, so `evaluate` has executed. */
function fireSelectionChange() {
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  root = document.createElement('div');
  const verse = document.createElement('span');
  verse.setAttribute('data-verse-text', '16');
  textNode = document.createTextNode(TEXT);
  verse.append(textNode);
  root.append(verse);
  document.body.append(root);
  sel = null;
  vi.stubGlobal('getSelection', () => sel);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const renderSelection = () =>
  renderHook(() => useTextAnnotation({ current: root }, resolveTarget));

describe('selection collapse grace — the flaky highlighter fix', () => {
  it('a collapse keeps `pending` for COLLAPSE_GRACE_MS, then clears it', () => {
    // SEED: restore `setPending(null)` on the collapse path in use-text-annotation.ts -> the
    // first assertion after the collapse goes RED (pending is already gone).
    const { result } = renderSelection();
    selectOffsets(4, 16); // "God so loved"
    fireSelectionChange();
    expect(result.current.pending).not.toBeNull();

    collapse();
    fireSelectionChange();
    // The instant clear is the defect: the popover may not have mounted yet.
    expect(result.current.pending, 'collapse cleared pending immediately').not.toBeNull();
    act(() => vi.advanceTimersByTime(COLLAPSE_GRACE_MS - 1));
    expect(result.current.pending, 'cleared before the grace window elapsed').not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.pending).toBeNull();
  });

  it('a new valid selection inside the grace window replaces pending and cancels the clear', () => {
    const { result } = renderSelection();
    selectOffsets(4, 16);
    fireSelectionChange();
    expect(result.current.pending?.start).toBe(4);

    collapse();
    fireSelectionChange();
    act(() => vi.advanceTimersByTime(500)); // inside the grace window

    selectOffsets(21, 26); // "world"
    fireSelectionChange();
    expect(result.current.pending?.start).toBe(21);
    expect(result.current.pending?.text).toBe('world');

    // Well past the ORIGINAL grace deadline: had the replacement not cancelled the scheduled
    // clear, pending would be gone now.
    act(() => vi.advanceTimersByTime(COLLAPSE_GRACE_MS + 1000));
    expect(result.current.pending?.start).toBe(21);
  });

  it('dismiss() clears immediately, inside the grace window, without waiting for the timer', () => {
    const { result } = renderSelection();
    selectOffsets(4, 16);
    fireSelectionChange();
    collapse();
    fireSelectionChange(); // grace is now scheduled; pending still showing

    act(() => result.current.dismiss());
    expect(result.current.pending, 'dismiss waited for the grace timer').toBeNull();
  });
});
