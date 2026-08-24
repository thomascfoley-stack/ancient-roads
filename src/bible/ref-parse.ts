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
  // HYPHENS AND UNDERSCORES ARE SEPARATORS, NOT CHARACTERS. A URL path segment spells
  // "Song of Solomon" as "song-of-solomon", and this table is keyed with spaces — so without
  // this the whole hyphenated form was compared against a spaced key and could never match.
  // That is not a gap of a few aliases: EVERY numbered and multi-word book (1 Samuel, 2 Kings,
  // 1 Corinthians, Song of Songs…) failed from a pasted or hand-typed URL, while its unspaced
  // abbreviation worked. Four instances of it were reported by the 2026-08-16 QA fleet; the
  // property test in test/invariants/book-slug-url-forms.test.ts found the rest.
  let s = raw.toLowerCase().replace(/[.\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(i{1,3}|1st|2nd|3rd|first|second|third)\s+(.+)$/.exec(s);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    s = `${ORDINAL_WORDS[m[1]] ?? m[1]} ${m[2]}`;
  }
  // "1john" → "1 john"
  s = s.replace(/^([1-3])(?=[a-z])/, '$1 ');
  // "iikings" → "2 kings". The ordinal rule above requires a separator that the digit rule on the
  // line above never did, so the roman spelling of the same URL resolved to nothing.
  //
  // TABLE-GUARDED, because a bare prefix rule here is WRONG: "isaiah" begins with a roman "i", and
  // an unguarded transform rewrites it to "1 saiah" and breaks a book that works today. So the
  // rewrite is applied only when the input names no book as written AND the rewritten form does —
  // which also makes "iv kings" and a lone "ii" fall through untouched.
  if (!ALIAS_EXACT.has(s)) {
    const roman = /^(i{1,3})(?=[a-z])/.exec(s);
    if (roman && roman[1] !== undefined) {
      const candidate = `${ORDINAL_WORDS[roman[1]] ?? roman[1]} ${s.slice(roman[1].length)}`;
      if (ALIAS_EXACT.has(candidate)) s = candidate;
    }
  }
  return s;
}

