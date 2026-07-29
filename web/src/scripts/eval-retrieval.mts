// Retrieval eval harness: a larger, LABELED query set spanning the categories a
// 10-query topical set can't exercise (exact-term, proper-noun, verse-ref,
// rare-topic). Each query declares its expected passage(s); a retrieved source
// is a HIT if its verseId decodes to an expected (book, chapter) range. This is
// objective and mode-discriminating, so it can finally settle vector vs hybrid
// vs full on data — and gives statistical power the topical set lacks.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-retrieval.mts
//   MODE=vector|hybrid|full (default all three)  ·  K=6 retrieved  ·  HIT=2 min hits
//
// Retrieval-only (no compose): compose reliability is ~9/10 and mode-independent;
// what discriminates the modes is whether the RIGHT passage is retrieved.

import { neon } from '@neondatabase/serverless';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = Number(process.env.K ?? 6);
const MIN_HITS = Number(process.env.HIT ?? 2); // >= this many of K in-range = correct
const MODES = (process.env.MODE ? [process.env.MODE] : ['vector', 'hybrid', 'full']) as Array<'vector' | 'hybrid' | 'full'>;

// Book numbers (SWORD order) for expected-passage labels.
const B = {
  gen: 1, exo: 2, num: 4, deu: 5, jos: 6, jdg: 7, rut: 8, sa1: 9, sa2: 10, ki1: 11, ki2: 12,
  job: 18, psa: 19, pro: 20, isa: 23, jer: 24, ezk: 26, dan: 27, jon: 32, mic: 33,
  mat: 40, mrk: 41, luk: 42, jhn: 43, act: 44, rom: 45, co1: 46, co2: 47, gal: 48, eph: 49,
  php: 50, col: 51, th1: 52, ti1: 54, heb: 58, jas: 59, pe1: 60, jn1: 62, rev: 66,
} as const;

type Range = { book: number; ch: [number, number] };
interface EvalQuery { q: string; cat: string; expect: Range[] }

