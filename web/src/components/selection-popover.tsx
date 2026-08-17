'use client';

// The Logos-style selection popover (Library Reader Phase 1; design §10.1) — built ONCE against
// useTextAnnotation's `pending` state and mounted by every reader (VerseDisplay now, WorkReader
// in Phase 2). Our skin, not a clone: the app's existing highlight palette, type, and dark-pill
// chrome. Two presentations of the same actions:
//   - md+ : a floating card near the selection — portal + collision-aware placement
//           (HIGHLIGHTER_POLISH §4): flip/shift, never clipped, repositions on scroll/resize,
//           Escape dismisses, outside interaction collapses the selection (which clears it).
//   - <md : the docked-low action bar (the existing pattern) so the popover never fights the
//           OS copy callout over the selection.
// The context label is `Author · Work · locus` shaped — NEVER a host URL.
// `onBookmark` is Phase 3 (bookmarks table): the button renders ONLY when a handler exists.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import {
  formatLines,
  formatStyledHtml,
  formatStyledText,
  formatTextOnly,
  type CopySource,
} from '@/lib/copy-format';
import { placePopover, type Placement } from '@/lib/popover-position';
import type { PendingAnnotation } from '@/lib/use-text-annotation';

type CopyMode = 'styled' | 'lines' | 'text';

export interface SelectionPopoverProps {
  pending: PendingAnnotation;
  /** `Author · Work · locus` (scripture: "John 3:16 · KJV") — NEVER a host URL. */
  contextLabel: string;
  /** Verse / line number for the "Copy lines" format. */
  copyLineNo?: string;
  signedIn: boolean;
  onHighlight?: (color: string) => void;
  onAddNote?: () => void;
  onAsk?: () => void;
  /** Single-word selections only, and only where original-language data exists — the caller
   *  decides both, so this component just renders the button when a handler arrives. */
  onDefine?: () => void;
  /** Phase 3 (bookmarks table) wires this; the button renders ONLY when provided. */
  onBookmark?: () => void;
  /** Whether the verse the popover is raised on is ALREADY bookmarked. Drives the label: the
   *  handler has always been a toggle, so removal existed and was invisible (B023). */
  bookmarked?: boolean;
  onOpenCommentaries?: () => void;
  onDismiss: () => void;
}

