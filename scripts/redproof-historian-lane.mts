#!/usr/bin/env node
/**
 * HISTORIAN LANE RED-PROOF — corpus-backlog decision 6, 2026-08-13.
 *
 * A lane that has only ever been watched return nothing proves nothing (THE_LOOP rule 4).
 * This script demonstrates the SHIPPED retrieval path returning a josephus-whiston row
 * IFF that row is served:
 *
 *   PRE     lane query against dev, all historian rows served=false  -> 0 rows
 *   IN-TX   one row flipped served=true inside a transaction         -> that row appears
 *   WALL    same tx: the EXEGETICAL pool query over the same range   -> still 0 historian
 *           rows (source_type='historian' is structurally walled out of the composed pool)
 *   POST    ROLLBACK, lane query again                               -> 0 rows
 *
 * The probes import laneOnRangeSql + HISTORIAN_CORPUS_FILTER + EXEGETICAL_TYPE_SQL from
 * web/src/lib/teacher/routing — the production predicate strings, never re-typed. The
 * on-range lane variant is used because it is an EXACT range scan (MATERIALIZED CTE over
 * the served verseId index): deterministic for a single flipped row, where the pure-ANN
 * lanePoolSql depends on planner/index state (no historian partial index exists yet —
 * see routing.ts HISTORIAN_CORPUS_FILTER's KNOWN GAP comment).
 *
 * The only write is the in-transaction served flip, always rolled back. Dev-only.
 *
 *   npx tsx scripts/redproof-historian-lane.mts --env=dev
 */
import { readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { Client } from 'pg';
import { laneOnRangeSql, HISTORIAN_CORPUS_FILTER, EXEGETICAL_TYPE_SQL, LEGAL_CORPUS_FILTER } from '../web/src/lib/teacher/routing';

if (process.argv.find((a) => a.startsWith('--env='))?.slice(6) !== 'dev') {
  console.error('Usage: npx tsx scripts/redproof-historian-lane.mts --env=dev  (dev only)');
  process.exit(1);
}
function loadEnv(name: string, paths: string[]): string {
  for (const p of paths) {
    try {
      const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
      if (m) return m[1]!.trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  console.error(`No ${name} in ${paths.join(', ')}`); process.exit(1);
}
const url = loadEnv('DATABASE_URL_UNPOOLED', ['.env.local', 'web/.env.local']);
const host = new URL(url).host;
if (host.includes('ep-odd-fog')) { console.error('ABORT: host is production (ep-odd-fog).'); process.exit(1); }
if (!host.includes('ep-tiny-hat')) { console.error(`ABORT: not the dev branch (expected ep-tiny-hat, got ${host})`); process.exit(1); }

mkdirSync('docs/evidence/historian-lane', { recursive: true });
const logPath = `docs/evidence/historian-lane/redproof-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
const stream = createWriteStream(logPath);
const log = (line = '') => { console.log(line); stream.write(line + '\n'); };

const key = loadEnv('DEEPINFRA_API_KEY', ['web/.env.local']);
const QUERY = 'the siege of Jerusalem and the burning of the temple';
const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [QUERY], encoding_format: 'float' }),
  signal: AbortSignal.timeout(90_000),
});
if (!res.ok) { console.error(`embed failed: ${res.status}`); process.exit(1); }
const vec = `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;

const client = new Client({ connectionString: url });
await client.connect();

interface LaneRow { source_id: string; score: number; metadata: { work?: string } }
let failures = 0;
const check = (ok: boolean, label: string) => { log(`  ${ok ? 'PASS' : 'FAIL'} — ${label}`); if (!ok) failures++; };

// The witness row: an ANCHORED josephus flat row (verseId > 0) so laneOnRangeSql's exact
// range scan can find it. The range is its own verse — the tightest possible probe.
const witness = (await client.query(
  `SELECT source_id, (metadata->>'verseId')::int AS v FROM embeddings
    WHERE user_id IS NULL AND source_type = 'historian' AND metadata->>'work' = 'josephus-whiston'
      AND (metadata->>'verseId')::int > 0 ORDER BY source_id LIMIT 1`)).rows[0];
if (!witness) { log('ABORT: no anchored josephus flat rows — run scripts/embed-historian-flat.mts --env=dev --apply first.'); process.exit(1); }
const range = [{ start: witness.v, end: witness.v }];
const laneSql = laneOnRangeSql(HISTORIAN_CORPUS_FILTER, range);

log(`historian lane red-proof · ${new Date().toISOString()} · host ${host} (dev)`);
log(`query: "${QUERY}" · witness row: ${witness.source_id} (verseId ${witness.v})`);
log(`lane SQL (shipped laneOnRangeSql + HISTORIAN_CORPUS_FILTER):`);
log(laneSql.replace(/\s+/g, ' ').trim());
log('');

// PRE: nothing served -> the lane returns nothing.
const pre = (await client.query(laneSql, [vec])) .rows as LaneRow[];
log(`PRE  (all historian rows served=false): lane returned ${pre.length} row(s)`);
check(pre.length === 0, 'lane empty while every historian row is served=false');

// IN-TX: flip ONE row served, probe, also probe the exegetical wall, roll back.
await client.query('BEGIN');
await client.query(`UPDATE embeddings SET served = true WHERE user_id IS NULL AND source_id = $1`, [witness.source_id]);
const inTx = (await client.query(laneSql, [vec])).rows as LaneRow[];
log(`IN-TX (witness served=true): lane returned ${inTx.length} row(s): ${inTx.map((r) => r.source_id).join(', ') || '(none)'}`);
check(inTx.some((r) => r.source_id === witness.source_id), 'flipped row appears in the lane ONLY while served');
// The wall assertion is not "the exegetical pool is empty on this verse" — served
// commentary/father rows on the same verse are SUPPOSED to be there. It is "no
// historian row can enter it": EXEGETICAL_TYPE_SQL admits source_type
// 'commentary'/'father' only, so a served historian row is structurally excluded.
const exegetical = (await client.query(
  `SELECT source_id, source_type FROM embeddings
    WHERE user_id IS NULL AND ${EXEGETICAL_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}
      AND (metadata->>'verseId')::int BETWEEN ${witness.v} AND ${witness.v}`,
)).rows as Array<{ source_id: string; source_type: string }>;
const historianInPool = exegetical.filter((r) => r.source_type === 'historian');
log(`WALL (same tx): exegetical pool predicate over the same verse returned ${exegetical.length} row(s), of which historian: ${historianInPool.length}`);
check(!exegetical.some((r) => r.source_id === witness.source_id) && historianInPool.length === 0,
  'served historian row is STILL walled out of the exegetical pool (source_type leg)');
await client.query('ROLLBACK');

// POST: the flip is gone; the lane is empty again.
const post = (await client.query(laneSql, [vec])).rows as LaneRow[];
log(`POST (rolled back): lane returned ${post.length} row(s)`);
check(post.length === 0, 'lane empty again after ROLLBACK — nothing persisted');

log('');
log(failures === 0
  ? 'RED-PROOF PASS: the historian lane serves a row IFF served=true; the exegetical wall holds regardless.'
  : `RED-PROOF FAIL (${failures} check(s)) — do NOT treat the lane as verified.`);
await client.end();
stream.end();
process.exit(failures === 0 ? 0 : 1);
