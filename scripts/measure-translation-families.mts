#!/usr/bin/env -S npx tsx
// Measure translation families for ADR-100.
//
// Pre-registered in docs/evidence/lane-b-slice1/translation-family-PRE-REGISTRATION.md, committed
// at edefd92 BEFORE this script was written. Metric, threshold, clustering rule, falsifier and bars
// are all fixed there; this only executes them.
//
//   BIBLE_DIR=web/public/bible npx tsx scripts/measure-translation-families.mts
//
// Uses the SAME shingle module the anchor channel uses. A family measured with different
// tokenisation would measure nothing the channel experiences.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { shingleHashSetOcr } from '../src/bible/uncited-shingle.ts';

const NGRAM = 6;
const T_MAIN = 0.5;
const T_SENSITIVITY = [0.4, 0.6];
const BIBLE_DIR = process.env.BIBLE_DIR ?? 'web/public/bible';

if (!existsSync(BIBLE_DIR)) {
  console.error(`✗ ${BIBLE_DIR} not found. It is gitignored; symlink it from the main clone.`);
  process.exit(1);
}

interface Loaded {
  name: string;
  /** verseId -> sorted shingle hashes. Int32Array keeps 18 translations in memory comfortably. */
  perVerse: Map<number, Int32Array>;
  distinct: Set<number>;
}

function load(name: string): Loaded {
  const dir = path.join(BIBLE_DIR, name);
  const perVerse = new Map<number, Int32Array>();
  const distinct = new Set<number>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
      book: number;
      chapters: Record<string, { verse: number; text: string }[]>;
    };
    for (const [c, vs] of Object.entries(j.chapters)) {
      for (const v of vs) {
        const id = j.book * 1_000_000 + Number(c) * 1000 + v.verse;
        const sh = shingleHashSetOcr(v.text, NGRAM);
        const arr = Int32Array.from(sh);
        arr.sort();
        perVerse.set(id, arr);
        for (const h of sh) distinct.add(h);
      }
    }
  }
  return { name, perVerse, distinct };
}

/** Jaccard over two sorted arrays, by merge. */
function jaccard(a: Int32Array, b: Int32Array): number | null {
  if (a.length === 0 && b.length === 0) return null; // no information
  if (a.length === 0 || b.length === 0) return 0;
  let i = 0;
  let j = 0;
  let inter = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { inter++; i++; j++; }
    else if (a[i]! < b[j]!) i++;
    else j++;
  }
  return inter / (a.length + b.length - inter);
}

const names = readdirSync(BIBLE_DIR)
  .filter((n) => existsSync(path.join(BIBLE_DIR, n, '.')) && !n.startsWith('.'))
  .filter((n) => readdirSync(path.join(BIBLE_DIR, n)).some((f) => f.endsWith('.json')))
  .sort();

console.error(`loading ${names.length} translations from ${BIBLE_DIR} …`);
const loaded: Loaded[] = [];
for (const n of names) {
  const l = load(n);
  loaded.push(l);
  console.error(`  ${n.padEnd(10)} ${l.perVerse.size} verses, ${l.distinct.size} distinct ${NGRAM}-shingles`);
}

// ── pairwise mean per-verse Jaccard ──────────────────────────────────────────────────────────────
const sim = new Map<string, number>();
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
for (let i = 0; i < loaded.length; i++) {
  for (let j = i + 1; j < loaded.length; j++) {
    const A = loaded[i]!;
    const B = loaded[j]!;
    let sum = 0;
    let n = 0;
    for (const [id, sa] of A.perVerse) {
      const sb = B.perVerse.get(id);
      if (!sb) continue; // paired population only
      const v = jaccard(sa, sb);
      if (v === null) continue;
      sum += v;
      n++;
    }
    sim.set(key(A.name, B.name), n === 0 ? 0 : sum / n);
  }
}

