// Verse previews — the passage behind a reference, read without leaving the page it was cited on.
//
// IT REUSES THE READER'S fetchChapter, AND THE FIRST CUT OF THIS FILE DID NOT. That version read
// the per-chapter files (`/bible/<t>/1ki/18.json`, 7.6K) rather than the whole-book ones
// (`1ki.json` is 137K, `psa.json` 264K), because one day of a topical plan cites ~18 passages
// across ~10 books and pulling a whole book per hover is heavy. The per-chapter files are sitting
// right there in `web/public`, so it worked locally, and it was broken the moment it deployed:
// `web/.vercelignore` excludes `public/bible/*/*/` DELIBERATELY — 21,402 files would blow Vercel's
// 15,000-file CLI limit — so those paths exist on no deployment. Every preview would have 404'd
// into "This passage could not be loaded".
//
// The lesson generalises past Bible files: A FILE PRESENT IN THE WORKING TREE IS NOT A FILE THAT
// SHIPS, and `ls` cannot tell you the difference. Check what the deploy actually uploads.
//
// So previews now read the same whole-book files the reader reads, through the same `bookCache`.
// Two consequences worth knowing: a multi-chapter span inside one book costs ONE fetch instead of
// one per chapter, and a reader already in a book gets its previews for free (and the reverse).
// Still no database and nothing on the request path, which is what keeps hover instant.

import { BOOK_BY_NUM } from '@/bible/books';
import { CHAPTER_END_SENTINEL } from '@/bible/ref-parse';
import { DEFAULT_TRANSLATION, TRANSLATIONS, fetchChapter } from '@/lib/bible';

/** One chapter's contribution to a reference's span, with the verse window to show from it. */
export interface ChapterSlice {
  bookNum: number;
  bookSlug: string;
  bookName: string;
  chapter: number;
  /** 1-based, inclusive. */
  fromVerse: number;
  /** Inclusive. CHAPTER_END_SENTINEL means "to the end of this chapter". */
  toVerse: number;
}

export interface Span {
  slices: ChapterSlice[];
  /** Chapters past the cap were dropped. The UI must SAY so rather than imply completeness. */
  truncated: boolean;
  /** How many chapters the reference really spans, before the cap. */
  totalChapters: number;
}

// A whole-Bible plan at 26 weeks x 7 days paces 1,189 chapters over 182 days — ~7 chapters a day —
// so a cap below 8 would render the commonest long plan as permanently truncated. Eight of the
// per-chapter files is ~40KB, still far under a single whole-book fetch.
export const MAX_PREVIEW_CHAPTERS = 8;

const EMPTY: Span = { slices: [], truncated: false, totalChapters: 0 };

/**
 * Walk a canonical verse-id span into per-chapter slices. Pure — no I/O, no clock.
 *
 * Covers the three shapes the plan tables actually produce: a verse range inside one chapter
 * (a topical entry, "1 Kings 18:24-39"); a whole chapter written as verse 1..CHAPTER_END_SENTINEL
 * (how the topical index prints "History of Ge 1; 2"); and a multi-chapter day span that may cross
 * a book boundary, which canonical-group plans routinely do — 87 Pauline chapters over 24 days
 * guarantees a straddling day.
 */
export function chaptersInSpan(verseStart: number, verseEnd: number): Span {
  if (!Number.isInteger(verseStart) || !Number.isInteger(verseEnd)) return EMPTY;
  // A backwards span is a caller bug. Show nothing rather than silently reading it forwards.
  if (verseEnd < verseStart) return EMPTY;

  const startBook = Math.floor(verseStart / 1_000_000);
  const endBook = Math.floor(verseEnd / 1_000_000);
  const startCh = Math.floor((verseStart % 1_000_000) / 1000);
  const endCh = Math.floor((verseEnd % 1_000_000) / 1000);
  const startVerse = verseStart % 1000;
  const endVerse = verseEnd % 1000;
  if (startCh < 1 || endCh < 1) return EMPTY;

  const all: ChapterSlice[] = [];
  for (let b = startBook; b <= endBook; b++) {
    const book = BOOK_BY_NUM.get(b);
    // An unknown book number means the id is malformed. Show nothing rather than guess at it.
    if (!book) return EMPTY;
    const from = b === startBook ? startCh : 1;
    const to = b === endBook ? Math.min(endCh, book.chapterCount) : book.chapterCount;
    for (let c = from; c <= to; c++) {
      all.push({
        bookNum: b,
        bookSlug: book.slug,
        bookName: book.name,
        chapter: c,
        fromVerse: b === startBook && c === startCh ? Math.max(1, startVerse) : 1,
        toVerse: b === endBook && c === endCh ? endVerse : CHAPTER_END_SENTINEL,
      });
    }
  }
  return {
    slices: all.slice(0, MAX_PREVIEW_CHAPTERS),
    truncated: all.length > MAX_PREVIEW_CHAPTERS,
    totalChapters: all.length,
  };
}

