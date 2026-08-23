// W-PN20 label re-code — follow-up probe (READ-ONLY, dev). Two questions the first
// probe left open:
//   1. pn18/pn16: does the ef=1000 base pool contain on-label rows? (ef-starvation vs
//      embedding-level recall failure — different retrieval remedies)
//   2. pn13: how many DISTINCT authors have served chunks anchored to the Joseph of
//      Arimathaea pericope itself (Luke 23:50-56)? (retrieval-limited vs content-limited)
//   cd web && npx tsx --env-file=.env.local src/scripts/w-pn20-recode-probe2.mts

import { neon } from '@neondatabase/serverless';
import { CANDIDATE_POOL, legalBasePool } from '../lib/teacher/routing';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const meta = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m) as { verseId: number; author: string };

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  if (!res.ok) throw new Error(`DeepInfra embed ${res.status}`);
  const vec = (await res.json() as { data?: { embedding: number[] }[] }).data?.[0]?.embedding;
  if (!vec) throw new Error('no vector');
  return `[${vec.join(',')}]`;
}

const CASES = [
  { id: 'pn18', query: 'Diotrephes who loveth to have the preeminence', book: 64, ch: 1, label: '3 John 1' },
  { id: 'pn16', query: 'Stephanas and his household, the firstfruits of Achaia', book: 46, ch: 16, label: '1 Corinthians 16' },
  { id: 'pn13', query: 'Joseph of Arimathaea who begged the body of Jesus', book: 42, ch: 23, label: 'Luke 23' },
] as const;

for (const c of CASES) {
  const lo = c.book * 1e6 + c.ch * 1000 + 1, hi = c.book * 1e6 + c.ch * 1000 + 999;
  const vec = await embed(c.query);
  const pool = (await legalBasePool(sql, vec, CANDIDATE_POOL, 1000)) as Array<{ metadata: unknown }>;
  const onLabel = pool.filter((r) => { const v = meta(r.metadata).verseId; return v >= lo && v <= hi; });
  console.log(`${c.id}: ef=1000 pool n=${pool.length}, on-label rows in pool = ${onLabel.length}`);
  for (const r of onLabel) { const m = meta(r.metadata); console.log(`    verseId=${m.verseId} ${m.author}`); }
}

// pn13 pericope-level coverage: distinct served authors anchored to Luke 23:50-56.
const per = (await sql.query(
  `SELECT source_type, metadata->>'author' AS author, COUNT(*)::int AS n,
          MIN((metadata->>'verseId')::int) AS v_lo, MAX((metadata->>'verseId')::int) AS v_hi
     FROM embeddings
    WHERE user_id IS NULL AND served
      AND (metadata->>'verseId')::int BETWEEN 42023050 AND 42023056
    GROUP BY 1, 2 ORDER BY 1, 3 DESC`)) as Array<{ source_type: string; author: string; n: number; v_lo: number; v_hi: number }>;
console.log('\npn13 pericope coverage — served rows anchored to Luke 23:50-56 (Joseph of Arimathaea):');
for (const r of per) console.log(`  ${r.source_type.padEnd(12)} ${(r.author ?? '?').padEnd(44)} n=${r.n} verses ${r.v_lo % 1000}-${r.v_hi % 1000}`);
console.log('\nDONE — read-only.');
