import { decodeVerseId } from '@bible/verse-id';
import { BOOK_BY_NUM } from '@bible/books';

/**
 * The reader URL for a stored verse id, targeting the VERSE.
 *
 * This lived inline in `/library/notes`, building `/read/<slug>/<chapter>` — so "jump back to it"
 * on a note about John 3:16 dropped the reader at John 3:1 and left them to find their own note
 * in a 36-verse chapter. Psalm 119 would be 176 (A7b walk, 2026-08-02).
 *
 * It lives here rather than in the page because the test needs the SHIPPED function. Its first
 * version re-declared this logic inside the test file, which meant seeding the page did not turn
 * the test red — a red-proof against a copy of the predicate, which is a named entry on this
 * repo's own failure-mode watchlist. One definition, imported by both.
 *
 * Returns '#' when the book number does not resolve, so a corrupt id renders an inert link rather
 * than a plausible-looking one that leads somewhere wrong.
 */
export function verseHref(verseId: number): string {
  const { book, chapter, verse } = decodeVerseId(verseId);
  const b = BOOK_BY_NUM.get(book);
  return b ? `/read/${b.slug}/${chapter}#v${verse}` : '#';
}
