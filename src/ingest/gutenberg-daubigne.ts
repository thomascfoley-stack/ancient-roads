// D'Aubigné, "History of the Reformation of the Sixteenth Century" (5 vols)
// — Gutenberg #40858/#41470/#41253/#40971/#41484 → historian-contract JSONL
// ({path, content}) for ingest-historian.ts. Historians are deliberately
// EXCLUDED from the adapter loop (adapter-loop.ts:96-99 — they ride the
// sections write-contract), so the gutenberg fetch machinery is reused but
// the sectioning and the ingest are the historian path's (Stage 1
// gutenberg-suetonius precedent).
//
//   npx tsx src/ingest/gutenberg-daubigne.ts --vol=1 \
//     --txt=data/raw/gutenberg/40858.txt --out=data/raw/gutenberg/daubigne-reformation1.jsonl
//
// Editions verified by READING each volume's title page (2026-09-07):
//   vol 1 (#40858): "A NEW TRANSLATION: BY HENRY BEVERIDGE, ESQ. ADVOCATE.
//     GLASGOW: PUBLISHED BY WILLIAM COLLINS. LONDON: R. GROOMBRIDGE AND SONS. 1845."
//   vol 2 (#41470): Beveridge, Collins, 1846.
//   vol 3 (#41253): "TRANSLATED BY H. WHITE … THE TRANSLATION CAREFULLY REVISED
//     BY DR. D'AUBIGNÉ", New York (150 Nassau-Street), 1848.
//   vol 4 (#40971): "ASSISTED IN THE PREPARATION OF THE ENGLISH ORIGINAL BY
//     H. WHITE", New York: Robert Carter, 1846.
//   vol 5 (#41484): "Translated by H. White, The Translation Carefully Revised
//     by Dr. Merle d'Aubigne", Collins's Select Library, Glasgow, 1862.
// The candidate card named "H. White trans." for the whole work — vols 1-2
// on PG are the Beveridge translation, recorded as such (both PD).
//
// Scope per volume: the four BOOKs only (declared per volume, exact heading
// lines, in order — a missing or out-of-order book aborts). Everything before
// the first BOOK heading is front matter (title page, CONTENTS, Beveridge's
// TRANSLATOR'S ADVERTISEMENT, author prefaces) and is excluded; each volume's
// declared back-matter cut (v1 Transcriber's note, v2 COLLINS' SERIES
// publisher catalog, v4 VALUABLE BOOKS publisher catalog) drops the rest.
//
// Chapter structure differs by edition and each style is sequence-validated
// (per book, consecutive from I — drift aborts):
//   vols 1-2 (Beveridge): flush "CHAP. I." + ALL-CAPS title line
//   vols 3, 5 (White):    flush "CHAPTER I." (no title line)
//   vol 4 (Carter 1846):  NO chapter headings — chapters open as inline
//     roman-numeral paragraphs ("I. We have witnessed …"), restarting per book
//
// Apparatus removed as non-authorial (suetonius precedent): [Sidenote: …]
// marginalia lines, numeric footnote paragraphs ("  [617] Löscher. Ref.
// Act."), the inline numeric markers [617] that referenced them, and
// single-line [Illustration: …] tags. Bracketed TEXT stays.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripBoilerplate } from './adapter-gutenberg.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface HistNode { path: string[]; content: string }

interface VolSpec {
  // [exact heading line in the etext, display label] in document order
  books: Array<{ heading: string; label: string }>;
  style: 'CHAP' | 'CHAPTER' | 'INLINE';
  end?: RegExp; // back-matter cut line
  minChapters: number;
}

