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
    // The nav spans the READING MEASURE, not a fixed width: a max-w-2xl row under an 84ch
    // chapter sits visibly inset from the text it serves (owner direction 2026-08-12).
    <div className="reading-measure mx-auto flex items-center justify-between gap-3 border-t edge px-4 py-3">
      {/* PRD reader nav: hairline-bordered arrows, square; hover is the instant ink fill
          (PRD §6/§7 — buttons fill immediately, so no transition here). */}
      {prev ? (
        <Link
          href={bookUrl(prev.book, prev.chapter)}
          className="flex min-h-[48px] items-center border edge px-4 text-sm font-medium text-stone-500 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-400 dark:hover:bg-stone-200 dark:hover:text-stone-950"
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
          className="flex min-h-[48px] items-center border edge px-4 text-sm font-medium text-stone-500 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-400 dark:hover:bg-stone-200 dark:hover:text-stone-950"
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
