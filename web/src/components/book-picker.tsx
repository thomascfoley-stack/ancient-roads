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
  const [jump, setJump] = useState('');
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
    // Filter by prefix, not equality: typing "1" on Psalms should narrow toward 1, 1x, 1xx rather
    // than jumping to chapter 1 and hiding 119. An out-of-range or non-numeric entry narrows to
    // nothing, which is honest — the grid shows what matches.
    const shownChapters = jump.trim() === '' ? chapters : chapters.filter((c) => String(c).startsWith(jump.trim()));
    const chapterCell = (c: number) =>
      `flex h-12 items-center justify-center text-sm font-medium transition-colors ease-gentle ${
        selectedBook.slug === currentBook.slug && c === currentChapter
          ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
          : 'border edge bg-paper text-stone-700 hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-900 dark:text-stone-200'
      }`;
    return (
      <div
        ref={dialog.ref}
        {...dialog.dialogProps}
        className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-stone-50/97 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-stone-950/97"
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
          {/* JUMP, DO NOT SCROLL — S2 item 5. Psalm 119 sat 150 taps down a scrolling grid. One
              input filtering an array already in memory; no new state store, no new dependency.
              Shown only where it earns its place: below ~24 chapters the grid is already one
              glance, and an extra control would be noise on 44 of the 66 books. */}
          {selectedBook.chapterCount > 24 && (
            // PRD §6 input: parchment surface, 1px hairline, square corners, gold border on focus.
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={selectedBook.chapterCount}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              aria-label={`Jump to a chapter in ${selectedBook.name}, 1 to ${selectedBook.chapterCount}`}
              placeholder={`Jump to a chapter (1–${selectedBook.chapterCount})`}
              className="mb-4 min-h-[44px] w-full border edge edge-focus bg-paper px-4 font-sans text-base text-stone-900 outline-none placeholder:text-stone-400 focus-quiet dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
            />
          )}
          <div className="grid grid-cols-6 gap-2">
            {shownChapters.map((c) =>
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
      className="fixed inset-0 z-50 overflow-auto overscroll-contain bg-stone-50/97 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-stone-950/97"
    >
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSort(sort === 'canonical' ? 'alpha' : 'canonical')}
            className="inline-flex min-h-[44px] items-center border edge bg-paper px-4 text-xs font-medium text-stone-600 hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-900 dark:text-stone-300"
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
    `flex min-h-[48px] items-center justify-center px-2 py-2 text-center text-sm transition-colors ease-gentle ${
      slug === currentSlug
        ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
        : 'border edge bg-paper text-stone-700 hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-900 dark:text-stone-200'
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
