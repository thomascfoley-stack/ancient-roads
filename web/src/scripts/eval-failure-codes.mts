// ~100-query legal-corpus eval with FAILURE-CODE breakdown (READ-ONLY). For every
// query, run the legal (publishable) full pipeline and classify the outcome so we
// can pick interventions by measured ROI:
//   pass            — >= 2 in-range voices in top-K (the product guarantee holds)
//   <2-voices       — right passage retrieved but only 1 in-range (diversity gap → any voice)
//   wrong-passage   — the set HAS the passage but a different one ranks top (RANKING → verse-ref intent)
//   no-content      — the publishable set has NO commentary on the expected passage (CONTENT → CrossWire-5)
// (verifier-fallback is a COMPOSE-stage code, measured by the bait/compose evals, not here.)
//
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-failure-codes.mts

import { neon } from '@neondatabase/serverless';
const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = Number(process.env.K ?? 6);

const PUBLISHABLE = `(
  metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
  OR (metadata->>'author'='John Chrysostom'   AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
  OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
)`;

const B = { gen:1,exo:2,lev:3,num:4,deu:5,jos:6,jdg:7,rut:8,sa1:9,sa2:10,ki1:11,ki2:12,job:18,psa:19,pro:20,ecc:21,isa:23,jer:24,ezk:26,dan:27,hos:28,jol:29,amo:30,oba:31,jon:32,mic:33,mat:40,mrk:41,luk:42,jhn:43,act:44,rom:45,co1:46,co2:47,gal:48,eph:49,php:50,col:51,th1:52,ti1:54,tit:56,heb:58,jas:59,pe1:60,jn1:62,jn4:62,rev:66 } as const;
type Range = { book: number; ch: [number, number] };
interface Q { q: string; cat: string; expect: Range[] }
const R = (book: number, a: number, b = a): Range => ({ book, ch: [a, b] });

