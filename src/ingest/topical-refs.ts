// Stateful verse-reference scanner for SWORD topical-index entries (Nave,
// Torrey, TCR) and Daily Light. These works compress references the way a
// printed concordance does — later refs inherit context from earlier ones:
//
//   "Ex 4:14-16, 27-31; 7:1, 2"      , = same book+chapter · ; = same book
//   "Isa 44:22 43:25 1:18"           bare C:V after a ref = same book (Daily)
//   "1Sa 22:20-23; with 22:6-19"     "with" = same-book connector (Nave)
//   "Nu 17"                          bare chapter → whole-chapter range
//
// parseRef alone cannot carry that state, so this module tokenizes a text,
// tracks (book, chapter) context left to right, and resolves every token
// through the repo's own book table (src/bible). Resolution always goes
// through parseRef so book identity has exactly one home.
//
// Three measured ambiguities decide the shape of this code (probe 2026-08-02):
//
// 1. "Jud" means JUDGES in these modules, not Jude: 726 of 807 Nave "Jud N"
//    refs carry a chapter > 1 (Jude has one chapter), "Jdg" never appears,
//    and Jude is always spelled out "Jude". parseRef alone resolves "Jud" to
//    Jude, which would silently mis-anchor ~1,500 refs.
//
// 2. A bare number can be a verse continuation OR the numeral of the next
//    numbered book. "1Jo 5:11,12 Joh 3:17" — the 12 is a verse; "By Titus
//    2 Co 8:16" — the 2 belongs to 2 Corinthians (and "Titus" is the man,
//    not the epistle). Decided structurally: a bare number in {1,2,3}
//    immediately followed by a book token whose numbered reading resolves
//    within chapter bounds is the book numeral; otherwise it is a verse/
//    chapter continuation. Both readings are validated through parseRef.
//
// 3. A range can dangle into another book: "2Sa 2:4-1Ki 2:11". The range
//    tail is refused when its digits abut a letter, and the second book is
//    picked up as its own ref — two correct point refs instead of one
//    fabricated backwards range.
//
// FAIL CLOSED: scanTopicalRefs reports every candidate token whose book
// resolves but whose chunk does not; the ingest treats any failure outside
// the per-work pinned KNOWN_BAD list (source-edition misprints, counted and
// exact) as a parse failure for the whole work.

import { parseRef } from '../bible/ref-parse.js';

export interface ScannedRef {
  index: number;        // char offset of the token in the input text
  length: number;
  display: string;      // canonical resolved form, e.g. "Ex 6:16-20"
  verseIdStart: number; // canonical book*1e6 + chapter*1e3 + verse
  verseIdEnd: number;
}

export interface ScanFailure {
  index: number;
  token: string;
  reason: string;
}

export interface ScanResult {
  refs: ScannedRef[];
  failures: ScanFailure[];
}

const SP = String.raw`[ \u00a0]`; // space or NBSP (cp1252 modules); escaped so no literal NBSP sits in source
const BOOK_TOKEN = String.raw`(?:[123]${SP}?)?[A-Za-z]{2,8}`;
// "6:16-20" | "6:16" | "17"; the (?![A-Za-z]) on range digits refuses a range
// tail that is really the numeral of a following book ("2:4-1Ki ..." § 3).
const CHUNK = String.raw`\d{1,3}(?::\d{1,3})?(?:-\d{1,3}(?![A-Za-z])(?::\d{1,3})?)?`;

const REF_START = new RegExp(String.raw`(?<![A-Za-z])(${BOOK_TOKEN})\.?${SP}+(${CHUNK})`, 'g');
// The separator may stack the "with" connector on a semicolon ("; with 22:6"),
// which is Nave's dominant form of it.
const CONT = new RegExp(String.raw`^([;,]${SP}*(?:with)?|${SP}+with)?${SP}*(${CHUNK})(?![:\d])`);
// "N Book C[:V]" — used to test whether a bare number is the next book's
// numeral. SP* (not +): the numeral is usually GLUED to its book ("1Co 5:7"),
// and requiring a space sent every glued form down the fabricated-chapter path.
const BOOK_AFTER_BARE = new RegExp(String.raw`^${SP}*([A-Za-z]{2,8})\.?${SP}+(${CHUNK})`);

const PROSE_WORDS = new Set(['with', 'verse', 'verses', 'chapter', 'chapters', 'ver', 'chap', 'see', 'also', 'about', 'compare']);

