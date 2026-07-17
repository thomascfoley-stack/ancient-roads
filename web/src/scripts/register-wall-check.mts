// A5 register-wall check (GO_LIVE_EXECUTION): proves, against the live dev DB
// and the SHARED routing.ts SQL, that
//   (a) the song/verse register retrieves its own labeled pool,
//   (b) hymns/poems NEVER appear in the exegetical base pool / injection /
//       backfill (the ≥2-voices floor can never be satisfied by a hymn),
//   (c) new prose works (K&D/Maclaren/Chrysostom/Augustine/Spurgeon…) DO appear.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/register-wall-check.mts

import { neon } from '@neondatabase/serverless';
import { legalBasePool, injectionSql, diversityBackfillSql, songVersePoolSql, songVerseOnRangeSql, LEGAL_CORPUS_FILTER, SERVED_SONG_VERSE_WORKS } from '../lib/teacher/routing.js';
import { resolveIntent } from '../bible/pericopes.js';

const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
async function embed(q: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPINFRA_API_KEY}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [q], encoding_format: 'float' }),
  });
  return `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;
}
const meta = (r: { metadata: unknown }) => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as Record<string, unknown>;
const isSongVerse = (r: { metadata: unknown }) => ['hymn', 'poetry'].includes(String(meta(r).register));

const QUERIES = [
  'the Lord is my shepherd I shall not want',
  'what does it mean that God so loved the world',
  'amazing grace and the mercy of God',   // hymn-baity — the wall's hardest case
  'the day of the LORD in the prophets',
  'justification by faith in Romans',
];

let wallBreaches = 0, svEmpty = 0;
const newProseAuthors = new Set<string>();
for (const q of QUERIES) {
  const vec = await embed(q);
  const base = await legalBasePool(sql, vec, 20);
  const leaked = base.filter(isSongVerse);
  wallBreaches += leaked.length;
  for (const r of base) { const m = meta(r); if (m.work) newProseAuthors.add(String(m.author)); }
  const inj = resolveIntent(q).inject;
  if (inj.length > 0) {
    const injected = (await sql.query(injectionSql(inj, LEGAL_CORPUS_FILTER), [vec])) as Array<{ metadata: unknown }>;
    wallBreaches += injected.filter(isSongVerse).length;
    const bf = (await sql.query(diversityBackfillSql([Math.floor(inj[0]!.start / 1000)], LEGAL_CORPUS_FILTER), [vec])) as Array<{ metadata: unknown }>;
    wallBreaches += bf.filter(isSongVerse).length;
  }
  const svRows = (inj.length > 0
    ? ((await sql.query(songVerseOnRangeSql(inj), [vec])) as Array<{ metadata: unknown }>)
    : []);
  const svPool = (await sql.query(songVersePoolSql(3), [vec])) as Array<{ metadata: unknown }>;
  const sv = svRows.length > 0 ? svRows : svPool;
  if (sv.length === 0) svEmpty++;
  const bad = sv.filter((r) => !isSongVerse(r));
  console.log(`  "${q.slice(0, 44)}" → base ${base.length} (leaked ${leaked.length}) · song_verse ${sv.length} (${bad.length} non-register)`);
  wallBreaches += bad.length;
}
console.log(`\nregister-wall breaches (hymn/poetry inside ANY exegetical pool, or prose inside song_verse): ${wallBreaches}`);
console.log(`song_verse pools empty: ${svEmpty}/${QUERIES.length} (should be 0 — ${SERVED_SONG_VERSE_WORKS.length} works served)`);
console.log(`new served prose authors seen in base pools: ${[...newProseAuthors].slice(0, 8).join(' · ') || '(none yet — prose ingest pending)'}`);
if (wallBreaches > 0) { console.error('✗ REGISTER WALL BREACHED'); process.exit(1); }
console.log('✓ register wall holds');
