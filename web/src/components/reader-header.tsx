'use client';

import { useState, useRef, useEffect } from 'react';
import { type Book, TRANSLATIONS, type Translation } from '@/lib/bible';
import { BookPicker } from './book-picker';
import { ReaderSettings } from './reader-settings';

export function ReaderHeader({
  book,
  chapter,
  translation,
  onTranslationChange,
  interlinear,
  onToggleInterlinear,
  highlightMode,
  onToggleHighlightMode,
  dialogOpen = false,
}: {
  book: Book;
  chapter: number;
  translation: Translation;
  onTranslationChange: (t: Translation) => void;
  interlinear: boolean;
  onToggleInterlinear: () => void;
  /** Two-tap highlight mode (the phone flow). Optional: headers without a highlightable
   *  surface simply do not render the toggle. */
  highlightMode?: boolean;
  onToggleHighlightMode?: () => void;
  /** A031 — true while the page has a modal dialog (the verse-study sheet) open. Pass-through to
   *  ReaderSettings, which closes its popover on the flip: the popover's only other exit is an
   *  outside mousedown, and the keyboard / deep-link paths into the dialog fire none, leaving both
   *  surfaces open and overlapping. Optional so WorkHeader and any header without a dialog to
   *  report are untouched. */
  dialogOpen?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const versionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!versionOpen) return;
    function handleClick(e: MouseEvent) {
      if (versionRef.current && !versionRef.current.contains(e.target as Node)) {
        setVersionOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [versionOpen]);

  const chapterLabel =
    book.chapterCount === 1 ? book.name : `${book.name} ${chapter}`;

  return (
    <>
      {/* PRD §6 nav bar: parchment, 1px hairline below, NO blur (§3 bans scrim blur). */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b edge bg-stone-50 px-3 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] sm:px-4 dark:bg-stone-950">
        {/* Hairline-bordered square button (PRD §6 CTA); hover is the PRD's INSTANT ink
            fill, so deliberately no transition here. */}
        <button
          onClick={() => setPickerOpen(true)}
          className="min-h-[44px] border edge px-4 text-sm font-semibold text-stone-900 hover:bg-stone-900 hover:text-stone-50 sm:min-h-0 sm:py-1.5 dark:text-stone-200 dark:hover:bg-stone-200 dark:hover:text-stone-950"
        >
          {chapterLabel}
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* A031 — see the prop's doc above: the popover closes itself when a dialog opens. */}
          <ReaderSettings dialogOpen={dialogOpen} />
        {onToggleHighlightMode && (
          <button
            onClick={onToggleHighlightMode}
            title="Highlight mode: tap a word, then another, to highlight that span"
            aria-pressed={!!highlightMode}
            className={`min-h-[44px] min-w-[44px] px-3 text-xs font-semibold sm:min-h-0 sm:min-w-0 sm:py-1.5 ${
              highlightMode
                ? // Same ON/OFF language as the interlinear toggle below: antique gold when on.
                  'bg-accent-600 text-stone-50 hover:bg-accent-700 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-500'
                : 'border edge text-stone-500 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-400 dark:hover:bg-stone-200 dark:hover:text-stone-950'
            }`}
          >
            HL
          </button>
        )}
        <button
          onClick={onToggleInterlinear}
          title="Greek / Hebrew interlinear"
          aria-label="Greek and Hebrew interlinear"
          aria-pressed={interlinear}
          className={`min-h-[44px] min-w-[44px] px-3 text-xs font-semibold sm:min-h-0 sm:min-w-0 sm:py-1.5 ${
            interlinear
              ? // The ON state wears antique gold (the link/accent colour), never
                // candle-flame — the flame is reserved for the PRD's rare moments.
                'bg-accent-600 text-stone-50 hover:bg-accent-700 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-500'
              : 'border edge text-stone-500 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-400 dark:hover:bg-stone-200 dark:hover:text-stone-950'
          }`}
        >
          אα
        </button>
        <div className="relative" ref={versionRef}>
          <button
            onClick={() => setVersionOpen((v) => !v)}
            className="min-h-[44px] border edge px-3 text-xs font-medium text-stone-500 hover:bg-stone-900 hover:text-stone-50 sm:min-h-0 sm:py-1.5 dark:text-stone-400 dark:hover:bg-stone-200 dark:hover:text-stone-950"
          >
            {translation.abbr}
          </button>
          {versionOpen && (
            <div className="absolute right-0 top-full mt-1 max-h-[70dvh] w-56 overflow-y-auto overscroll-contain border edge bg-paper py-1 dark:bg-stone-900">
              {/* S2 item 1. A reader hunting for ESV/NIV/NLT finds them silently absent and reads
                  that as a gap. It is a stance: every translation here is public domain, which is
                  precisely why this product can quote them at length and license them onward.
                  Saying so converts a perceived defect into a position — and it belongs HERE, in
                  the list that raises the question, not on a settings page nobody opens. */}
              <p className="border-b edge px-4 py-2.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                All {TRANSLATIONS.length} are public domain, so we can quote them freely. Modern
                translations require licences; we&rsquo;re working on it.
              </p>
              {TRANSLATIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onTranslationChange(t);
                    setVersionOpen(false);
                  }}
                  className={`flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800 ${
                    t.id === translation.id
                      ? 'bg-stone-50 font-semibold text-stone-900 dark:bg-stone-800 dark:text-stone-50'
                      : 'text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <span>{t.name}</span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">{t.abbr}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </header>
      {pickerOpen && (
        <BookPicker
          currentBook={book}
          currentChapter={chapter}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
