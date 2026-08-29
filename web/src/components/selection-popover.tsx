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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import { SaveToStudy, type ClipRef } from './save-to-study';
import {
  formatLines,
  formatStyledHtml,
  formatStyledText,
  formatTextOnly,
  type CopySource,
} from '@/lib/copy-format';
import { placePopover, type Placement } from '@/lib/popover-position';
import type { PendingAnnotation } from '@/lib/use-text-annotation';
import type { DefineResolution, EnglishMatch } from '@/lib/original';
import { DISPLAY_LOCALE } from '@/lib/locale';

type CopyMode = 'styled' | 'lines' | 'text';

/** Mirror of `CLIP_REFERENCE_MAX` in `@/lib/studies.ts` — that module is server-only (it imports
 *  the db layer), so the bound is restated here rather than pulled into a client bundle, exactly
 *  as `save-to-study.tsx` restates `STUDY_TITLE_MAX`. Over-long references are CLAMPED rather
 *  than posted: a work's `heading` is free text from ingest, and an unclamped label turns a
 *  working affordance into a 400 on precisely the works with long headings. */
const CLIP_REFERENCE_MAX = 300;
/** B030: the selected text, used only to LOCATE a paragraph server-side. Mirrors the route's
 *  500-char cap so an over-long drag is trimmed at the source rather than 400'd at the edge. */
const CLIP_MATCH_HINT_MAX = 500;

/**
 * `SaveToStudy` is authored for the app's ordinary surfaces — stone-500 ink on a parchment page,
 * which is what /ask gives it. This pill is INVERTED (night surface in light mode, parchment in
 * dark, PRD §8), so the component's own palette lands wrong on both. Restated here as
 * child-scoped overrides rather than by editing `save-to-study.tsx`: that component's colours are
 * correct where it already ships, and this file's standing rule is that every control on the pill
 * carries both palettes.
 *
 * `[role=status]` / `[role=alert]` rather than a blanket `p`, so the ERROR notice keeps being red
 * instead of being flattened into the same ink as the success toast.
 *
 * THE TOAST'S CHILDREN ARE LISTED SEPARATELY, and they are not padding: colouring the `<p>` alone
 * leaves `Saved to <study>.` on its own `text-stone-700` (#44403c on the #0c0a09 pill — ~1.9:1)
 * and `Change?` on `text-accent-700`, because both carry their own class and a rule aimed at the
 * paragraph never reaches them. The one CONFIRMATION the primary path produces would have been
 * the least readable text in the component. Found by compiling the stylesheet and reading the
 * emitted selectors, not by looking at the JSX.
 *
 * The accent flip (300 on the night pill, 700 on the parchment one) is this file's existing
 * idiom — the same pair the "Sign in to highlight" link already uses, inverted for the same
 * reason. The picker panel is NOT overridden: it paints its own `bg-stone-50 dark:bg-stone-950`
 * surface, so its authored colours are already correct on it, and `[&>button]` is direct-child
 * scoped so it cannot leak into the picker's rows.
 */
