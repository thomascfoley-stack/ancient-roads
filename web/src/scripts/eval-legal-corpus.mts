// Legal-corpus accuracy measurement (READ-ONLY). Runs the labeled 30-query eval
// on the CURRENT full corpus (baseline) vs the PUBLISHABLE set (verified-repairable
// only: helloao Gill/JFB/Clarke/Matthew-Henry + patristic-repairable Chrysostom
// Acts/John/Matthew + Augustine Psalms/John). Filters retrieval to the publishable
// source_ids — no migration, no writes. Reports vector + full(hybrid→rerank) for
// both, per-category, and which queries the filter loses.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-legal-corpus.mts

import { neon } from '@neondatabase/serverless';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = Number(process.env.K ?? 6);
const MIN_HITS = Number(process.env.HIT ?? 2);

// The publishable set: verified-repairable authors (helloao whole-Bible) + the
// verified patristic works (author + book), by verseId book number.
const PUBLISHABLE = `(
  metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
  OR (metadata->>'author'='John Chrysostom'   AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
  OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
)`;

const B = {
  gen: 1, exo: 2, num: 4, deu: 5, sa1: 9, psa: 19, isa: 23, ezk: 26, jon: 32,
  mat: 40, mrk: 41, luk: 42, jhn: 43, act: 44, rom: 45, co1: 46, gal: 48, eph: 49, heb: 58, jn1: 62, rev: 66,
} as const;
type Range = { book: number; ch: [number, number] };
interface EvalQuery { q: string; cat: string; expect: Range[] }
const QUERIES: EvalQuery[] = [
  { q: 'the Word became flesh in the Gospel of John', cat: 'verse-ref', expect: [{ book: B.jhn, ch: [1, 1] }] },
  { q: 'Genesis 1 creation account, in the beginning God created', cat: 'verse-ref', expect: [{ book: B.gen, ch: [1, 2] }] },
  { q: 'Psalm 23 the Lord is my shepherd', cat: 'verse-ref', expect: [{ book: B.psa, ch: [23, 23] }] },
  { q: 'Isaiah 53 the suffering servant', cat: 'verse-ref', expect: [{ book: B.isa, ch: [52, 53] }] },
  { q: '1 Corinthians 13 the greatest of these is love', cat: 'verse-ref', expect: [{ book: B.co1, ch: [13, 13] }] },
  { q: 'Romans 8 nothing can separate us from the love of God', cat: 'verse-ref', expect: [{ book: B.rom, ch: [8, 8] }] },
  { q: 'the beatitudes in the Sermon on the Mount', cat: 'verse-ref', expect: [{ book: B.mat, ch: [5, 7] }] },
  { q: 'Revelation 21 a new heaven and a new earth', cat: 'verse-ref', expect: [{ book: B.rev, ch: [21, 22] }] },
  { q: 'who was Melchizedek the priest king', cat: 'proper-noun', expect: [{ book: B.gen, ch: [14, 14] }, { book: B.heb, ch: [7, 7] }, { book: B.psa, ch: [110, 110] }] },
  { q: 'Nicodemus came to Jesus by night', cat: 'proper-noun', expect: [{ book: B.jhn, ch: [3, 3] }] },
  { q: 'Jonah and the city of Nineveh', cat: 'proper-noun', expect: [{ book: B.jon, ch: [1, 4] }] },
  { q: 'Moses and the burning bush', cat: 'proper-noun', expect: [{ book: B.exo, ch: [3, 4] }] },
  { q: 'David and Goliath the Philistine', cat: 'proper-noun', expect: [{ book: B.sa1, ch: [17, 17] }] },
  { q: 'the Samaritan woman at the well', cat: 'proper-noun', expect: [{ book: B.jhn, ch: [4, 4] }] },
  { q: 'Paul on the road to Damascus', cat: 'proper-noun', expect: [{ book: B.act, ch: [9, 9] }, { book: B.act, ch: [22, 22] }, { book: B.act, ch: [26, 26] }] },
  { q: 'propitiation for our sins', cat: 'exact-term', expect: [{ book: B.rom, ch: [3, 3] }, { book: B.jn1, ch: [2, 2] }, { book: B.jn1, ch: [4, 4] }, { book: B.heb, ch: [2, 2] }] },
  { q: 'justification by faith apart from works of the law', cat: 'exact-term', expect: [{ book: B.rom, ch: [3, 5] }, { book: B.gal, ch: [2, 3] }] },
  { q: 'predestination and election of the saints', cat: 'exact-term', expect: [{ book: B.rom, ch: [8, 9] }, { book: B.eph, ch: [1, 1] }] },
  { q: 'circumcision of the heart', cat: 'exact-term', expect: [{ book: B.deu, ch: [10, 10] }, { book: B.deu, ch: [30, 30] }, { book: B.rom, ch: [2, 2] }] },
  { q: 'the firstfruits of the resurrection', cat: 'exact-term', expect: [{ book: B.co1, ch: [15, 15] }] },
  { q: 'the Urim and Thummim', cat: 'rare-topic', expect: [{ book: B.exo, ch: [28, 28] }, { book: B.num, ch: [27, 27] }, { book: B.sa1, ch: [28, 28] }] },
  { q: 'the Nephilim, sons of God and daughters of men', cat: 'rare-topic', expect: [{ book: B.gen, ch: [6, 6] }] },
  { q: "Balaam's donkey that spoke", cat: 'rare-topic', expect: [{ book: B.num, ch: [22, 24] }] },
  { q: 'the bronze serpent lifted up in the wilderness', cat: 'rare-topic', expect: [{ book: B.num, ch: [21, 21] }, { book: B.jhn, ch: [3, 3] }] },
  { q: 'Gog and Magog', cat: 'rare-topic', expect: [{ book: B.ezk, ch: [38, 39] }, { book: B.rev, ch: [20, 20] }] },
  { q: 'the valley of dry bones', cat: 'rare-topic', expect: [{ book: B.ezk, ch: [37, 37] }] },
  { q: 'the good shepherd lays down his life for the sheep', cat: 'topical', expect: [{ book: B.jhn, ch: [10, 10] }] },
  { q: 'I am the vine you are the branches', cat: 'topical', expect: [{ book: B.jhn, ch: [15, 15] }] },
  { q: 'you must be born again', cat: 'topical', expect: [{ book: B.jhn, ch: [3, 3] }] },
  { q: 'the Lord\'s Supper, this is my body broken for you', cat: 'topical', expect: [{ book: B.co1, ch: [11, 11] }, { book: B.mat, ch: [26, 26] }, { book: B.luk, ch: [22, 22] }] },
];

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  const v = ((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding;
  return `[${v.join(',')}]`;
}
const vid = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m).verseId as number;
function inRange(verseId: number, ranges: Range[]): boolean {
  const book = Math.floor(verseId / 1_000_000); const ch = Math.floor((verseId % 1_000_000) / 1000);
  return ranges.some((r) => book === r.book && ch >= r.ch[0] && ch <= r.ch[1]);
}
async function rerank(q: string, rows: Array<{ content: string; metadata: unknown }>): Promise<number[]> {
  if (rows.length <= K) return rows.map((r) => vid(r.metadata));
  const res = await fetch('https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-0.6B', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, 1200)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).slice(0, K).map(({ i }) => vid(rows[i]!.metadata));
}
const ok = (hits: number[], ex: Range[]) => hits.filter((h) => inRange(h, ex)).length >= MIN_HITS;

