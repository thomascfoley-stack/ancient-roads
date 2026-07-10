// Reference-routing re-measure (READ-ONLY). Runs the frozen 88-query eval in three
// configs — legal(no route) / legal(routed) / full(routed) — to prove the routing
// gate: verse-ref HIT=1 up on legal, no regression on full. Routing = SOFT-BOOST:
// inject the top vector matches WITHIN the named passage's verse range (resolveIntent)
// into the reranker pool (cap INJECT_CAP), then rerank. No writes.
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-routing.mts

import { neon } from '@neondatabase/serverless';
import { QUERIES, type Range } from './eval-failure-codes.mjs';
import { resolveIntent } from '../bible/pericopes';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = 6, INJECT_CAP = 8;
const PUBLISHABLE = `(
  metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
  OR (metadata->>'author'='John Chrysostom'   AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
  OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
)`;

type Row = { source_id: string; content: string; metadata: unknown };
const vid = (m: unknown) => ((typeof m === 'string' ? JSON.parse(m) : m) as { verseId: number }).verseId;
const inRange = (v: number, rs: Range[]) => { const b = Math.floor(v / 1e6), c = Math.floor((v % 1e6) / 1000); return rs.some((r) => b === r.book && c >= r.ch[0] && c <= r.ch[1]); };

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;
}
// Full reranked pool (rows in rerank order), so the floor can promote on-range.
async function rerankAll(q: string, rows: Row[]): Promise<Row[]> {
  if (rows.length <= K) return rows;
  const res = await fetch('https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-0.6B', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, 1200)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).map(({ i }) => rows[i]!);
}
// FLOOR: for a referenced query, reserve the top-2 slots for the best-reranked
// on-reference voices (they're on the named passage). Guarantees HIT=1 + ≥2 voices
// there; the remaining slots keep topical breadth. Only when ranges resolved.
function applyFloor(ranked: Row[], ranges: Range2[]): number[] {
  const onR = (r: Row) => { const v = vid(r.metadata); return ranges.some((rg) => v >= rg.start && v <= rg.end); };
  const promote = ranked.filter(onR).slice(0, 2);
  const rest = ranked.filter((r) => !promote.includes(r));
  return [...promote, ...rest].slice(0, K).map((r) => vid(r.metadata));
}
async function basePool(q: string, vec: string, legal: boolean): Promise<Row[]> {
  return (legal
    ? await sql.query(`SELECT source_id, content, metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} ORDER BY embedding <=> $1::vector LIMIT 20`, [vec])
    : await sql.query(`SELECT source_id, content, metadata FROM hybrid_search($1, $2::vector, 20, 0.4, 0.6, NULL)`, [q, vec])) as Row[];
}
async function injectRange(vec: string, ranges: Range2[], legal: boolean): Promise<Row[]> {
  const conds = ranges.map((r) => `(metadata->>'verseId')::int BETWEEN ${r.start} AND ${r.end}`).join(' OR ');
  return (await sql.query(
    `WITH inrange AS MATERIALIZED (
       SELECT source_id, content, metadata, embedding FROM embeddings
       WHERE user_id IS NULL AND source_type='commentary' ${legal ? `AND ${PUBLISHABLE}` : ''} AND (${conds})
     ) SELECT source_id, content, metadata FROM inrange ORDER BY embedding <=> $1::vector LIMIT ${INJECT_CAP}`, [vec])) as Row[];
}
interface Range2 { start: number; end: number }

async function retrieve(q: string, vec: string, legal: boolean, route: boolean): Promise<number[]> {
  let rows = await basePool(q, vec, legal);
  let ranges: Range2[] = [];
  if (route) {
    ranges = resolveIntent(q) as Range2[];
    if (ranges.length) {
      const inj = await injectRange(vec, ranges, legal);
      const seen = new Set<string>(); const merged: Row[] = [];
      for (const r of [...inj, ...rows]) if (!seen.has(r.source_id)) { seen.add(r.source_id); merged.push(r); }
      rows = merged;
    }
  }
  const ranked = await rerankAll(q, rows);
  return ranges.length ? applyFloor(ranked, ranges) : ranked.slice(0, K).map((r) => vid(r.metadata));
}

const CONFIGS: Array<{ name: string; legal: boolean; route: boolean }> = [
  { name: 'legal / no route', legal: true, route: false },
  { name: 'legal / ROUTED', legal: true, route: true },
  { name: 'full / ROUTED', legal: false, route: true },
];

async function main() {
  const n = QUERIES.length;
  const agg = CONFIGS.map(() => ({ hit1: 0, hit2: 0, vrHit1: 0, vrN: 0, lt2: 0, wrong: 0 }));
  const vrLost: string[] = [];

  for (const item of QUERIES) {
    const vec = await embed(item.q);
    const results = await Promise.all(CONFIGS.map((c) => retrieve(item.q, vec, c.legal, c.route)));
    results.forEach((top, ci) => {
      const nIn = top.filter((h) => inRange(h, item.expect)).length;
      const top1 = top.length > 0 && inRange(top[0]!, item.expect);
      const a = agg[ci]!;
      if (top1) a.hit1++;
      if (nIn >= 2) a.hit2++; else if (nIn === 1) a.lt2++; else a.wrong++;
      if (item.cat === 'verse-ref') { a.vrN++; if (top1) a.vrHit1++; }
    });
    if (item.cat === 'verse-ref') {
      const routedTop1 = inRange(results[1]![0] ?? -1, item.expect);
      if (!routedTop1) vrLost.push(item.q.slice(0, 50));
    }
  }

  const p = (x: number, d = n) => `${x}/${d} (${Math.round(100 * x / d)}%)`;
  console.log(`Reference-routing re-measure — ${n} queries, K=${K}, inject cap=${INJECT_CAP}\n`);
  console.log('config                 HIT=1        HIT=2        verse-ref HIT=1');
  CONFIGS.forEach((c, i) => { const a = agg[i]!; console.log(`  ${c.name.padEnd(20)} ${p(a.hit1).padEnd(12)} ${p(a.hit2).padEnd(12)} ${p(a.vrHit1, a.vrN)}`); });
  const L = agg[1]!;
  console.log(`\nlegal/ROUTED failure codes: <2-voices ${L.lt2}, wrong-passage ${L.wrong} (no-content=0)`);
  console.log(`verse-ref still failing HIT=1 under routing (legal): ${vrLost.length}`);
  for (const q of vrLost) console.log(`  ✗ ${q}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
