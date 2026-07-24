// Interactive reference resolver: typed input → canonical verse-ID ranges.
//
// This is the omnibox/deep-link/picker path. It parses a whole string that
// is supposed to BE a reference ("jn 3 16", "1 Cor 13:4-8a", "matt 5-7").
// Finding references inside prose is the ingestion pipeline's job (the BCV
// parser, CORPUS.md stage 4); both emit the same canonical verse IDs.
//
// Contract: never guess. Ambiguous book input returns candidates for the
// typeahead; out-of-bounds chapters/verses and backwards ranges reject with
// a reason the UI can show verbatim.

import { BOOKS, type Book } from './books';
import { BOOK_ALIASES } from './aliases';
import { encodeVerseId } from './verse-id';

export type RefKind =
  | 'book'
  | 'chapter'
  | 'chapter_range'
  | 'verse'
  | 'verse_range'
  | 'sequence';

export interface VerseRange {
  start: number; // canonical verse ID, inclusive
  end: number; // canonical verse ID, inclusive
}

export interface ResolvedRef {
  book: Book;
  kind: RefKind;
  ranges: VerseRange[];
  display: string; // canonical human form: "John 3:16–18"
}

export type ParseOutcome =
  | { ok: true; ref: ResolvedRef }
  | { ok: false; reason: string; candidates?: Book[] };

// Chapter-granularity ranges end at this sentinel verse until the verses
// table supplies real counts. Range-safe against section_anchors because
// real verse numbers never reach 999 (max is Psalm 119's 176).
export const CHAPTER_END_SENTINEL = 999;

// Supplied by the ingested text (build order step 2). Without it the
// resolver validates structure only (chapter bounds, verse >= 1).
export interface VerseCountProvider {
  verseCount(bookNum: number, chapter: number): number | undefined;
}

export interface ParseOptions {
  verseCounts?: VerseCountProvider;
}

// ---------------------------------------------------------------------------
// Book matching

interface AliasEntry {
  alias: string;
  book: Book;
}

const ALIAS_ENTRIES: AliasEntry[] = [];
const ALIAS_EXACT = new Map<string, Book>();

for (const book of BOOKS) {
  const aliases = new Set<string>([
    book.name.toLowerCase(),
    book.slug,
    ...(BOOK_ALIASES[book.slug] ?? []),
  ]);
  for (const alias of aliases) {
    ALIAS_EXACT.set(alias, book);
    ALIAS_ENTRIES.push({ alias, book });
  }
}

const ORDINAL_WORDS: Record<string, string> = {
  i: '1',
  ii: '2',
  iii: '3',
  '1st': '1',
  '2nd': '2',
  '3rd': '3',
  first: '1',
  second: '2',
  third: '3',
};

// Normalize a book token: lowercase, strip periods, collapse whitespace,
// digit ordinals. "I Jn." → "1 jn", "FIRST JOHN" → "1 john".
export function normalizeBookInput(raw: string): string {
  let s = raw.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(i{1,3}|1st|2nd|3rd|first|second|third)\s+(.+)$/.exec(s);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    s = `${ORDINAL_WORDS[m[1]] ?? m[1]} ${m[2]}`;
  }
  // "1john" → "1 john"
  s = s.replace(/^([1-3])(?=[a-z])/, '$1 ');
  return s;
}

// All books whose alias set matches `input` exactly or by prefix.
// Exact alias match wins outright (so "jud" is Jude, not Judges).
// A bare numbered-book name without its ordinal ("timothy", "corinthians")
// returns every numbered sibling as candidates.
export function matchBooks(raw: string): Book[] {
  const input = normalizeBookInput(raw);
  if (input.length === 0) return [];

  const exact = ALIAS_EXACT.get(input);
  if (exact) return [exact];

  const seen = new Set<number>();
  const matches: Book[] = [];
  for (const { alias, book } of ALIAS_ENTRIES) {
    if (alias.startsWith(input) && !seen.has(book.bookNum)) {
      seen.add(book.bookNum);
      matches.push(book);
    }
  }
  if (matches.length > 0) {
    return matches.sort((a, b) => a.bookNum - b.bookNum);
  }

  // "timothy" → 1 Timothy + 2 Timothy
  for (const { alias, book } of ALIAS_ENTRIES) {
    const base = /^[1-3] (.+)$/.exec(alias)?.[1];
    if (base !== undefined && base.startsWith(input) && input.length >= 2 && !seen.has(book.bookNum)) {
      seen.add(book.bookNum);
      matches.push(book);
    }
  }
  return matches.sort((a, b) => a.bookNum - b.bookNum);
}

