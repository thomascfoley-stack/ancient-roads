// A. H. Sayce — two works, two Gutenberg ids (the candidate card combined
// them; they are separate books, promoted as separate slugs):
//   Patriarchal Palestine               — Gutenberg #14405 (SPCK, n.d. [1895])
//   Fresh Light from the Ancient Monuments — Gutenberg #32883 (RTS, 2nd ed. 1884)
// → historian-contract JSONL ({path, content}) for ingest-historian.ts
// (historians are excluded from the adapter loop by design; Stage 1
// gutenberg-suetonius precedent).
//
//   npx tsx src/ingest/gutenberg-sayce.ts --book=patriarchal-palestine \
//     --txt=data/raw/gutenberg/14405.txt --out=data/raw/gutenberg/sayce-patriarchal-palestine.jsonl
//
// Editions verified by READING the title pages (2026-09-07):
//   #14405: "PATRIARCHAL PALESTINE BY THE REV. A.H. SAYCE … PUBLISHED UNDER
//     THE DIRECTION OF THE TRACT COMMITTEE. LONDON: SOCIETY FOR PROMOTING
//     CHRISTIAN KNOWLEDGE …" — no date on the title page; cataloged 1895.
//   #32883: "Fresh Light from the Ancient Monuments … by Archibald Henry
//     Sayce … Second Edition. London: The Religious Tract Society … 1884".
//
// Scope: the author's PREFACE through the last chapter (and #32883's two
// authorial appendices); each book's INDEX is the back-matter cut. Chapter
// headings are flush whole lines, sequence-validated (consecutive from I —
// drift aborts): #14405 "CHAPTER I" + ALL-CAPS title line; #32883 "CHAPTER
// I. INTRODUCTION." (title on the same line).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripBoilerplate } from './adapter-gutenberg.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface HistNode { path: string[]; content: string }

interface BookSpec {
  work: string; // path head
  preface: RegExp; // the author's preface heading line
  chapter: RegExp; // flush chapter heading; group 1 = numeral, optional group 2 = inline title
  chapters: number; // expected chapter count
  appendix?: RegExp; // appendix heading (group 1 = numeral)
  appendices?: number;
  end: RegExp; // back-matter cut (INDEX)
  minNodes: number;
}

const BOOKS: Record<string, BookSpec> = {
  'patriarchal-palestine': {
    work: 'Patriarchal Palestine',
    preface: /^PREFACE$/,
    chapter: /^CHAPTER ([IVXLC]+)$/,
    chapters: 6,
    end: /^INDEX$/,
    minNodes: 7,
  },
  'ancient-monuments': {
    work: 'Fresh Light from the Ancient Monuments',
    preface: /^PREFACE\.$/,
    chapter: /^CHAPTER ([IVXLC]+)\. (.+)$/,
    chapters: 7,
    appendix: /^APPENDIX ([IVX]+)\.$/,
    appendices: 2,
    end: /^INDEX\.$/,
    minNodes: 10,
  },
};

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanToInt(s: string): number | null {
  let n = 0; const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) { const c = ROMAN[t[i]!]; if (!c) return null; const nx = ROMAN[t[i + 1]!] ?? 0; n += c < nx ? -c : c; }
  return n || null;
}

function isCapsLine(line: string): boolean {
  const t = line.trim();
  return /[A-Z]/.test(t) && !/[a-z]/.test(t) && t.length <= 90;
}

function titleCase(caps: string): string {
  const SMALL = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'at', 'by', 'for', 'on', 'with']);
  return caps.trim().toLowerCase().replace(/[a-z']+/g, (w, offset) =>
    (offset > 0 && SMALL.has(w)) ? w : w[0]!.toUpperCase() + w.slice(1));
}

