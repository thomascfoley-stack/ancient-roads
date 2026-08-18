#!/usr/bin/env node
// P4.n copy verifier — READ-ONLY, no writes, no credentials printed.
//
// Answers one question: for the slugs in <file>, does production hold what lane-b holds?
// Exit 0 = COMPLETE. Exit 1 = SHORT (prints exactly which works and by how much).
//
// WHY THIS EXISTS. corpus-copy.mjs prints its own "all counts match" line, and a tool's
// self-report is not verification (AGENTS.md / the A1 finding: a claim resting on the tool's
// own log is UNVERIFIED). This reads both databases independently and compares.
//
// It also asserts the property that makes a copy inert: served=false on every copied row.
// A copied work that arrives served is a silent retrieval change.
import fs from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) { console.error('usage: p4n-verify.mjs <slugs.json>'); process.exit(2); }
// Exit 2 is "I could not run the check" and must stay distinct from exit 1, "the copy is short" —
// the wrapper retries a COPY on 1, so a typo'd filename crashing to 1 would re-run a production
// write for no reason. Measured: an uncaught readFileSync throw exits 1.
let slugs;
try {
  slugs = JSON.parse(fs.readFileSync(file, 'utf8')).slugs;
} catch (e) {
  console.error(`STOP: cannot read ${file}: ${e.message}`);
  process.exit(2);
}
if (!Array.isArray(slugs) || !slugs.length) { console.error(`no slugs in ${file}`); process.exit(2); }

const env = (n) => { const v = process.env[n]; if (!v) { console.error(`STOP: ${n} is unset.`); process.exit(2); } return v; };
const cx = (u) => ({ connectionString: u, ssl: { rejectUnauthorized: false } });
const counts = `
  SELECT s.slug,
         (SELECT count(*)::int FROM sections x WHERE x.source_id = s.id) sections,
         (SELECT count(*)::int FROM embeddings e WHERE e.user_id IS NULL AND e.metadata->>'work' = s.slug) flat
  FROM sources s WHERE s.slug = ANY($1)`;

async function read(url, extra) {
  const c = new pg.Client(cx(url));
  await c.connect();
  await c.query('BEGIN TRANSACTION READ ONLY');
  const rows = (await c.query(counts, [slugs])).rows;
  const more = extra ? (await c.query(extra, [slugs])).rows : null;
  await c.query('ROLLBACK');
  await c.end();
  return { rows, more };
}

const src = await read(env('CORPUS_COPY_SOURCE_URL'));
const dst = await read(env('CORPUS_COPY_DEST_URL'), `
  SELECT count(*) FILTER (WHERE served)::int served,
         count(*) FILTER (WHERE NOT served)::int unserved
  FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1)`);

const S = Object.fromEntries(src.rows.map((r) => [r.slug, r]));
const D = Object.fromEntries(dst.rows.map((r) => [r.slug, r]));

const short = [];
for (const slug of slugs) {
  const s = S[slug];
  if (!s) { short.push({ slug, why: 'ABSENT FROM SOURCE' }); continue; }
  const d = D[slug];
  if (!d) { short.push({ slug, why: `missing (want ${s.sections} sec / ${s.flat} flat)` }); continue; }
  if (d.sections !== s.sections || d.flat !== s.flat) {
    short.push({ slug, why: `sec ${d.sections}/${s.sections}, flat ${d.flat}/${s.flat}` });
  }
}

const served = dst.more[0].served;
const tot = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
console.log(`  source : ${src.rows.length} work(s), ${tot(src.rows, 'sections').toLocaleString()} sections, ${tot(src.rows, 'flat').toLocaleString()} flat`);
console.log(`  dest   : ${dst.rows.length} work(s), ${tot(dst.rows, 'sections').toLocaleString()} sections, ${tot(dst.rows, 'flat').toLocaleString()} flat`);
console.log(`  served=true on dest: ${served}  <- MUST be 0; a copy that serves is a retrieval change`);

if (served > 0) { console.log(`\n  ✗ ${served} COPIED ROW(S) ARE SERVED. Stop and investigate before anything else.`); process.exit(1); }
if (short.length) {
  console.log(`\n  ✗ SHORT — ${short.length} of ${slugs.length} work(s) incomplete:`);
  for (const s of short.slice(0, 25)) console.log(`      ${s.slug.padEnd(34)} ${s.why}`);
  if (short.length > 25) console.log(`      … and ${short.length - 25} more`);
  console.log(`\n  Re-running the same copy command is SAFE and fills the gaps (ON CONFLICT DO NOTHING).`);
  process.exit(1);
}
console.log(`\n  ✓ COMPLETE — all ${slugs.length} work(s) match source, all staged and unserved.`);