// ---------------------------------------------------------------------------
// Reference parsing

// Split "1 cor 13:4-8" into a book part and a numeric tail. The ordinal
// prefix keeps a leading digit from being mistaken for the tail.
const SPLIT_RE =
  /^((?:(?:[1-3])[\s.]*|(?:i{1,3}|1st|2nd|3rd|first|second|third)[\s.]+)?[a-z][a-z.\s]*?)\s*(\d.*)?$/i;

interface Segment {
  chapter: number;
  verseStart?: number;
  endChapter?: number;
  verseEnd?: number;
  toChapterEnd?: boolean; // "ff"
}

export function parseRef(input: string, opts: ParseOptions = {}): ParseOutcome {
  const trimmed = input.trim().replace(/[–—]/g, '-');
  if (trimmed.length === 0) return { ok: false, reason: 'Empty reference' };

  const split = SPLIT_RE.exec(trimmed);
  if (!split) return { ok: false, reason: `Not a reference: "${input.trim()}"` };

  const bookRaw = (split[1] ?? '').trim();
  const tail = (split[2] ?? '').trim().toLowerCase();

  const books = matchBooks(bookRaw);
  if (books.length > 1) {
    return {
      ok: false,
      reason: `Ambiguous book: "${bookRaw}"`,
      candidates: books,
    };
  }
  const book = books[0];
  if (!book) {
    return { ok: false, reason: `Unknown book: "${bookRaw}"` };
  }

  if (tail.length === 0) {
    return {
      ok: true,
      ref: {
        book,
        kind: 'book',
        ranges: [
          {
            start: encodeVerseId({ book: book.bookNum, chapter: 1, verse: 1 }),
            end: chapterEnd(book, book.chapterCount, opts),
          },
        ],
        display: book.name,
      },
    };
  }

  const segments = tail.split(',').map((s) => s.trim());
  const parsed: Segment[] = [];
  let context: Segment | undefined;

  for (const rawSeg of segments) {
    if (rawSeg.length === 0) return { ok: false, reason: 'Empty segment in sequence' };
    const seg = parseSegment(rawSeg, book, context);
    if ('reason' in seg) return { ok: false, reason: seg.reason };
    parsed.push(seg);
    context = seg;
  }

  const validated = validate(parsed, book, opts);
  if (validated) return { ok: false, reason: validated };

  const first = parsed[0];
  if (!first) return { ok: false, reason: 'Empty reference' };
  const ranges = parsed.map((s) => toRange(s, book, opts));
  const kind: RefKind = parsed.length > 1 ? 'sequence' : segmentKind(first);

  return {
    ok: true,
    ref: { book, kind, ranges, display: formatDisplay(book, parsed) },
  };
}

function parseSegment(
  raw: string,
  book: Book,
  context: Segment | undefined,
): Segment | { reason: string } {
  // "3v16" / "3 v 16" / "3vv16" → "3:16"
  let s = raw.replace(/(\d)\s*v{1,2}\s*(?=\d)/g, '$1:');
  // "." as chapter:verse separator; bare "3 16" likewise
  s = s.replace(/(\d)\s*\.\s*(?=\d)/g, '$1:');
  s = s.replace(/(\d) +(?=\d)/g, '$1:');
  s = s.replace(/\s+/g, '');
  // Letter suffixes ("8a") are print-edition granularity we don't carry.
  const ff = /ff$/.test(s);
  s = s.replace(/(\d)(?:ff|[a-d])\b/g, '$1');

  const singleChapter = book.chapterCount === 1;
  const inVerseContext = context?.verseStart !== undefined;

  let m: RegExpExecArray | null;

  // C:V-C2:V2
  if ((m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(s))) {
    return {
      chapter: num(m[1]),
      verseStart: num(m[2]),
      endChapter: num(m[3]),
      verseEnd: num(m[4]),
    };
  }
  // C:V-V2  (or with ff: C:Vff handled below)
  if ((m = /^(\d+):(\d+)-(\d+)$/.exec(s))) {
    return { chapter: num(m[1]), verseStart: num(m[2]), verseEnd: num(m[3]) };
  }
  // C:V
  if ((m = /^(\d+):(\d+)$/.exec(s))) {
    return { chapter: num(m[1]), verseStart: num(m[2]), toChapterEnd: ff };
  }
  // N-N2: chapter range, or verse range in context / single-chapter books
  if ((m = /^(\d+)-(\d+)$/.exec(s))) {
    const [a, b] = [num(m[1]), num(m[2])];
    if (singleChapter) return { chapter: 1, verseStart: a, verseEnd: b };
    if (inVerseContext && context) {
      return { chapter: context.endChapter ?? context.chapter, verseStart: a, verseEnd: b };
    }
    return { chapter: a, endChapter: b };
  }
  // N: chapter, or verse in context / single-chapter books
  if ((m = /^(\d+)$/.exec(s))) {
    const n = num(m[1]);
    if (singleChapter) return { chapter: 1, verseStart: n, toChapterEnd: ff };
    if (inVerseContext && context) {
      return {
        chapter: context.endChapter ?? context.chapter,
        verseStart: n,
        toChapterEnd: ff,
      };
    }
    return { chapter: n };
  }

  return { reason: `Can't read "${raw}" as chapter and verse` };
}

