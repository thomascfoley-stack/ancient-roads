#!/usr/bin/env -S npx tsx
// Re-derive K under ADR-103's metric, per k-rederivation-PRE-REGISTRATION-v2.md (committed 29d2d77
// BEFORE this run). v1 was UNDERPOWERED by its own floor because the fill was author-by-author and
// the cap was exhausted by two authors; v2 changes the FILL ORDER to round-robin and nothing else.
//
//   BIBLE_DIR=web/public/bible CCEL_DIR=/abs/path/to/data/raw/ccel npx tsx scripts/measure-k-rederivation.mts

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCcelSections } from '../src/ingest/adapter-ccel.ts';
import { shingleHashSetOcr } from '../src/bible/uncited-shingle.ts';

// ── pre-registered constants ─────────────────────────────────────────────────────────────────────
const NGRAM = 6;
const GOLD_NGRAM = 8;
const MIN_VERSE_SHINGLES = 3;
const MIN_DOC_CHARS = 4000;
const GOLD_FLOOR = 5;
const K_SWEEP = [1, 2, 3, 4, 5, 6, 7, 8];
const PRECISION_BAR = 0.6;
const MAX_WORKS_PER_AUTHOR = 6;
const MAX_DOCS_PER_SET = 90;
const MIN_AUTHORS = 5;
const MIN_DOCS = 25;
const EXCLUDED_AUTHOR = 'spurgeon';

const BIBLE_DIR = process.env.BIBLE_DIR ?? 'web/public/bible';
const CCEL_DIR = process.env.CCEL_DIR ?? '';
const TRANSLATION = 'kjv';

if (!existsSync(BIBLE_DIR) || !existsSync(CCEL_DIR)) {
  console.error(`✗ need BIBLE_DIR (${BIBLE_DIR}) and CCEL_DIR (${CCEL_DIR})`);
  process.exit(1);
}

// ── index: 6-gram (returns) and 8-gram (gold), from the shipped module ───────────────────────────
const idx6 = new Map<number, number[]>();
const idx8 = new Map<number, number[]>();
const sh6Count = new Map<number, number>();
{
  const dir = path.join(BIBLE_DIR, TRANSLATION);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
      book: number; chapters: Record<string, { verse: number; text: string }[]>;
    };
    for (const [c, vs] of Object.entries(j.chapters)) {
      for (const v of vs) {
        const id = j.book * 1_000_000 + Number(c) * 1000 + v.verse;
        const s6 = shingleHashSetOcr(v.text, NGRAM);
        sh6Count.set(id, s6.size);
        for (const h of s6) (idx6.get(h) ?? idx6.set(h, []).get(h)!).push(id);
        for (const h of shingleHashSetOcr(v.text, GOLD_NGRAM)) (idx8.get(h) ?? idx8.set(h, []).get(h)!).push(id);
      }
    }
  }
}
console.error(`indexed ${TRANSLATION}: ${sh6Count.size} verses, ${idx6.size} 6-shingles, ${idx8.size} 8-shingles`);

