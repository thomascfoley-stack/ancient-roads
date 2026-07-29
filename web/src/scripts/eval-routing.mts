// Reference-routing re-measure (READ-ONLY). Runs the frozen 88-query eval in four
// configs — legal/full × no-route/routed — to prove the routing gate: verse-ref
// HIT=1 up on legal, no regression vs the full/no-route baseline. The routing
// orchestration (injectionSql/mergeById/floorOnRange, cap, rerank model) is the
// SHARED production path from lib/teacher/routing.ts — this eval is not a look-alike.
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-routing.mts

import { neon } from '@neondatabase/serverless';
import { QUERIES, type Range } from './eval-failure-codes.mjs';
import { resolveIntent } from '../bible/pericopes';
import type { VerseRange } from '../bible/ref-parse';
// SHARED with production retrieveCommentary: the injection SQL + cap, the pool
// merge, the floor, and the rerank model + doc truncation all come from here — so
// this eval exercises the SAME orchestration it ships, not a look-alike. The only
// per-caller pieces are the base-pool query (the legal PUBLISHABLE filter is a
// measurement-only variant) and the rerank fetch (production's is server-only).
import { CANDIDATE_POOL, RERANK_MODEL, RERANK_DOC_CHARS, injectionSql, mergeById, floorOnRange } from '../lib/teacher/routing';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = 6; // top-K = production retrieveCommentary's default `limit`
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
// Full reranked pool (rows in rerank order), so the shared floor can promote
// on-range. Uses the SHARED rerank model + doc truncation.
async function rerankAll(q: string, rows: Row[]): Promise<Row[]> {
  if (rows.length <= K) return rows;
  const res = await fetch(`https://api.deepinfra.com/v1/inference/${RERANK_MODEL}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, RERANK_DOC_CHARS)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).map(({ i }) => rows[i]!);
}
// Base pool: full corpus = production's hybrid_search; legal = pure-vector + the
// PUBLISHABLE filter (a measurement-only variant — production doesn't yet restrict
// to the legal corpus). Routing on top is the SHARED path (injectionSql/merge/floor).
async function basePool(q: string, vec: string, legal: boolean): Promise<Row[]> {
  return (legal
    ? await sql.query(`SELECT source_id, content, metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} ORDER BY embedding <=> $1::vector LIMIT ${CANDIDATE_POOL}`, [vec])
    : await sql.query(`SELECT source_id, content, metadata FROM hybrid_search($1, $2::vector, ${CANDIDATE_POOL}, 0.4, 0.6, NULL)`, [q, vec])) as Row[];
}
async function injectRange(vec: string, ranges: readonly VerseRange[], legal: boolean): Promise<Row[]> {
  return (await sql.query(injectionSql(ranges, legal ? PUBLISHABLE : ''), [vec])) as Row[];
}

async function retrieve(q: string, vec: string, legal: boolean, route: boolean): Promise<number[]> {
  let rows = await basePool(q, vec, legal);
  let floorRanges: readonly VerseRange[] = [];
  if (route) {
    const intent = resolveIntent(q);
    if (intent.inject.length) rows = mergeById(await injectRange(vec, intent.inject, legal), rows, (r) => r.source_id);
    floorRanges = intent.floor;
  }
  const ranked = await rerankAll(q, rows);
  return floorOnRange(ranked, floorRanges, (r) => vid(r.metadata)).slice(0, K).map((r) => vid(r.metadata));
}

const CONFIGS: Array<{ name: string; legal: boolean; route: boolean }> = [
  { name: 'legal / no route', legal: true, route: false },
  { name: 'legal / ROUTED', legal: true, route: true },
  { name: 'full / no route', legal: false, route: false },
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
  console.log(`Reference-routing re-measure — ${n} queries, K=${K}, shared routing.ts orchestration\n`);
  console.log('config                 HIT=1        HIT=2        verse-ref HIT=1');
  CONFIGS.forEach((c, i) => { const a = agg[i]!; console.log(`  ${c.name.padEnd(20)} ${p(a.hit1).padEnd(12)} ${p(a.hit2).padEnd(12)} ${p(a.vrHit1, a.vrN)}`); });
  const L = agg[1]!;
  console.log(`\nlegal/ROUTED failure codes: <2-voices ${L.lt2}, wrong-passage ${L.wrong} (no-content=0)`);
  console.log(`verse-ref still failing HIT=1 under routing (legal): ${vrLost.length}`);
  for (const q of vrLost) console.log(`  ✗ ${q}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
