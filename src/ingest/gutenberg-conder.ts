// Claude R. Conder, "Tent Work in Palestine" — Gutenberg #46641 →
// historian-contract JSONL ({path, content}) for ingest-historian.ts
// (historians are excluded from the adapter loop by design; Stage 1
// gutenberg-suetonius precedent).
//
//   npx tsx src/ingest/gutenberg-conder.ts \
//     --txt=data/raw/gutenberg/46641.txt --out=data/raw/gutenberg/conder-tent-work.jsonl
//
// Edition verified by READING the title page (2026-09-07): "TENT WORK IN
// PALESTINE. A Record of Discovery and Adventure. BY CLAUDE REIGNIER CONDER,
// R.E., OFFICER IN COMMAND OF THE SURVEY EXPEDITION. Published for the
// Committee of the Palestine Exploration Fund. … New Edition. LONDON:
// RICHARD BENTLEY & SON … 1887." (The candidate card said 1878 — the first
// edition; this PG text is the 1887 New Edition, recorded as such.)
//
// Scope: the author's PREFACE and INTRODUCTION (Conder's own first-person
// account of the survey) and the twenty-five chapters, each "CHAPTER I." +
// ALL-CAPS title line, sequence-validated (consecutive from I — drift
// aborts). Back-matter cut at APPENDIX. — a "LIST OF WORKS CONSULTED"
// bibliography, apparatus, not content; the INDEX follows it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripBoilerplate } from './adapter-gutenberg.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface HistNode { path: string[]; content: string }

const WORK = 'Tent Work in Palestine';
const CHAPTERS = 25;
const CHAP_RE = /^CHAPTER ([IVXLC]+)\.$/;
const START_RE = /^PREFACE\.$/;
const INTRO_RE = /^INTRODUCTION\.$/;
const END_RE = /^APPENDIX\.$/;

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
  if (start < 0) throw new Error(`FAIL CLOSED: preface heading not found`);
  const endAt = lines.findIndex((l, i) => i > start && END_RE.test(l));
  if (endAt < 0) throw new Error(`FAIL CLOSED: appendix cut not found — structure drift`);
  const scoped = lines.slice(start, endAt);

  interface Bound { at: number; label: string }
  const bounds: Bound[] = [{ at: 0, label: 'Preface' }];
  const intro = scoped.findIndex((l, i) => i > 0 && INTRO_RE.test(l));
  if (intro < 0) throw new Error(`FAIL CLOSED: introduction heading not found — structure drift`);
  bounds.push({ at: intro, label: 'Introduction' });
  let cursor = intro + 1;
  for (let n = 1; n <= CHAPTERS; n++) {
    let at = -1;
    for (let i = cursor; i < scoped.length; i++) {
      const m = scoped[i]!.match(CHAP_RE);
      if (m && romanToInt(m[1]!) === n) { at = i; break; }
    }
    if (at < 0) throw new Error(`FAIL CLOSED: chapter ${n} not found in order — structure drift`);
    // Title = first non-blank line after the heading; it must be ALL-CAPS.
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
    let seg = scoped.slice(from, to);
    if (bounds[b]!.label.includes('—')) {
      // drop the consumed caps title line (first non-blank line of the segment)
      const ti = seg.findIndex((l) => l.trim());
      if (ti >= 0 && isCapsLine(seg[ti]!)) seg = seg.filter((_, i) => i !== ti);
    }
    const content = seg.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content.length < 100) continue;
    nodes.push({ path: [WORK, bounds[b]!.label], content });
  }
  if (nodes.length < 25) throw new Error(`FAIL CLOSED: yielded ${nodes.length} nodes (<25) — incomplete parse`);
  return nodes;
}

function main() {
  const txtPath = arg('--txt') ?? 'data/raw/gutenberg/46641.txt';
  const outPath = arg('--out') ?? 'data/raw/gutenberg/conder-tent-work.jsonl';
  const body = stripBoilerplate(readFileSync(txtPath, 'utf8'));
  const nodes = convert(body);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  console.log(`conder-tent-work → ${nodes.length} nodes → ${outPath}`);
}

if (process.argv[1] && /gutenberg-conder/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
