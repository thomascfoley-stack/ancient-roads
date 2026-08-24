'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { type CommentaryEntry } from '@/lib/bible';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import { fetchLexEntry, decodeMorph, type OWord, type LexEntry, type WordSelection } from '@/lib/original';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import { useDialog } from '@/lib/use-dialog';
import {
  eraLabel,
  pickDiverse,
  partitionByRegister,
  EntryCard,
  RegisterLaneSections,
  type AnnotationControls,
} from './commentary-panel';

export type StudyTab = 'commentaries' | 'word' | 'notes';

// Future facets slot in here (videos, sermons) once their data exists.
const TABS: { id: StudyTab; label: string }[] = [
  { id: 'commentaries', label: 'Commentaries' },
  { id: 'word', label: 'Word study' },
  { id: 'notes', label: 'Notes' },
];

export function StudyPanel({
  reference,
  verseNum,
  verseText,
  entries,
  originalWords,
  lang,
  annotation,
  bookmarked = false,
  onToggleBookmark,
  defaultTab = 'commentaries',
  focusWordIdx,
  selection,
  verseId,
  prevVerse = null,
  nextVerse = null,
  onNavigate,
  onTabChange,
  onClose,
}: {
  reference: string;
  verseNum: number;
  verseText: string;
  entries: CommentaryEntry[];
  originalWords: OWord[] | null;
  lang: 'hebrew' | 'greek' | null;
  annotation: AnnotationControls;
  /** B022 — whether THIS verse is bookmarked, so the toggle below can say which way it will go
   *  (B023's rule: a stateless "Bookmark" label hides that removal exists). */
  bookmarked?: boolean;
  /** B022 — the bookmark toggle for this verse. A SIBLING of `annotation`, not a member of it,
   *  deliberately: `AnnotationControls` is declared in commentary-panel.tsx and shared with that
   *  file's own surfaces, and widening a shared interface for one caller's new control is how
   *  optional fields nobody else honours accumulate. Threaded the same way as the rest — the
   *  caller closes over the verse (`() => toggleBookmark(study.verse)`), exactly like
   *  `annotation.onClearHighlight`. Optional so existing callers are untouched; absent = no
   *  control, never a dead one. */
  onToggleBookmark?: () => void;
  defaultTab?: StudyTab;
  focusWordIdx?: number;
  /** OPTION C (ruling 2026-08-21): the reader's single-word selection, carried in from the
   *  popover's word-study doors. The Word study tab pins its candidate rows on top, expanded,
   *  and folds the rest of the verse below a hairline. Empty `indices` = matched nothing,
   *  which the tab says plainly over the full list. Absent = today's plain list. */
  selection?: WordSelection;
  /** Numeric verse id, for the Pray entry point. Optional so existing callers are unaffected. */
  verseId?: number;
  /** A027/A028 — THE PANEL IS IN A SEQUENCE AND DID NOT KNOW IT.
   *
   *  The verse before / after this one IN THE RENDERED CHAPTER, or null at either end. The caller
   *  derives them because the caller is the one holding the chapter; the panel is handed the answer
   *  so it never has to guess what "next" means (the next verse is not always `verseNum + 1` — a
   *  verse with no text renders nothing, so stepping onto it would open an empty panel).
   *  `null` is what makes the control DISABLED rather than dead. */
  prevVerse?: number | null;
  nextVerse?: number | null;
  /** Moves the open verse WITHIN the chapter. Not a fetch: everything the panel needs for the
   *  neighbouring verse is already in the caller's hands. Absent = no stepping controls at all,
   *  which is how existing callers stay untouched. */
  onNavigate?: (verse: number) => void;
  onTabChange?: (tab: StudyTab) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<StudyTab>(defaultTab);
  const drag = useDragDismiss(onClose);
  const dialog = useDialog(onClose, 'Study this verse');

  // A027 — THE TAB IS THE READER'S MODE, NOT A PROPERTY OF THE VERSE, so it survives a verse
  // change: someone reading commentary verse by verse stays on Commentaries, and someone comparing
  // the Greek stays on Word study.
  //
  // `verseNum` was in this dep array and is deliberately gone. It re-derived the tab from
  // `defaultTab` on every step, which made the persistence rest ENTIRELY on the caller happening to
  // carry the current tab across a navigate — it does (page.tsx `navigateStudy`), so nothing is
  // visibly different today, and that is exactly the problem: the property would be held by the
  // other file, silently, and a caller that passed a fixed tab would snap the reader back to
  // Commentaries on every step with nothing here to notice. `defaultTab` alone still resets when
  // the CALLER asks for a different tab, which is the only case that ever wanted a reset —
  // WordPanel's "show commentary" and the `#v16:study` deep link both change it.
  useEffect(() => setTab(defaultTab), [defaultTab]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  function selectTab(t: StudyTab) {
    setTab(t);
    onTabChange?.(t);
  }

  return (
    // PRD §3 scrim: rgba(26,20,15,0.32) light / rgba(251,248,242,0.08) dark, NO blur.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/[0.32] animate-fade-in dark:bg-stone-50/[0.08]"
      onClick={(e) => {
        // A028 — A CLICK ON A VERSE NUMBER BEHIND THE SCRIM ASKS FOR THAT VERSE, NOT FOR CLOSE.
        //
        // The scrim is `inset-0`, so it lies over the whole reading column. The chapter is still
        // legible through it at 32% and the verse numbers still LOOK like the handles they are —
        // but every click on one landed here, matched `target === currentTarget`, and closed the
        // panel. Reported twice by the same QA session: the reader aims at verse 3, the sheet
        // vanishes, and nothing says why.
        //
        // Only the NUMBER switches. A click on the verse text still closes, deliberately: ADR-047
        // already rules that the number is the handle and the text is not, and making the text a
        // switch would leave almost nowhere on a reading page to click-outside-to-close.
        if (e.target !== e.currentTarget) return; // inside the sheet — not an outside click at all
        const verse = onNavigate ? verseHandleUnder(e.clientX, e.clientY) : null;
        // Tapping the OPEN verse's own handle falls through to close: the panel is already showing
        // it, so switching would be a click that visibly does nothing, and a second tap on the
        // handle you opened with reads as toggling it back off.
        if (verse !== null && verse !== verseNum) {
          onNavigate?.(verse);
          return;
        }
        onClose();
      }}
    >
      <div
        ref={dialog.ref}
        {...dialog.dialogProps}
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] animate-slide-up dark:bg-stone-900"
        style={drag.style}
      >
        {/* Grab handle (drag down to dismiss) */}
        <div aria-hidden className="flex justify-center pt-2.5" {...drag.handleProps}>
          <span className="h-1.5 w-10 rounded-full bg-stone-300/80 dark:bg-stone-700" />
        </div>
        {/* Header */}
 <div className="flex items-center justify-between border-b edge px-5 py-3" {...drag.handleProps}>
          <div>
            {/* A027 — announced, because the verse can now change UNDER the panel. Without this a
                screen-reader user who presses Next hears nothing at all: the dialog's own name is
                static ("Study this verse") and the reference is the only thing that says which
                verse is open. Polite, so it never interrupts the commentary being read. */}
            <p aria-live="polite" className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{reference}</p>
            <p className="mt-0.5 line-clamp-2 max-w-md font-scripture text-sm italic leading-snug text-stone-600 dark:text-stone-400">
              &ldquo;{verseText}&rdquo;
            </p>
          </div>
          {/* A027 — VERSE-BY-VERSE READING WITHOUT LEAVING THE PANEL. Filed as MAJOR: every single
              verse cost a close, a hunt for the next number on the page behind, and a reopen — and
              the panel was already holding a chapter's worth of context it could step through.
              These sit INSIDE the drag handle, which is safe by construction: `useDragDismiss`
              refuses to start a drag from a press on a control (drag-handle-swallows-clicks). */}
          <div className="flex shrink-0 items-center">
            {onNavigate && (
              <>
                <VerseStepButton verse={prevVerse} direction="previous" onNavigate={onNavigate} />
                <VerseStepButton verse={nextVerse} direction="next" onNavigate={onNavigate} />
              </>
            )}
            <button
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="Close"
            >
              <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Always-visible highlight row — and, per B022, the bookmark toggle beside it: this row
            is the panel's persistent per-verse chrome, and until now the ONLY route to a working
            bookmark feature was the text-selection popover, which nothing points at. */}
        <HighlightRow annotation={annotation} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />

        {/* Tabs — PRD §4: 14px Source Sans, weight 600, tracking 0.02em. */}
 {/* D37: these switch mutually exclusive panels but were plain buttons — no tab semantics,
            no selected state, the active one conveyed by accent colour and an underline only. The
            repo's own convention for this exact pattern is at plans-client.tsx:464 and
            study-library-panel.tsx:169. */}
        <div className="flex gap-1 border-b edge px-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={`relative min-h-[44px] px-3.5 py-2.5 font-sans text-sm font-semibold tracking-[0.02em] transition-colors ease-gentle ${
                tab === t.id
                  ? 'text-accent-600 dark:text-accent-400'
                  : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              {t.label}
              {t.id === 'commentaries' && entries.length > 0 && (
                <span className="ml-1 text-micro text-stone-500 dark:text-stone-400">{entries.length}</span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent-600 dark:bg-accent-400" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[30vh] flex-1 overflow-y-auto">
          {tab === 'commentaries' && <CommentariesTab entries={entries} />}
          {tab === 'word' && <WordTab words={originalWords} lang={lang} focusIdx={focusWordIdx} selection={selection} />}
          {tab === 'notes' && <NotesTab annotation={annotation} />}
          {/* PRAY — block PR1a. An ACTION, not a fourth tab: commentaries/word/notes are facets of
              the verse, and prayer is something the reader does with it. Making it a tab would file
              responding-to-the-text alongside studying it, which is the exact conflation the block
              exists to undo. Carries the verse as a reference the prayer space PRE-FILLS and does
              not require — a prayer stands alone (owner ruling 2026-08-08). */}
          {annotation.signedIn && verseId !== undefined && (
            <a
              href={`/prayers?verse=${verseId}`}
              className="mt-6 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-accent-600/50 px-4 font-serif text-sm text-accent-700 transition-colors ease-gentle hover:bg-accent-50/60 dark:border-accent-400/50 dark:text-accent-300 dark:hover:bg-accent-950/30"
            >
              Pray over this verse
            </a>
          )}
        </div>

      </div>
    </div>
  );
}

/**
 * A028 — which verse handle, if any, is under a point on the scrim.
 *
 * `elementsFromPoint` (plural) returns the whole paint-order stack, so the scrim itself comes back
 * first and whatever the reader was actually aiming at comes back behind it. That is the only way
 * to answer this question without making the scrim `pointer-events: none`, which would hand every
 * click through to the page behind a dialog that declares `aria-modal` — a worse defect than the
 * one being fixed.
 *
 * `[data-verse-handle]` is the reading surface's contract for "this element IS the verse's handle"
 * (verse-display.tsx). Reaching for the enclosing `[data-verse]` instead would make the whole verse
 * — text included — a switch, which ADR-047 rules against.
 *
 * The typeof guard is not defensive noise: this is a LAYOUT query, jsdom has no layout and does not
 * implement it, and the fallback is deliberately `null` so that where the API is missing the panel
 * behaves exactly as it did before (close), rather than guessing at a verse.
 */
function verseHandleUnder(x: number, y: number): number | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const handle = el.closest<HTMLElement>('[data-verse-handle]');
    if (!handle) continue;
    const verse = Number(handle.dataset.verseHandle);
    return Number.isInteger(verse) ? verse : null;
  }
  return null;
}

