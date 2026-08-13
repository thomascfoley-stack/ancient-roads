#!/usr/bin/env node
/**
 * PHASE 6b FLIP — corpus-backlog decision #9(a), RULED 2026-08-13.
 *
 * Unserved-and-hold the ADR-044 rows: the 4,174 forbidden-provenance flat `embeddings`
 * rows with served=true (Chrysostom 2,515 + Augustine 1,659, historicalchristian.faith).
 * served=true -> false. REVERSIBLE — the exact id set is snapshotted and the inverse is
 * the same flip back. The held-out eval then decides delete-vs-re-source (ADR-044 options).
 *
 * ORDERING CONSTRAINT: run AFTER phase6a on the same env. 6a's tripwire asserts the
 * served=false forbidden count; flipping first would move these 4,174 rows into 6a's
 * scope and break its pre-stated expectation.
 *
 *   node scripts/phase6b-unserved-adr044.mjs --env=dev           # census, no write
 *   node scripts/phase6b-unserved-adr044.mjs --env=prod --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';

const PROD_ENDPOINT = 'ep-odd-fog';
const PROD_EXPECT = 4174; // ADR-044 re-measure 2026-08-12 (T0-c) — pre-stated tripwire

const ENV = process.argv.find((a) => a.startsWith('--env='))?.slice(6);
const APPLY = process.argv.includes('--apply');
if (!ENV || !['dev', 'prod'].includes(ENV)) { console.error('pass --env=dev|prod'); process.exit(1); }

function loadUrl() {
  if (ENV === 'prod') return readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
  for (const p of ['../.env.local', '../web/.env.local']) {
    try {
      const raw = readFileSync(new URL(p, import.meta.url), 'utf8');
      const m = raw.match(/^DATABASE_URL_UNPOOLED=(.+)$/m) || raw.match(/^DATABASE_URL=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  console.error('No dev DATABASE_URL'); process.exit(1);
}
const url = loadUrl();
const host = new URL(url).host;
if (ENV === 'prod' && !host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=prod, host ${host}`); process.exit(1); }
if (ENV === 'dev' && host.includes(PROD_ENDPOINT)) { console.error('ABORT: --env=dev but host is prod'); process.exit(1); }
console.log(`target: ${ENV} (${host}) · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

const client = new Client({ connectionString: url });
await client.connect();

// classify in JS — the forbidden-domain list has ONE body (forbidden-provenance.mjs); no SQL ILIKE.
const ids = [];
for (let offset = 0; ; offset += 5000) {
  const { rows } = await client.query(
    `SELECT id, metadata->>'sourceUrl' AS u, metadata->>'author' AS a FROM embeddings
     WHERE user_id IS NULL AND served = true ORDER BY id LIMIT 5000 OFFSET $1`, [offset]);
  if (rows.length === 0) break;
  for (const r of rows) if (forbiddenProvenanceDomain(r.u)) ids.push({ id: r.id, author: r.a });
}
const byAuthor = {};
for (const r of ids) byAuthor[r.author] = (byAuthor[r.author] || 0) + 1;
console.log(`forbidden served=true rows: ${ids.length}`, JSON.stringify(byAuthor));
if (ENV === 'prod' && ids.length !== PROD_EXPECT) {
  console.error(`ABORT: prod tripwire — expected ${PROD_EXPECT}, found ${ids.length}. Reality moved; do not adapt, report.`);
  await client.end(); process.exit(1);
}
if (ids.length === 0) { console.log('Nothing to flip.'); await client.end(); process.exit(0); }

// baseline: Chrysostom/Augustine admitted pools BEFORE the flip (ADR-044 expects the post-flip
// pools to hold at the clean rows: Chrysostom 72, Augustine 1,336 — measured 2026-08-02)
const pool = await client.query(
  `SELECT metadata->>'author' AS a, count(*)::int AS n FROM embeddings
   WHERE user_id IS NULL AND served = true AND metadata->>'author' IN ('John Chrysostom','Augustine of Hippo')
   GROUP BY 1`);
console.log('served pools BEFORE:', JSON.stringify(Object.fromEntries(pool.rows.map((r) => [r.a, r.n]))));

if (!APPLY) { console.log('DRY-RUN — re-run with --apply.'); await client.end(); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = new URL('../docs/evidence/phase6b/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const snapPath = join(dir, `${ENV}-adr044-flip-snapshot-${ts}.json`);
writeFileSync(snapPath, JSON.stringify({ env: ENV, host, takenAt: new Date().toISOString(), flippedIds: ids.map((r) => r.id) }, null, 2));

await client.query('BEGIN');
try {
  const idList = ids.map((r) => r.id);
  const res = await client.query(
    `UPDATE embeddings SET served = false WHERE id = ANY($1::uuid[]) AND served = true`, [idList]);
  if (res.rowCount !== ids.length) throw new Error(`flipped ${res.rowCount} != expected ${ids.length}`);
  const left = await client.query(
    `SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND served = true AND id = ANY($1::uuid[])`, [idList]);
  if (left.rows[0].n !== 0) throw new Error('post-flip check failed');
  await client.query('COMMIT');
  console.log(`FLIPPED ${res.rowCount} rows served=true->false on ${ENV}.`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error(`FLIP FAILED, rolled back: ${e.message}`);
  await client.end(); process.exit(1);
}
const after = await client.query(
  `SELECT metadata->>'author' AS a, count(*)::int AS n FROM embeddings
   WHERE user_id IS NULL AND served = true AND metadata->>'author' IN ('John Chrysostom','Augustine of Hippo')
   GROUP BY 1`);
console.log('served pools AFTER:', JSON.stringify(Object.fromEntries(after.rows.map((r) => [r.a, r.n]))));
console.log(`snapshot (exact inverse = flip these ids back): ${snapPath}`);
await client.end();
