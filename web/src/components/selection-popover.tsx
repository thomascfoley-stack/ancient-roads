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
  /** Phase 3 (bookmarks table) wires this; the button renders ONLY when provided. */
  onBookmark?: () => void;
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
  onBookmark,
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
        className={`h-7 w-7 shrink-0 rounded-full ${c.dot} ring-1 ring-white/20 transition-transform active:scale-90`}
      />
    ))
  ) : (
    <Link href="/auth/sign-in" className="shrink-0 px-1 text-xs font-semibold text-accent-300">
      Sign in to highlight
    </Link>
  );

  const divider = <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" aria-hidden />;

  const actionButtons = (
    <>
      {onAddNote && (
        <button
          onClick={onAddNote}
          title="Add note"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white"
        >
          ✎ Note
        </button>
      )}
      {onBookmark && (
        <button
          onClick={onBookmark}
          title="Bookmark"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white"
        >
          Bookmark
        </button>
      )}
      {onAsk && (
        <button
          onClick={onAsk}
          title="Ask Ancient Paths about this"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white"
        >
          Ask
        </button>
      )}
      {onOpenCommentaries && (
        <button
          onClick={onOpenCommentaries}
          title="Commentaries on this verse"
          className="shrink-0 rounded-full px-2 py-1 text-stone-200 hover:text-white"
        >
          &#10077;
        </button>
      )}
    </>
  );

  const copyChip = (mode: CopyMode, label: string) => (
    <button
      onClick={() => copy(mode)}
      className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-medium text-stone-300 hover:border-white/30 hover:text-white"
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
        <div className="w-max max-w-[560px] rounded-xl bg-stone-900/95 px-3 py-2.5 shadow-deep ring-1 ring-white/10 dark:bg-stone-800">
          <div className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-stone-400">{contextLabel}</div>
          <div className="flex items-center gap-2">
            {swatches}
            {divider}
            {actionButtons}
          </div>
          <div className="mt-2 flex items-center gap-1.5 px-0.5">
            {copyChip('styled', 'Copy styled')}
            {copyChip('lines', 'Copy lines')}
            {copyChip('text', 'Text only')}
          </div>
        </div>
      </div>

      {/* <md — the docked-low action bar (existing pattern): never fights the OS copy callout,
          sits above the mobile nav, scrolls horizontally when actions overflow 390px. */}
      <div
        className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:hidden"
        {...holdSelection}
      >
        <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full bg-stone-900/95 px-3 py-2 shadow-deep dark:bg-stone-800">
          <span className="shrink-0 px-1 text-xs font-medium text-stone-300">{contextLabel}</span>
          {swatches}
          {divider}
          {actionButtons}
          {divider}
          {copyChip('styled', 'Styled')}
          {copyChip('lines', 'Lines')}
          {copyChip('text', 'Text')}
        </div>
      </div>
    </>,
    document.body,
  );
}