/**
 * A027 — one step along the chapter.
 *
 * `verse === null` means there is no neighbour that way (the chapter's first or last rendered
 * verse), and the button is DISABLED rather than hidden: hiding it would shift the close button
 * sideways at exactly the two moments the reader is clicking repeatedly in that spot. Disabled is
 * also what stops it being a dead control — `<button disabled>` fires no click and is announced as
 * unavailable, where a live-looking button that does nothing is the "fake door" this repo files as
 * its own defect class.
 *
 * Chevrons point LEFT/RIGHT, not up/down, even though verses run down the page: an up/down pair in
 * the header of a bottom sheet reads as expand/collapse, which is a gesture this sheet already has
 * (drag the handle).
 */
function VerseStepButton({
  verse,
  direction,
  onNavigate,
}: {
  verse: number | null;
  direction: 'previous' | 'next';
  onNavigate: (verse: number) => void;
}) {
  const label = direction === 'previous' ? 'Previous verse' : 'Next verse';
  return (
    <button
      type="button"
      disabled={verse === null}
      onClick={() => {
        // The null check is the type narrowing, not a second belt: at the boundary the button is
        // disabled and this handler is unreachable.
        if (verse !== null) onNavigate(verse);
      }}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 disabled:pointer-events-none disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800"
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d={direction === 'previous' ? 'M11 4L6 9l5 5' : 'M7 4l5 5-5 5'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function HighlightRow({
  annotation,
  bookmarked = false,
  onToggleBookmark,
}: {
  annotation: AnnotationControls;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  if (!annotation.signedIn) {
    // B022 note: the bookmark toggle deliberately does not render in this branch either — same
    // gate as the selection popover (verse-display.tsx wires onBookmark only when signed in). An
    // optimistic toggle whose POST will 401 is a control that appears to work and silently does
    // not, and this row already offers the honest alternative: sign in.
    return (
      <div className="border-b edge px-5 py-2.5">
        <Link href="/auth/sign-in" className="inline-flex min-h-[44px] items-center font-sans text-sm font-semibold text-accent-600 hover:underline dark:text-accent-400">
          Sign in to highlight and save notes to your account →
        </Link>
      </div>
    );
  }
  // `flex-wrap` arrived WITH the bookmark toggle (B022): the ten 44px swatch buttons already fill
  // a 390px sheet edge-to-edge, and a shrink-0 toggle jammed on the same line would squeeze the
  // swatch hit targets below their dots. Wrapping drops the toggle to its own line on narrow
  // screens instead — the same remedy the selection popover's desktop card uses for this exact
  // swatch run.
  return (
 <div className="flex flex-wrap items-center gap-x-2 border-b edge px-5 py-1">
      <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Highlight</span>
      <div className="flex items-center gap-0.5">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => annotation.onSetHighlight(c.id)}
            aria-label={`Highlight ${c.id}`}
            // D38: the current colour was shown by a ring class alone, so all ten swatches
            // announced identically and a screen-reader user could not tell which colour the
            // verse already carried before hitting Clear.
            aria-pressed={annotation.color === c.id}
            className="flex h-11 w-11 items-center justify-center rounded-full active:bg-stone-100 dark:active:bg-stone-800"
          >
            <span
              className={`h-7 w-7 rounded-full ${c.dot} ring-2 transition-transform ease-gentle hover:scale-110 ${
                annotation.color === c.id ? 'ring-stone-700 dark:ring-stone-200' : 'ring-transparent'
              }`}
            />
          </button>
        ))}
        {annotation.color && (
          <button
            onClick={annotation.onClearHighlight}
            className="ml-1 min-h-[44px] px-2 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-500"
          >
            clear
          </button>
        )}
      </div>
      {/* B022 — the bookmark toggle, in persistent chrome at last. The feature already worked
          end-to-end (write path, optimistic Set, the `⚑` on the verse itself) and was reachable
          ONLY through the text-selection popover. The label follows the state per B023 — a second
          press removes, and the control must say so — and the glyph is the SAME `⚑` the verse
          carries (verse-display.tsx), lit accent when set, so the control and the indicator read
          as one feature. Renders only when the caller wired the toggle: absent handler, no
          control (the fake-door rule this repo files as its own defect class). */}
      {onToggleBookmark && (
        <button
          onClick={onToggleBookmark}
          className="ml-auto flex min-h-[44px] shrink-0 items-center gap-1 px-2 font-sans text-xs font-semibold text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          <span aria-hidden className={bookmarked ? 'text-accent-600 dark:text-accent-300' : ''}>⚑</span>
          {bookmarked ? 'Remove bookmark' : 'Bookmark'}
        </button>
      )}
    </div>
  );
}