/** The whole chapter a reference STARTS in — what the pane's "whole chapter" control loads. */
export function wholeChapterSpan(verseStart: number): Span {
  const book = BOOK_BY_NUM.get(Math.floor(verseStart / 1_000_000));
  const chapter = Math.floor((verseStart % 1_000_000) / 1000);
  if (!book || chapter < 1 || chapter > book.chapterCount) return EMPTY;
  return {
    slices: [
      {
        bookNum: book.bookNum,
        bookSlug: book.slug,
        bookName: book.name,
        chapter,
        fromVerse: 1,
        toVerse: CHAPTER_END_SENTINEL,
      },
    ],
    truncated: false,
    totalChapters: 1,
  };
}

/** True when a span already runs a chapter end to end, so "whole chapter" would add nothing. */
export function isWholeChapter(span: Span): boolean {
  const only = span.slices.length === 1 ? span.slices[0] : undefined;
  return Boolean(only && only.fromVerse === 1 && only.toVerse === CHAPTER_END_SENTINEL);
}

/**
 * A passage raised into the reader pane. Carries the caller's own label rather than re-deriving
 * one, so the pane header reads exactly as the reference the user clicked — the plan's labels are
 * already careful about the whole-chapter sentinel and cross-book spans, and a second formatter
 * here would be free to disagree with them.
 */
export interface PassageTarget {
  verseStart: number;
  verseEnd: number;
  label: string;
}

export interface PreviewVerse {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

/** Fetch the verses a span covers, in canonical order. Rejects if a chapter cannot be loaded. */
export async function fetchSpanVerses(span: Span, translation: string): Promise<PreviewVerse[]> {
  // fetchChapter caches the RESOLVED book file, not the in-flight promise, so several chapters of
  // one book requested at once would each miss and refetch it — measured on a Romans 16 to
  // 1 Corinthians 2 span, which pulled `1co.json` twice. Warm one chapter per DISTINCT book first
  // (those go in parallel), after which every remaining slice is a cache hit. Matters most exactly
  // where the file is biggest: a multi-chapter Psalms span would otherwise refetch 264K per
  // chapter.
  const firstPerBook = new Map<string, ChapterSlice>();
  for (const s of span.slices) if (!firstPerBook.has(s.bookSlug)) firstPerBook.set(s.bookSlug, s);
  await Promise.all(
    [...firstPerBook.values()].map((s) => fetchChapter(s.bookSlug, s.chapter, translation)),
  );

  const files = await Promise.all(
    span.slices.map((s) => fetchChapter(s.bookSlug, s.chapter, translation)),
  );
  const out: PreviewVerse[] = [];
  span.slices.forEach((slice, i) => {
    const file = files[i];
    if (!file) return;
    for (const v of file.verses) {
      if (v.verse < slice.fromVerse || v.verse > slice.toVerse) continue;
      out.push({
        bookSlug: slice.bookSlug,
        bookName: slice.bookName,
        chapter: slice.chapter,
        verse: v.verse,
        text: v.text,
      });
    }
  });
  return out;
}

/**
 * The reader's stored translation, validated against the SHIPPING picker.
 *
 * Two reasons this is not a bare localStorage read. First, an id that has since been pulled from
 * TRANSLATIONS — the picker excludes litv/mkjv (license denies commercial use) and leb/jubilee
 * (unresolved) — must never come back to life just because it is still sitting in a browser from
 * an earlier build; falling back to the default fails closed, which is how licensing is required
 * to fail here. Second, it MUST NOT be called during render: the reader records at
 * `app/read/[book]/[chapter]/page.tsx:31-48` that reading localStorage before mount produces a
 * hydration mismatch, and this app has already shipped that once as a React #418 on every reader
 * page load (MASTER.md, A7-X1). Call it from an effect.
 */
export function storedTranslation(): string {
  if (typeof window === 'undefined') return DEFAULT_TRANSLATION;
  const stored = window.localStorage.getItem('translation');
  return stored && TRANSLATIONS.some((t) => t.id === stored) ? stored : DEFAULT_TRANSLATION;
}
