/**
 * SLICE 0 — PRECISION eval + recall/precision trade curve (docs/SERMON_SEARCH_DESIGN.md).
 * The recall run confirmed the uncited channel finds the passage (90% held-out) but returns ~66
 * verses/sermon. This measures how many of those returns are REAL.
 *
 * PRE-REGISTERED (before measuring):
 *  - Return rule (the tightening knob K): a verse is RETURNED if >= K of its 6-word shingles
 *    appear in the body. K=1 is the frozen recall harness. Larger K = fewer, stronger returns.
 *  - GOLD (truth, independent of K): the sermon genuinely engages a verse iff the body contains
 *    an >=8-word verbatim run of it (an 8-gram overlap). Conservative → precision is a LOWER bound.
 *  - Precision (sermon-level) = |returns ∩ gold| / |returns|, averaged over sermons. BAR >= 60%.
 *  - Recall (chapter) = stated text's chapter is among the returned verses' chapters. BAR >= 70%.
 * Report the (K → recall, precision, avg-returns) curve; never tune K to the set.
 *
 * Run: BIBLE_TR=kjv npx tsx scripts/slice0-precision.mts <set.txt>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scanReferences } from '../src/bible/ref-parse.ts';
import { shingleHashSetOcr, tokenListOcr } from '../src/ingest/resource-textmatch.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIB = path.join(REPO, 'web/public/bible', process.env.BIBLE_TR ?? 'kjv');

// index: hash6 -> verseIds, hash8 -> verseIds, plus per-verse 6-shingle count
const idx6 = new Map<number, number[]>(), idx8 = new Map<number, number[]>();
const shCount6 = new Map<number, number>();
for (const f of readdirSync(BIB).filter((n) => n.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(path.join(BIB, f), 'utf8')) as { book: number; chapters: Record<string, { verse: number; text: string }[]> };
  for (const [chap, vs] of Object.entries(j.chapters)) for (const v of vs) {
    const id = j.book * 1_000_000 + Number(chap) * 1000 + v.verse;
    const s6 = shingleHashSetOcr(v.text, 6); shCount6.set(id, s6.size);
    for (const h of s6) (idx6.get(h) ?? idx6.set(h, []).get(h)!).push(id);
    for (const h of shingleHashSetOcr(v.text, 8)) (idx8.get(h) ?? idx8.set(h, []).get(h)!).push(id);
  }
}
const chapOf = (id: number) => Math.floor(id / 1000);

// same parsing as the frozen recall harness
const lines = readFileSync(process.argv[2]!, 'utf8').split('\n');
const cleanRe = /["'”’][.,*]{0,3}\s*[—-]{1,3}\s*([1-3]?\s?[A-Z][A-Za-z]{2,})\.?\s+(\d{1,3}):(\d{1,3})/;
const titleCase = (b: string) => b.replace(/\s+/g, ' ').trim().replace(/\S+/g, (w) => w[0]! + w.slice(1).toLowerCase());
const markers: { line: number; verseId: number }[] = [];
for (let i = 0; i < lines.length; i++) {
  const c = lines[i]!.match(cleanRe); if (!c) continue;
  const refs = scanReferences(`${titleCase(c[1]!)} ${Number(c[2])}:${Number(c[3])}`);
  if (refs[0]?.ranges[0]) markers.push({ line: i, verseId: refs[0].ranges[0].start });
}
interface S { gt: number; body: string }
const sermons: S[] = [];
for (let k = 0; k < markers.length; k++) {
  const start = markers[k]!.line + 1;
  const end = Math.min(k + 1 < markers.length ? markers[k + 1]!.line : lines.length, start + 700, lines.length);
  const body = lines.slice(start, end).join('\n');
  if (tokenListOcr(body).length >= 300) sermons.push({ gt: markers[k]!.verseId, body });
}

// per sermon: candidate 6-hits per verse + the gold set (>=8-word run)
const rows = sermons.map((s) => {
  const hits = new Map<number, number>();
  for (const h of shingleHashSetOcr(s.body, 6)) for (const id of idx6.get(h) ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
  const gold = new Set<number>();
  for (const h of shingleHashSetOcr(s.body, 8)) for (const id of idx8.get(h) ?? []) gold.add(id);
  return { gt: s.gt, hits, gold };
});

console.log(`\n=== SLICE 0 PRECISION + trade curve (n=${rows.length}, ${process.env.BIBLE_TR ?? 'kjv'}, gold=>=8-word run) ===`);
console.log(`K   returns/sermon   precision(sermon-avg)   recall(chapter)`);
for (const K of [1, 2, 3, 4, 5]) {
  let precSum = 0, precN = 0, recHit = 0, retSum = 0;
  for (const r of rows) {
    const returns = [...r.hits].filter(([, n]) => n >= K).map(([id]) => id);
    retSum += returns.length;
    if (returns.length) { precSum += returns.filter((id) => r.gold.has(id)).length / returns.length; precN++; }
    if (returns.some((id) => chapOf(id) === chapOf(r.gt))) recHit++;
  }
  const prec = precN ? (100 * precSum / precN) : 0;
  console.log(`${K}   ${(retSum / rows.length).toFixed(1).padStart(6)}          ${prec.toFixed(0).padStart(3)}%                  ${((100 * recHit) / rows.length).toFixed(0).padStart(3)}%  (${recHit}/${rows.length})`);
}
// failure-code: at K=1, what fraction of NON-gold returns are single-hit (incidental common phrase)?
let single = 0, nonGold = 0;
for (const r of rows) for (const [id, n] of r.hits) if (!r.gold.has(id)) { nonGold++; if (n === 1) single++; }
console.log(`\nfalse positives at K=1: ${nonGold} non-gold returns; ${((100 * single) / nonGold).toFixed(0)}% are single-6gram hits (incidental collisions, killed by K>=2)`);
