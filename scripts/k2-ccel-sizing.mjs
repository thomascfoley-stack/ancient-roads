// K-2 blast radius — how much CCEL-sourced text carries the scripRef deletion damage.
//
// READ ONLY. Nothing is written. No connection string is printed. Follows scripts/prod-census.mjs:
// CENSUS_DB_URL or ~/.neon_prod_url, `BEGIN TRANSACTION READ ONLY`, and the database is ANNOUNCED
// rather than asserted — a sizing that silently ran against dev would be a confidently wrong
// answer, which is worse than an error.
//
// WHAT IT COUNTS AND WHY. `thmlText()` used to delete each <scripRef> element whole, including its
// display text. Two visible shapes result, and both are counted separately because they are read
// very differently by whoever decides on a re-ingest:
//   - EMPTY PARENS `( )` — the reference sat inside brackets, so the brackets survive as debris.
//     Cheap to spot, and the shape the plan named.
//   - PUBLISHED vs not — the only number that describes what a READER can currently see. Damage in
//     a staged work costs nothing until it is published.
// The adapter fix does NOT repair stored rows; this is the input to the separate, owner-approved
// re-ingest decision, not a measure of it.
import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';

const url = process.env.CENSUS_DB_URL
  ?? (fs.existsSync(`${os.homedir()}/.neon_prod_url`) ? fs.readFileSync(`${os.homedir()}/.neon_prod_url`, 'utf8').trim() : null);
if (!url) { console.error('STOP: set CENSUS_DB_URL or provide ~/.neon_prod_url'); process.exit(2); }

const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname;
const endpoint = host.split('.')[0];
console.log(`database: ${endpoint}${endpoint.startsWith('ep-odd-fog') ? '  (PRODUCTION)' : '  (NOT production)'}\n`);

const n = (v) => Number(v).toLocaleString();
// Empty brackets left where a citation was: "( )", "( , )", "( ; )", "()".
const DEBRIS = String.raw`\(\s*[,;.]*\s*\)`;
// Identify CCEL works the way the adapter records them (adapter-loop.ts reads this exact path).
const CCEL = `w.provenance->'acquire'->>'adapter' = 'ccel'`;

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('BEGIN TRANSACTION READ ONLY');
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  const works = await q(`SELECT status, count(*)::int AS n FROM sources w WHERE ${CCEL} GROUP BY status ORDER BY 2 DESC`);
  console.log('CCEL WORKS (provenance.acquire.adapter = ccel)');
  if (!works.length) console.log('   none');
  works.forEach((r) => console.log(`   ${String(r.status).padEnd(12)} ${n(r.n)}`));

  // A sanity leg: any work whose provenance mentions ccel ANYWHERE but is not tagged by that path
  // would be missed above. If this is non-zero the number above is an undercount, and says so.
  const loose = (await q(
    `SELECT count(*)::int AS n FROM sources w WHERE w.provenance::text ILIKE '%ccel%' AND NOT (${CCEL})`,
  ))[0].n;
  console.log(`   [works mentioning ccel in provenance but NOT tagged by that path: ${n(loose)}${loose ? '  <-- the count above is an undercount' : ''}]`);

  const sec = (await q(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE w.status = 'published')::int AS published
       FROM sections s JOIN sources w ON w.id = s.source_id WHERE ${CCEL}`,
  ))[0];
  console.log(`\nCCEL SECTIONS\n   total ${n(sec.total)}   in published works ${n(sec.published)}`);

  const dmg = (await q(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE w.status = 'published')::int AS published
       FROM sections s JOIN sources w ON w.id = s.source_id
      WHERE ${CCEL} AND s.body ~ '${DEBRIS}'`,
  ))[0];
  const pct = sec.total ? ((dmg.total / sec.total) * 100).toFixed(1) : '0.0';
  console.log(`\nSECTIONS WITH EMPTY-BRACKET DEBRIS\n   total ${n(dmg.total)} (${pct}% of CCEL sections)`);
  console.log(`   READER-VISIBLE (in published works) ${n(dmg.published)}`);

  const per = await q(
    `SELECT w.slug, w.author, w.status, count(*)::int AS damaged
       FROM sections s JOIN sources w ON w.id = s.source_id
      WHERE ${CCEL} AND s.body ~ '${DEBRIS}'
      GROUP BY w.slug, w.author, w.status
      ORDER BY 4 DESC LIMIT 25`,
  );
  console.log(`\nPER WORK (top 25 by damaged sections) — settles which works are actually affected`);
  if (!per.length) console.log('   none');
  per.forEach((r) => console.log(`   ${String(r.damaged).padStart(6)}  ${String(r.status).padEnd(11)} ${r.slug}  — ${r.author}`));
} finally {
  await c.query('ROLLBACK');
  await c.end();
}