const goldOf = (body: string): Set<number> => {
  const out = new Set<number>();
  for (const h of shingleHashSetOcr(body, GOLD_NGRAM)) for (const id of idx8.get(h) ?? []) out.add(id);
  return out;
};
const hitsOf = (body: string): Map<number, number> => {
  const hits = new Map<number, number>();
  for (const h of shingleHashSetOcr(body, NGRAM)) for (const id of idx6.get(h) ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
  return hits;
};
const returnsAt = (hits: Map<number, number>, K: number): Set<number> => {
  const out = new Set<number>();
  for (const [id, n] of hits) if ((sh6Count.get(id) ?? 0) >= MIN_VERSE_SHINGLES && n >= K) out.add(id);
  return out;
};

// ── the sets, by the pre-registered blind rule ───────────────────────────────────────────────────
const files = readdirSync(CCEL_DIR).filter((f) => f.endsWith('.xml')).sort();
const byAuthor = new Map<string, string[]>();
for (const f of files) {
  const a = f.split('_')[0]!;
  byAuthor.set(a, [...(byAuthor.get(a) ?? []), f]);
}
const eligibleAuthors = [...byAuthor.entries()]
  .filter(([a, fs]) => a !== EXCLUDED_AUTHOR && fs.length >= 3)
  .map(([a]) => a)
  .sort();
const setAuthors: [string[], string[]] = [[], []];
eligibleAuthors.forEach((a, i) => setAuthors[i % 2 === 0 ? 0 : 1]!.push(a));

interface Doc { author: string; work: string; heading: string; body: string; gold: Set<number>; hits: Map<number, number> }

function buildSet(authors: string[], label: string): { docs: Doc[]; zeroGold: number; belowFloor: number; scanned: number } {
  let zeroGold = 0;
  let belowFloor = 0;
  let scanned = 0;

  // v2: collect each author's eligible documents FIRST, then take round-robin. v1 took them
  // author-by-author, so the first two authors exhausted the cap and the set never reached a
  // third — the B-1 monoculture failure reproduced by a fill order.
  const perAuthor = new Map<string, Doc[]>();
  for (const a of authors) {
    const mine: Doc[] = [];
    for (const w of (byAuthor.get(a) ?? []).slice(0, MAX_WORKS_PER_AUTHOR)) {
      let secs;
      try { secs = buildCcelSections(readFileSync(path.join(CCEL_DIR, w), 'utf8')); } catch { continue; }
      for (const s of secs) {
        const body = String((s as { body?: string }).body ?? '');
        if (body.length < MIN_DOC_CHARS) continue;
        scanned++;
        const gold = goldOf(body);
        if (gold.size === 0) { zeroGold++; continue; }
        if (gold.size < GOLD_FLOOR) { belowFloor++; continue; }
        mine.push({ author: a, work: w, heading: String((s as { heading?: string }).heading ?? ''), body, gold, hits: hitsOf(body) });
      }
    }
    if (mine.length > 0) perAuthor.set(a, mine);
  }
  const docs: Doc[] = [];
  const cursors = new Map([...perAuthor.keys()].map((a) => [a, 0]));
  let progressed = true;
  while (docs.length < MAX_DOCS_PER_SET && progressed) {
    progressed = false;
    for (const a of perAuthor.keys()) {
      const i = cursors.get(a)!;
      const list = perAuthor.get(a)!;
      if (i >= list.length) continue;
      docs.push(list[i]!);
      cursors.set(a, i + 1);
      progressed = true;
      if (docs.length >= MAX_DOCS_PER_SET) break;
    }
  }
  console.error(`${label}: ${docs.length} eligible docs from ${new Set(docs.map((d) => d.author)).size} authors (scanned ${scanned}, zero-gold ${zeroGold}, below-floor ${belowFloor})`);
  return { docs, zeroGold, belowFloor, scanned };
}

const S1 = buildSet(setAuthors[0]!, 'SET 1 (derivation)');
const S2 = buildSet(setAuthors[1]!, 'SET 2 (validation)');

function score(docs: Doc[], K: number) {
  let p = 0; let r = 0; let n = 0; let ret = 0;
  for (const d of docs) {
    const returns = returnsAt(d.hits, K);
    let inter = 0;
    for (const v of returns) if (d.gold.has(v)) inter++;
    p += returns.size === 0 ? 0 : inter / returns.size;
    r += d.gold.size === 0 ? 0 : inter / d.gold.size;
    ret += returns.size;
    n++;
  }
  return { precision: p / n, recall: r / n, returnsPerDoc: ret / n };
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────
const out: string[] = [];
const say = (s = '') => { out.push(s); console.log(s); };

say('# RESULT — K re-derived under ADR-103\'s metric');
say();
say('Pre-registration: `k-rederivation-PRE-REGISTRATION-v2.md`, committed at 29d2d77 before this ran.');
say(`Index: **${TRANSLATION}**. Gold = ≥1 shared ${GOLD_NGRAM}-gram. Returns = ≥K shared ${NGRAM}-grams, minVerseShingles=${MIN_VERSE_SHINGLES}.`);
say();
say('## The sets');
say();
say(`- **SET 1 (derivation)** — ${S1.docs.length} documents, ${new Set(S1.docs.map((d) => d.author)).size} authors: ${[...new Set(S1.docs.map((d) => d.author))].join(', ')}`);
say(`- **SET 2 (validation)** — ${S2.docs.length} documents, ${new Set(S2.docs.map((d) => d.author)).size} authors: ${[...new Set(S2.docs.map((d) => d.author))].join(', ')}`);
say(`- Author-disjoint by construction. Spurgeon excluded from both.`);
say();
say('### Exclusion (reported, not gated)');
say();
say('| set | scanned | zero gold | 0 < gold < 5 | eligible |');
say('|---|---|---|---|---|');
say(`| SET 1 | ${S1.scanned} | ${S1.zeroGold} (${((S1.zeroGold / Math.max(1, S1.scanned)) * 100).toFixed(1)}%) | ${S1.belowFloor} | ${S1.docs.length} |`);
say(`| SET 2 | ${S2.scanned} | ${S2.zeroGold} (${((S2.zeroGold / Math.max(1, S2.scanned)) * 100).toFixed(1)}%) | ${S2.belowFloor} | ${S2.docs.length} |`);
say();

const underpowered = (s: typeof S1) => s.docs.length < MIN_DOCS || new Set(s.docs.map((d) => d.author)).size < MIN_AUTHORS;
if (underpowered(S1) || underpowered(S2)) {
  say('## ⚠ UNDERPOWERED — reported as such, not as a result');
  say();
  say(`Pre-registered floor: ≥${MIN_DOCS} documents and ≥${MIN_AUTHORS} authors per set.`);
}

say('## SET 1 — the K sweep (derivation)');
say();
say('| K | returns/doc | precision | recall |');
say('|---|---|---|---|');
const s1 = K_SWEEP.map((K) => ({ K, ...score(S1.docs, K) }));
for (const r of s1) say(`| ${r.K} | ${r.returnsPerDoc.toFixed(1)} | ${r.precision.toFixed(3)}${r.precision >= PRECISION_BAR ? ' ✓' : ''} | ${r.recall.toFixed(3)} |`);
say();

const chosen = s1.find((r) => r.precision >= PRECISION_BAR);
if (!chosen) {
  say(`## ✗ NO K CLEARS precision ≥ ${PRECISION_BAR} on SET 1 — derivation VOID.`);
} else {
  say(`**Chosen K = ${chosen.K}** — the smallest K whose mean precision ≥ ${PRECISION_BAR} (${chosen.precision.toFixed(3)}), recall ${chosen.recall.toFixed(3)}.`);
  say();
  say('## SET 2 — validation at that K');
  say();
  say('| K | returns/doc | precision | recall |');
  say('|---|---|---|---|');
  const s2 = K_SWEEP.map((K) => ({ K, ...score(S2.docs, K) }));
  for (const r of s2) say(`| ${r.K}${r.K === chosen.K ? ' ←' : ''} | ${r.returnsPerDoc.toFixed(1)} | ${r.precision.toFixed(3)} | ${r.recall.toFixed(3)} |`);
  say();
  const v = s2.find((r) => r.K === chosen.K)!;
  say(v.precision >= PRECISION_BAR
    ? `**K = ${chosen.K} TRANSFERS.** SET 2 precision ${v.precision.toFixed(3)} ≥ ${PRECISION_BAR}, recall ${v.recall.toFixed(3)}. K is re-derived and validated on a disjoint author set.`
    : `**✗ K = ${chosen.K} DID NOT TRANSFER.** SET 2 precision ${v.precision.toFixed(3)} < ${PRECISION_BAR}. Per the pre-registration the derivation is VOID and the shipped K stays unset.`);
}
say();
say('_Slice 0\'s recall numbers are deliberately absent: different denominator, not comparable (ADR-103)._');

const dest = 'docs/evidence/lane-b-slice1/k-rederivation-RESULT.md';
writeFileSync(dest, `${out.join('\n')}\n`);
console.error(`\nwritten to ${dest}`);