const QUERIES: EvalQuery[] = [
  // ── verse-ref / specific passage ──
  { q: 'the Word became flesh in the Gospel of John', cat: 'verse-ref', expect: [{ book: B.jhn, ch: [1, 1] }] },
  { q: 'Genesis 1 creation account, in the beginning God created', cat: 'verse-ref', expect: [{ book: B.gen, ch: [1, 2] }] },
  { q: 'Psalm 23 the Lord is my shepherd', cat: 'verse-ref', expect: [{ book: B.psa, ch: [23, 23] }] },
  { q: 'Isaiah 53 the suffering servant', cat: 'verse-ref', expect: [{ book: B.isa, ch: [52, 53] }] },
  { q: '1 Corinthians 13 the greatest of these is love', cat: 'verse-ref', expect: [{ book: B.co1, ch: [13, 13] }] },
  { q: 'Romans 8 nothing can separate us from the love of God', cat: 'verse-ref', expect: [{ book: B.rom, ch: [8, 8] }] },
  { q: 'the beatitudes in the Sermon on the Mount', cat: 'verse-ref', expect: [{ book: B.mat, ch: [5, 7] }] },
  { q: 'Revelation 21 a new heaven and a new earth', cat: 'verse-ref', expect: [{ book: B.rev, ch: [21, 22] }] },
  // ── proper-noun (people / places) ──
  { q: 'who was Melchizedek the priest king', cat: 'proper-noun', expect: [{ book: B.gen, ch: [14, 14] }, { book: B.heb, ch: [7, 7] }, { book: B.psa, ch: [110, 110] }] },
  { q: 'Nicodemus came to Jesus by night', cat: 'proper-noun', expect: [{ book: B.jhn, ch: [3, 3] }] },
  { q: 'Jonah and the city of Nineveh', cat: 'proper-noun', expect: [{ book: B.jon, ch: [1, 4] }] },
  { q: 'Moses and the burning bush', cat: 'proper-noun', expect: [{ book: B.exo, ch: [3, 4] }] },
  { q: 'David and Goliath the Philistine', cat: 'proper-noun', expect: [{ book: B.sa1, ch: [17, 17] }] },
  { q: 'the Samaritan woman at the well', cat: 'proper-noun', expect: [{ book: B.jhn, ch: [4, 4] }] },
  { q: 'Paul on the road to Damascus', cat: 'proper-noun', expect: [{ book: B.act, ch: [9, 9] }, { book: B.act, ch: [22, 22] }, { book: B.act, ch: [26, 26] }] },
  // ── exact-term (theological terms; BM25's home turf) ──
  { q: 'propitiation for our sins', cat: 'exact-term', expect: [{ book: B.rom, ch: [3, 3] }, { book: B.jn1, ch: [2, 2] }, { book: B.jn1, ch: [4, 4] }, { book: B.heb, ch: [2, 2] }] },
  { q: 'justification by faith apart from works of the law', cat: 'exact-term', expect: [{ book: B.rom, ch: [3, 5] }, { book: B.gal, ch: [2, 3] }] },
  { q: 'predestination and election of the saints', cat: 'exact-term', expect: [{ book: B.rom, ch: [8, 9] }, { book: B.eph, ch: [1, 1] }] },
  { q: 'circumcision of the heart', cat: 'exact-term', expect: [{ book: B.deu, ch: [10, 10] }, { book: B.deu, ch: [30, 30] }, { book: B.rom, ch: [2, 2] }] },
  { q: 'the firstfruits of the resurrection', cat: 'exact-term', expect: [{ book: B.co1, ch: [15, 15] }] },
  // ── rare-topic / obscure ──
  { q: 'the Urim and Thummim', cat: 'rare-topic', expect: [{ book: B.exo, ch: [28, 28] }, { book: B.num, ch: [27, 27] }, { book: B.sa1, ch: [28, 28] }] },
  { q: 'the Nephilim, sons of God and daughters of men', cat: 'rare-topic', expect: [{ book: B.gen, ch: [6, 6] }] },
  { q: "Balaam's donkey that spoke", cat: 'rare-topic', expect: [{ book: B.num, ch: [22, 24] }] },
  { q: 'the bronze serpent lifted up in the wilderness', cat: 'rare-topic', expect: [{ book: B.num, ch: [21, 21] }, { book: B.jhn, ch: [3, 3] }] },
  { q: 'Gog and Magog', cat: 'rare-topic', expect: [{ book: B.ezk, ch: [38, 39] }, { book: B.rev, ch: [20, 20] }] },
  { q: 'the valley of dry bones', cat: 'rare-topic', expect: [{ book: B.ezk, ch: [37, 37] }] },
  // ── conceptual / topical (the original class) ──
  { q: 'the good shepherd lays down his life for the sheep', cat: 'topical', expect: [{ book: B.jhn, ch: [10, 10] }] },
  { q: 'I am the vine you are the branches', cat: 'topical', expect: [{ book: B.jhn, ch: [15, 15] }] },
  { q: 'you must be born again', cat: 'topical', expect: [{ book: B.jhn, ch: [3, 3] }] },
  { q: 'the Lord\'s Supper, this is my body broken for you', cat: 'topical', expect: [{ book: B.co1, ch: [11, 11] }, { book: B.mat, ch: [26, 26] }, { book: B.luk, ch: [22, 22] }] },
];

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return ((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding;
}

interface Hit { verseId: number }
async function retrieveVector(vec: number[]): Promise<Hit[]> {
  const rows = (await sql.query(
    `SELECT metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' ORDER BY embedding <=> $1::vector LIMIT $2`,
    [`[${vec.join(',')}]`, K],
  )) as Array<{ metadata: unknown }>;
  return rows.map((r) => ({ verseId: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata).verseId }));
}
async function retrieveHybrid(text: string, vec: number[], limit: number): Promise<Hit[]> {
  const rows = (await sql.query(`SELECT metadata FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, NULL)`, [text, `[${vec.join(',')}]`, limit])) as Array<{ metadata: unknown }>;
  return rows.map((r) => ({ verseId: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata).verseId }));
}
async function retrieveFull(text: string, vec: number[]): Promise<Hit[]> {
  const rows = (await sql.query(`SELECT content, metadata FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, NULL)`, [text, `[${vec.join(',')}]`, 20])) as Array<{ content: string; metadata: unknown }>;
  if (rows.length <= K) return rows.map((r) => ({ verseId: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata).verseId }));
  const res = await fetch('https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-0.6B', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [text], documents: rows.map((r) => r.content.slice(0, 1200)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).slice(0, K)
    .map(({ i }) => ({ verseId: (typeof rows[i]!.metadata === 'string' ? JSON.parse(rows[i]!.metadata as string) : rows[i]!.metadata as { verseId: number }).verseId }));
}

function inRange(verseId: number, ranges: Range[]): boolean {
  const book = Math.floor(verseId / 1_000_000);
  const ch = Math.floor((verseId % 1_000_000) / 1000);
  return ranges.some((r) => book === r.book && ch >= r.ch[0] && ch <= r.ch[1]);
}

async function main() {
  console.log(`Retrieval eval — ${QUERIES.length} labeled queries, K=${K}, hit>=${MIN_HITS}, modes=${MODES.join('/')}\n`);
  const cats = [...new Set(QUERIES.map((q) => q.cat))];

  for (const mode of MODES) {
    let correct = 0;
    const byCat: Record<string, { c: number; n: number }> = {};
    const misses: string[] = [];
    for (const item of QUERIES) {
      byCat[item.cat] ??= { c: 0, n: 0 };
      byCat[item.cat]!.n++;
      const vec = await embed(item.q);
      const hits = mode === 'vector' ? await retrieveVector(vec) : mode === 'hybrid' ? await retrieveHybrid(item.q, vec, K) : await retrieveFull(item.q, vec);
      const nHit = hits.filter((h) => inRange(h.verseId, item.expect)).length;
      const ok = nHit >= MIN_HITS;
      if (ok) { correct++; byCat[item.cat]!.c++; } else { misses.push(`${item.cat}: ${item.q.slice(0, 44)} (${nHit}/${K} in range)`); }
    }
    console.log(`━━ MODE=${mode}: ${correct}/${QUERIES.length} (${(100 * correct / QUERIES.length).toFixed(0)}%) ━━`);
    for (const c of cats) console.log(`   ${c.padEnd(12)} ${byCat[c]!.c}/${byCat[c]!.n}`);
    if (misses.length) { console.log('   misses:'); for (const m of misses) console.log(`     ✗ ${m}`); }
    console.log();
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
