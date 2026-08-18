// Client-side Bible data access. Fetches verse JSON from /bible/{translation}/{slug}/{chapter}.json.

import { BOOKS, BOOK_BY_SLUG, type Book } from '@bible/books';
import { isPublishedCommentaryEntry, isPublishedAuthor } from '@/lib/legal-corpus';
import { TRANSLATION_LICENSES } from '@/lib/licensing';

export type { Book };
export { BOOKS, BOOK_BY_SLUG };

export const BOOK_BY_BOOK_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));

export interface Translation {
  id: string;
  name: string;
  abbr: string;
}

// The served reader picker. Every id here MUST have a shipping license record in
// web/src/lib/licensing.ts (commercial_use=allow, or conditional+ack) — enforced by
// web/test/invariants/translation-licensing.test.ts, which is the picker-side twin of the
// deploy gate. Excluded because their record blocks: litv/mkjv (deny), leb (conditional,
// no ack), jubilee (unknown — Jubilee Bible 2000 appears copyrighted). LSV ships WITH
// attribution (see translationAttribution).
export const TRANSLATIONS: Translation[] = [
  { id: 'web', name: 'World English Bible', abbr: 'WEB' },
  { id: 'bsb', name: 'Berean Standard Bible', abbr: 'BSB' },
  { id: 'kjv', name: 'King James Version', abbr: 'KJV' },
  { id: 'asv', name: 'American Standard Version', abbr: 'ASV' },
  { id: 'ylt', name: "Young's Literal Translation", abbr: 'YLT' },
  { id: 'darby', name: 'Darby Translation', abbr: 'DBY' },
  { id: 'bbe', name: 'Bible in Basic English', abbr: 'BBE' },
  { id: 'lsv', name: 'Literal Standard Version', abbr: 'LSV' },
  { id: 'geneva', name: 'Geneva Bible (1599)', abbr: 'GNV' },
  { id: 'tyndale', name: 'Tyndale Bible', abbr: 'TYN' },
  { id: 'webster', name: "Webster's Bible Translation", abbr: 'WBT' },
  { id: 'nheb', name: 'New Heart English Bible', abbr: 'NHEB' },
  { id: 'akjv', name: 'American King James Version', abbr: 'AKJV' },
  { id: 'rotherham', name: "Rotherham's Emphasized Bible", abbr: 'REB' },
  { id: 'rwebster', name: 'Revised Webster Version', abbr: 'RWB' },
  { id: 'ukjv', name: 'Updated King James Version', abbr: 'UKJV' },
  { id: 'noyes', name: 'Noyes Translation', abbr: 'NOY' },
  { id: 'anderson', name: 'Anderson New Testament', abbr: 'ANT' },
];

// Required display credit for a translation (CC BY / CC BY-SA / conditional), or undefined
// for public-domain works. The reader shows this when the translation is selected.
export function translationAttribution(id: string): string | undefined {
  return TRANSLATION_LICENSES[id]?.attribution;
}

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
  // Register go-live (CONTENT_GO_LIVE decision 2/3): published-work slug +
  // register label; paraphrase marks metrical psalters (never Scripture).
  work?: string;
  register?: string;
  paraphrase?: boolean;
  license?: string; // shown when attribution-required (CC BY / CC BY-SA)
}

// The register wall, reader side: hymn/poetry entries render in their own
// LABELED section and never mix with (or displace) exegetical voices.
export function isSongVerse(e: CommentaryEntry): boolean {
  return e.register === 'hymn' || e.register === 'poetry';
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
        isPublishedCommentaryEntry({ author: e.author, sourceUrl: e.sourceUrl, book: data.book, work: e.work }),
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
  // BY SLUG, NOT BY REFERENCE — see canonIndex below.
  const idx = canonIndex(book);
  if (idx <= 0) return null;
  const prev = BOOKS[idx - 1]!;
  return { book: prev, chapter: prev.chapterCount };
}

// A book's position in the canon, or -1.
//
// This was `BOOKS.indexOf(book)`, which compares by REFERENCE, so any book that was equal but not
// identical — rebuilt from a route param, round-tripped through JSON, spread into a new object, or
// returned by a resolver that constructs rather than hands back the singleton — scored -1. Neither
// caller was written for -1, and they failed in opposite directions and in silence:
//
//   nextChapter guarded `idx >= BOOKS.length - 1`, which -1 is not, and fell through to
//   BOOKS[-1 + 1] — **Genesis 1**. So reading past the last chapter of any book could continue
//   into an unrelated one with no error, and past Revelation it WRAPPED the canon.
//   prevChapter guarded `idx <= 0` and returned null: a silent dead end at the top of every book.
//
// Slug is how the rest of the app identifies a book (`resolveBookSlug`, the reader routes, the
// desk panes), so this makes the lookup agree with them and removes identity from the contract.
function canonIndex(book: Book): number {
  return BOOKS.findIndex((b) => b.slug === book.slug);
}

export function nextChapter(
  book: Book,
  chapter: number,
): { book: Book; chapter: number } | null {
  if (chapter < book.chapterCount) return { book, chapter: chapter + 1 };
  const idx = canonIndex(book);
  // `idx < 0` must be its own case: the old `idx >= BOOKS.length - 1` guard let -1 through and
  // landed on BOOKS[0]. An unknown book has no successor; it does not have Genesis.
  if (idx < 0 || idx >= BOOKS.length - 1) return null;
  const next = BOOKS[idx + 1]!;
  return { book: next, chapter: 1 };
}