const SAVE_ON_PILL = [
  '[&>button]:text-stone-200 [&>button]:hover:text-white',
  'dark:[&>button]:text-stone-700 dark:[&>button]:hover:text-stone-900',
  '[&_[role=status]]:text-stone-300 dark:[&_[role=status]]:text-stone-600',
  '[&_[role=status]_span]:text-stone-100 dark:[&_[role=status]_span]:text-stone-800',
  '[&_[role=status]_button]:text-accent-300 dark:[&_[role=status]_button]:text-accent-700',
  '[&_[role=alert]]:text-red-300 dark:[&_[role=alert]]:text-red-800',
].join(' ');

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
  /** OPTION A (ruling 2026-08-21): the original word(s) behind a single-word selection, shown
   *  as the answer itself — the "Define" verb this replaced hid the feature behind the one
   *  label that didn't say what it does. The caller resolves (single word + interlinear loaded)
   *  and hands DATA; this component only renders it. 1 match = the word row; several = every
   *  candidate (never a guess — original.ts's standing rule); 0 = the quiet word-study line.
   *  Absent = a phrase selection or no data: nothing renders, exactly as before. */
  define?: DefineResolution | null;
  /** Open the full entry for one candidate. */
  onPickDefine?: (m: EnglishMatch) => void;
  /** Option C's door: open the verse's Word study carrying the selection (compare / no-match). */
  onOpenWordStudy?: () => void;
  /** Phase 3 (bookmarks table) wires this; the button renders ONLY when provided. */
  onBookmark?: () => void;
  /** Whether the verse the popover is raised on is ALREADY bookmarked. Drives the label: the
   *  handler has always been a toggle, so removal existed and was invisible (B023). */
  bookmarked?: boolean;
  /** Whether the verse the popover is raised on already carries a highlight. */
  highlighted?: boolean;
  /** Clears the highlight on that verse. Absent on surfaces that cannot clear — the control is
   *  not rendered then, rather than rendered as a no-op (B046). */
  onClearHighlight?: () => void;
  onOpenCommentaries?: () => void;
  /**
   * ADD TO STUDY — a clipping REFERENCE for the selected passage, never its text.
   *
   * The route states the rule (`api/studies/[id]/blocks/route.ts:25`) and enforces it before any
   * branch runs (:116, `quote`/`attribution` → 400): a clipping carries `sectionId`, `sourceId`
   * or `slug`. The TABLE says it one layer down — `110_studies.sql:90`,
   * `CHECK ( kind <> 'clipping' OR (source_id IS NOT NULL OR section_id IS NOT NULL) )` — so a
   * clipping that is not a corpus key cannot be stored at all. The server snapshots the bytes
   * itself, inside the licensing gate of the same INSERT…SELECT (F3/S-1).
   *
   * WHICH IS WHY THIS IS OPTIONAL, AND WHY ITS ABSENCE IS NOT AN OVERSIGHT. The Book Reader has a
   * key for every section it renders (`WorkSectionRow.id` IS `sections.id`), so it passes one.
   * The BIBLE READER HAS NONE: `/read` serves verse text from a static asset
   * (`web/public/bible/{translation}/{book}.json`, built by `src/ingest/consolidate-bibles.ts`)
   * and its commentary from another (`/commentaries/{book}/{chapter}.json`, whose entries carry
   * author/verse range and no id at all). Neither is a `sections` row and neither has an
   * embeddings key, so there is nothing to reference — and no text-carrying path to fall back on,
   * by design. `verse-display.tsx` therefore passes no clip and the control does not render,
   * because a control that can only 400 is worse than no control. Closing that gap is a
   * migration + route change (a scripture reference the table can hold), not a client change.
   */
  clip?: ClipRef;
  /** Title for the "New study" the picker offers when there is nothing to save to yet. Falls
   *  back to `contextLabel`, which is already `Author · Work · locus` shaped. */
  clipTitle?: string;
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
  define,
  onPickDefine,
  onOpenWordStudy,
  onBookmark,
  bookmarked = false,
  highlighted = false,
  onClearHighlight,
  onOpenCommentaries,
  clip,
  clipTitle,
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
      // F-143 — a selection spanning multiple verses must copy ALL of it. `pending.text` is the
      // FIRST verse's canonical substring (useTextAnnotation resolves only the start container);
      // the live selection's toString() carries every verse. Use whichever is longer — the live
      // selection is empty after a programmatic raise (tap mode), so pending.text wins there.
      const liveText = window.getSelection()?.toString().trim() ?? '';
      const text = liveText.length > pending.text.length ? liveText : pending.text;
      const src: CopySource = { text, label: contextLabel, lineNo: copyLineNo };
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

  // Clamped ONCE, here, so every surface gets the bound rather than each caller remembering it —
  // and memoised because `SaveToStudy` keys a `useCallback` off this object's identity.
  const clampedClip = useMemo<ClipRef | undefined>(() => {
    if (!clip) return undefined;
    const reference = clip.reference?.slice(0, CLIP_REFERENCE_MAX);
    // B030: clamped HERE for the same reason the reference is — one bound, not one per caller.
    // The route caps it again at 500; this keeps a long drag-selection from being sent at all.
    const matchHint = clip.matchHint?.slice(0, CLIP_MATCH_HINT_MAX);
    // Rebuilt per branch rather than spread: `ClipRef` is a union of two exclusive shapes, and a
    // spread would let a stray `sourceId` ride along beside a `sectionId` — which the route
    // rejects ("send exactly one of sectionId (reader) or sourceId (ask)").
    return 'sectionId' in clip
      ? { sectionId: clip.sectionId, reference, matchHint }
      : { sourceId: clip.sourceId, reference };
  }, [clip]);

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

  // THE ONE CANONICAL SAVE-TO-STUDY VERB, not a second implementation of it. Targeting is
  // already solved — a stored last target, the picker as the second tap, "Change?" to move the
  // block (E7, "always auto-save, never ask") — and solving it again here would give the reader
  // a different answer to "which study?" than /ask gives, for the same user, on the same device.
  //
  // Gated on `signedIn` like the highlight/bookmark/clear controls beside it: the POST 401s for a
  // signed-out reader, and this file's standing rule is that a control which appears to work and
  // silently does not is worse than an absent one.
  const saveToStudy =
    signedIn && clampedClip ? (
      <SaveToStudy clip={clampedClip} contextTitle={clipTitle ?? contextLabel} className={`shrink-0 ${SAVE_ON_PILL}`} />
    ) : null;

  // OPTION A — the original word(s) behind the selection, rendered as the answer (the row this
  // replaced was a "Define" text button whose label hid the feature). Inverted like everything
  // on this surface: light text on the night card, ink on the parchment one. The rows never
  // guess: one confident match, every candidate, or the honest zero line (original.ts:128-138).
  const langName = define ? (define.lang === 'hebrew' ? 'Hebrew' : 'Greek') : '';
  const defineRow = (m: EnglishMatch, showCount: boolean) => (
    <button
      key={m.index}
      onClick={() => onPickDefine?.(m)}
      className="flex w-full items-center gap-2.5 border border-white/15 px-2.5 py-1.5 text-left hover:border-white/30 dark:border-stone-900/25 dark:hover:border-stone-900/40"
    >
      <span
        dir={define!.lang === 'hebrew' ? 'rtl' : 'ltr'}
        lang={define!.lang === 'hebrew' ? 'he' : 'el'}
        className="shrink-0 font-scripture text-lg leading-none text-stone-100 dark:text-stone-900"
      >
        {m.word.w}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-stone-300 dark:text-stone-600">
          <i>{m.word.tr}</i>
          {m.word.g ? ` — ${m.word.g}` : ''}
        </span>
        {showCount && define!.count !== undefined && (
          <span className="block text-micro text-stone-400 dark:text-stone-500">
            Appears in {define!.count.toLocaleString(DISPLAY_LOCALE)} verses
          </span>
        )}
      </span>
      {m.word.s && (
        <span className="shrink-0 border border-white/15 px-1.5 py-0.5 text-micro font-semibold text-stone-300 dark:border-stone-900/25 dark:text-stone-600">
          {m.word.s}
        </span>
      )}
      <span aria-hidden className="shrink-0 text-accent-300 dark:text-accent-700">&rarr;</span>
    </button>
  );
  const defineBlock = define ? (
    <div className="flex w-full flex-col gap-1.5">
      {define.matches.length > 1 && (
        <span className="px-0.5 text-micro text-stone-400 dark:text-stone-500">
          {define.matches.length} {langName} words in this verse can stand behind &ldquo;{define.english}&rdquo; — tap one:
        </span>
      )}
      {define.matches.map((m) => defineRow(m, define.matches.length === 1))}
      {define.matches.length > 1 && onOpenWordStudy && (
        <button
          onClick={onOpenWordStudy}
          className="self-start px-0.5 text-micro text-accent-300 underline hover:text-accent-200 dark:text-accent-700 dark:hover:text-accent-800"
        >
          compare in word study &rarr;
        </button>
      )}
      {define.matches.length === 0 && onOpenWordStudy && (
        <button
          onClick={onOpenWordStudy}
          className="self-start px-0.5 text-xs text-stone-300 underline hover:text-white dark:text-stone-600 dark:hover:text-stone-900"
        >
          No {langName} match — open the verse&rsquo;s word study &rarr;
        </button>
      )}
      {define.lexiconDown && define.matches.length > 0 && (
        <span className="px-0.5 text-micro text-stone-400 dark:text-stone-500">
          (dictionary unavailable — matched on glosses alone)
        </span>
      )}
    </div>
  ) : null;

  // The pill is night-surface in light mode and INVERTED to parchment in dark (PRD §8), so
  // every control on it carries both palettes: stone-200→white text on the dark pill,
  // stone-700→stone-900 on the parchment one.
  const actionButtons = (
    <>
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
      {/* B024 — Bookmark sits BEFORE the conditional Remove-highlight, not after it. On the
          mobile bar this group is what the first 390px viewport shows, and Remove-highlight is
          the group's widest optional control (~112px measured): rendered first, it pushed
          Bookmark back off-screen on exactly the verses that carry a highlight. On the desktop
          card the group wraps, so the order costs nothing there. */}
      {onBookmark && (
        <button
          onClick={onBookmark}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          {bookmarked ? 'Remove bookmark' : 'Bookmark'}
        </button>
      )}
      {/* B046 — removal was never missing: `study-panel.tsx` clears a highlight whenever the verse
          carries a colour. It lived on a DIFFERENT SURFACE from creation, so a reader who
          highlighted from this popover had no route back. Conditional on the verse actually
          carrying one: an always-present "Remove highlight" would be worse than none. */}
      {highlighted && onClearHighlight && (
        <button
          onClick={onClearHighlight}
          title="Remove highlight"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-stone-200 hover:text-white dark:text-stone-700 dark:hover:text-stone-900"
        >
          Remove highlight
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
          {/* Option A sits between the swatches and the verbs: it is content about the
              selection, not an action on it. */}
          {defineBlock && <div className="mt-2">{defineBlock}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actionButtons}
          </div>
          {/* ONE copy action. Three chips ("Copy styled" / "Copy lines" / "Text only") made the
              reader choose a clipboard format before they had copied anything, which is a
              preference, not a decision worth a third of the toolbar. `styled` is the one that
              carries the attribution, and an unattributed quote is the failure this product
              exists to prevent, so it is the only sensible default. */}
          {/* Save sits beside Copy rather than in the action row above: both are "take this
              passage away with you" verbs, where the row above is "mark up what is in front of
              me". The card has no `overflow` clip, so the picker and the toast that open from
              here escape it normally. */}
          <div className="mt-2 flex items-center gap-1.5 px-0.5">
            {copyChip('styled', 'Copy')}
            {saveToStudy}
          </div>
        </div>
      </div>

      {/* <md — the docked-low action bar (existing pattern): never fights the OS copy callout,
          sits above the mobile nav, scrolls horizontally when actions overflow 390px. */}
      {/* B024 — ACTIONS BEFORE THE SWATCH RUN, and the label capped. The old order (label ->
          ten 28px swatches -> actions) put Bookmark at 538–607px in a 365px visible window
          (measured at a 390px viewport, Source Sans 3 loaded — harness numbers, not estimates),
          behind an `overflow-x-auto` that shows no scrollbar on a rounded pill: hidden with
          nothing saying the bar scrolls. Actions-first flips who overflows, and the swatches are
          the right thing to overflow twice over — they are ten variants of ONE feature, so the
          cut-off circle at the right edge both still says "highlight colours here" AND is the
          scroll affordance the bar lacked. Measured after the reorder: Note/Bookmark/Ask/❝ all
          inside the first viewport (Bookmark 166–234px), swatch #2 cut mid-circle at the edge.
          The 96px label cap is load-bearing, not taste: "Song of Solomon 1:1 · KJV" runs 139.5px,
          and with Define present and the "Remove bookmark" label (112px) the toggle ended 24.5px
          off-screen — capped, it ends at 346px with 19px to spare in that worst case. The full
          locus still travels with every copy (copy-format.ts); this trims only the bar's echo of
          it. Desktop card untouched: its rows wrap, so nothing there ever overflowed. */}
      <div
        className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-1.5 px-3 md:hidden"
        {...holdSelection}
      >
        {/* SAVE RIDES ABOVE THE PILL, OUTSIDE IT — not fastidiousness, two hard constraints.
            (1) The pill is `overflow-x-auto`, and a box with `overflow-x: auto` and
            `overflow-y: visible` has its used `overflow-y` computed to `auto` as well: the
            picker AND the "Saved to <study>." toast would both be clipped by the pill they
            opened from, so the primary path's only confirmation would be invisible. That is the
            same class of defect as B024 (a control hidden behind this bar's own overflow), which
            is why it is not being repeated one row down.
            (2) The picker opens downward (`absolute … mt-1`, save-to-study.tsx) — from above the
            pill it lands over the toolbar and the nav rather than off the bottom of the screen.
            It out-paints both: `z-20` inside this `z-40` container beats the pill's auto, and the
            portal mounts after the `z-40` mobile nav, so equal z-index resolves on tree order.
            Square corners, like the desktop card and for its stated reason: this box grows to two
            rows when the toast is up, and `rounded-full` on a multi-row box renders an ellipse
            that clips its own corners. */}
        {saveToStudy && (
          <div className="max-w-full animate-[fade-in_150ms_var(--ease-gentle)] border border-stone-800 bg-stone-950 px-3 py-1 dark:border-stone-900 dark:bg-stone-50">
            {saveToStudy}
          </div>
        )}
        {/* Option A on mobile rides its own box above the pill — the pill is a one-row
            overflow-x scroller and word rows are not row-of-chips content. Same stacked-box
            pattern (and the same overflow reasoning) as Save above. */}
        {defineBlock && (
          <div className="w-full max-w-[420px] animate-[fade-in_150ms_var(--ease-gentle)] border border-stone-800 bg-stone-950 px-3 py-2 dark:border-stone-900 dark:bg-stone-50">
            {defineBlock}
          </div>
        )}
        <div className="flex max-w-full animate-[fade-in_150ms_var(--ease-gentle)] items-center gap-2 overflow-x-auto rounded-full border border-stone-800 bg-stone-950 px-3 py-2 dark:border-stone-900 dark:bg-stone-50">
          <span className="max-w-[96px] shrink-0 truncate px-1 font-sans text-xs font-medium text-stone-300 dark:text-stone-600">{contextLabel}</span>
          {actionButtons}
          {divider}
          {swatches}
          {divider}
          {copyChip('styled', 'Copy')}
        </div>
      </div>
    </>,
    document.body,
  );
}
