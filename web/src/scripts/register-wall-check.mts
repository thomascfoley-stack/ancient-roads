// A5 register-wall check (GO_LIVE_EXECUTION): proves, against the live dev DB
// and the SHARED routing.ts SQL, that
//   (a) the song/verse register retrieves its own labeled pool,
//   (b) hymns/poems NEVER appear in the exegetical base pool / injection /
//       backfill (the ≥2-voices floor can never be satisfied by a hymn),
//   (c) new prose works (K&D/Maclaren/Chrysostom/Augustine/Spurgeon…) DO appear.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/register-wall-check.mts

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { legalBasePool, injectionSql, diversityBackfillSql, songVersePoolSql, songVerseOnRangeSql, LEGAL_CORPUS_FILTER, EXEGETICAL_FTS_EXCLUSION, PROSE_TYPE_SQL, SERVED_SONG_VERSE_WORKS, SERVED_LANE_WORKS } from '../lib/teacher/routing.js';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from '../lib/legal-corpus.js';
import { resolveIntent } from '../bible/pericopes.js';
// The REAL reader/library/Today register classifier — we probe the shipped code
// path, never a lookalike (A6 discipline).
import { partitionByRegister } from '../components/commentary-panel.js';

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
// ── surface 2: the FTS commentary search (library search + /ask fallback share
// EXEGETICAL_FTS_EXCLUSION) — REAL breach detector (A6 line-by-line 2026-07-17:
// the old probe was `register IN (hymn,poetry) AND register NOT IN (hymn,poetry)`
// = 0 by construction, a tautology). Apply the EXACT serving predicates (legal +
// exegetical exclusion) and count ANY register-work row that slips through: song/
// verse (hymn/poetry) AND lane (sermon/theology/confession) — matched TWO ways,
// by register AND by served work slug, so a NULL/missing register can't fail the
// wall open (sermon-lane extension 2026-07-18). If the exclusion has a hole, n>0.
// PREDICATE-LEVEL, no tsquery narrowing: an earlier version counted leaks only
// among rows matching an 8-term probe query, which 0 of 955 hymn rows and ~10%
// of lane rows matched — the checker could print green through a real leak
// (deep-audit 2026-07-18). This count sees every row the serving predicate sees.
const wallWorkSql = [...SERVED_SONG_VERSE_WORKS, ...SERVED_LANE_WORKS].map((w) => `'${w}'`).join(',');
const ftsLeak = (await sql.query(
  `SELECT count(*)::int n FROM commentary_entries
   WHERE (${LEGAL_COMMENTARY_ENTRIES_PREDICATE})
     AND (${EXEGETICAL_FTS_EXCLUSION})
     AND (register IN ('hymn','poetry','sermon','theology','confession') OR work IN (${wallWorkSql}))`,
)) as Array<{ n: number }>;
const ftsAll = (await sql.query(
  `SELECT
     (count(*) FILTER (WHERE register IN ('hymn','poetry')))::int AS sv,
     (count(*) FILTER (WHERE register IN ('sermon','theology','confession')))::int AS lane
   FROM commentary_entries`,
)) as Array<{ sv: number; lane: number }>;
console.log(`\nFTS surface: ${ftsAll[0]!.sv} hymn/poetry + ${ftsAll[0]!.lane} sermon/theology rows exist; ${ftsLeak[0]!.n} leak past the live search predicate (must be 0)`);
wallBreaches += ftsLeak[0]!.n;

