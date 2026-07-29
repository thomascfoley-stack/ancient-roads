// Canonical verse ID: book * 1_000_000 + chapter * 1_000 + verse.
// Genesis 1:1 = 1001001. John 3:16 = 43003016. Sortable, rangeable, joinable.

import { BOOK_BY_NUM } from './books';

export interface VerseRef {
  book: number;
  chapter: number;
  verse: number;
}

export function encodeVerseId({ book, chapter, verse }: VerseRef): number {
  return book * 1_000_000 + chapter * 1_000 + verse;
}

export function decodeVerseId(verseId: number): VerseRef {
  const book = Math.floor(verseId / 1_000_000);
  const chapter = Math.floor((verseId % 1_000_000) / 1_000);
  const verse = verseId % 1_000;
  return { book, chapter, verse };
}

// Structural validity: known book, chapter within the book's KJV chapter
// count, verse >= 1. Verse-number upper bounds require the verses table;
// the verifier's corpus lookup handles that.
export function isStructurallyValidVerseId(verseId: number): boolean {
  if (!Number.isInteger(verseId) || verseId <= 0) return false;
  const { book, chapter, verse } = decodeVerseId(verseId);
  const b = BOOK_BY_NUM.get(book);
  if (!b) return false;
  return chapter >= 1 && chapter <= b.chapterCount && verse >= 1;
}

export function formatVerseId(verseId: number): string {
  const { book, chapter, verse } = decodeVerseId(verseId);
  const b = BOOK_BY_NUM.get(book);
  return `${b?.name ?? `Book ${book}`} ${chapter}:${verse}`;
}