const QUERIES: Q[] = [
  // verse-ref
  { q: 'the Word became flesh in the Gospel of John', cat: 'verse-ref', expect: [R(B.jhn,1)] },
  { q: 'Genesis 1 creation, in the beginning God created', cat: 'verse-ref', expect: [R(B.gen,1,2)] },
  { q: 'Psalm 23 the Lord is my shepherd', cat: 'verse-ref', expect: [R(B.psa,23)] },
  { q: 'Isaiah 53 the suffering servant', cat: 'verse-ref', expect: [R(B.isa,52,53)] },
  { q: '1 Corinthians 13 the greatest of these is love', cat: 'verse-ref', expect: [R(B.co1,13)] },
  { q: 'Romans 8 nothing can separate us from the love of God', cat: 'verse-ref', expect: [R(B.rom,8)] },
  { q: 'the beatitudes in the Sermon on the Mount', cat: 'verse-ref', expect: [R(B.mat,5,7)] },
  { q: 'Revelation 21 a new heaven and a new earth', cat: 'verse-ref', expect: [R(B.rev,21,22)] },
  { q: 'the ten commandments given to Moses', cat: 'verse-ref', expect: [R(B.exo,20),R(B.deu,5)] },
  { q: 'the Lord\'s Prayer, our Father who art in heaven', cat: 'verse-ref', expect: [R(B.mat,6),R(B.luk,11)] },
  { q: 'John 3:16 for God so loved the world', cat: 'verse-ref', expect: [R(B.jhn,3)] },
  { q: 'the parable of the prodigal son', cat: 'verse-ref', expect: [R(B.luk,15)] },
  { q: 'the parable of the good Samaritan', cat: 'verse-ref', expect: [R(B.luk,10)] },
  { q: 'the fruit of the Spirit is love joy peace', cat: 'verse-ref', expect: [R(B.gal,5)] },
  { q: 'the whole armor of God, breastplate of righteousness', cat: 'verse-ref', expect: [R(B.eph,6)] },
  { q: 'faith is the substance of things hoped for', cat: 'verse-ref', expect: [R(B.heb,11)] },
  { q: 'the great commission, go and make disciples of all nations', cat: 'verse-ref', expect: [R(B.mat,28)] },
  { q: 'Ecclesiastes a time to be born and a time to die', cat: 'verse-ref', expect: [R(B.ecc,3)] },
  { q: 'Proverbs 31 the virtuous woman', cat: 'verse-ref', expect: [R(B.pro,31)] },
  { q: 'the transfiguration of Jesus on the mountain', cat: 'verse-ref', expect: [R(B.mat,17),R(B.mrk,9),R(B.luk,9)] },
  { q: 'the raising of Lazarus from the dead', cat: 'verse-ref', expect: [R(B.jhn,11)] },
  { q: 'Pentecost and the tongues of fire', cat: 'verse-ref', expect: [R(B.act,2)] },
  { q: 'the golden calf at Mount Sinai', cat: 'verse-ref', expect: [R(B.exo,32)] },
  { q: 'Elijah and the prophets of Baal on Mount Carmel', cat: 'verse-ref', expect: [R(B.ki1,18)] },
  { q: 'the fiery furnace, Shadrach Meshach and Abednego', cat: 'verse-ref', expect: [R(B.dan,3)] },
  { q: 'Daniel in the lions den', cat: 'verse-ref', expect: [R(B.dan,6)] },
  // proper-noun
  { q: 'who was Melchizedek the priest king', cat: 'proper-noun', expect: [R(B.gen,14),R(B.heb,7),R(B.psa,110)] },
  { q: 'Nicodemus came to Jesus by night', cat: 'proper-noun', expect: [R(B.jhn,3)] },
  { q: 'Jonah and the city of Nineveh', cat: 'proper-noun', expect: [R(B.jon,1,4)] },
  { q: 'Moses and the burning bush', cat: 'proper-noun', expect: [R(B.exo,3,4)] },
  { q: 'David and Goliath the Philistine', cat: 'proper-noun', expect: [R(B.sa1,17)] },
  { q: 'the Samaritan woman at the well', cat: 'proper-noun', expect: [R(B.jhn,4)] },
  { q: 'Paul on the road to Damascus', cat: 'proper-noun', expect: [R(B.act,9),R(B.act,22),R(B.act,26)] },
  { q: 'Abraham offering Isaac on Mount Moriah', cat: 'proper-noun', expect: [R(B.gen,22)] },
  { q: 'Jacob\'s ladder reaching to heaven', cat: 'proper-noun', expect: [R(B.gen,28)] },
  { q: 'Joseph and his coat of many colors', cat: 'proper-noun', expect: [R(B.gen,37)] },
  { q: 'Ruth and Naomi, whither thou goest I will go', cat: 'proper-noun', expect: [R(B.rut,1)] },
  { q: 'Solomon\'s wisdom and the two mothers', cat: 'proper-noun', expect: [R(B.ki1,3)] },
  { q: 'Zacchaeus the tax collector in the sycamore tree', cat: 'proper-noun', expect: [R(B.luk,19)] },
  { q: 'the woman caught in adultery', cat: 'proper-noun', expect: [R(B.jhn,8)] },
  { q: 'Stephen the first martyr stoned', cat: 'proper-noun', expect: [R(B.act,7)] },
  { q: 'Cornelius the centurion and Peter\'s vision', cat: 'proper-noun', expect: [R(B.act,10)] },
  { q: 'the Ethiopian eunuch baptized by Philip', cat: 'proper-noun', expect: [R(B.act,8)] },
  { q: 'blind Bartimaeus by the roadside', cat: 'proper-noun', expect: [R(B.mrk,10)] },
  // exact-term
  { q: 'propitiation for our sins', cat: 'exact-term', expect: [R(B.rom,3),R(B.jn1,2),R(B.jn1,4),R(B.heb,2)] },
  { q: 'justification by faith apart from works of the law', cat: 'exact-term', expect: [R(B.rom,3,5),R(B.gal,2,3)] },
  { q: 'predestination and election of the saints', cat: 'exact-term', expect: [R(B.rom,8,9),R(B.eph,1)] },
  { q: 'circumcision of the heart', cat: 'exact-term', expect: [R(B.deu,10),R(B.deu,30),R(B.rom,2)] },
  { q: 'the firstfruits of the resurrection', cat: 'exact-term', expect: [R(B.co1,15)] },
  { q: 'sanctification and holiness without which none shall see the Lord', cat: 'exact-term', expect: [R(B.heb,12),R(B.th1,4)] },
  { q: 'redemption through his blood the forgiveness of sins', cat: 'exact-term', expect: [R(B.eph,1),R(B.col,1)] },
  { q: 'adoption as sons of God', cat: 'exact-term', expect: [R(B.rom,8),R(B.gal,4),R(B.eph,1)] },
  { q: 'the wages of sin is death', cat: 'exact-term', expect: [R(B.rom,6)] },
  { q: 'by grace are ye saved through faith not of works', cat: 'exact-term', expect: [R(B.eph,2)] },
  { q: 'reconciliation with God through Christ', cat: 'exact-term', expect: [R(B.co2,5),R(B.rom,5)] },
  { q: 'the imputation of righteousness to Abraham who believed', cat: 'exact-term', expect: [R(B.rom,4),R(B.gen,15)] },
  { q: 'the fear of the Lord is the beginning of wisdom', cat: 'exact-term', expect: [R(B.pro,1),R(B.pro,9),R(B.psa,111)] },
  { q: 'atonement and the mercy seat', cat: 'exact-term', expect: [R(B.lev,16),R(B.rom,3)] },
  // rare-topic
  { q: 'the Urim and Thummim', cat: 'rare-topic', expect: [R(B.exo,28),R(B.num,27),R(B.sa1,28)] },
  { q: 'the Nephilim, sons of God and daughters of men', cat: 'rare-topic', expect: [R(B.gen,6)] },
  { q: "Balaam's donkey that spoke", cat: 'rare-topic', expect: [R(B.num,22,24)] },
  { q: 'the bronze serpent lifted up in the wilderness', cat: 'rare-topic', expect: [R(B.num,21),R(B.jhn,3)] },
  { q: 'Gog and Magog', cat: 'rare-topic', expect: [R(B.ezk,38,39),R(B.rev,20)] },
  { q: 'the valley of dry bones', cat: 'rare-topic', expect: [R(B.ezk,37)] },
  { q: 'the Nazirite vow', cat: 'rare-topic', expect: [R(B.num,6)] },
  { q: 'the year of Jubilee', cat: 'rare-topic', expect: [R(B.lev,25)] },
  { q: 'the scapegoat sent into the wilderness', cat: 'rare-topic', expect: [R(B.lev,16)] },
  { q: 'Rahab and the scarlet cord in the window', cat: 'rare-topic', expect: [R(B.jos,2)] },
  { q: 'the witch of Endor summoning Samuel', cat: 'rare-topic', expect: [R(B.sa1,28)] },
  { q: 'Leviathan and Behemoth', cat: 'rare-topic', expect: [R(B.job,40,41)] },
  { q: 'the four horsemen of the apocalypse', cat: 'rare-topic', expect: [R(B.rev,6)] },
  { q: 'the writing on the wall mene mene tekel', cat: 'rare-topic', expect: [R(B.dan,5)] },
  { q: 'Ezekiel and the wheel within a wheel', cat: 'rare-topic', expect: [R(B.ezk,1),R(B.ezk,10)] },
  // topical
  { q: 'the good shepherd lays down his life for the sheep', cat: 'topical', expect: [R(B.jhn,10)] },
  { q: 'I am the vine you are the branches', cat: 'topical', expect: [R(B.jhn,15)] },
  { q: 'you must be born again of water and the Spirit', cat: 'topical', expect: [R(B.jhn,3)] },
  { q: 'the Lord\'s Supper this is my body broken for you', cat: 'topical', expect: [R(B.co1,11),R(B.mat,26),R(B.luk,22)] },
  { q: 'the bread of life come down from heaven', cat: 'topical', expect: [R(B.jhn,6)] },
  { q: 'I am the way the truth and the life', cat: 'topical', expect: [R(B.jhn,14)] },
  { q: 'love your enemies and turn the other cheek', cat: 'topical', expect: [R(B.mat,5),R(B.luk,6)] },
  { q: 'the new covenant written on the heart', cat: 'topical', expect: [R(B.jer,31),R(B.heb,8)] },
  { q: 'faith without works is dead', cat: 'topical', expect: [R(B.jas,2)] },
  { q: 'God is love and perfect love casts out fear', cat: 'topical', expect: [R(B.jn4,4)] },
  { q: 'be still and know that I am God', cat: 'topical', expect: [R(B.psa,46)] },
  { q: 'the peace of God which passes all understanding', cat: 'topical', expect: [R(B.php,4)] },
  { q: 'put off the old man and put on the new', cat: 'topical', expect: [R(B.eph,4),R(B.col,3)] },
  { q: 'the second coming of Christ in the clouds', cat: 'topical', expect: [R(B.th1,4),R(B.mat,24),R(B.rev,1)] },
  { q: 'no one comes to the Father except through me', cat: 'topical', expect: [R(B.jhn,14)] },
];

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;
}
const vid = (m: unknown) => ((typeof m === 'string' ? JSON.parse(m) : m) as { verseId: number }).verseId;
const inRange = (v: number, rs: Range[]) => { const b = Math.floor(v / 1e6), c = Math.floor((v % 1e6) / 1000); return rs.some((r) => b === r.book && c >= r.ch[0] && c <= r.ch[1]); };
async function legalTop(q: string, vec: string): Promise<number[]> {
  const rows = (await sql.query(`SELECT content, metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} ORDER BY embedding <=> $1::vector LIMIT 20`, [vec])) as Array<{ content: string; metadata: unknown }>;
  if (rows.length <= K) return rows.map((r) => vid(r.metadata));
  const res = await fetch('https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-0.6B', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, 1200)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).slice(0, K).map(({ i }) => vid(rows[i]!.metadata));
}
async function hasContent(expect: Range[]): Promise<boolean> {
  const conds = expect.map((r) => `((metadata->>'verseId')::int/1000000 = ${r.book} AND (metadata->>'verseId')::int%1000000/1000 BETWEEN ${r.ch[0]} AND ${r.ch[1]})`).join(' OR ');
  const n = Number(((await sql.query(`SELECT count(*) n FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} AND (${conds})`)) as Array<{ n: string }>)[0]!.n);
  return n > 0;
}

