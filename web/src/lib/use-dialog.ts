'use client';

import { useEffect, useRef } from 'react';

// The dialog contract, in one place.
//
// The app had thirteen sheets, drawers and popovers and NOT ONE of them trapped focus,
// restored focus to the trigger on close, or carried `role="dialog"` with a name. Four
// (the mobile menu sheet, the book picker, the word-study entry sheet, the reader
// popovers) had no Escape handler either, so on a keyboard the only way out of them was
// to tab blindly through the page behind. Every one of them renders after the page
// content, so Tab walked straight out of the open sheet and into the document beneath it
// while the scrim still covered the screen.
//
// Written as a hook rather than a <Dialog> component on purpose: these thirteen have
// genuinely different chrome (bottom sheets with drag handles, a full-bleed picker, an
// anchored popover) and wrapping them all would mean rewriting layout that already works.
// This adds behaviour and leaves the markup alone.
//
// Escape is bound in the CAPTURE phase so a sheet opened over another surface closes
// itself first, and `stopPropagation` keeps one Escape from closing two things.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleFocusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // offsetParent is null for display:none. Sheets keep both a mobile and a desktop
    // variant mounted in a few places, so the hidden one must not capture the tab ring.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Makes an overlay behave like a dialog: focus moves in on open, Tab cycles inside it,
 * Escape closes it, and focus returns to whatever opened it.
 *
 * Spread `dialogProps` on the panel (not the scrim) and attach `ref` to the same element.
 */
export function useDialog(onClose: () => void, label: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    // Captured BEFORE focus moves, so it is the trigger rather than the sheet.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (node) {
      const first = visibleFocusable(node)[0];
      // Fall back to the panel itself (tabIndex -1) so focus is never left on the page
      // behind a sheet that happens to contain no controls.
      (first ?? node).focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = visibleFocusable(node);
      if (items.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const inside = node.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only restore if focus is still inside the sheet (or nowhere). If the reader has
      // already clicked something else, stealing it back would be worse than not restoring.
      const active = document.activeElement;
      if (!active || active === document.body || ref.current?.contains(active)) {
        previouslyFocused?.focus?.({ preventScroll: true });
      }
    };
  }, []);

  return {
    ref,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-label': label,
      tabIndex: -1,
    },
  };
}
