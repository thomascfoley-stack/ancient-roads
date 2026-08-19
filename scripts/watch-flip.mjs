#!/usr/bin/env node
// Watch a publish-flip until the committed state is visible. READ-ONLY.
//
//   node scripts/watch-flip.mjs <slugs.json> [--minutes=180]
//
// ONE EXIT CONDITION, DELIBERATELY. An earlier ad-hoc version of this also tried to detect
// cancellation, using "the UPDATE is no longer active AND nothing is published yet" — which is
// exactly true during the COMMIT window, between the UPDATE finishing and the transaction landing.
// It therefore reported the 2026-08-19 `father` flip as CANCELLED at the moment it succeeded.
// Absence of evidence is not evidence of absence: this waits for the positive state and says
// nothing else. If a flip really did die, its own terminal says so.
import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';

const file = process.argv[2];
const minutes = Number(process.argv.find((a) => a.startsWith('--minutes='))?.split('=')[1] ?? 180);
if (!file) { console.error('usage: watch-flip.mjs <slugs.json> [--minutes=N]'); process.exit(2); }

let slugs;
try { slugs = JSON.parse(fs.readFileSync(file, 'utf8')).slugs; }
catch (e) { console.error(`STOP: cannot read ${file}: ${e.message}`); process.exit(2); }

const url = process.env.CENSUS_DB_URL
  ?? fs.readFileSync(`${os.homedir()}/.neon_prod_url`, 'utf8').trim();
const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname.split('.')[0];
console.log(`watching ${slugs.length} slug(s) on ${host}, up to ${minutes} min`);

const started = Date.now();
const deadline = started + minutes * 60_000;
let baseline = null;

while (Date.now() < deadline) {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    await c.query('BEGIN TRANSACTION READ ONLY');
    const r = (await c.query(`SELECT
      (SELECT count(*)::int FROM sources WHERE slug=ANY($1) AND status='published') pub,
      (SELECT count(*) FILTER (WHERE served)::int FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=ANY($1)) srv,
      (SELECT count(*) FILTER (WHERE served)::int FROM embeddings WHERE user_id IS NULL) tot`, [slugs])).rows[0];
    await c.query('ROLLBACK');
    baseline ??= r.tot;
    if (r.pub === slugs.length && r.srv > 0) {
      const mins = ((Date.now() - started) / 60_000).toFixed(0);
      console.log(`\nCOMMITTED (seen after ${mins} min of watching)`);
      console.log(`  published : ${r.pub}/${slugs.length}`);
      console.log(`  served    : ${r.srv.toLocaleString()} rows for this batch`);
      console.log(`  corpus    : ${r.tot.toLocaleString()} served  (+${(r.tot - baseline).toLocaleString()} since watching began)`);
      process.exit(0);
    }
  } catch { /* a dropped poll is not a signal; keep watching */ }
  finally { try { await c.end(); } catch { /* already closed */ } }
  await new Promise((res) => setTimeout(res, 60_000));
}
console.log(`\nNOT COMMITTED within ${minutes} min. This says the state is not visible yet — NOT that the flip failed.`);
process.exit(1);