function CommentariesTab({ entries }: { entries: CommentaryEntry[] }) {
  // Register wall (reader side): sermons, theology/confessions, and hymns/poems are
  // DISTINCT registers — each renders in its OWN labeled section, never blended
  // into (or displacing) the exegetical voices (A6 line-by-line 2026-07-17 landed
  // hymns/poetry on this LIVE reader tab; the sermon-lane slice 2026-07-18 extends
  // the same treatment to sermon + theology).
  const { exegetical, sermon, theology, songVerse } = partitionByRegister(entries);
  const [showAll, setShowAll] = useState(false);
  const diverse = pickDiverse(exegetical, 10);
  // APPEND, never re-pick. `pickDiverse(exegetical, exegetical.length)` would also return every
  // entry, but in the ORIGINAL order — so expanding would reshuffle the ten already on screen
  // under the reader's eyes. The first ten keep their places and the remainder follows.
  const rest = exegetical.filter((e) => !diverse.includes(e));
  const shown = showAll ? [...diverse, ...rest] : diverse;
  let lastEra = '';
  if (diverse.length === 0 && sermon.length === 0 && theology.length === 0 && songVerse.length === 0) {
    return <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">No commentary on this verse yet.</p>;
  }
  return (
    <div className="space-y-1 px-5 py-4">
      {shown.map((entry, i) => {
        const era = eraLabel(entry.year);
        const showEra = era !== lastEra && era !== '';
        if (showEra) lastEra = era;
        return (
          <div key={i}>
            {showEra && (
              <p className="pt-4 pb-1.5 text-micro font-bold uppercase tracking-widest text-stone-300 dark:text-stone-400">
                {era}
              </p>
            )}
            {/* Hairline rule above each voice (PRD §5); the era border + ornament live
                in EntryCard itself. */}
            <div className="mb-4 border-t edge pt-4">
              <EntryCard entry={entry} />
            </div>
          </div>
        );
      })}
      {/* The count used to be a bare sentence: "Showing 10 of 11 voices", with no way to reach
          the 11th (2026-08-16 QA fleet). The cap is deliberate — pickDiverse rotates over
          tradition buckets so ten slots are not spent on one school — but stating a shortfall
          and offering nothing to do about it reads as a broken control. Every withheld entry is
          already in `entries`; this renders them, and retrieves nothing. */}
      {!showAll && diverse.length < exegetical.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center text-center font-sans text-xs text-stone-500 underline underline-offset-2 transition-colors ease-gentle hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
        >
          Show all {exegetical.length} voices
        </button>
      )}
      <div className="pt-2">
        <RegisterLaneSections sermon={sermon} theology={theology} songVerse={songVerse} />
      </div>
    </div>
  );
}

