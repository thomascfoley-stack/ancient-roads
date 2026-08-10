'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChapterData } from '@/lib/bible';
import { HIGHLIGHT_BG } from '@/lib/highlight-colors';
import { flattenToSegments, type HighlightRange } from '@/lib/highlight-range';
import { useTextAnnotation, type AnnotationTarget } from '@/lib/use-text-annotation';
import { singleWordOf } from '@/lib/original';
// StoredSpan is defined in the hook that produces it (use-annotation-writes.ts), not here —
// this component only renders the shape, it doesn't own it. Re-exported for callers that used to
// import it from this module.
import type { StoredSpan } from '@/lib/use-annotation-writes';
import { SelectionPopover } from './selection-popover';
import type { StudyTab } from './study-panel';

export type { StoredSpan };

const HINT_KEY = 'verse-handle-hint:v1';

/**
 * Shown once, ever, then never again: what the verse number does.
 *
 * Highlighting, notes, bookmarks, "Ask about this verse" and the commentary panel all hang off
 * tapping the small superscript number, and that is the app's richest interaction. It is also
 * the least announced one — the handle carries a hover colour and a pointer cursor, and hover
 * is not something a phone has, so on touch there is no resting cue at all that the number is
 * a control. One sentence the first time a chapter opens closes that, where a permanent banner
 * over a devotional reading surface would be a tax on every subsequent visit.
 *
 * `null` while undecided, deliberately: reading localStorage during render would differ between
 * the server pass (no storage) and the client's first pass, which is the React #418 hydration
 * mismatch this repo already ate once in the sidebar. Nothing renders until an effect has run.
 */
