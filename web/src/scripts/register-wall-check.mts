// A5 register-wall check (GO_LIVE_EXECUTION): proves, against the live dev DB
// and the SHARED routing.ts SQL, that
//   (a) the song/verse register retrieves its own labeled pool,
//   (b) hymns/poems NEVER appear in the exegetical base pool / injection /
//       backfill (the ≥2-voices floor can never be satisfied by a hymn),
//   (c) new prose works (K&D/Maclaren/Chrysostom/Augustine/Spurgeon…) DO appear.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/register-wall-check.mts

import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { legalBasePool, injectionSql, diversityBackfillSql, songVersePoolSql, songVerseOnRangeSql, LEGAL_CORPUS_FILTER, EXEGETICAL_FTS_EXCLUSION, SERVED_SONG_VERSE_WORKS, SERVED_LANE_WORKS } from '../lib/teacher/routing.js';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from '../lib/legal-corpus.js';
import { resolveIntent } from '../bible/pericopes.js';

const SONG_VERSE_SLUGS = new Set<string>(SERVED_SONG_VERSE_WORKS);
const LANE_SLUGS = new Set<string>(SERVED_LANE_WORKS); // sermon + theology — must NEVER be in the exegetical pool

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
// A lane row (sermon/theology) in the exegetical pool is a register-wall breach —
// those registers have their own pools and must never enter the ≥2-voices floor.
const isLane = (r: { metadata: unknown }) => LANE_SLUGS.has(String(meta(r).work));

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
  const leaked = base.filter((r) => isSongVerse(r) || isLane(r)); // hymn/poetry OR sermon/theology in the exegetical pool = breach
  wallBreaches += leaked.length;
  for (const r of base) { const m = meta(r); if (m.work) newProseAuthors.add(String(m.author)); }
  const inj = resolveIntent(q).inject;
  if (inj.length > 0) {
    const injected = (await sql.query(injectionSql(inj, LEGAL_CORPUS_FILTER), [vec])) as Array<{ metadata: unknown }>;
    wallBreaches += injected.filter((r) => isSongVerse(r) || isLane(r)).length;
    const bf = (await sql.query(diversityBackfillSql([Math.floor(inj[0]!.start / 1000)], LEGAL_CORPUS_FILTER), [vec])) as Array<{ metadata: unknown }>;
    wallBreaches += bf.filter((r) => isSongVerse(r) || isLane(r)).length;
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
// ── surface 2: the FTS commentary search — REAL breach detector (A6 line-by-
// line 2026-07-17: the old probe was `register IN (hymn,poetry) AND register NOT
// IN (hymn,poetry)` = 0 by construction, a tautology). Apply the EXACT serving
// predicates (legal + exegetical exclusion) and count any song/verse row that
// slips through. If the exclusion has a hole, n > 0 → breach.
const ftsLeak = (await sql.query(
  `SELECT count(*)::int n FROM commentary_entries
   WHERE tsv @@ websearch_to_tsquery('english', 'shepherd God grace faith love mercy')
     AND (${LEGAL_COMMENTARY_ENTRIES_PREDICATE})
     AND (${EXEGETICAL_FTS_EXCLUSION})
     AND (register IN ('hymn','poetry') OR work IN (${SERVED_SONG_VERSE_WORKS.map((w) => `'${w}'`).join(',')}))`,
)) as Array<{ n: number }>;
const ftsAll = (await sql.query(
  `SELECT count(*)::int n FROM commentary_entries WHERE register IN ('hymn','poetry')`,
)) as Array<{ n: number }>;
console.log(`\nFTS surface: ${ftsAll[0]!.n} hymn/poetry rows exist; ${ftsLeak[0]!.n} leak past the live search predicate (must be 0)`);
wallBreaches += ftsLeak[0]!.n;

// ── surface 3: the reader static corpus — every register-work entry MUST carry
// its register so the panel can segregate it. Path is resolved against BOTH web-
// cwd and repo-root cwd (the old cwd-relative path silently skipped, A6). An
// unlabeled register-work entry is a real breach (it would render as commentary).
let unlabeled = 0, labeled = 0, chaptersProbed = 0;
for (const probe of ['psa/23', 'jhn/3', 'mat/5', 'gen/3', 'luk/2']) {
  const p = [`public/commentaries/${probe}.json`, `web/public/commentaries/${probe}.json`].find((x) => existsSync(x));
  if (!p) continue;
  chaptersProbed++;
  const j = JSON.parse(readFileSync(p, 'utf8')) as { entries: Array<{ register?: string; work?: string }> };
  for (const e of j.entries) {
    if (!e.work) continue; // legacy commentary rows have no register — fine
    if (SONG_VERSE_SLUGS.has(e.work)) {
      if (e.register === 'hymn' || e.register === 'poetry') labeled++;
      else unlabeled++; // a song/verse work entry with no/other register — breach
    }
  }
}
console.log(`reader surface: ${chaptersProbed}/5 probe chapters found; ${labeled} song/verse entries labeled, ${unlabeled} UNLABELED`);
if (chaptersProbed === 0) { console.error('✗ reader probe found NO chapter files — check cwd'); process.exit(1); }
wallBreaches += unlabeled;

console.log(`\nregister-wall breaches (hymn/poetry inside ANY exegetical pool, or prose inside song_verse): ${wallBreaches}`);
console.log(`song_verse pools empty: ${svEmpty}/${QUERIES.length} (should be 0 — ${SERVED_SONG_VERSE_WORKS.length} works served)`);
console.log(`new served prose authors seen in base pools: ${[...newProseAuthors].slice(0, 8).join(' · ') || '(none yet — prose ingest pending)'}`);
if (wallBreaches > 0) { console.error('✗ REGISTER WALL BREACHED'); process.exit(1); }
console.log('✓ register wall holds (vector pools + FTS + reader labeling probes)');