/** Single-linkage connected components at threshold t. */
function families(t: number): string[][] {
  const parent = new Map(names.map((n) => [n, n]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if ((sim.get(key(names[i]!, names[j]!)) ?? 0) >= t) {
        const a = find(names[i]!);
        const b = find(names[j]!);
        if (a !== b) parent.set(a, b);
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const r = find(n);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  }
  return [...groups.values()].map((g) => g.sort()).sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
}

/** |union of the family's shingles| / |largest member|. 1.0 = union is free. */
function unionCost(fam: string[]): { ratio: number; unionSize: number; maxMember: number } {
  const u = new Set<number>();
  let maxMember = 0;
  for (const n of fam) {
    const l = loaded.find((x) => x.name === n)!;
    maxMember = Math.max(maxMember, l.distinct.size);
    for (const h of l.distinct) u.add(h);
  }
  return { ratio: u.size / maxMember, unionSize: u.size, maxMember };
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────
const out: string[] = [];
const say = (s = '') => { out.push(s); console.log(s); };

say(`# RESULT — translation families for ADR-100`);
say();
say(`Pre-registration: \`translation-family-PRE-REGISTRATION.md\`, committed at edefd92 before this ran.`);
say(`Metric: mean per-verse Jaccard of ${NGRAM}-gram shingles, paired population only. T = ${T_MAIN}.`);
say();

say(`## Pairwise similarity — top 25 pairs`);
say();
say('| a | b | mean Jaccard |');
say('|---|---|---|');
const sorted = [...sim.entries()].sort((x, y) => y[1] - x[1]);
for (const [k, v] of sorted.slice(0, 25)) {
  const [a, b] = k.split('|');
  say(`| ${a} | ${b} | ${v.toFixed(3)} |`);
}
say();
say(`Lowest pair: ${sorted.at(-1)![0].replace('|', ' / ')} at ${sorted.at(-1)![1].toFixed(3)}`);
say(`Median of all ${sorted.length} pairs: ${sorted[Math.floor(sorted.length / 2)]![1].toFixed(3)}`);
say();

const fam = families(T_MAIN);
say(`## Families at T = ${T_MAIN}`);
say();
for (const f of fam) say(`- ${f.length === 1 ? '(singleton) ' : ''}${f.join(', ')}`);
say();

say(`## Sensitivity`);
say();
for (const t of T_SENSITIVITY) {
  const g = families(t);
  say(`- **T = ${t}** → ${g.length} groups: ${g.map((x) => `{${x.join(',')}}`).join(' ')}`);
}
say();

// ── the pre-registered falsifier ─────────────────────────────────────────────────────────────────
const KJV_DESCENDED = ['akjv', 'kjv', 'rwebster', 'ukjv', 'webster'];
const present = KJV_DESCENDED.filter((n) => names.includes(n));
const homes = new Set(present.map((n) => fam.findIndex((f) => f.includes(n))));
const together = homes.size === 1;

say(`## The pre-registered falsifier`);
say();
say(`ADR-100 asserts ${present.join(', ')} are KJV-descended and share long verbatim runs.`);
say(`**Expected:** one family at T = ${T_MAIN}. **Observed:** ${together ? 'ONE family — claim 1 HOLDS.' : `${homes.size} different families — claim 1 IS FALSIFIED.`}`);
if (together) {
  const home = fam[[...homes][0]!]!;
  say();
  say(`That family: ${home.join(', ')}`);
  const c = unionCost(home);
  say();
  say(`## Claim 2 — is union within the family cheap?`);
  say();
  say(`Union of the family's distinct shingles: ${c.unionSize}`);
  say(`Largest single member:                   ${c.maxMember}`);
  say(`**Union cost ratio: ${c.ratio.toFixed(3)}**`);
  say();
  const verdict = c.ratio <= 1.25
    ? `**≤ 1.25 — ADR-100 decision 3 STANDS.** Union within the family is cheap.`
    : c.ratio > 1.5
      ? `**> 1.50 — ADR-100 decision 3 is WITHDRAWN.** Ship single-translation + recorded fallback.`
      : `**between 1.25 and 1.50 — INCONCLUSIVE.** Goes to the owner; ship single-translation until ruled.`;
  say(verdict);
  say();
  say(`For contrast, the cost ADR-100 refused (Option B, union across ALL translations):`);
  const all = unionCost(names);
  say(`  all ${names.length} translations → ratio ${all.ratio.toFixed(3)} (${all.unionSize} shingles)`);
}

const dest = 'docs/evidence/lane-b-slice1/translation-family-RESULT.md';
const { writeFileSync } = await import('node:fs');
writeFileSync(dest, `${out.join('\n')}\n`);
console.error(`\nwritten to ${dest}`);