// Regex groups are guaranteed by the grammar patterns; the throw is a
// can't-happen guard for the type system.
function num(s: string | undefined): number {
  if (s === undefined) throw new Error('regex group missing');
  return parseInt(s, 10);
}

function validate(segments: Segment[], book: Book, opts: ParseOptions): string | null {
  for (const seg of segments) {
    const chapters = [seg.chapter, seg.endChapter].filter(
      (c): c is number => c !== undefined,
    );
    for (const c of chapters) {
      if (c < 1 || c > book.chapterCount) {
        return book.chapterCount === 1
          ? `${book.name} has one chapter`
          : `${book.name} has ${book.chapterCount} chapters`;
      }
    }
    for (const [ch, v] of [
      [seg.chapter, seg.verseStart],
      [seg.endChapter ?? seg.chapter, seg.verseEnd],
    ] as const) {
      if (v === undefined) continue;
      if (v < 1) return 'Verse numbers start at 1';
      if (v >= CHAPTER_END_SENTINEL) return `No verse ${v}`;
      const count = opts.verseCounts?.verseCount(book.bookNum, ch);
      if (count !== undefined && v > count) {
        return `${book.name} ${book.chapterCount === 1 ? '' : `${ch} `}has ${count} verses`;
      }
    }

    if (
      seg.verseStart !== undefined &&
      seg.verseEnd !== undefined &&
      (seg.endChapter ?? seg.chapter) === seg.chapter &&
      seg.verseEnd <= seg.verseStart
    ) {
      return `Backwards range: ${seg.verseStart}-${seg.verseEnd}`;
    }
    if (seg.endChapter !== undefined && seg.endChapter < seg.chapter) {
      return `Backwards chapter range: ${seg.chapter}-${seg.endChapter}`;
    }
  }
  return null;
}

function chapterEnd(book: Book, chapter: number, opts: ParseOptions): number {
  const count = opts.verseCounts?.verseCount(book.bookNum, chapter);
  return encodeVerseId({
    book: book.bookNum,
    chapter,
    verse: count ?? CHAPTER_END_SENTINEL,
  });
}

function toRange(seg: Segment, book: Book, opts: ParseOptions): VerseRange {
  const b = book.bookNum;
  if (seg.verseStart === undefined) {
    // whole chapter(s)
    return {
      start: encodeVerseId({ book: b, chapter: seg.chapter, verse: 1 }),
      end: chapterEnd(book, seg.endChapter ?? seg.chapter, opts),
    };
  }
  const start = encodeVerseId({ book: b, chapter: seg.chapter, verse: seg.verseStart });
  if (seg.toChapterEnd) return { start, end: chapterEnd(book, seg.chapter, opts) };
  if (seg.verseEnd === undefined) return { start, end: start };
  return {
    start,
    end: encodeVerseId({
      book: b,
      chapter: seg.endChapter ?? seg.chapter,
      verse: seg.verseEnd,
    }),
  };
}

function segmentKind(seg: Segment): RefKind {
  if (seg.verseStart === undefined) {
    return seg.endChapter !== undefined ? 'chapter_range' : 'chapter';
  }
  if (seg.verseEnd !== undefined || seg.toChapterEnd) return 'verse_range';
  return 'verse';
}

