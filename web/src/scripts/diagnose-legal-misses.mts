// Diagnose the 2 HIT=1 legal-corpus misses (read-only): show what the publishable
// set retrieves as its top passages vs the full-corpus baseline, to tell a CONTENT
// gap (CrossWire-5 fixes) from a RANKING/ANCHORING issue (it won't).
//   cd web && npx tsx --env-file=.env.local src/scripts/diagnose-legal-misses.mts

import { neon } from '@neondatabase/serverless';
const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));

const PUBLISHABLE = `(
  metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
  OR (metadata->>'author'='John Chrysostom'   AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
  OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
)`;
const BOOKN: Record<number, string> = { 40: 'Matt', 43: 'John', 44: 'Acts', 45: 'Rom', 46: '1Cor', 49: 'Eph', 58: 'Heb', 62: '1John', 19: 'Ps', 23: 'Isa' };
const dec = (v: number) => `${BOOKN[Math.floor(v / 1e6)] ?? 'bk' + Math.floor(v / 1e6)} ${Math.floor((v % 1e6) / 1000)}:${v % 1000}`;

const CASES = [
  { q: '1 Corinthians 13 the greatest of these is love', want: 'expect 1Cor 13' },
  { q: 'propitiation for our sins', want: 'expect Rom 3 / 1John 2,4 / Heb 2' },
];

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;
}
const meta = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m) as { verseId: number; author: string };
async function rerankTop(q: string, rows: Array<{ content: string; metadata: unknown }>, k = 6) {
  if (rows.length <= k) return rows.slice(0, k);
  const res = await fetch('https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-0.6B', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, 1200)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).slice(0, k).map(({ i }) => rows[i]!);
}

async function main() {
  for (const c of CASES) {
    console.log('\n' + '='.repeat(76) + `\nQUERY: "${c.q}"  (${c.want})\n` + '='.repeat(76));
    const vec = await embed(c.q);

    const base = (await sql.query(`SELECT content, metadata FROM hybrid_search($1, $2::vector, 20, 0.4, 0.6, NULL)`, [c.q, vec])) as Array<{ content: string; metadata: unknown }>;
    const legal = (await sql.query(`SELECT content, metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} ORDER BY embedding <=> $1::vector LIMIT 20`, [vec])) as Array<{ content: string; metadata: unknown }>;

    for (const [label, rows] of [['BASELINE (full corpus)', base], ['LEGAL (publishable)', legal]] as const) {
      const top = await rerankTop(c.q, rows);
      console.log(`\n  ${label} — reranked top 6:`);
      top.forEach((r, i) => { const m = meta(r.metadata); console.log(`    ${i + 1}. ${dec(m.verseId).padEnd(12)} ${m.author.slice(0, 22).padEnd(23)} ${r.content.replace(/\s+/g, ' ').slice(0, 60)}`); });
    }

    // Does the publishable set even CONTAIN commentary on the expected passage?
    const has = (await sql.query(
      `SELECT metadata->>'author' a, count(*) n FROM embeddings
        WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE}
          AND (metadata->>'verseId')::int/1000000 = ANY($1) GROUP BY 1 ORDER BY n DESC`,
      [c.q.startsWith('1 Cor') ? [46] : [45, 62, 58]])) as Array<{ a: string; n: string }>;
    console.log(`\n  publishable coverage of the expected book(s): ${has.map((x) => `${x.a}=${x.n}`).join(', ') || 'NONE'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
