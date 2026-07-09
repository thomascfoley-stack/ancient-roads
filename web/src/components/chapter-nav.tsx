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
    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 dark:border-stone-800">
      {prev ? (
        <Link
          href={bookUrl(prev.book, prev.chapter)}
          className="flex min-h-[48px] items-center rounded-xl px-4 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800 active:bg-stone-100 dark:hover:text-stone-200 dark:active:bg-stone-800"
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
          className="flex min-h-[48px] items-center rounded-xl px-4 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800 active:bg-stone-100 dark:hover:text-stone-200 dark:active:bg-stone-800"
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
