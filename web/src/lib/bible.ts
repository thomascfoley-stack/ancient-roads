// Client-side Bible data access. Fetches verse JSON from /bible/{translation}/{slug}/{chapter}.json.

import { BOOKS, BOOK_BY_SLUG, type Book } from '@bible/books';

export type { Book };
export { BOOKS, BOOK_BY_SLUG };

export const BOOK_BY_BOOK_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));

export interface Translation {
  id: string;
  name: string;
  abbr: string;
}

export const TRANSLATIONS: Translation[] = [
  { id: 'web', name: 'World English Bible', abbr: 'WEB' },
  { id: 'bsb', name: 'Berean Standard Bible', abbr: 'BSB' },
  { id: 'kjv', name: 'King James Version', abbr: 'KJV' },
  { id: 'asv', name: 'American Standard Version', abbr: 'ASV' },
  { id: 'ylt', name: "Young's Literal Translation", abbr: 'YLT' },
  { id: 'darby', name: 'Darby Translation', abbr: 'DBY' },
  { id: 'bbe', name: 'Bible in Basic English', abbr: 'BBE' },
  { id: 'lsv', name: 'Literal Standard Version', abbr: 'LSV' },
];

export const DEFAULT_TRANSLATION = 'web';

export interface ChapterData {
  book: number;
  chapter: number;
  translation?: string;
  verses: { verse: number; text: string }[];
}

export async function fetchChapter(
  bookSlug: string,
  chapter: number,
  translation: string = DEFAULT_TRANSLATION,
): Promise<ChapterData> {
  const res = await fetch(`/bible/${translation}/${bookSlug}/${chapter}.json`);
  if (!res.ok) throw new Error(`Failed to load ${bookSlug} ${chapter}`);
  return res.json();
}

export interface CommentaryEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  year: number | null;
  tradition?: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
}

export interface CommentaryData {
  book: number;
  chapter: number;
  entries: CommentaryEntry[];
}

export async function fetchCommentary(
  bookSlug: string,
  chapter: number,
): Promise<CommentaryData | null> {
  try {
    const res = await fetch(`/commentaries/${bookSlug}/${chapter}.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function bookUrl(book: Book, chapter = 1): string {
  return `/read/${book.slug}/${chapter}`;
}

export function prevChapter(
  book: Book,
  chapter: number,
): { book: Book; chapter: number } | null {
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const idx = BOOKS.indexOf(book);
  if (idx <= 0) return null;
  const prev = BOOKS[idx - 1]!;
  return { book: prev, chapter: prev.chapterCount };
}

export function nextChapter(
  book: Book,
  chapter: number,
): { book: Book; chapter: number } | null {
  if (chapter < book.chapterCount) return { book, chapter: chapter + 1 };
  const idx = BOOKS.indexOf(book);
  if (idx >= BOOKS.length - 1) return null;
  const next = BOOKS[idx + 1]!;
  return { book: next, chapter: 1 };
}