const VOLS: Record<number, VolSpec> = {
  1: {
    books: [
      { heading: 'BOOK I.', label: 'Book 1' },
      { heading: 'BOOK SECOND.', label: 'Book 2' },
      { heading: 'BOOK THIRD.', label: 'Book 3' },
      { heading: 'BOOK FOURTH.', label: 'Book 4' },
    ],
    style: 'CHAP',
    end: /^\s*Transcriber/,
    minChapters: 38,
  },
  2: {
    books: [
      { heading: 'BOOK FIFTH.', label: 'Book 5' },
      { heading: 'BOOK SIXTH.', label: 'Book 6 — The Bull of Rome (1520)' },
      { heading: 'BOOK SEVENTH.', label: 'Book 7' },
      { heading: 'BOOK EIGHTH.', label: 'Book 8' },
    ],
    style: 'CHAP',
    end: /^COLLINS' SERIES/,
    minChapters: 40,
  },
  3: {
    books: [
      { heading: 'BOOK IX.', label: 'Book 9 — First Reforms (1521-1522)' },
      { heading: 'BOOK X.', label: 'Book 10' },
      { heading: 'BOOK XI.', label: 'Book 11' },
      { heading: 'BOOK XII.', label: 'Book 12' },
    ],
    style: 'CHAPTER',
    minChapters: 50,
  },
  4: {
    books: [
      { heading: 'BOOK XIII.', label: 'Book 13 — The Protest and the Conference (1526-1529)' },
      { heading: 'BOOK XIV.', label: 'Book 14 — The Augsburg Confession (1530)' },
      { heading: 'BOOK XV.', label: 'Book 15' },
      { heading: 'BOOK XVI.', label: 'Book 16' },
    ],
    style: 'INLINE',
    end: /^\s*VALUABLE BOOKS/,
    minChapters: 35,
  },
  5: {
    books: [
      { heading: 'BOOK XVII.', label: 'Book 17 — England before the Reformation' },
      { heading: 'BOOK XVIII', label: 'Book 18 — The Revival of the Church' }, // no period in the etext
      { heading: 'BOOK XIX.', label: 'Book 19' },
      { heading: 'BOOK XX.', label: 'Book 20' },
    ],
    style: 'CHAPTER',
    end: /^\s*Transcriber/,
    minChapters: 48,
  },
};

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanToInt(s: string): number | null {
  let n = 0; const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) { const c = ROMAN[t[i]!]; if (!c) return null; const nx = ROMAN[t[i + 1]!] ?? 0; n += c < nx ? -c : c; }
  return n || null;
}

// An ALL-CAPS heading line: letters present, no lowercase (digits/punct OK).
function isCapsLine(line: string): boolean {
  const t = line.trim();
  return /[A-Z]/.test(t) && !/[a-z]/.test(t) && t.length <= 90;
}

function titleCase(caps: string): string {
  const SMALL = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'at', 'by', 'for', 'on', 'with']);
  return caps.trim().toLowerCase().replace(/[a-z']+/g, (w, offset) =>
    (offset > 0 && SMALL.has(w)) ? w : w[0]!.toUpperCase() + w.slice(1));
}

