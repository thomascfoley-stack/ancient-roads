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
      <div className="fixed inset-0 z-50 bg-stone-50/95 backdrop-blur-sm overflow-auto dark:bg-stone-950/95">
        <div className="mx-auto max-w-lg px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setStage('book')}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              &larr; Books
            </button>
            <h2 className="text-lg font-semibold text-stone-800">
              {selectedBook.name}
            </h2>
            <button
              onClick={onClose}
              className="text-sm text-stone-500 hover:text-stone-800"
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
                className={`flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                  selectedBook.slug === currentBook.slug && c === currentChapter
                    ? 'bg-stone-800 text-white'
                    : 'bg-white text-stone-700 hover:bg-stone-100 shadow-sm'
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
    <div className="fixed inset-0 z-50 bg-stone-50/95 backdrop-blur-sm overflow-auto">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSort(sort === 'canonical' ? 'alpha' : 'canonical')}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-100"
          >
            {sort === 'canonical' ? 'A–Z' : '1–66'}
          </button>
          <h2 className="text-lg font-semibold text-stone-800">Books</h2>
          <button
            onClick={onClose}
            className="text-sm text-stone-500 hover:text-stone-800"
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
                className={`rounded-lg px-2 py-2 text-center text-sm transition-colors ${
                  b.slug === currentSlug
                    ? 'bg-stone-800 text-white'
                    : 'bg-white text-stone-700 hover:bg-stone-100 shadow-sm'
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
              className={`rounded-lg px-2 py-2 text-center text-sm transition-colors ${
                b.slug === currentSlug
                  ? 'bg-stone-800 text-white'
                  : 'bg-white text-stone-700 hover:bg-stone-100 shadow-sm'
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