// A URL-path book segment ("john", "1cor") → its canonical Book, or undefined.
//
// FOUND BY A7's product walk (2026-08-02): `/read/john/1` failed with "Unknown book: john"
// while `/read/jhn/1` worked, even though `aliases.ts` already declares `jhn: ['john', ...]` —
// two callers (the reader route and the multi-pane desk) each did a bare
// `BOOK_BY_BOOK_SLUG.get(slug)` and never consulted the alias table this file already builds.
// Two hand-duplicated resolvers, the class this repo's watchlist names most often, closed here
// by giving both ONE function instead of a second copy.
//
// EXACT ALIAS ONLY, deliberately not `matchBooks`'s prefix/candidate matching. `matchBooks`
// exists for an interactive typeahead, where "returns candidates for ambiguous input" is the
// right behaviour — a menu the user picks from. A URL path segment has no menu: a caller must
// get back one book or none, never a list, and "cor" silently landing on "1 Corinthians" because
// it happens to be the first prefix match would be a surprising redirect, not a convenience.
export function resolveBookSlug(raw: string): Book | undefined {
  return ALIAS_EXACT.get(normalizeBookInput(raw));
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

// SCAN_RE's leftmost-first match at a word PRECEDING a numbered book consumes the ordinal as that
// word's numeric tail — "see also 1 Corinthians 13:4-7" yields the dead candidate "also 1", and
// because matchAll resumes AFTER the consumed "1", the true span can never start; the leftover
// "Corinthians 13:4-7" is ambiguous (1 Cor vs 2 Cor) and dies in parseRef. SCAN_RE's book group
// (`[a-z]{2,}` straight into `\s+`) also has no room for an abbreviation's period, so
// "1 Cor. 13:4-7" forms no candidate at all — while parseRef handles both forms fine
// (docs/evidence/uploader-deep-dive-2026-08-20/MEASUREMENTS.md Run 4, defect M3). This pass scans
// the ordinal-prefixed forms with their own regex, whose matchAll position SCAN_RE cannot starve,
// and admits one optional trailing period on the book word. Additive: it never alters a SCAN_RE
// match (dedupe by display), and parseRef still validates every span — "1 dog. 3" dies on the
// unknown book "1 dog". The period is admitted ONLY here, behind a required ordinal: putting `\.?`
// on SCAN_RE's own book word would turn every sentence ending in a book-alias word before a
// number into a candidate ("did his job. 3 of them" → Job 3) on the /ask intent-routing path,
// which has no isExplicitCitation gate. The unnumbered period form ("Rom. 8:28") therefore stays
// unscanned — a known residual, recorded with M3, not silently.
const ORDINAL_BOOK_SCAN_RE =
  /\b([1-3]|i{1,3}|first|second|third)\s+([a-z]{2,})\.?\s+(\d{1,3}(?::\d{1,3})?(?:\s*[-–]\s*\d{1,3}(?::\d{1,3})?)?)\b/gi;

// Digit-ATTACHED ordinals — "1Cor 13", "2tim 3:16" — are invisible to both passes above:
// SCAN_RE's optional ordinal requires `\s+` after it, and its book group `[a-z]{2,}` cannot
// start on a digit, so the attached form formed no candidate at all and never reached parseRef —
// which already normalises it ("1john" → "1 john", normalizeBookInput above). The /ask routing
// path (resolveIntent) is one of the callers that lost the span. Same shape and same constraint
// as the period fix: the ordinal prefix is REQUIRED and digit-only ([1-3] — roman/word forms are
// indistinguishable from the book word without a separator), one optional trailing period on the
// book word, additive pass (dedupe by display, overlap by source span), and parseRef validates
// every candidate. Precision holds for the same reason ORDINAL_BOOK_SCAN_RE's does: "3rd 4"
// yields the candidate "3 rd 4", which dies on the unknown book; "21cor 13" never matches at
// all — there is no word boundary between the "2" and the "1" for `\b([1-3])` to start at.
const DIGIT_ATTACHED_SCAN_RE =
  /\b([1-3])([a-z]{2,})\.?\s+(\d{1,3}(?::\d{1,3})?(?:\s*[-–]\s*\d{1,3}(?::\d{1,3})?)?)\b/gi;

// Find scripture references embedded in prose — "1 Corinthians 13 the greatest
// of these…", "Isaiah 53", "John 3:16" — and return the resolved refs. Unlike
// parseRef (whole-string typeahead), this scans candidate spans anywhere in the
// text and keeps only those that parse to a valid reference (high precision).
// Used to route a query to the passage it names; never guesses.
/** A scanned reference plus the source facts a caller needs to judge its confidence. */
export interface ScannedSpan {
  ref: ResolvedRef;
  /** Offsets of the matched text in the ORIGINAL string, so a caller can strip it. */
  start: number;
  end: number;
  /** The book word exactly as matched, lowercased ("mark", "james", "corinthians"). */
  bookWord: string;
  /** Did the match carry an explicit ordinal ("1 John", "first Kings")? */
  hasOrdinal: boolean;
}

// Scan with the source facts retained. `scanReferences` is this function with the facts
// dropped, so the two can never disagree about WHAT was found — only about how much the
// caller is told. Callers that need to judge confidence (resolveIntent's ambiguous-book-word
// gate) use this; everyone else keeps the simpler signature.
export function scanReferenceSpans(text: string, opts: ParseOptions = {}): ScannedSpan[] {
  // Candidates carry their SOURCE SPANS so overlaps can be resolved. Without positions,
  // display-dedupe let the ordinal pass's correct "1 John 4:8" coexist with SCAN_RE's wrong
  // "John 4:8" from the SAME characters — different displays, one slice of text — and the
  // /ask floor spent a slot on Gospel-of-John commentary for an epistle question (tier-level
  // verification, 2026-08-21). Where two VALID candidates overlap in the source, the longer
  // span wins (ties: the earlier start); non-overlapping candidates are all kept, which is
  // what protects "Ephesians 2:8-9 and 1 Peter 5:7".
  const candidates: { ref: ResolvedRef; start: number; end: number; bookWord: string; hasOrdinal: boolean }[] = [];
  const consider = (span: string, start: number, end: number, bookWord: string, hasOrdinal: boolean) => {
    const outcome = parseRef(span, opts);
    if (outcome.ok) candidates.push({ ref: outcome.ref, start, end, bookWord: bookWord.toLowerCase(), hasOrdinal });
  };
  for (const m of text.matchAll(SCAN_RE)) {
    consider(`${m[1] ?? ''}${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim(), m.index!, m.index! + m[0].length, m[2]!, Boolean(m[1]));
  }
  for (const m of text.matchAll(ORDINAL_BOOK_SCAN_RE)) {
    consider(`${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim(), m.index!, m.index! + m[0].length, m[2]!, true);
  }
  for (const m of text.matchAll(DIGIT_ATTACHED_SCAN_RE)) {
    // Merge 2026-08-24. TWO sessions hit this same conflict from opposite branches and resolved it
    // identically, which is worth recording: main widened `consider` to take the book word and
    // whether the span carried an explicit ordinal (the SCAN_RE corroboration work), and the
    // digit-attached pass had been calling it with three arguments. A digit-attached form IS an
    // ordinal — "1Cor 13" carries exactly the confidence of "1 Cor 13" — so it passes the matched
    // alias and `true`, never false.
    consider(`${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim(), m.index!, m.index! + m[0].length, m[2]!, true);
  }
  if (MULTIWORD_SCAN_RE) {
    for (const m of text.matchAll(MULTIWORD_SCAN_RE)) {
      consider(`${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim(), m.index!, m.index! + m[0].length, m[1]!, false);
    }
  }
  const keep = candidates.filter((c) =>
    !candidates.some((o) =>
      o !== c && o.start < c.end && c.start < o.end &&
      (o.end - o.start > c.end - c.start ||
        (o.end - o.start === c.end - c.start && (o.start < c.start || (o.start === c.start && candidates.indexOf(o) < candidates.indexOf(c))))),
    ));
  keep.sort((a, b) => a.start - b.start);
  const out: ScannedSpan[] = [];
  const seen = new Set<string>();
  for (const c of keep) {
    if (seen.has(c.ref.display)) continue;
    seen.add(c.ref.display);
    out.push(c);
  }
  return out;
}

export function scanReferences(text: string, opts: ParseOptions = {}): ResolvedRef[] {
  return scanReferenceSpans(text, opts).map((s) => s.ref);
}