// Strip the edition's apparatus from a chapter body (see header comment).
function clean(text: string): string {
  const paras = text.split(/\n\s*\n/);
  const kept: string[] = [];
  for (const p of paras) {
    const lines = p.split('\n').filter((l) => {
      const t = l.trim();
      if (/^\[Sidenote:.*\]\.?$/.test(t)) return false; // marginalia (sometimes printed "…].")
      if (/^\[Illustration:.*\]$/.test(t)) return false; // plate tags
      if (/^END OF (VOLUME|THE)\b/.test(t)) return false; // volume colophon
      if (/^William Collins, and Co\., Printers/.test(t)) return false; // printer line
      if (/^\*(\s+\*)+$/.test(t)) return false; // asterisk separators
      return true;
    });
    if (lines.length === 0) continue;
    if (/^\s*\[\d+\]/.test(lines[0]!)) continue; // numeric footnote paragraph
    kept.push(lines.join('\n'));
  }
  return kept.join('\n\n')
    .replace(/\[(\d{1,4})\]/g, '') // inline markers of the dropped footnotes
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Consume up to 2 consecutive ALL-CAPS lines (not matching chapterStart) as a
// subtitle/title block; returns the joined text and lines consumed.
function takeCapsBlock(lines: string[], from: number, chapterStart: RegExp | null): { text: string; consumed: number } {
  const caps: string[] = [];
  let i = from;
  while (i < lines.length && caps.length < 2) {
    const t = lines[i]!.trim();
    if (!t) { i++; if (caps.length > 0) break; continue; } // skip leading blanks; stop at trailing blank
    if (!isCapsLine(t)) break;
    if (chapterStart && chapterStart.test(t)) break;
    caps.push(t);
    i++;
  }
  return { text: caps.join(' '), consumed: i - from };
}

export function convert(vol: number, body: string): HistNode[] {
  const spec = VOLS[vol];
  if (!spec) throw new Error(`FAIL CLOSED: no spec for volume ${vol}`);
  const lines = body.split('\n').map((l) => l.replace(/\r$/, ''));

  // Scope: first declared BOOK heading to the back-matter cut (or body end).
  // Heading tests run on RAW lines (never trimmed): the volumes' CONTENTS
  // pages carry the same "BOOK I."/"CHAP. I." texts INDENTED, and a trimmed
  // match would scope the ToC instead of the body (the first draft's exact
  // failure). Body headings are flush.
  const firstBook = lines.findIndex((l) => l === spec.books[0]!.heading);
  if (firstBook < 0) throw new Error(`FAIL CLOSED: vol ${vol} first book heading "${spec.books[0]!.heading}" not found`);
  let end = lines.length;
  if (spec.end) {
    const at = lines.findIndex((l, i) => i > firstBook && spec.end!.test(l));
    if (at < 0) throw new Error(`FAIL CLOSED: vol ${vol} back-matter cut ${spec.end} not found — structure drift`);
    end = at;
  }
  const scoped = lines.slice(firstBook, end);

  // Book boundaries: declared headings, exact whole lines, in order.
  const bounds: Array<{ at: number; label: string }> = [];
  let cursor = 0;
  for (const b of spec.books) {
    let at = -1;
    for (let i = cursor; i < scoped.length; i++) {
      if (scoped[i] === b.heading) { at = i; break; }
    }
    if (at < 0) throw new Error(`FAIL CLOSED: vol ${vol} book heading "${b.heading}" not found in order — structure drift`);
    bounds.push({ at, label: b.label });
    cursor = at + 1;
  }

  // Trailing period optional: the etext drops it on a few chapter lines
  // ("CHAP. V", "CHAP. XI" in vol 1 Book 2). Raw-line test keeps the
  // indented ToC entries from matching.
  // Case-insensitive: vol 2 Book 7 has a "Chap. III." typo in the etext.
  const chapRe = spec.style === 'CHAP' ? /^CHAP\. ([IVXLC]+)\.?$/i : /^CHAPTER ([IVXLC]+)\.?$/i;
  const nodes: HistNode[] = [];
  const work = `History of the Reformation of the Sixteenth Century, Vol. ${vol}`;

  for (let b = 0; b < bounds.length; b++) {
    const from = bounds[b]!.at + 1;
    const to = b + 1 < bounds.length ? bounds[b + 1]!.at : scoped.length;
    let bookLines = scoped.slice(from, to);
    // A book subtitle block (v2-v5) rides in the label, never in chapter text.
    const sub = takeCapsBlock(bookLines, 0, spec.style === 'INLINE' ? null : chapRe);
    const bookLabel = sub.text && !bounds[b]!.label.includes('—') ? `${bounds[b]!.label} — ${titleCase(sub.text)}` : bounds[b]!.label;
    bookLines = bookLines.slice(sub.consumed);
    const bookText = bookLines.join('\n');

    const chapters: Array<{ num: number; title?: string; text: string }> = [];
    if (spec.style === 'INLINE') {
      // Chapters open as inline roman-numeral paragraphs ("I. We have …").
      const paras = bookText.split(/\n\s*\n/);
      const startRe = /^\s*([IVXLC]{1,7})\.\s+([A-Z"“'])/;
      let cur: string[] | null = null;
      let curNum = 0;
      const flush = () => {
        if (cur !== null) chapters.push({ num: curNum, text: cur!.join('\n\n') });
      };
      for (const p of paras) {
        const m = p.match(startRe);
        const n = m ? romanToInt(m[1]!) : null;
        // Only a numeral that continues the expected sequence opens a chapter —
        // an enumerative "I." mid-book that is out of sequence stays in the body.
        if (n !== null && n === curNum + 1) {
          flush();
          curNum = n;
          cur = [p.replace(startRe, '$2')];
        } else if (cur !== null) {
          cur.push(p);
        } // text before chapter I (none expected) is dropped with the subtitle
      }
      flush();
    } else {
      const cuts: number[] = [];
      for (let i = 0; i < bookLines.length; i++) {
        if (chapRe.test(bookLines[i]!)) cuts.push(i); // raw line: ToC's indented "  CHAP. I." must not match
      }
      for (let c = 0; c < cuts.length; c++) {
        const m = bookLines[cuts[c]!]!.match(chapRe)!;
        const segLines = bookLines.slice(cuts[c]! + 1, c + 1 < cuts.length ? cuts[c + 1]! : bookLines.length);
        let title: string | undefined;
        let bodyLines = segLines;
        if (spec.style === 'CHAP') {
          const t = takeCapsBlock(segLines, 0, chapRe);
          if (t.text) { title = titleCase(t.text); bodyLines = segLines.slice(t.consumed); }
        }
        chapters.push({ num: romanToInt(m[1]!)!, title, text: bodyLines.join('\n') });
      }
    }

    // Sequence validation: per book, chapters are exactly 1..N consecutive.
    // One repair class is allowed, loudly: the etext occasionally repeats the
    // previous numeral where the next is due (vol 3 Book 10 prints "CHAPTER
    // VI." twice — the volume's own CONTENTS lists I–XIV with VII present),
    // an etext/print misnumbering, not missing text. A duplicate-of-previous
    // numeral is renumbered to the expected value and reported; any other
    // drift aborts.
    if (chapters.length < 3) throw new Error(`FAIL CLOSED: vol ${vol} ${bookLabel} yielded ${chapters.length} chapters (<3) — structure drift`);
    chapters.forEach((ch, i) => {
      if (ch.num === i + 1) return;
      if (ch.num === i) {
        console.log(`  vol ${vol} ${bookLabel}: repaired duplicated numeral ${ch.num} → ${i + 1} (etext misnumbering)`);
        ch.num = i + 1;
        return;
      }
      throw new Error(`FAIL CLOSED: vol ${vol} ${bookLabel} chapter sequence drift at position ${i + 1} (got numeral ${ch.num})`);
    });

    for (const ch of chapters) {
      const content = clean(ch.text);
      if (content.length < 100) continue; // heading residue — falls to the sequence check above
      const label = ch.title ? `Chapter ${ch.num} — ${ch.title}` : `Chapter ${ch.num}`;
      nodes.push({ path: [work, bookLabel, label], content });
    }
  }

  if (nodes.length < spec.minChapters) {
    throw new Error(`FAIL CLOSED: vol ${vol} yielded ${nodes.length} chapters (<${spec.minChapters}) — incomplete parse`);
  }
  return nodes;
}

function main() {
  const vol = Number(arg('--vol'));
  const txtPath = arg('--txt');
  const outPath = arg('--out');
  if (!vol || !txtPath || !outPath) throw new Error('usage: gutenberg-daubigne.ts --vol=N --txt=<f> --out=<f>');
  const body = stripBoilerplate(readFileSync(txtPath, 'utf8'));
  const nodes = convert(vol, body);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  console.log(`daubigne-reformation${vol} → ${nodes.length} chapters → ${outPath}`);
}

if (process.argv[1] && /gutenberg-daubigne/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