// Canonical display: en dash for ranges, single-chapter books drop the
// chapter number ("Jude 24"), sequences render left to right.
function formatDisplay(book: Book, segments: Segment[]): string {
  const single = book.chapterCount === 1;
  const parts: string[] = [];
  let prevChapter: number | undefined;

  for (const seg of segments) {
    const first = parts.length === 0;
    let p = '';
    if (seg.verseStart === undefined) {
      p = seg.endChapter !== undefined ? `${seg.chapter}–${seg.endChapter}` : `${seg.chapter}`;
      prevChapter = seg.endChapter ?? seg.chapter;
    } else {
      const cv = single ? '' : `${seg.chapter}:`;
      const showChapter = first || seg.chapter !== prevChapter;
      p = showChapter ? `${cv}${seg.verseStart}` : `${seg.verseStart}`;
      if (seg.toChapterEnd) p += 'ff';
      else if (seg.endChapter !== undefined && seg.endChapter !== seg.chapter) {
        p += `–${seg.endChapter}:${seg.verseEnd}`;
      } else if (seg.verseEnd !== undefined) {
        p += `–${seg.verseEnd}`;
      }
      prevChapter = seg.endChapter ?? seg.chapter;
    }
    parts.push(p);
  }

  const tail = parts.join(', ');
  return tail.length > 0 ? `${book.name} ${tail}` : book.name;
}

// Typeahead entry point: book-only input returns completions; input with
// numbers parses. The omnibox calls this on every keystroke.
export type TypeaheadResult =
  | { kind: 'completions'; books: Book[] }
  | { kind: 'ref'; outcome: ParseOutcome };

export function typeahead(input: string, opts: ParseOptions = {}): TypeaheadResult {
  const hasDigitsBeyondOrdinal = /[a-z].*\d/i.test(input.trim());
  if (!hasDigitsBeyondOrdinal) {
    return { kind: 'completions', books: matchBooks(input) };
  }
  return { kind: 'ref', outcome: parseRef(input, opts) };
}

// ---------------------------------------------------------------------------
// Free-text reference scan (retrieval intent routing).

// Candidate "<book> <chapter>[:verse][-range]" spans: optional ordinal, one book
// word, then numbers. Deliberately conservative — each candidate is validated by
// parseRef, so a non-book word ("chapter 3", "top 6") yields nothing.
const SCAN_RE =
  /\b((?:[1-3]|i{1,3}|first|second|third)\s+)?([a-z]{2,})\s+(\d{1,3}(?::\d{1,3})?(?:\s*[-–]\s*\d{1,3}(?::\d{1,3})?)?)\b/gi;

// SCAN_RE's book group is a SINGLE word (after an optional numeric ordinal), so a
// multi-word name with no ordinal is invisible to prose scanning. Book 22 is the only
// such book: "Song of Solomon 2" / "Song of Songs 8:7" resolve to nothing, while the
// one-word "Canticles 2" resolves fine — the reader who quotes the book by its KJV name
// gets no routing at all. This second pass scans for exactly the multi-word aliases,
// derived from the table so it stays correct if any are added. Additive: it never alters
// a single-word match; parseRef still validates every span, so precision is unaffected.
const MULTIWORD_ALIASES = [...new Set(ALIAS_ENTRIES.map((e) => e.alias))]
  .filter((a) => a.includes(' ') && !/^[1-3]\s/.test(a))
  .sort((a, b) => b.length - a.length); // longest-first: "song of songs" before any prefix

const MULTIWORD_SCAN_RE =
  MULTIWORD_ALIASES.length > 0
    ? new RegExp(
        `\\b(${MULTIWORD_ALIASES.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+(\\d{1,3}(?::\\d{1,3})?(?:\\s*[-–]\\s*\\d{1,3}(?::\\d{1,3})?)?)\\b`,
        'gi',
      )
    : null;

// Find scripture references embedded in prose — "1 Corinthians 13 the greatest
// of these…", "Isaiah 53", "John 3:16" — and return the resolved refs. Unlike
// parseRef (whole-string typeahead), this scans candidate spans anywhere in the
// text and keeps only those that parse to a valid reference (high precision).
// Used to route a query to the passage it names; never guesses.
export function scanReferences(text: string, opts: ParseOptions = {}): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  const seen = new Set<string>();
  const consider = (span: string) => {
    const outcome = parseRef(span, opts);
    if (outcome.ok && !seen.has(outcome.ref.display)) {
      seen.add(outcome.ref.display);
      out.push(outcome.ref);
    }
  };
  for (const m of text.matchAll(SCAN_RE)) {
    consider(`${m[1] ?? ''}${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim());
  }
  if (MULTIWORD_SCAN_RE) {
    for (const m of text.matchAll(MULTIWORD_SCAN_RE)) {
      consider(`${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim());
    }
  }
  return out;
}
