'use client';

import { useState } from 'react';
import { useDialog } from '@/lib/use-dialog';
import { BOOKS, type Book, bookUrl } from '@/lib/bible';
import Link from 'next/link';

type SortMode = 'canonical' | 'alpha';

export function BookPicker({
  currentBook,
  currentChapter,
  onClose,
  onPick,
}: {
  currentBook: Book;
  currentChapter: number;
  onClose: () => void;
  /** When provided, picking a chapter calls this instead of navigating to /read — the desk uses
   *  it to place the selection into a pane. Omitted, cells are plain links (the reader's case). */
  onPick?: (book: Book, chapter: number) => void;
}) {
  const [stage, setStage] = useState<'book' | 'chapter'>('book');
  const [selectedBook, setSelectedBook] = useState<Book>(currentBook);
  const [sort, setSort] = useState<SortMode>('canonical');
  // Full-screen and, until now, inescapable by keyboard: no Escape handler, no backdrop
  // dismiss, close was the one button. useDialog supplies Escape, the focus trap and
  // focus restore; the two returns below are exclusive stages of the same overlay.
  const dialog = useDialog(onClose, 'Choose a book or chapter');

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
    const chapterCell = (c: number) =>
      `flex h-12 items-center justify-center rounded-xl text-sm font-medium transition-colors ease-gentle ${
        selectedBook.slug === currentBook.slug && c === currentChapter
          ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
          : 'bg-paper text-stone-700 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none'
      }`;
    return (
      <div
        ref={dialog.ref}
        {...dialog.dialogProps}
        className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-stone-50/97 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur-sm dark:bg-stone-950/97"
      >
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
            {chapters.map((c) =>
              onPick ? (
                <button key={c} onClick={() => onPick(selectedBook, c)} className={chapterCell(c)}>
                  {c}
                </button>
              ) : (
                <Link key={c} href={bookUrl(selectedBook, c)} onClick={onClose} className={chapterCell(c)}>
                  {c}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialog.ref}
      {...dialog.dialogProps}
      className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-stone-50/97 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur-sm dark:bg-stone-950/97"
    >
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSort(sort === 'canonical' ? 'alpha' : 'canonical')}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-paper px-4 text-xs font-medium text-stone-600 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:shadow-none"
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
          onPick={onPick}
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
          onPick={onPick}
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
  onPick,
}: {
  label: string;
  books: Book[];
  currentSlug: string;
  onSelect: (b: Book) => void;
  onPick?: (b: Book, chapter: number) => void;
}) {
  const cell = (slug: string) =>
    `flex min-h-[48px] items-center justify-center rounded-xl px-2 py-2 text-center text-sm transition-colors ease-gentle ${
      slug === currentSlug
        ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
        : 'bg-paper text-stone-700 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none'
    }`;
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </h3>
      <div className="grid grid-cols-4 gap-1.5">
        {books.map((b) => {
          if (b.chapterCount === 1) {
            // A single-chapter book IS its only chapter, so in pick mode it picks directly.
            return onPick ? (
              <button key={b.slug} onClick={() => onPick(b, 1)} className={cell(b.slug)}>
                {b.name}
              </button>
            ) : (
              <Link key={b.slug} href={bookUrl(b, 1)} className={cell(b.slug)}>
                {b.name}
              </Link>
            );
          }
          return (
            <button key={b.slug} onClick={() => onSelect(b)} className={cell(b.slug)}>
              {b.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
