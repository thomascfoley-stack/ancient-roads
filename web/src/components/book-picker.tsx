'use client';

import { useState } from 'react';
import { BOOKS, type Book, bookUrl } from '@/lib/bible';
import Link from 'next/link';

type SortMode = 'canonical' | 'alpha';

export function BookPicker({
  currentBook,
  currentChapter,
  onClose,
}: {
  currentBook: Book;
  currentChapter: number;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'book' | 'chapter'>('book');
  const [selectedBook, setSelectedBook] = useState<Book>(currentBook);
  const [sort, setSort] = useState<SortMode>('canonical');

  const sorted =
    sort === 'canonical'
      ? BOOKS
      : [...BOOKS].sort((a, b) => a.name.localeCompare(b.name));

  const otBooks = sorted.filter((b) => b.testament === 'OT');
  const ntBooks = sorted.filter((b) => b.testament === 'NT');

  if (stage === 'chapter') {
    const chapters = Array.from(
      { length: selectedBook.chapterCount },
      (_, i) => i + 1,
    );
    return (
      <div className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-stone-50/97 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur-sm dark:bg-stone-950/97">
        <div className="mx-auto max-w-lg px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setStage('book')}
              className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm text-stone-500 hover:text-stone-800 active:bg-stone-200/60 dark:hover:text-stone-200"
            >
              &larr; Books
            </button>
            <h2 className="font-display text-lg font-semibold text-stone-800 dark:text-stone-100">
              {selectedBook.name}
            </h2>
            <button
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm text-stone-500 hover:text-stone-800 active:bg-stone-200/60 dark:hover:text-stone-200"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {chapters.map((c) => (
              <Link
                key={c}
                href={bookUrl(selectedBook, c)}
                onClick={onClose}
                className={`flex h-12 items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                  selectedBook.slug === currentBook.slug && c === currentChapter
                    ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
                    : 'bg-paper text-stone-700 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none'
                }`}
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-stone-50/97 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur-sm dark:bg-stone-950/97">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSort(sort === 'canonical' ? 'alpha' : 'canonical')}
            className="inline-flex min-h-[44px] items-center rounded-full bg-paper px-4 text-xs font-medium text-stone-600 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:shadow-none"
          >
            {sort === 'canonical' ? 'A–Z' : '1–66'}
          </button>
          <h2 className="font-display text-lg font-semibold text-stone-800 dark:text-stone-100">Books</h2>
          <button
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm text-stone-500 hover:text-stone-800 active:bg-stone-200/60 dark:hover:text-stone-200"
          >
            Close
          </button>
        </div>

        <BookSection
          label="Old Testament"
          books={otBooks}
          currentSlug={currentBook.slug}
          onSelect={(b) => {
            setSelectedBook(b);
            if (b.chapterCount === 1) {
              // Single-chapter books skip the chapter grid
              return;
            }
            setStage('chapter');
          }}
        />
        <BookSection
          label="New Testament"
          books={ntBooks}
          currentSlug={currentBook.slug}
          onSelect={(b) => {
            setSelectedBook(b);
            if (b.chapterCount === 1) return;
            setStage('chapter');
          }}
        />
      </div>
    </div>
  );
}

function BookSection({
  label,
  books,
  currentSlug,
  onSelect,
}: {
  label: string;
  books: Book[];
  currentSlug: string;
  onSelect: (b: Book) => void;
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </h3>
      <div className="grid grid-cols-4 gap-1.5">
        {books.map((b) => {
          if (b.chapterCount === 1) {
            return (
              <Link
                key={b.slug}
                href={bookUrl(b, 1)}
                className={`flex min-h-[48px] items-center justify-center rounded-xl px-2 py-2 text-center text-sm transition-colors ${
                  b.slug === currentSlug
                    ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
                    : 'bg-paper text-stone-700 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none'
                }`}
              >
                {b.name}
              </Link>
            );
          }
          return (
            <button
              key={b.slug}
              onClick={() => onSelect(b)}
              className={`flex min-h-[48px] items-center justify-center rounded-xl px-2 py-2 text-center text-sm transition-colors ${
                b.slug === currentSlug
                  ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
                  : 'bg-paper text-stone-700 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none'
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
