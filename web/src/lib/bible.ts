// Client-side Bible data access. Fetches verse JSON from /bible/{translation}/{slug}/{chapter}.json.

import { BOOKS, BOOK_BY_SLUG, type Book } from '@bible/books';
import { isPublishedCommentaryEntry, isPublishedAuthor } from '@/lib/legal-corpus';

export type { Book };
export { BOOKS, BOOK_BY_SLUG };

export const BOOK_BY_BOOK_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));

export interface Translation {
  id: string;
  name: string;
  abbr: string;
}

// Translation IDs the corpus policy forbids serving — copyrighted or commercially
// capped, per docs/ACQUISITION_MANIFEST.md:28 ("EXCLUDE (copyrighted, commonly mislabeled
// free): LEB (Lexham), LITV / MKJV (Green's), LSV (CC BY-SA but commercial-capped), NASB/
// NIV/ESV/NLT/CSB"). These must never appear in TRANSLATIONS (the served reader picker).
// Guarded by web/test/invariants/translation-licensing.test.ts. The static files under
// web/public/bible/{leb,litv,mkjv,lsv}/ still need purging + a redeploy — owner action
// (docs/LONG_NIGHT.md § NEEDS YOUR HAND, finding C1). Removing them here stops the reader
// offering them; it does NOT remove the already-deployed files.
export const FORBIDDEN_TRANSLATION_IDS = ['leb', 'litv', 'mkjv', 'lsv', 'nasb', 'niv', 'esv', 'nlt', 'csb'] as const;

export const TRANSLATIONS: Translation[] = [
  { id: 'web', name: 'World English Bible', abbr: 'WEB' },
  { id: 'bsb', name: 'Berean Standard Bible', abbr: 'BSB' },
  { id: 'kjv', name: 'King James Version', abbr: 'KJV' },
  { id: 'asv', name: 'American Standard Version', abbr: 'ASV' },
  { id: 'ylt', name: "Young's Literal Translation", abbr: 'YLT' },
  { id: 'darby', name: 'Darby Translation', abbr: 'DBY' },
  { id: 'bbe', name: 'Bible in Basic English', abbr: 'BBE' },
  { id: 'geneva', name: 'Geneva Bible (1599)', abbr: 'GNV' },
  { id: 'tyndale', name: 'Tyndale Bible', abbr: 'TYN' },
  { id: 'webster', name: "Webster's Bible Translation", abbr: 'WBT' },
  { id: 'nheb', name: 'New Heart English Bible', abbr: 'NHEB' },
  { id: 'akjv', name: 'American King James Version', abbr: 'AKJV' },
  { id: 'rotherham', name: "Rotherham's Emphasized Bible", abbr: 'REB' },
  { id: 'jubilee', name: 'Jubilee Bible 2000', abbr: 'JUB' },
  { id: 'rwebster', name: 'Revised Webster Version', abbr: 'RWB' },
  { id: 'ukjv', name: 'Updated King James Version', abbr: 'UKJV' },
  { id: 'noyes', name: 'Noyes Translation', abbr: 'NOY' },
  { id: 'anderson', name: 'Anderson New Testament', abbr: 'ANT' },
];

export const DEFAULT_TRANSLATION = 'web';

export interface ChapterData {
  book: number;
  chapter: number;
  translation?: string;
  verses: { verse: number; text: string }[];
}

interface BibleBookFile {
  translation: string;
  book: number;
  slug: string;
  chapters: Record<string, { verse: number; text: string }[]>;
}

// Per-book files are consolidated (see src/ingest/consolidate-bibles.ts). Cache
// the fetched book so paging between chapters in the same book doesn't refetch.
const bookCache = new Map<string, BibleBookFile>();

export async function fetchChapter(
  bookSlug: string,
  chapter: number,
  translation: string = DEFAULT_TRANSLATION,
): Promise<ChapterData> {
  const key = `${translation}/${bookSlug}`;
  let bookFile = bookCache.get(key);
  if (!bookFile) {
    const res = await fetch(`/bible/${translation}/${bookSlug}.json`);
    if (!res.ok) throw new Error(`Failed to load ${bookSlug} (${translation})`);
    bookFile = (await res.json()) as BibleBookFile;
    bookCache.set(key, bookFile);
  }
  const verses = bookFile.chapters[String(chapter)];
  if (!verses) throw new Error(`Failed to load ${bookSlug} ${chapter}`);
  return { book: bookFile.book, chapter, translation, verses };
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
    const data = (await res.json()) as CommentaryData;
    // INTEGRITY (§1a): the static files hold the whole ingested corpus, including
    // unverified/heretical authors (Pelagius, Valentinus, …). The reader must serve only
    // published authors — the same boundary the DB paths enforce — NOT the raw file.
    return {
      ...data,
      entries: data.entries.filter((e) =>
        isPublishedCommentaryEntry({ author: e.author, sourceUrl: e.sourceUrl, book: data.book }),
      ),
    };
  } catch {
    return null;
  }
}

export interface CommentarySource {
  author: string;
  sourceTitle: string;
  tradition: string | null;
  year: number | null;
  entries: number;
  bookSlugs: string[];
}

export interface CommentaryManifest {
  generatedAt: string;
  sources: CommentarySource[];
}

export async function fetchCommentaryManifest(): Promise<CommentaryManifest | null> {
  try {
    const res = await fetch('/commentaries/_manifest.json');
    if (!res.ok) return null;
    const m = (await res.json()) as CommentaryManifest;
    // §1a: the library facet must list only published authors (was leaking Tyndale,
    // Pelagius, et al. into the source dropdown).
    return { ...m, sources: m.sources.filter((s) => isPublishedAuthor(s.author)) };
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