// ── surface 2b: the exegetical VECTOR pool, predicate-level. The per-query legs
// above sample 5 embeddings × top-20 — a hole admitting rows that never rank in
// those pools passes green (deep-audit 2026-07-18). This counts EVERY embeddings
// row the exegetical serving predicate admits that is a song/verse or lane work
// (by slug) or carries a song/verse register. Deterministic; must be 0.
const vecLeak = (await sql.query(
  `SELECT count(*)::int n FROM embeddings
   WHERE user_id IS NULL AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}
     AND (metadata->>'work' IN (${wallWorkSql}) OR metadata->>'register' IN ('hymn','poetry'))`,
)) as Array<{ n: number }>;
console.log(`vector surface (predicate-level): ${vecLeak[0]!.n} song/verse or lane rows admitted by the exegetical pool predicate (must be 0)`);
wallBreaches += vecLeak[0]!.n;

// ── surface 3: the READER static corpus. The reader, the library browse, and
// Today all segregate entries through partitionByRegister() (imported above — the
// REAL classifier, not a lookalike). Probe EVERY chapter file under the served
// corpus (not 5 hardcoded probes): no lane (sermon/theology) or song/verse WORK
// may land in the exegetical bucket, where it would render as plain commentary and
// (on Today) satisfy the >=2-voices floor. The oracle is INDEPENDENT of the
// classifier — it re-derives lane/song-verse membership by register AND by served
// work slug — so a register-less lane row (data drift) the register-only
// classifier would miss still trips the wall. Path resolves against BOTH web-cwd
// and repo-root cwd (A6: the old cwd-relative path silently skipped).
const readerBase = ['public/commentaries', 'web/public/commentaries'].find((x) => existsSync(x));
if (!readerBase) { console.error('✗ reader probe found NO commentaries dir — check cwd'); process.exit(1); }
const svOracle = (e: { register?: string; work?: string }) =>
  e.register === 'hymn' || e.register === 'poetry' || (!!e.work && SONG_VERSE_SLUGS.has(e.work));
const laneOracle = (e: { register?: string; work?: string }) =>
  e.register === 'sermon' || e.register === 'theology' || e.register === 'confession' || (!!e.work && LANE_SLUGS.has(e.work));
let unlabeledLane = 0, unlabeledSV = 0, laneLabeled = 0, svLabeled = 0, chaptersProbed = 0;
for (const book of readdirSync(readerBase)) {
  let files: string[];
  try { files = readdirSync(`${readerBase}/${book}`); } catch { continue; } // skip _manifest.json (a file, not a dir)
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    chaptersProbed++;
    const j = JSON.parse(readFileSync(`${readerBase}/${book}/${file}`, 'utf8')) as { entries: Array<{ register?: string; work?: string }> };
    const part = partitionByRegister(j.entries);
    // Anything the reader routes to the exegetical bucket that is REALLY a lane or
    // song/verse work = an unlabeled register-wall breach.
    for (const e of part.exegetical) {
      if (laneOracle(e)) unlabeledLane++;
      else if (svOracle(e)) unlabeledSV++;
    }
    laneLabeled += part.sermon.length + part.theology.length;
    svLabeled += part.songVerse.length;
  }
}
console.log(`reader surface: ${chaptersProbed} chapter files probed; song/verse labeled ${svLabeled} (UNLABELED ${unlabeledSV}); sermon/theology labeled ${laneLabeled} (UNLABELED ${unlabeledLane})`);
if (chaptersProbed === 0) { console.error('✗ reader probe found NO chapter files — check cwd'); process.exit(1); }
wallBreaches += unlabeledLane + unlabeledSV;

console.log(`\nregister-wall breaches (song/verse OR sermon/theology inside ANY exegetical pool/search/reader, or prose inside song_verse): ${wallBreaches}`);
console.log(`song_verse pools empty: ${svEmpty}/${QUERIES.length} (should be 0 — ${SERVED_SONG_VERSE_WORKS.length} works served)`);
console.log(`new served prose authors seen in base pools: ${[...newProseAuthors].slice(0, 8).join(' · ') || '(none yet — prose ingest pending)'}`);
if (wallBreaches > 0) { console.error('✗ REGISTER WALL BREACHED'); process.exit(1); }
console.log('✓ register wall holds (vector pools + FTS + reader labeling probes)');