async function main() {
  console.log(`Failure-code eval — ${QUERIES.length} queries on the LEGAL corpus (publishable 38%), K=${K}\n`);
  const codes: Record<string, { n: number; ex: string[] }> = { pass: { n: 0, ex: [] }, '<2-voices': { n: 0, ex: [] }, 'wrong-passage': { n: 0, ex: [] }, 'no-content': { n: 0, ex: [] } };
  const byCat: Record<string, { n: number; pass2: number; pass1: number }> = {};
  let pass1 = 0, pass2 = 0;

  for (const item of QUERIES) {
    byCat[item.cat] ??= { n: 0, pass2: 0, pass1: 0 }; byCat[item.cat]!.n++;
    const vec = await embed(item.q);
    const top = await legalTop(item.q, vec);
    const nIn = top.filter((h) => inRange(h, item.expect)).length;
    const top1 = top.length > 0 && inRange(top[0]!, item.expect);
    if (top1) { pass1++; byCat[item.cat]!.pass1++; }
    let code: string;
    if (nIn >= 2) { code = 'pass'; pass2++; byCat[item.cat]!.pass2++; }
    else if (nIn === 1) code = '<2-voices';
    else code = (await hasContent(item.expect)) ? 'wrong-passage' : 'no-content';
    codes[code]!.n++;
    if (code !== 'pass' && codes[code]!.ex.length < 8) codes[code]!.ex.push(`[${item.cat}] ${item.q.slice(0, 46)}`);
  }

  const n = QUERIES.length, pc = (x: number) => `${Math.round(100 * x / n)}%`;
  console.log(`ACCURACY (legal corpus): true-success HIT=1 ${pass1}/${n} (${pc(pass1)}) · ≥2-voices HIT=2 ${pass2}/${n} (${pc(pass2)})\n`);
  console.log('FAILURE-CODE BREAKDOWN (of all queries):');
  for (const [k, v] of Object.entries(codes)) console.log(`  ${k.padEnd(14)} ${String(v.n).padStart(3)}  ${pc(v.n)}`);
  console.log('\n  intervention by code: no-content → CrossWire-5/content · wrong-passage → verse-ref intent (ranking) · <2-voices → any added voice (Catena)\n');
  for (const [k, v] of Object.entries(codes)) { if (k === 'pass' || v.ex.length === 0) continue; console.log(`  [${k}] examples:`); v.ex.forEach((e) => console.log(`    ✗ ${e}`)); }
  console.log('\nby category (HIT=2 pass / n):');
  for (const [c, v] of Object.entries(byCat)) console.log(`  ${c.padEnd(12)} ${v.pass2}/${v.n}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
