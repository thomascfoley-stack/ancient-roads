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
}: {
  book: Book;
  chapter: number;
  translation: Translation;
  onTranslationChange: (t: Translation) => void;
  interlinear: boolean;
  onToggleInterlinear: () => void;
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
    // An anchored menu is not a modal, so it gets Escape and focus return but NOT a focus
    // trap. Without this the only way out was a mouse click somewhere else, which leaves a
    // keyboard user stuck with the menu open behind them.
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setVersionOpen(false);
        versionRef.current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [versionOpen]);

  const chapterLabel =
    book.chapterCount === 1 ? book.name : `${book.name} ${chapter}`;

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b edge bg-stone-50/95 px-3 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur-sm sm:px-4 dark:bg-stone-950/95">
        {/* Every control in this bar was an unlabelled glyph: a screen reader announced them as
            "Aa", "אα" (aleph then alpha, read as content) and "WEB". Two of them open menus and
            said nothing about it, so the chapter title and the translation code both read as
            static text rather than as the pickers they are. */}
        <button
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label={`${chapterLabel}. Choose a book or chapter`}
          className="min-h-[44px] rounded-lg bg-paper px-4 text-sm font-semibold text-stone-800 shadow-paper hover:bg-stone-100 active:bg-stone-200 transition-colors ease-gentle sm:min-h-0 sm:py-1.5 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
        >
          {chapterLabel}
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ReaderSettings />
        <button
          onClick={onToggleInterlinear}
          title="Greek / Hebrew interlinear"
          aria-pressed={interlinear}
          aria-label="Greek and Hebrew interlinear"
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 shadow-paper transition-colors ease-gentle sm:min-h-8 sm:min-w-8 ${
            interlinear
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-paper text-stone-500 hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
          }`}
        >
          <LanguagesIcon />
        </button>
        <div className="relative" ref={versionRef}>
          <button
            onClick={() => setVersionOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={versionOpen}
            aria-label={`Translation: ${translation.name}. Change translation`}
            className="flex min-h-[44px] items-center gap-1 rounded-lg bg-paper px-3 text-xs font-medium text-stone-500 shadow-paper hover:bg-stone-100 active:bg-stone-200 transition-colors ease-gentle sm:min-h-8 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            {translation.abbr}
            <ChevronDownIcon />
          </button>
          {versionOpen && (
            <div role="menu" aria-label="Translation" className="absolute right-0 top-full mt-1 max-h-[70dvh] w-56 overflow-y-auto overscroll-contain rounded-xl bg-paper py-1 shadow-float ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
              {TRANSLATIONS.map((t) => (
                <button
                  key={t.id}
                  role="menuitemradio"
                  aria-checked={t.id === translation.id}
                  onClick={() => {
                    onTranslationChange(t);
                    setVersionOpen(false);
                  }}
                  className={`flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-700 ${
                    t.id === translation.id
                      ? 'bg-stone-50 font-semibold text-stone-900 dark:bg-stone-700 dark:text-white'
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

/* Matches sidebar.tsx's LanguagesIcon, which replaced the same `אα` glyph in the rail. The
   two lived one component apart with opposite treatments. */
function LanguagesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6h8M7 6v10m-3 0h6M14 18l3.5-9 3.5 9m-6-3h5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
