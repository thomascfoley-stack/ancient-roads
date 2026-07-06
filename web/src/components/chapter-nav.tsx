'use client';

import Link from 'next/link';
import { type Book, bookUrl, prevChapter, nextChapter } from '@/lib/bible';

export function ChapterNav({
  book,
  chapter,
}: {
  book: Book;
  chapter: number;
}) {
  const prev = prevChapter(book, chapter);
  const next = nextChapter(book, chapter);

  return (
    <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
      {prev ? (
        <Link
          href={bookUrl(prev.book, prev.chapter)}
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          &larr;{' '}
          {prev.book.slug === book.slug
            ? `Chapter ${prev.chapter}`
            : `${prev.book.name} ${prev.chapter}`}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={bookUrl(next.book, next.chapter)}
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          {next.book.slug === book.slug
            ? `Chapter ${next.chapter}`
            : `${next.book.name} ${next.chapter}`}{' '}
          &rarr;
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