export function SelectionPopover({
  pending,
  contextLabel,
  copyLineNo,
  signedIn,
  onHighlight,
  onAddNote,
  onAsk,
  onDefine,
  onBookmark,
  bookmarked = false,
  onOpenCommentaries,
  onDismiss,
}: SelectionPopoverProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const [copied, setCopied] = useState<CopyMode | null>(null);

  // Place the floating card next to the LIVE selection rect (fall back to the rect captured at
  // evaluation time), collision-aware. Re-run on scroll (capture: any container) and resize.
  const reposition = useCallback(() => {
    const card = cardRef.current;
    if (!card || card.offsetWidth === 0) return; // display:none on mobile — the bar handles it
    const sel = window.getSelection();
    const live =
      sel && !sel.isCollapsed && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const anchor = live ?? pending.rect;
    if (!anchor) return;
    // The selection scrolled fully out of view — hide the card until it comes back
    // (a floating toolbar with no visible anchor is noise, not help).
    if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
      setPos(null);
      return;
    }
    setPos(
      placePopover(
        anchor,
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [pending]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  useEffect(() => {
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [reposition]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const copy = useCallback(
    async (mode: CopyMode) => {
      const src: CopySource = { text: pending.text, label: contextLabel, lineNo: copyLineNo };
      const plain =
        mode === 'text' ? formatTextOnly(src) : mode === 'lines' ? formatLines(src) : formatStyledText(src);
      try {
        if (mode === 'styled' && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': new Blob([plain], { type: 'text/plain' }),
              'text/html': new Blob([formatStyledHtml(src)], { type: 'text/html' }),
            }),
          ]);
        } else {
          await navigator.clipboard.writeText(plain);
        }
        setCopied(mode);
        setTimeout(() => setCopied(null), 1400);
      } catch {
        // Clipboard permission denied — the native selection stays live for a manual copy.
        setCopied(null);
      }
    },
    [pending, contextLabel, copyLineNo],
  );

  if (typeof document === 'undefined') return null;

  // Keep the selection alive: a press on either surface must not clear it before we read it.
  const holdSelection = {
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
  };

  const swatches = signedIn && onHighlight ? (
    HIGHLIGHT_COLORS.map((c) => (
      <button
        key={c.id}
        onClick={() => onHighlight(c.id)}
        aria-label={`Highlight ${c.id}`}
        // PRD §5: 28px circles with a 1px ink-wash border — the one place rounded-full stays.
        className={`h-7 w-7 shrink-0 rounded-full border border-stone-500 ${c.dot}`}
      />
    ))
  ) : (
    <Link href="/auth/sign-in" className="shrink-0 px-1 text-xs font-semibold text-accent-300 dark:text-accent-700">
      Sign in to highlight
    </Link>
  );

  const divider = <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15 dark:bg-stone-900/20" aria-hidden />;

  // The pill is night-surface in light mode and INVERTED to parchment in dark (PRD §8), so
  // every control on it carries both palettes: stone-200→white text on the dark pill,
  // stone-700→stone-900 on the parchment one.
  const actionButtons = (
    <>
      {onDefine && (
        <button
          onClick={onDefine}
          title="Greek or Hebrew behind this word"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          Define
        </button>
      )}
      {onAddNote && (
        <button
          onClick={onAddNote}
          title="Add note"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          ✎ Note
        </button>
      )}
      {/* The label follows the STATE. `onToggleBookmark` has always toggled, so a second press
          already removed the bookmark — but the button read "Bookmark" either way, so removal
          existed and no reader could know it (B023, 2026-08-17 authenticated QA). Bookmarked
          verses already carry a visible flag (verse-display.tsx:341); this is the other half. */}
      {onBookmark && (
        <button
          onClick={onBookmark}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          {bookmarked ? 'Remove bookmark' : 'Bookmark'}
        </button>
      )}
      {onAsk && (
        <button
          onClick={onAsk}
          title="Ask Ancient Paths about this"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          Ask
        </button>
      )}
      {onOpenCommentaries && (
        <button
          onClick={onOpenCommentaries}
          title="Commentaries on this verse"
          className="shrink-0 rounded-full px-2 py-1 text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          &#10077;
        </button>
      )}
    </>
  );

  const copyChip = (mode: CopyMode, label: string) => (
    <button
      onClick={() => copy(mode)}
      className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-micro font-medium text-stone-300 hover:border-white/30 hover:text-white dark:border-stone-900/25 dark:text-stone-600 dark:hover:border-stone-900/40 dark:hover:text-stone-900"
    >
      {copied === mode ? 'Copied ✓' : label}
    </button>
  );

  return createPortal(
    <>
      {/* md+ — floating card near the selection, collision-aware, portal-mounted. */}
      <div
        ref={cardRef}
        role="toolbar"
        aria-label="Annotate selection"
        className="fixed z-50 hidden md:block"
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
        {...holdSelection}
      >
        {/* PRD §5/§8: night surface, 1px night-hairline border, NO shadow, 150ms fade.
            Dark mode inverts it to parchment with a dark border. NOT rounded-full: the PRD's
            "pill" is the mockup's ONE-ROW toolbar (the mobile bar below keeps it); this desktop
            card stacks label/swatches/actions/copy, and rounded-full on a multi-row box renders
            an ellipse that clips its own corners (measured: 168x131 signed-out). Square corners
            per the global radius-0 rule. */}
        <div className="w-max max-w-[420px] animate-[fade-in_150ms_var(--ease-gentle)] border border-stone-800 bg-stone-950 px-4 py-2.5 dark:border-stone-900 dark:bg-stone-50">
          {/* AA on both skins: ink-wash (stone-500) fails 4.5:1 at 11px on the dark pill, so
              the label lightens to stone-400 there; on parchment in dark mode ink-wash passes. */}
          <div className="px-1 pb-1.5 font-sans text-micro font-medium small-caps tracking-[0.08em] text-stone-400 dark:text-stone-500">{contextLabel}</div>
          {/* SWATCHES ON THEIR OWN ROW, WRAPPING. Ten colours (highlight-colors.ts) at 28px each
              plus gaps run ~350px — comfortably inside this card on their own, but every child
              here is `shrink-0` and the row never wrapped, so sharing a line with Note/Bookmark/
              Ask/the commentaries button pushed the total past `max-w` and the overflow rendered
              OUTSIDE the opaque card, on the page background: readable-looking text that was
              actually unstyled and, for anything wide enough, unclickable. `flex-wrap` means a
              narrower card (a `pending.rect` near a screen edge, per `popover-position.ts`) still
              shows every colour, wrapped to a second line, rather than clipping silently. */}
          <div className="flex flex-wrap items-center gap-2">{swatches}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actionButtons}
          </div>
          {/* ONE copy action. Three chips ("Copy styled" / "Copy lines" / "Text only") made the
              reader choose a clipboard format before they had copied anything, which is a
              preference, not a decision worth a third of the toolbar. `styled` is the one that
              carries the attribution, and an unattributed quote is the failure this product
              exists to prevent, so it is the only sensible default. */}
          <div className="mt-2 flex items-center gap-1.5 px-0.5">{copyChip('styled', 'Copy')}</div>
        </div>
      </div>

      {/* <md — the docked-low action bar (existing pattern): never fights the OS copy callout,
          sits above the mobile nav, scrolls horizontally when actions overflow 390px. */}
      <div
        className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:hidden"
        {...holdSelection}
      >
        <div className="flex max-w-full animate-[fade-in_150ms_var(--ease-gentle)] items-center gap-2 overflow-x-auto rounded-full border border-stone-800 bg-stone-950 px-3 py-2 dark:border-stone-900 dark:bg-stone-50">
          <span className="shrink-0 px-1 font-sans text-xs font-medium text-stone-300 dark:text-stone-600">{contextLabel}</span>
          {swatches}
          {divider}
          {actionButtons}
          {divider}
          {copyChip('styled', 'Copy')}
        </div>
      </div>
    </>,
    document.body,
  );
}
