#!/usr/bin/env node
// READ-ONLY census of a corpus database. One committed tool instead of ad-hoc heredocs.
//
// WHY. On 2026-08-19 every production reading was taken with a throwaway script written inline,
// and those scripts were the least reliable artefact of the session: one rendered intervals as
// "[object Object]", one asserted `chk(7, true, ...)` — an unconditional pass dressed as a check —
// and one matched author names by token-subset so it could not see the very case that prompted it.
// A tool that is read, reviewed and reused does not fail those ways silently.
//
//   node scripts/prod-census.mjs                 # summary
//   node scripts/prod-census.mjs --slugs=<f.json> # + per-batch verification
//
// Credential from CENSUS_DB_URL or ~/.neon_prod_url. Every statement inside BEGIN TRANSACTION
// READ ONLY. Nothing is written. No connection string is printed.
import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const url = process.env.CENSUS_DB_URL
  ?? (fs.existsSync(`${os.homedir()}/.neon_prod_url`) ? fs.readFileSync(`${os.homedir()}/.neon_prod_url`, 'utf8').trim() : null);
if (!url) { console.error('STOP: set CENSUS_DB_URL or provide ~/.neon_prod_url'); process.exit(2); }

const n = (v) => Number(v).toLocaleString();

// NAME THE DATABASE, ALWAYS. Borrowed from scripts/prod-census.cjs, which says it best: "a `prod
// census` that silently ran against dev would be a confidently wrong answer, which is worse than an
// error." This tool is deliberately pointable at dev via CENSUS_DB_URL — it was, during the
// 2026-08-19 session — so it cannot ASSERT the host, and must therefore ANNOUNCE it. Numbers
// screenshotted out of context are how a dev reading becomes a prod claim.
// Host only, parsed from the URL. The credential itself is never printed.
const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname;
const endpoint = host.split('.')[0];
console.log(`database: ${endpoint}${endpoint.startsWith('ep-odd-fog') ? '  (PRODUCTION)' : '  (NOT production)'}\n`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('BEGIN TRANSACTION READ ONLY');
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  const status = await q('SELECT status, count(*)::int n FROM sources GROUP BY status ORDER BY 2 DESC');
  console.log('SOURCES');
  status.forEach((r) => console.log(`   ${String(r.status).padEnd(12)} ${n(r.n)}`));
  console.log(`   ${'TOTAL'.padEnd(12)} ${n(status.reduce((a, r) => a + r.n, 0))}`);

  const sec = (await q('SELECT count(*)::int n FROM sections'))[0].n;
  const emb = (await q('SELECT count(*)::int n, count(*) FILTER (WHERE served)::int s FROM embeddings WHERE user_id IS NULL'))[0];
  console.log(`\nCONTENT\n   sections ${n(sec)}   corpus embedding rows ${n(emb.n)}   served ${n(emb.s)}`);

  console.log('\nSERVED BY REGISTER (what a reader can actually reach)');
  const reg = await q(`SELECT source_type, count(DISTINCT metadata->>'work')::int w, count(*)::int r
    FROM embeddings WHERE user_id IS NULL AND served GROUP BY source_type ORDER BY 3 DESC`);
  reg.forEach((r) => console.log(`   ${String(r.source_type ?? '(null)').padEnd(14)} ${String(r.w).padStart(4)} works  ${n(r.r).padStart(10)} rows`));

  // The exegetical pool is the one /ask's >=2-voices floor draws on. routing.ts:239.
  const ex = (await q(`SELECT count(DISTINCT metadata->>'work')::int w, count(*)::int r
    FROM embeddings WHERE user_id IS NULL AND served AND source_type IN ('commentary','father')`))[0];
  console.log(`\n   EXEGETICAL POOL (commentary + father): ${ex.w} works, ${n(ex.r)} rows`);

  const slugFile = arg('slugs');
  if (slugFile) {
    const slugs = JSON.parse(fs.readFileSync(slugFile, 'utf8')).slugs;
    const st = await q('SELECT status, count(*)::int n FROM sources WHERE slug=ANY($1) GROUP BY status', [slugs]);
    const e = await q(`SELECT count(*)::int n, count(*) FILTER (WHERE served)::int s
      FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=ANY($1)`, [slugs]);
    const missing = slugs.length - (await q('SELECT count(*)::int n FROM sources WHERE slug=ANY($1)', [slugs]))[0].n;
    console.log(`\nBATCH ${slugFile}  (${slugs.length} slug(s))`);
    st.forEach((r) => console.log(`   ${String(r.status).padEnd(12)} ${r.n}`));
    console.log(`   rows ${n(e[0].n)}   served ${n(e[0].s)}   missing from db: ${missing}`);
  }
} finally {
  await c.query('ROLLBACK');
  await c.end();
}