function VerseHandleHint() {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(HINT_KEY) === null);
    } catch {
      // Private mode: no storage, so no way to remember a dismissal. Showing the hint on every
      // visit would be worse than never showing it.
      setShow(false);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Nothing to do — the hint is already gone for this session.
    }
  };

  if (!show) return null;

  return (
    <div className="mb-8 flex items-start gap-3 border edge bg-paper px-4 py-3 dark:bg-stone-900">
      <p className="flex-1 font-sans text-[13px] leading-relaxed text-stone-700 dark:text-stone-300">
        Tap any <span className="font-sans text-micro font-semibold text-accent-600 dark:text-accent-300">verse&nbsp;number</span> for
        highlights, notes, word study and what the commentators said. Selecting the text itself
        offers the same tools for a phrase.
      </p>
      <button
        onClick={dismiss}
        className="-mr-1 -mt-1 shrink-0 px-2 py-1 font-sans text-xs font-semibold text-stone-600 transition-colors ease-gentle hover:bg-accent-100/70 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-accent-900/40 dark:hover:text-stone-200"
      >
        Got it
      </button>
    </div>
  );
}

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
  onDefine,
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
  /** Look up the original-language word behind a selected English word. Offered ONLY for
   *  single-word selections, because that is the only question this lookup can answer — a phrase
   *  has no one word behind it. Absent when the chapter has no interlinear data. */
  onDefine?: (english: string, verse: number) => void;
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
  // TWO FLOATING SURFACES, ONE AT A TIME. The selection popover is owned here; the study
  // drawer is owned by the page (`selectedVerse`), so neither one could see the other and both
  // could be on screen at once — a stale selection toolbar stacked over the verse drawer,
  // observed in the 2026-08-07 UX walk. Closed at BOTH ends, because the two ends are
  // different bugs: this one drops the selection when a verse handle is used...
  const openVerse = useCallback(
    (verse: number) => {
      dismiss();
      onVerseClick(verse);
    },
    [dismiss, onVerseClick],
  );

  function askPending() {
    if (!pending) return;
    const excerpt = pending.text.length > 220 ? `${pending.text.slice(0, 217)}…` : pending.text;
    const q = `What have commentators said about "${excerpt}" (${bookName} ${data.chapter}:${pending.key})?`;
    dismiss();
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  // The chapter's opening verse, for the drop cap below. `find`, not `[0]`: a verse with no text
  // renders nothing, and a cap on an empty verse would float over the next one.
  const firstVerse = data.verses.find((v) => v.text)?.verse;

  return (
    // PRD §5: a bare reading column on the parchment page — no card chrome. Separation
    // comes from the one hairline under the title and whitespace (5rem margins desktop, 3rem
    // mobile). Width is the reader's: `.reading-measure` resolves --reading-measure, default
    // 66ch (lib/reading-prefs.ts). ChapterSkeleton in the page MIRRORS this container; change
    // one, change both.
    <div ref={rootRef} className="reading-measure mx-auto my-12 px-6 sm:my-20">
      <h1 className="mb-4 font-display text-[30px] font-medium leading-[1.2] tracking-[-0.01em] text-stone-900 dark:text-stone-100">
        {bookName} {data.chapter}
      </h1>
      <div aria-hidden className="mb-12 border-b edge" />
      <VerseHandleHint />
      {/* PRD §5 chapter opening: the drop cap is this CONTAINER's ::first-letter. The first
          verse's own span cannot carry it — ::first-letter needs a block container, and
          `inline-block` on a span inside the continuous verse flow contains the float, so any
          first verse shorter than the cap punched a blank line into the flow (measured on
          /read/psa/23). Container-level, the cap floats and every following line wraps it.
          The verse-1 number <sup> floats too: out-of-flow content is skipped when the first
          letter is determined, otherwise the cap would be the DIGIT (measured — a giant "1").
          leading-[0.88], not the mockup's 0.9: at 4.8rem, 0.9 makes the float box 69.1px
          against a 2-line height of 68.4px (18px × 1.9 × 2), and that 0.7px overhang drags a
          THIRD line into the indent, leaving a hole under the cap glyph. 0.88 = 67.6px, a
          clean two-line cap. Pure CSS either way: the DOM and the text-node offsets the
          anchoring engine walks are untouched, and the letter stays part of the verse for
          screen readers. */}
      <div className="reading-scale font-scripture leading-[1.9] text-stone-900 dark:text-stone-200 first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-[4.8rem] first-letter:leading-[0.88] first-letter:text-accent-600 first-letter:[font-feature-settings:'onum'] dark:first-letter:text-accent-400">
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
          // PRD §5: a selected verse highlights in vellum (night hairline in dark), 100ms fade.
          const outerBg = isSelected ? 'bg-stone-200 transition-colors duration-100 ease-gentle dark:bg-stone-800' : '';
          // The deep-link flash is one of the three sanctioned candle-flame uses (PRD §4).
          // Stays a `ring`, not an outline: verse-deep-link.test.tsx asserts the `ring-2` class.
          const flashRing = v.verse === flashVerse ? ' ring-2 ring-flame/70' : '';
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
              {/* KEYBOARD. This handle is the reader's primary interaction and it was
                  reachable by pointer only: no tabIndex, no role, no key handler, so a
                  keyboard user could not open commentary on any verse in the app.
                  It stays a <sup> carrying its own onClick, deliberately. A first pass made
                  it a real <button> nested inside the <sup>, which is better semantics but
                  moves the handler off the element ADR-047 names, and
                  verse-open-gesture.test.tsx went red because the handle it asserts on no
                  longer answers a click. That test guards an owner ruling; the fix belongs
                  in the component, not in the test. So: same element, same handler, same
                  box, plus the ARIA button contract. */}
              <sup
                role="button"
                tabIndex={0}
                aria-label={`Verse ${v.verse}, read commentary`}
                onClick={() => openVerse(v.verse)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openVerse(v.verse);
                  }
                }}
                /* RESTING OPACITY, not a new affordance. This handle already had
                   `cursor-pointer`, a hover colour shift, role/tabIndex/aria-label and the
                   global :focus-visible ring — a UX pass reporting "no hover state, no cursor
                   change, nothing" was measurably wrong about all three. What it was right
                   about is that the RESTING state reads as faded typography rather than a
                   control, and hover is not a cue that exists on touch at all. Dropping the
                   /80 costs no layout and no reading-surface noise; it just stops the one
                   interactive mark on the page from looking like decoration. */
                /* Verse numbers (PRD §4): 11px Source Sans, antique gold, old-style
                   figures, weight 500. Dark mode takes the PRD's brighter gold (accent-400)
                   rather than the paler accent-300.
                   Verse 1's number FLOATS so the container's ::first-letter drop cap lands on
                   the verse text, not this digit — see the container comment above the map.
                   `leading-none` must ride along: preflight gives sup `line-height: 0`, which
                   is invisible inline but collapses a FLOAT to a zero-height box — the
                   accessibility tree prunes it and the tap target shrinks to the pseudo. */
                className={`relative mr-0.5 cursor-pointer font-sans text-micro font-medium text-accent-600 select-none [font-feature-settings:'onum'] before:absolute before:-inset-y-1 before:-left-1.5 before:-right-0.5 before:content-[''] hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300${v.verse === firstVerse ? ' float-left leading-none' : ''}`}
              >
                {v.verse}
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
      {/* ...and this is the other end: an INVARIANT rather than another handler. However the
          drawer came to be open — verse handle, `#v16` deep link, a jump from My library — the
          popover does not co-render with it. A guard that depends on every future path
          remembering to call `dismiss()` is the kind that goes stale. */}
      {pending && selectedVerse === null && (
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
          onDefine={
            onDefine && singleWordOf(pending.text)
              ? () => {
                  const verse = Number(pending.key);
                  // The bare word, without the punctuation the snap brought with it.
                  const english = singleWordOf(pending.text)!;
                  dismiss();
                  onDefine(english, verse);
                }
              : undefined
          }
          onOpenCommentaries={onOpen ? () => openPending('commentaries') : undefined}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
