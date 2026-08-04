'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ChapterData } from '@/lib/bible';
import { HIGHLIGHT_BG } from '@/lib/highlight-colors';
import { flattenToSegments, type HighlightRange } from '@/lib/highlight-range';
import { useTextAnnotation, type AnnotationTarget } from '@/lib/use-text-annotation';
// StoredSpan is defined in the hook that produces it (use-annotation-writes.ts), not here —
// this component only renders the shape, it doesn't own it. Re-exported for callers that used to
// import it from this module.
import type { StoredSpan } from '@/lib/use-annotation-writes';
import { SelectionPopover } from './selection-popover';
import type { StudyTab } from './study-panel';

export type { StoredSpan };

export function VerseDisplay({
  data,
  bookName,
  translation,
  selectedVerse,
  flashVerse,
  onVerseClick,
  highlights,
  notedVerses,
  bookmarkedVerses,
  onToggleBookmark,
  signedIn,
  onAddHighlight,
  onOpen,
}: {
  data: ChapterData;
  bookName: string;
  translation: string;
  selectedVerse: number | null;
  /** A verse arrived at via a `#v<n>` deep link, ringed briefly so the reader can see which
   *  one was meant. Passed as a prop because the verse is React-controlled: a class added with
   *  classList.add is wiped by the next render. */
  flashVerse?: number | null;
  onVerseClick: (verse: number) => void;
  highlights?: Map<number, StoredSpan[]>;
  notedVerses?: Set<number>;
  /** Verses the reader has bookmarked, by verse number. A Set: a bookmark is a place, not data. */
  bookmarkedVerses?: Set<number>;
  /** Toggles the bookmark on a verse. Absent when signed out, which is what hides the button:
   *  SelectionPopover renders Bookmark only when a handler exists (selection-popover.tsx). */
  onToggleBookmark?: (verse: number) => void;
  signedIn?: boolean;
  onAddHighlight?: (verse: number, range: { start: number; end: number } | null, color: string) => void;
  onOpen?: (verse: number, tab: StudyTab) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Resolve a selection boundary to its verse container (the shared engine's target contract;
  // the Phase-2 WorkReader supplies the dataset.sectionText equivalent). The canonical length
  // comes from chapter data, not the DOM — v.text stays the offset authority.
  const resolveTarget = useCallback(
    (node: Node): AnnotationTarget | null => {
      let n: Node | null = node;
      while (n) {
        if (n instanceof HTMLElement && n.dataset.verseText) {
          const verse = Number(n.dataset.verseText);
          const text = data.verses.find((v) => v.verse === verse)?.text ?? '';
          if (!text) return null;
          return { kind: 'verse', key: String(verse), textLen: text.length, container: n };
        }
        n = n.parentNode;
      }
      return null;
    },
    [data],
  );

  const { pending, dismiss } = useTextAnnotation(rootRef, resolveTarget);

  function highlightPending(color: string) {
    if (pending && onAddHighlight) {
      onAddHighlight(Number(pending.key), { start: pending.start, end: pending.end }, color);
    }
    dismiss();
  }

  function openPending(tab: StudyTab) {
    if (!pending) return;
    const verse = Number(pending.key);
    dismiss();
    onOpen?.(verse, tab);
  }

  // Hand the selection to /ask as a PREFILL (never auto-submit — a reload must not spend a
  // teacher run). The question carries the excerpt + locus, no host URL.
  function askPending() {
    if (!pending) return;
    const excerpt = pending.text.length > 220 ? `${pending.text.slice(0, 217)}…` : pending.text;
    const q = `What have commentators said about "${excerpt}" (${bookName} ${data.chapter}:${pending.key})?`;
    dismiss();
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  return (
    <div ref={rootRef} className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
      <h1 className="mb-8 font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">
        {bookName} {data.chapter}
      </h1>
      <div className="reading-scale font-scripture leading-[1.9] text-stone-800 dark:text-stone-200">
        {data.verses.map((v) => {
          if (!v.text) return null;
          const isSelected = v.verse === selectedVerse;
          const spans = highlights?.get(v.verse) ?? [];
          // Translation pin (§1.3): a sub-verse span renders exactly only in the translation it was
          // made in. Whole-verse (null range) and null-translation (legacy) spans always render.
          const native: HighlightRange[] = [];
          let foreignColor: string | null = null;
          for (const s of spans) {
            const wholeVerse = s.start == null || s.end == null;
            const sameTranslation = s.translation == null || s.translation === translation;
            if (wholeVerse || sameTranslation) {
              native.push({ start: s.start ?? 0, end: s.end ?? v.text.length, color: s.color, id: s.id });
            } else {
              foreignColor = s.color; // degrade to a verse-level indicator, never lost
            }
          }
          const segments = flattenToSegments(v.text.length, native);
          const hasNote = notedVerses?.has(v.verse);
          const isBookmarked = bookmarkedVerses?.has(v.verse);
          const outerBg = isSelected ? 'bg-accent-100/70 dark:bg-accent-500/20' : '';
          const flashRing = v.verse === flashVerse ? ' ring-2 ring-accent-400/70' : '';
          return (
            <span
              key={v.verse}
              // ADDRESSABLE. A saved note in My library could only ever link to the CHAPTER, so
              // "jump back to it" dropped the reader at John 3:1 for a note on John 3:16 and left
              // them to find it. `#v16` makes the verse itself a destination. `scroll-mt-20`
              // keeps it clear of the sticky header when scrolled to.
              id={`v${v.verse}`}
              data-verse={v.verse}
              className={`verse inline scroll-mt-20 rounded ${outerBg}${flashRing}`}
            >
              {/* THE NUMBER IS THE HANDLE; THE VERSE TEXT IS NOT.
                  This onClick used to sit on the whole verse span, so the FIRST click of a
                  double-click opened StudyPanel, whose root is a `fixed inset-0` scrim
                  (study-panel.tsx). The second click then landed on the scrim, which closes
                  on `e.target === e.currentTarget`, so the browser's word selection never reached
                  the text: the sheet flashed open and shut and no word was selected. The old guard
                  could not catch it — on click one the selection IS collapsed. Nor could
                  `e.detail > 1`: the damage is done by the click where detail === 1, and it would
                  still open a sheet on every double-click attempt. A cancel-on-dblclick timer can,
                  at ~250ms on EVERY tap — and mobile taps are single clicks, so the whole primary
                  path would pay for a gesture touch does not have (long-press selects; with no
                  maximumScale in layout.tsx a double-tap zooms).
                  `select-none` already makes this the one part of a verse that can never be inside
                  a selection, so a click here cannot race the selection engine at all.
                  STUDY_TOOLKIT_DESIGN.md decision 9.1: when the toolkit supersedes the sheet, this
                  handle becomes its anchor or is deleted, and the text is already free.
                  The `before:` pseudo-element grows the tap target without reflowing the line:
                  padding on an inline box would shift every verse's first word sideways. Insets
                  are deliberately asymmetric — `-right-0.5` matches `mr-0.5` exactly so the
                  invisible area stops at the margin and never steals a long-press from the first
                  word. Whether the top edge crosses into the line above is a MEASUREMENT, taken
                  at 390px and desktop in the DoD pass — not a claim made here.
                  OWNER RULING, 2026-08-02: ADR-047 (docs/DECISIONS.md), amending
                  docs/LIBRARY_READER_BUILD.md's "do not change tap-a-verse -> commentaries"
                  boundary. Recorded before this code changed, not after. */}
              {/* A real <button>, not a <sup onClick>. The handle above is the reader's
                  primary interaction and it was reachable by pointer only: no tabIndex, no
                  role, no key handler, so a keyboard user could not open the commentary for
                  any verse in the app. The <sup> stays as the baseline wrapper so nothing
                  reflows, and the button keeps this element's exact box, `select-none` and
                  `before:` tap target, so the pointer behaviour ADR-047 rules on is
                  unchanged. `appearance-none` and the explicit font keep the browser's
                  button defaults out of the verse line. */}
              <sup className="mr-0.5">
                <button
                  type="button"
                  onClick={() => onVerseClick(v.verse)}
                  aria-label={`Verse ${v.verse}, read commentary`}
                  className="relative appearance-none bg-transparent p-0 font-sans text-[11px] font-semibold leading-none text-accent-600/80 select-none before:absolute before:-inset-y-1 before:-left-1.5 before:-right-0.5 before:content-[''] hover:text-accent-700 dark:text-accent-300/80 dark:hover:text-accent-200"
                >
                  {v.verse}
                </button>
              </sup>
              {foreignColor && (
                <sup
                  className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-super ${HIGHLIGHT_BG[foreignColor] ?? ''} select-none`}
                >
                  <span className="sr-only">Highlighted in another translation</span>
                </sup>
              )}
              {/* The verse-text container: its text nodes concatenate to exactly v.text, so the
                  anchoring mapper (rangeToOffsetsInContainer) walks it to derive offsets into v.text. */}
              <span data-verse-text={v.verse}>
                {segments.map((seg, i) =>
                  seg.color ? (
                    <span key={i} className={`rounded-[3px] ${HIGHLIGHT_BG[seg.color] ?? ''}`}>
                      {v.text.slice(seg.start, seg.end)}
                    </span>
                  ) : (
                    <span key={i}>{v.text.slice(seg.start, seg.end)}</span>
                  ),
                )}
              </span>{' '}
              {/* The glyph is decorative and the `title` that used to carry its meaning was
                  hover-only: absent on touch, unreliable to assistive tech. The glyph is
                  now aria-hidden and the meaning is real text beside it. */}
              {hasNote && (
                <>
                  <sup className="mr-0.5 select-none text-accent-600 dark:text-accent-300" aria-hidden>
                    ✎
                  </sup>
                  <span className="sr-only">You have a note here.</span>
                </>
              )}
              {isBookmarked && (
                <>
                  <sup className="mr-0.5 select-none text-accent-600 dark:text-accent-300" aria-hidden>
                    ⚑
                  </sup>
                  <span className="sr-only">Bookmarked.</span>
                </>
              )}
            </span>
          );
        })}
      </div>

      {/* The shared Logos-style selection popover (Phase 1): floating card on md+, docked-low bar
          on mobile. No onBookmark yet — Phase 3 (bookmarks table) wires it. */}
      {pending && (
        <SelectionPopover
          pending={pending}
          contextLabel={`${bookName} ${data.chapter}:${pending.key} · ${translation.toUpperCase()}`}
          copyLineNo={pending.key}
          signedIn={!!signedIn}
          onHighlight={onAddHighlight ? highlightPending : undefined}
          onAddNote={onOpen ? () => openPending('notes') : undefined}
          onBookmark={
            // Gated on signedIn, the same as the highlight swatches (selection-popover.tsx). The
            // button is not merely useless when signed out: the optimistic toggle would show the
            // flag, the POST would 401, and the flag would vanish on the next load — a control
            // that appears to work and silently does not.
            signedIn && onToggleBookmark
              ? () => {
                  // The popover's key is the verse it was raised on. Dismiss FIRST: leaving it
                  // open over a verse whose state just changed reads as if nothing happened.
                  const verse = Number(pending!.key);
                  dismiss();
                  onToggleBookmark(verse);
                }
              : undefined
          }
          onAsk={askPending}
          onOpenCommentaries={onOpen ? () => openPending('commentaries') : undefined}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
