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
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [versionOpen]);

  const chapterLabel =
    book.chapterCount === 1 ? book.name : `${book.name} ${chapter}`;

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur-sm dark:border-stone-800 dark:bg-stone-950/95">
        <button
          onClick={() => setPickerOpen(true)}
          className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-100 transition-colors dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
        >
          {chapterLabel}
        </button>
        <div className="flex items-center gap-2">
          <ReaderSettings />
        <button
          onClick={onToggleInterlinear}
          title="Greek / Hebrew interlinear"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
            interlinear
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-white text-stone-500 hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
          }`}
        >
          אα
        </button>
        <div className="relative" ref={versionRef}>
          <button
            onClick={() => setVersionOpen((v) => !v)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-500 shadow-sm hover:bg-stone-100 transition-colors dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            {translation.abbr}
          </button>
          {versionOpen && (
            <div className="absolute right-0 top-full mt-1 max-h-[70vh] w-56 overflow-y-auto overscroll-contain rounded-xl bg-white py-1 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
              {TRANSLATIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onTranslationChange(t);
                    setVersionOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-700 ${
                    t.id === translation.id
                      ? 'bg-stone-50 font-semibold text-stone-900 dark:bg-stone-700 dark:text-white'
                      : 'text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <span>{t.name}</span>
                  <span className="text-xs text-stone-400">{t.abbr}</span>
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
