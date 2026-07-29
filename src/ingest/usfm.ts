// Minimal USFM parser: extracts plain-text verses keyed by canonical verse ID.
// Handles the WEB's inline markup (\w...\w*, \f...\f*, \+wh...\+wh*, \x...\x*).
// Not a general USFM library — purpose-built for ingestion stage 2 (normalize).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKS, BOOK_BY_SLUG, type Book } from '../bible/books';
import { encodeVerseId } from '../bible/verse-id';

export interface ParsedVerse {
  verseId: number;
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

// USFM file slug (e.g. "GEN", "1SA", "MAT") → our book slug
const USFM_TO_SLUG: Record<string, string> = {};
for (const b of BOOKS) {
  USFM_TO_SLUG[b.slug.toUpperCase()] = b.slug;
}
// Override mismatches between USFM standard IDs and our slugs
const USFM_ID_MAP: Record<string, string> = {
  GEN: 'gen', EXO: 'exo', LEV: 'lev', NUM: 'num', DEU: 'deu',
  JOS: 'jos', JDG: 'jdg', RUT: 'rut',
  '1SA': '1sa', '2SA': '2sa', '1KI': '1ki', '2KI': '2ki',
  '1CH': '1ch', '2CH': '2ch', EZR: 'ezr', NEH: 'neh', EST: 'est',
  JOB: 'job', PSA: 'psa', PRO: 'pro', ECC: 'ecc', SNG: 'sng',
  ISA: 'isa', JER: 'jer', LAM: 'lam', EZK: 'ezk', DAN: 'dan',
  HOS: 'hos', JOL: 'jol', AMO: 'amo', OBA: 'oba', JON: 'jon',
  MIC: 'mic', NAM: 'nam', HAB: 'hab', ZEP: 'zep', HAG: 'hag',
  ZEC: 'zec', MAL: 'mal',
  MAT: 'mat', MRK: 'mrk', LUK: 'luk', JHN: 'jhn', ACT: 'act',
  ROM: 'rom', '1CO': '1co', '2CO': '2co', GAL: 'gal', EPH: 'eph',
  PHP: 'php', COL: 'col', '1TH': '1th', '2TH': '2th',
  '1TI': '1ti', '2TI': '2ti', TIT: 'tit', PHM: 'phm', HEB: 'heb',
  JAS: 'jas', '1PE': '1pe', '2PE': '2pe',
  '1JN': '1jn', '2JN': '2jn', '3JN': '3jn', JUD: 'jud', REV: 'rev',
};

// Strip USFM inline markup → plain text.
function stripMarkup(raw: string): string {
  let s = raw;
  // Remove footnotes: \f ... \f*  and cross-refs: \x ... \x*
  s = s.replace(/\\f\s.*?\\f\*/g, '');
  s = s.replace(/\\x\s.*?\\x\*/g, '');
  // \w word|strong="..."\w* and \+w word|strong="..."\+w* → word
  s = s.replace(/\\\+?w\s+(.*?)\|[^\\]*\\\+?w\*/g, '$1');
  // \+wh ... \+wh* (Hebrew in footnotes — shouldn't survive \f strip but clean up)
  s = s.replace(/\\\+wh\s+(.*?)\\\+wh\*/g, '$1');
  // Any remaining backslash markers (\p, \q1, \nb, etc.)
  s = s.replace(/\\[+]?[a-z]+\d?\s?/gi, '');
  // Stray marker closers
  s = s.replace(/\\\+?[a-z]+\*/gi, '');
  // USFM footnote caller anchors (bare * not inside markup)
  s = s.replace(/\s?\*\s?/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Tags that start a new structural block but don't start a new verse.
// Text after these tags belongs to the most recent \v.
const CONTINUATION_RE = /^\\(?:q[1-4]?|p|m|nb|pi[1-4]?|mi|li[1-4]?|pc|qr|qc|qa|b)\s?/;

export function parseUsfmFile(content: string): ParsedVerse[] {
  const verses: ParsedVerse[] = [];
  let book: Book | undefined;
  let chapter = 0;

  // Accumulator: the most recent verse(s) being built. We flush when we
  // hit the next \v, \c, or EOF.
  let pendingVerses: { book: number; chapter: number; vStart: number; vEnd: number }[] = [];
  let pendingText = '';

  function flush() {
    if (pendingVerses.length === 0) return;
    const text = stripMarkup(pendingText);
    for (const pv of pendingVerses) {
      for (let v = pv.vStart; v <= pv.vEnd; v++) {
        verses.push({
          verseId: encodeVerseId({ book: pv.book, chapter: pv.chapter, verse: v }),
          book: pv.book,
          chapter: pv.chapter,
          verse: v,
          text: v === pv.vStart ? text : '',
        });
      }
    }
    pendingVerses = [];
    pendingText = '';
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trimEnd();

    if (trimmed.startsWith('\\id ')) {
      flush();
      const id = trimmed.slice(4).trim().split(/\s/)[0]?.toUpperCase();
      if (id) {
        const slug = USFM_ID_MAP[id];
        book = slug ? BOOK_BY_SLUG.get(slug) : undefined;
      }
      continue;
    }

    if (trimmed.startsWith('\\c ')) {
      flush();
      const n = parseInt(trimmed.slice(3).trim(), 10);
      if (!isNaN(n)) chapter = n;
      continue;
    }

    // Skip header tags that aren't verse content
    if (/^\\(?:h|toc[1-3]|mt[1-3]?|ms[1-3]?|mr|s[1-5]?|r|d|sp|rem|ie|cl|cd)\s/.test(trimmed)) {
      continue;
    }

    if (!book || chapter === 0) continue;

    // Lines with \v markers: may have multiple \v on one line
    const vMatches = [...trimmed.matchAll(/\\v\s+(\d+[-–]\d+|\d+)\s/g)];
    if (vMatches.length > 0) {
      // Flush the previous verse before starting new ones
      flush();

      for (let i = 0; i < vMatches.length; i++) {
        if (i > 0) flush();
        const vm = vMatches[i]!;
        const verseRef = vm[1]!;
        const startIdx = vm.index! + vm[0].length;
        const endIdx = vMatches[i + 1]?.index ?? trimmed.length;

        const rangeParts = verseRef.split(/[-–]/);
        const vStart = parseInt(rangeParts[0]!, 10);
        const vEnd = parseInt(rangeParts[rangeParts.length - 1] ?? rangeParts[0]!, 10);

        pendingVerses = [{ book: book.bookNum, chapter, vStart, vEnd }];
        pendingText = trimmed.slice(startIdx, endIdx);
      }
      continue;
    }

    // Continuation line: poetry (\q1, \q2), paragraph (\p), etc.
    if (pendingVerses.length > 0) {
      let textPart = trimmed;
      // Strip leading paragraph/poetry marker
      textPart = textPart.replace(CONTINUATION_RE, '');
      pendingText += ' ' + textPart;
    }
  }

  flush();
  return verses;
}

// Parse all USFM files in a directory → full verse array, sorted by verseId.
export function parseUsfmDir(dir: string): ParsedVerse[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.usfm') && !f.includes('FRT') && !f.includes('GLO'))
    .sort();

  const all: ParsedVerse[] = [];
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    all.push(...parseUsfmFile(content));
  }
  all.sort((a, b) => a.verseId - b.verseId);
  return all;
}

// Generate verse-count map: { bookNum: { chapter: verseCount } }
export type VerseCounts = Record<number, Record<number, number>>;

export function computeVerseCounts(verses: ParsedVerse[]): VerseCounts {
  const counts: VerseCounts = {};
  for (const v of verses) {
    const bc = (counts[v.book] ??= {});
    bc[v.chapter] = Math.max(bc[v.chapter] ?? 0, v.verse);
  }
  return counts;
}