interface Resolved { start: number; end: number; chapter: number; display: string }

function resolve(book: string, chunk: string): Resolved | null {
  const r = parseRef(`${book} ${chunk}`);
  if (!r.ok) return null;
  const head = r.ref.ranges[0];
  const tail = r.ref.ranges[r.ref.ranges.length - 1];
  if (!head || !tail) return null;
  return {
    start: head.start,
    end: tail.end,
    chapter: Math.floor((head.start % 1_000_000) / 1000),
    display: `${book} ${chunk}`,
  };
}

const bookResolves = (book: string): boolean => parseRef(`${book} 1:1`).ok || parseRef(`${book} 1`).ok;

/**
 * Scan free text for verse references with concordance-style context
 * inheritance. Pure; never throws on content — failures are data.
 */
export function scanTopicalRefs(text: string): ScanResult {
  const refs: ScannedRef[] = [];
  const failures: ScanFailure[] = [];
  REF_START.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = REF_START.exec(text)) !== null) {
    const rawBook = (m[1] ?? '').trim();
    const firstChunk = m[2] ?? '';
    const at = m.index;

    if (PROSE_WORDS.has(rawBook.toLowerCase())) {
      // Do not skip past the chunk — its digits may open the next real ref
      // ("Corinth 1Co 16:17" must not strand "Co 16:17").
      REF_START.lastIndex = at + 1;
      continue;
    }

    const book = /^jud$/i.test(rawBook) ? 'Judges' : rawBook; // header § 1

    const first = resolve(book, firstChunk);
    if (!first) {
      if (bookResolves(book)) {
        const outcome = parseRef(`${book} ${firstChunk}`);
        failures.push({
          index: at,
          token: `${rawBook} ${firstChunk}`,
          reason: outcome.ok ? 'unresolvable' : outcome.reason,
        });
      }
      REF_START.lastIndex = at + 1; // a prose word ate a digit — rescan from inside
      continue;
    }

    // Header § 2, REF_START side: "Titus 2 Co 8:16" — a bare-chapter reading
    // whose number really opens the next numbered book. Prefer the numbered
    // book when it resolves; the bare chapter is then never emitted.
    const isBareFirst = !firstChunk.includes(':') && !firstChunk.includes('-');
    if (isBareFirst && /^[123]$/.test(firstChunk)) {
      const after = BOOK_AFTER_BARE.exec(text.slice(REF_START.lastIndex));
      if (after && resolve(`${firstChunk}${after[1]}`, after[2] ?? '')) {
        REF_START.lastIndex = at + m[0].length - firstChunk.length; // hand the numeral back
        continue;
      }
    }

    let ctx = { book, chapter: first.chapter };
    refs.push({ index: at, length: m[0].length, display: first.display, verseIdStart: first.start, verseIdEnd: first.end });

    // Consume continuations immediately following this match.
    let pos = REF_START.lastIndex;
    for (;;) {
      const rest = text.slice(pos);
      const c = CONT.exec(rest);
      if (!c) break;
      const sep = (c[1] ?? '').trim();
      const chunk = c[2] ?? '';
      const isBare = !chunk.includes(':') && !chunk.includes('-');
      const isBareRange = !chunk.includes(':') && chunk.includes('-');

      // Header § 2, continuation side: ",2 Joh 3:17" / "; 1 Co 5:7" — a bare
      // number in {1,2,3} whose numbered-book reading resolves belongs to the
      // book. End this run; REF_START picks the numbered book up whole.
      if (isBare && /^[123]$/.test(chunk)) {
        const after = BOOK_AFTER_BARE.exec(rest.slice(c[0].length));
        if (after && resolve(`${chunk}${after[1]}`, after[2] ?? '')) break;
      }

      // "," binds to the current chapter (verse or verse-range); ";", "with"
      // and bare whitespace bind to the book (chapter or C:V).
      const effective = sep === ',' && (isBare || isBareRange) ? `${ctx.chapter}:${chunk}` : chunk;
      const r = resolve(ctx.book, effective);
      if (!r) break; // not a continuation after all — stop the run
      refs.push({
        index: pos + (c.index ?? 0) + (c[0].length - chunk.length),
        length: chunk.length,
        display: r.display,
        verseIdStart: r.start,
        verseIdEnd: r.end,
      });
      ctx = { book: ctx.book, chapter: r.chapter };
      pos += c[0].length;
    }
    REF_START.lastIndex = pos;
  }

  return { refs, failures };
}