function WordTab({
  words,
  lang,
  focusIdx,
  selection,
}: {
  words: OWord[] | null;
  lang: 'hebrew' | 'greek' | null;
  focusIdx?: number;
  selection?: WordSelection;
}) {
  if (words === null) {
    return <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">Loading Greek / Hebrew…</p>;
  }
  if (words.length === 0 || !lang) {
    return (
      <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
        Original-language data isn&rsquo;t available for this verse.
      </p>
    );
  }

  // OPTION C (ruling 2026-08-21): a carried selection pins its candidate rows on top, first one
  // open, and folds the remainder below a hairline — instead of the reader hunting one word
  // through the verse's original-order list. Same-Strong's repeats fold into the pinned row's
  // caption ("twice in the Greek: θεὸν · θεὸς") rather than listing twice; matched-nothing says
  // so plainly over the FULL list. No selection = exactly the plain list this always was.
  const pinnedIdx = (selection?.indices ?? []).filter((i) => i >= 0 && i < words.length);
  if (selection && pinnedIdx.length > 0) {
    const pinnedStrongs = new Set(pinnedIdx.map((i) => words[i]!.s).filter(Boolean));
    const rest = words
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => !pinnedIdx.includes(i) && !(w.s && pinnedStrongs.has(w.s)));
    return (
      <div className="px-3 py-3">
        <p className="px-2 pb-2 text-micro font-semibold uppercase tracking-[0.08em] text-accent-600 dark:text-accent-400">
          Matches your selection &middot; &ldquo;{selection.english}&rdquo;
        </p>
        {pinnedIdx.map((i, n) => {
          const w = words[i]!;
          const siblings = w.s ? words.filter((x) => x.s === w.s) : [w];
          return (
            <div key={i} className="mb-1 border border-accent-300 bg-accent-50/40 dark:border-accent-800 dark:bg-accent-950/20">
              {siblings.length > 1 && (
                <p className="px-2 pt-2 text-micro text-stone-500 dark:text-stone-400">
                  {siblings.length === 2 ? 'twice' : `${siblings.length} times`} in the {lang === 'hebrew' ? 'Hebrew' : 'Greek'}:{' '}
                  <span dir={lang === 'hebrew' ? 'rtl' : 'ltr'} className="font-scripture">{siblings.map((x) => x.w).join(' · ')}</span>
                </p>
              )}
              <WordRow word={w} lang={lang} defaultOpen={n === 0} />
            </div>
          );
        })}
        <p className="px-2 pb-2 pt-4 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
          The rest of the verse &middot; {rest.length} {rest.length === 1 ? 'word' : 'words'}
        </p>
        {rest.map(({ w, i }) => (
          <WordRow key={i} word={w} lang={lang} />
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      {selection && (
        <p className="px-2 pb-2 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
          No direct match for &ldquo;{selection.english}&rdquo; &mdash; the verse&rsquo;s words:
        </p>
      )}
      {words.map((w, i) => (
        <WordRow key={i} word={w} lang={lang} defaultOpen={i === focusIdx} />
      ))}
    </div>
  );
}

function WordRow({ word, lang, defaultOpen = false }: { word: OWord; lang: 'hebrew' | 'greek'; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [entry, setEntry] = useState<LexEntry | null>(null);
  // Lexicon file itself failed to load (vs. entry === null: no entry for this key).
  const [lexDown, setLexDown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rtl = lang === 'hebrew';

  useEffect(() => {
    if (open && !loaded) {
      fetchLexEntry(word.s).then((e) => {
        setLexDown(e === 'unavailable');
        setEntry(e === 'unavailable' ? null : e);
        setLoaded(true);
      });
    }
  }, [open, loaded, word.s]);

  const morph = decodeMorph(word.m, lang);

  return (
 <div className="border-b edge last:border-0">
      {/* The chip is a LINK to /word/{s} (option D: every Strong's chip is a destination) and a
          SIBLING of the toggle, never nested inside it — a link in a button is invalid and one
          tap cannot honestly do two things. The toggle keeps the whole rest of the row. */}
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[48px] w-full min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left transition-colors ease-gentle hover:bg-accent-50/60 active:bg-accent-50/80 dark:hover:bg-accent-950/30"
        >
          <span dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'he' : 'el'} className="font-scripture text-xl text-stone-900 dark:text-stone-100">
            {word.w}
          </span>
          <span className="text-xs text-stone-500 dark:text-stone-400">{word.tr}</span>
          {word.g && <span className="flex-1 truncate text-sm text-stone-600 dark:text-stone-500">{word.g}</span>}
        </button>
        {word.s && (
          <Link
            href={`/word/${word.s}`}
            title={`Everything about ${word.s}`}
            className="mr-2 shrink-0 bg-stone-100 px-2 py-0.5 text-micro font-semibold text-stone-500 transition-colors ease-gentle hover:bg-accent-100 hover:text-accent-800 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-accent-950/60 dark:hover:text-accent-300"
          >
            {word.s}
          </Link>
        )}
      </div>
      {open && (
        <div className="space-y-2 px-2 pb-3 text-sm">
          {morph && (
            <p className="text-micro font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{morph}</p>
          )}
          {!loaded ? (
            <p className="text-stone-500 dark:text-stone-400">Looking up…</p>
          ) : entry ? (
            <>
              {entry.def && <p className="text-stone-700 dark:text-stone-500">{entry.def}</p>}
              {entry.kjv && (
                <p className="text-stone-500 dark:text-stone-400">
                  <span className="font-semibold">KJV: </span>
                  <span className="italic">{entry.kjv}</span>
                </p>
              )}
            </>
          ) : lexDown ? (
            <p className="text-stone-500 dark:text-stone-400">Lexicon unavailable right now; entry can&rsquo;t be shown.</p>
          ) : (
            <p className="text-stone-500 dark:text-stone-400">No dictionary entry linked{word.l ? ` (lemma ${word.l})` : ''}.</p>
          )}
        </div>
      )}
    </div>
  );
}

function NotesTab({ annotation }: { annotation: AnnotationControls }) {
  const [text, setText] = useState(annotation.note);
  useEffect(() => setText(annotation.note), [annotation.note]);

  if (!annotation.signedIn) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">Save notes to your account.</p>
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // The DELIBERATE replacement for an accidental guard. Until `signedIn` stopped being a fetch
  // result, a failed annotations load also made this branch render the "Sign in" panel, so nobody
  // could type over an invisible note. Now the load failing and being signed out are separate
  // facts, and this is the one that has to block the editor: `onSaveNote` upserts.
  if (annotation.loadFailed) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="mb-1 text-sm text-stone-500 dark:text-stone-400">Your notes couldn&rsquo;t be loaded.</p>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Close this and use Retry at the top of the chapter. Editing now could overwrite a note you can&rsquo;t see.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      {/* PRD §6 input: parchment surface, 1px hairline, antique-gold focus, no shadow. */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a note on this verse…"
        aria-label="Note on this verse"
        rows={6}
        className="w-full resize-y rounded-lg border edge edge-focus bg-stone-50 px-3 py-2.5 font-sans text-sm text-stone-900 placeholder:text-stone-500 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-400"
      />
      <div className="mt-2 flex items-center gap-2">
        {/* PRD §6 primary CTA: 1px ink hairline, transparent, ink fill on hover. */}
        <button
          onClick={() => annotation.onSaveNote(text)}
          disabled={!text.trim()}
          className="min-h-[44px] rounded-lg border border-stone-900 px-4 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-40 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Save note
        </button>
        {annotation.note && (
          <button
            onClick={() => {
              annotation.onDeleteNote();
              setText('');
            }}
            className="min-h-[44px] px-2 text-xs text-stone-500 dark:text-stone-400 hover:text-accent-700 dark:hover:text-accent-300"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
