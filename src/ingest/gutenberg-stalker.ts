// James Stalker, "The Life of St. Paul" — Gutenberg #21828 →
// historian-contract JSONL ({path, content}) for ingest-historian.ts
// (historians are excluded from the adapter loop by design; Stage 1
// gutenberg-suetonius precedent).
//
//   npx tsx src/ingest/gutenberg-stalker.ts \
//     --txt=data/raw/gutenberg/21828.txt --out=data/raw/gutenberg/stalker-life-paul.jsonl
//
// Edition verified by READING the title page (2026-09-07): "THE LIFE OF
// ST. PAUL by PROF. JAMES STALKER, D.D. … With Foreword by Wilbert W.
// White, D.D. … New and Revised Edition. New York—Chicago—Toronto …
// Fleming H. Revell Company … Copyright, 1912" (the candidate card paired
// this with "The Life of Jesus Christ" — NOT on Project Gutenberg; only
// the Life of St. Paul is promoted, recorded as a deviation).
//
// Scope: the work's own title line through the end of CHAPTER X. EXCLUDED
// as non-authorial editor matter (Wilbert W. White's 1912 study apparatus,
// which must never serve under Stalker): the FOREWORD, each chapter's
// "Paragraphs N–M." study-outline block under the title, and the whole
// "HINTS TO TEACHERS AND QUESTIONS FOR PUPILS" section that follows the
// work. Chapters are "CHAPTER I" + ALL-CAPS title line, sequence-validated
// (consecutive from I — drift aborts). The numbered body paragraphs
// ("1.  The Man for the Time.--…") are the edition's own furniture and
// stay.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripBoilerplate } from './adapter-gutenberg.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface HistNode { path: string[]; content: string }

const WORK = 'The Life of St. Paul';
const CHAPTERS = 10;
const START_RE = /^THE LIFE OF ST\. PAUL$/;
const CHAP_RE = /^CHAPTER ([IVXLC]+)$/;
const END_RE = /^HINTS TO TEACHERS/;

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

export function convert(body: string): HistNode[] {
  const lines = body.split('\n').map((l) => l.replace(/\r$/, ''));
  const start = lines.findIndex((l) => START_RE.test(l));
  if (start < 0) throw new Error(`FAIL CLOSED: work title line not found`);
  const endAt = lines.findIndex((l, i) => i > start && END_RE.test(l));
  if (endAt < 0) throw new Error(`FAIL CLOSED: study-apparatus cut not found — structure drift`);
  const scoped = lines.slice(start, endAt);

  const bounds: Array<{ at: number; label: string }> = [];
  let cursor = 1;
  for (let n = 1; n <= CHAPTERS; n++) {
    let at = -1;
    for (let i = cursor; i < scoped.length; i++) {
      const m = scoped[i]!.match(CHAP_RE);
      if (m && romanToInt(m[1]!) === n) { at = i; break; }
    }
    if (at < 0) throw new Error(`FAIL CLOSED: chapter ${n} not found in order — structure drift`);
    let t = at + 1;
    while (t < scoped.length && !scoped[t]!.trim()) t++;
    if (t >= scoped.length || !isCapsLine(scoped[t]!)) throw new Error(`FAIL CLOSED: chapter ${n} title line not ALL-CAPS — structure drift`);
    bounds.push({ at, label: `Chapter ${n} — ${titleCase(scoped[t]!.trim().replace(/\.$/, ''))}` });
    cursor = at + 1;
  }

  const nodes: HistNode[] = [];
  for (let b = 0; b < bounds.length; b++) {
    const from = bounds[b]!.at + 1;
    const to = b + 1 < bounds.length ? bounds[b + 1]!.at : scoped.length;
    const seg = scoped.slice(from, to);
    // Drop the consumed caps title line, then White's study-outline block:
    // everything from the "Paragraphs N–M." line until the first numbered
    // body paragraph ("1.  …"). Fail closed if the body start is missing.
    const ti = seg.findIndex((l) => l.trim());
    if (ti < 0 || !isCapsLine(seg[ti]!)) throw new Error(`FAIL CLOSED: ${bounds[b]!.label} title line missing in segment`);
    // Body paragraphs are numbered continuously across the work (ch. 2 opens
    // at "13."), so the boundary marker is any FLUSH numbered paragraph
    // ("13.  Date and Place…"). The outline's own refs are indented and
    // hyphenated ("  14-16.  DATE AND PLACE…") and cannot match.
    const bodyStart = seg.findIndex((l, i) => i > ti && /^\d+\.\s{1,2}\S/.test(l));
    if (bodyStart < 0) throw new Error(`FAIL CLOSED: ${bounds[b]!.label} body start (numbered paragraph) not found — study-outline boundary unreadable`);
    const content = seg.slice(bodyStart).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content.length < 100) continue;
    nodes.push({ path: [WORK, bounds[b]!.label], content });
  }
  if (nodes.length < CHAPTERS) throw new Error(`FAIL CLOSED: yielded ${nodes.length} nodes (<${CHAPTERS}) — incomplete parse`);
  return nodes;
}

function main() {
  const txtPath = arg('--txt') ?? 'data/raw/gutenberg/21828.txt';
  const outPath = arg('--out') ?? 'data/raw/gutenberg/stalker-life-paul.jsonl';
  const body = stripBoilerplate(readFileSync(txtPath, 'utf8'));
  const nodes = convert(body);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  console.log(`stalker-life-paul → ${nodes.length} nodes → ${outPath}`);
}

if (process.argv[1] && /gutenberg-stalker/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