async function vector(vec: string, filtered: boolean): Promise<number[]> {
  const rows = (await sql.query(
    `SELECT metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' ${filtered ? `AND ${PUBLISHABLE}` : ''} ORDER BY embedding <=> $1::vector LIMIT $2`,
    [vec, K])) as Array<{ metadata: unknown }>;
  return rows.map((r) => vid(r.metadata));
}
async function full(q: string, vec: string, filtered: boolean): Promise<number[]> {
  const rows = (filtered
    ? await sql.query(`SELECT content, metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} ORDER BY embedding <=> $1::vector LIMIT 20`, [vec])
    : await sql.query(`SELECT content, metadata FROM hybrid_search($1, $2::vector, 20, 0.4, 0.6, NULL)`, [q, vec])
  ) as Array<{ content: string; metadata: unknown }>;
  return rerank(q, rows);
}

async function main() {
  console.log(`Legal-corpus eval — ${QUERIES.length} queries, K=${K}, hit>=${MIN_HITS}. Publishable = 66,801/173,806 (38.4%).\n`);
  const cats = [...new Set(QUERIES.map((x) => x.cat))];
  const tally = { vecBase: 0, vecFilt: 0, fullBase: 0, fullFilt: 0 };
  const byCat: Record<string, { base: number; filt: number; n: number }> = {};
  const lost: Array<{ q: string; cat: string }> = [];

  for (const item of QUERIES) {
    byCat[item.cat] ??= { base: 0, filt: 0, n: 0 }; byCat[item.cat]!.n++;
    const vec = await embed(item.q);
    const [vb, vf, fb, ff] = await Promise.all([vector(vec, false), vector(vec, true), full(item.q, vec, false), full(item.q, vec, true)]);
    if (ok(vb, item.expect)) tally.vecBase++;
    if (ok(vf, item.expect)) tally.vecFilt++;
    const fbOk = ok(fb, item.expect), ffOk = ok(ff, item.expect);
    if (fbOk) { tally.fullBase++; byCat[item.cat]!.base++; }
    if (ffOk) { tally.fullFilt++; byCat[item.cat]!.filt++; }
    if (fbOk && !ffOk) lost.push({ q: item.q, cat: item.cat });
  }

  const pct = (n: number) => `${n}/${QUERIES.length} (${Math.round(100 * n / QUERIES.length)}%)`;
  console.log('                       BASELINE (full corpus)   LEGAL (publishable 38%)');
  console.log(`  vector               ${pct(tally.vecBase).padEnd(24)} ${pct(tally.vecFilt)}`);
  console.log(`  full (rerank)        ${pct(tally.fullBase).padEnd(24)} ${pct(tally.fullFilt)}`);
  console.log('\nfull-pipeline by category (base → legal):');
  for (const c of cats) console.log(`  ${c.padEnd(12)} ${byCat[c]!.base}/${byCat[c]!.n} → ${byCat[c]!.filt}/${byCat[c]!.n}`);
  console.log(`\nQueries lost by the legal filter (full pipeline): ${lost.length}`);
  for (const l of lost) console.log(`  ✗ [${l.cat}] ${l.q}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
