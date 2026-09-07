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
  // What to give focus back to. A REF, not a local, because an effect can run more than once on
  // one mount and this must be captured only the first time.
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    // Captured BEFORE focus moves, so it is the trigger rather than the sheet — and captured ONCE.
    //
    // It used to be a plain `const previouslyFocused = document.activeElement` read on every run of
    // this effect, and React StrictMode runs an effect twice on purpose (mount, tear down, mount)
    // — which Next.js turns on by default, so it is what `next dev` does on every page. By the
    // second run focus is already INSIDE this panel, because the first run put it there, so the
    // capture picked up one of the panel's own buttons. Closing then handed focus to an element
    // being removed in the same commit and the reader landed on <body>.
    //
    // Measured, not reasoned about: Chrome at 375px on the reader's translation dropdown
    // (2026-09-06). Patching HTMLElement.prototype.focus for the length of the Escape logged one
    // call, `BUTTON:World English BibleWEB connected=false` — the first translation in the list,
    // already detached, rather than the WEB trigger. Red-proved in
    // test/components/use-dialog-focus-restore.test.tsx.
    //
    // Re-reading is still right when focus has genuinely moved OUTSIDE the panel between runs;
    // what must never happen is re-capturing an element this hook focused itself.
    if (restoreTo.current === null || !node?.contains(document.activeElement)) {
      restoreTo.current = document.activeElement as HTMLElement | null;
    }

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
      // D15 (DEEP_SWEEP, P2): this used the `node` captured when the effect ran. BookPicker
      // renders TWO mutually exclusive stages — pick a multi-chapter book and the panel div is
      // REPLACED — so the closure held a detached element. visibleFocusable() on a detached node
      // returns [] (offsetParent null), which took the branch below and called focus() on
      // nothing: every Tab was swallowed and the chapter cells, the jump input and Close were all
      // unreachable by keyboard. Escape alone worked. The ref OBJECT updated the whole time; the
      // closure never did. Read it live instead — every other consumer renders one stable panel,
      // which is why only BookPicker ever tripped it.
      const panel = ref.current;
      if (e.key !== 'Tab' || !panel) return;
      const items = visibleFocusable(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const inside = panel.contains(active);
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
        restoreTo.current?.focus?.({ preventScroll: true });
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

/**
 * The panel element, wired to `useDialog`, as a component.
 *
 * `useDialog`'s effect is deps-[] on purpose — it means "on open". A parent that renders its
 * overlay conditionally (`if (!open) return null`) cannot call the hook itself without the effect
 * firing at page load instead, so overlays like the omnibox and the verse-ref sheet went without
 * a trap rather than restructure (DEEP_SWEEP D39, D40). Mounting the panel through THIS component
 * gets the semantics, focus-in, trap and restore with no prop threading: the children stay exactly
 * where they were, closing over the parent's state as before.
 */
export function DialogPanel(
  { label, onClose, className, children }:
  { label: string; onClose: () => void; className?: string; children: React.ReactNode },
) {
  const { ref, dialogProps } = useDialog(onClose, label);
  return (
    <div ref={ref} {...dialogProps} className={className}>
      {children}
    </div>
  );
}