export function convert(book: string, body: string): HistNode[] {
  const spec = BOOKS[book];
  if (!spec) throw new Error(`FAIL CLOSED: no spec for ${book}`);
  const lines = body.split('\n').map((l) => l.replace(/\r$/, ''));

  const start = lines.findIndex((l) => spec.preface.test(l));
  if (start < 0) throw new Error(`FAIL CLOSED: ${book} preface heading ${spec.preface} not found`);
  const endAt = lines.findIndex((l, i) => i > start && spec.end.test(l));
  if (endAt < 0) throw new Error(`FAIL CLOSED: ${book} back-matter cut ${spec.end} not found — structure drift`);
  const scoped = lines.slice(start, endAt);

  // Section boundaries: PREFACE, then the declared chapter headings in
  // order, then any appendices — all flush whole lines (ToC entries, where
  // present, are indented and cannot match).
  interface Bound { at: number; label: string }
  const bounds: Bound[] = [{ at: 0, label: 'Preface' }];
  let cursor = 1;
  for (let n = 1; n <= spec.chapters; n++) {
    let at = -1;
    let label = '';
    for (let i = cursor; i < scoped.length; i++) {
      const m = scoped[i]!.match(spec.chapter);
      if (!m) continue;
      const num = romanToInt(m[1]!);
      if (num !== n) continue; // a heading with an unexpected numeral: keep scanning — sequence check below decides
      at = i;
      label = m[2] ? `Chapter ${n} — ${titleCase(m[2].replace(/\.$/, ''))}` : `Chapter ${n}`;
      break;
    }
    if (at < 0) throw new Error(`FAIL CLOSED: ${book} chapter ${n} not found in order — structure drift`);
    // #14405 style: the ALL-CAPS title rides on the next line.
    if (!label.includes('—') && isCapsLine(scoped[at + 2] ?? '') && (scoped[at + 1] ?? '').trim() === '') {
      label = `Chapter ${n} — ${titleCase(scoped[at + 2]!)}`;
    }
    bounds.push({ at, label });
    cursor = at + 1;
  }
  for (let n = 1; n <= (spec.appendices ?? 0); n++) {
    let at = -1;
    for (let i = cursor; i < scoped.length; i++) {
      const m = scoped[i]!.match(spec.appendix!);
      if (m && romanToInt(m[1]!) === n) { at = i; break; }
    }
    if (at < 0) throw new Error(`FAIL CLOSED: ${book} appendix ${n} not found — structure drift`);
    bounds.push({ at, label: `Appendix ${n}` });
    cursor = at + 1;
  }

  const nodes: HistNode[] = [];
  for (let b = 0; b < bounds.length; b++) {
    const from = bounds[b]!.at + 1;
    const to = b + 1 < bounds.length ? bounds[b + 1]!.at : scoped.length;
    let seg = scoped.slice(from, to).join('\n');
    // For #14405-style chapters, drop the consumed title line from the body.
    if (bounds[b]!.label.includes('—') && !spec.chapter.source.includes('(.+)')) {
      seg = seg.split('\n').filter((l, i) => !(i <= 2 && isCapsLine(l))).join('\n');
    }
    const content = seg.split(/\n\s*\n/)
      .filter((p) => !/^\s*\[Illustration\.?\]$/.test(p.split('\n')[0]!)) // frontispiece plate block
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n').trim();
    if (content.length < 100) continue;
    nodes.push({ path: [spec.work, bounds[b]!.label], content });
  }
  if (nodes.length < spec.minNodes) {
    throw new Error(`FAIL CLOSED: ${book} yielded ${nodes.length} nodes (<${spec.minNodes}) — incomplete parse`);
  }
  return nodes;
}

function main() {
  const book = arg('--book');
  const txtPath = arg('--txt');
  const outPath = arg('--out');
  if (!book || !txtPath || !outPath) throw new Error('usage: gutenberg-sayce.ts --book=<key> --txt=<f> --out=<f>');
  const body = stripBoilerplate(readFileSync(txtPath, 'utf8'));
  const nodes = convert(book, body);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  console.log(`sayce-${book} → ${nodes.length} nodes → ${outPath}`);
}

if (process.argv[1] && /gutenberg-sayce/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
