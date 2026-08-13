#!/usr/bin/env node
/**
 * PHASE 6a RUNNER — corpus-backlog decision #8 (RULED 2026-08-13).
 *
 * Deletes the bulk of the forbidden-provenance flat `embeddings` rows: exactly the
 * rows with `user_id IS NULL AND served = false` whose metadata->>'sourceUrl' belongs
 * to a forbidden-provenance domain. These rows serve nothing today, so deleting them
 * cannot change any live number. The 4,174 forbidden rows with served=true are
 * ADR-044 inventory (Phase 6b) and are NOT touched by this runner.
 *
 * Predicate discipline (non-negotiable):
 *   - The domain list has ONE body: src/ingest/forbidden-provenance.mjs. Rows are
 *     filtered in JS via forbiddenProvenanceDomain(). SQL-side ILIKE substring
 *     matching is FORBIDDEN — naive substring matching is exactly what the module
 *     warns against.
 *   - DRY-RUN by default (census only, read-only). On prod the census ASSERTS the
 *     forbidden served=false count equals the pre-stated 67,710 (WORKLOG "E3
 *     re-measured", 2026-08-12). Any other number aborts loudly — the pre-stated
 *     expectation is the tripwire; if reality moved, stop, don't "adapt".
 *   - SNAPSHOT before delete (on --apply): every deleted row's id + ALL non-vector
 *     columns + metadata, gzipped JSON lines, to
 *     docs/evidence/phase6a/<env>-snapshot-<ts>.jsonl.gz. NO INVERSE is generated —
 *     re-materializing forbidden-provenance rows would mean re-holding forbidden
 *     text. Irreversible by owner ruling #8 (2026-08-13).
 *   - APPLY is batched: ids collected via keyset pagination, DELETE ... WHERE id =
 *     ANY($1) in ~5,000-id transactions. NOT one giant transaction (a single
 *     68k-row transaction on Neon is the hazard). Post-delete census runs in the
 *     same script run: every serving number must be IDENTICAL to the dry-run
 *     values; any non-zero delta is a STOP.
 *   - --env=dev reads .env.local (root) or web/.env.local; --env=prod reads
 *     ~/.neon_prod_url. The endpoint is asserted BEFORE connecting: prod requires
 *     ep-odd-fog in the host, dev refuses it. No secret is ever printed.
 *
 *   node scripts/phase6a-delete-unserved-forbidden.mjs --env=dev
 *   node scripts/phase6a-delete-unserved-forbidden.mjs --env=prod            # dry-run census
 *   node scripts/phase6a-delete-unserved-forbidden.mjs --env=prod --apply    # owner-run
 */
import { readFileSync, mkdirSync, createWriteStream, createReadStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { Client } from 'pg';
import { FORBIDDEN_PROVENANCE_DOMAINS, forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';

const PROD_ENDPOINT = 'ep-odd-fog';
// Pre-stated expectation (WORKLOG "E3 re-measured", 2026-08-12): prod holds 71,884
// forbidden rows total; 67,710 served=false (this runner's scope); 4,174 served=true
// (ADR-044 inventory, Phase 6b — must not be touched here).
const EXPECTED_PROD_UNSERVED_FORBIDDEN = 67710;
const BATCH = 5000;

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const ENV = arg('env');
const APPLY = process.argv.includes('--apply');
if (!ENV || !['dev', 'prod'].includes(ENV)) {
  console.error('Usage: --env=dev|prod [--apply]');
  process.exit(1);
}

function loadUrl() {
  if (ENV === 'prod') return readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
  for (const p of ['../.env.local', '../web/.env.local']) {
    try {
      const raw = readFileSync(new URL(p, import.meta.url), 'utf8');
      const m = raw.match(/^DATABASE_URL_UNPOOLED=(.+)$/m) || raw.match(/^DATABASE_URL=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  console.error('No DATABASE_URL found for dev.'); process.exit(1);
}
const url = loadUrl();
const host = new URL(url).host;
if (ENV === 'prod' && !host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=prod but host is ${host}`); process.exit(1); }
if (ENV === 'dev' && host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=dev but host is prod (${host})`); process.exit(1); }
console.log(`target: ${ENV} (${host}) · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`forbidden domains (from src/ingest/forbidden-provenance.mjs): ${FORBIDDEN_PROVENANCE_DOMAINS.join(', ')}`);

const client = new Client({ connectionString: url });
await client.connect();

function emptyDomainCounts() {
  return Object.fromEntries(FORBIDDEN_PROVENANCE_DOMAINS.map((d) => [d, 0]));
}

// Keyset-paginate over `embeddings WHERE user_id IS NULL AND served = $served`,
// classifying each row in JS via forbiddenProvenanceDomain(). When collectIds is
// true, the ids of forbidden rows are returned (uuid strings — small).
async function scanByServed(servedFlag, collectIds) {
  const counts = { scanned: 0, forbiddenTotal: 0, byDomain: emptyDomainCounts() };
  const ids = [];
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { rows } = await client.query(
      `SELECT id, metadata->>'sourceUrl' AS source_url
         FROM embeddings
        WHERE user_id IS NULL AND served = $1 AND id > $2
        ORDER BY id
        LIMIT ${BATCH}`,
      [servedFlag, lastId],
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      counts.scanned += 1;
      const d = forbiddenProvenanceDomain(r.source_url);
      if (d) {
        counts.forbiddenTotal += 1;
        counts.byDomain[d] += 1;
        if (collectIds) ids.push(r.id);
      }
    }
    lastId = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return { counts, ids };
}

async function countSql(sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows[0].n;
}

// ---------- CENSUS (always, read-only) ----------
console.log('scanning served=false rows (JS-side domain classification)...');
const unserved = await scanByServed(false, APPLY);
console.log('scanning served=true rows (JS-side domain classification)...');
const served = await scanByServed(true, false);
const totalEmbeddings = await countSql('SELECT count(*)::int AS n FROM embeddings');
const servedTrueTotal = await countSql('SELECT count(*)::int AS n FROM embeddings WHERE served = true');

const census = {
  total_embeddings: totalEmbeddings,
  served_true_total: servedTrueTotal,
  unserved_scope: {
    scanned_user_id_null_served_false: unserved.counts.scanned,
    forbidden_served_false: unserved.counts.forbiddenTotal,
    forbidden_served_false_by_domain: unserved.counts.byDomain,
  },
  served_report_only: {
    scanned_user_id_null_served_true: served.counts.scanned,
    forbidden_served_true: served.counts.forbiddenTotal,
    forbidden_served_true_by_domain: served.counts.byDomain,
  },
};
console.log('census:', JSON.stringify(census, null, 2));

// The pre-stated expectation is the tripwire (prod only — dev's count is whatever it is).
if (ENV === 'prod' && unserved.counts.forbiddenTotal !== EXPECTED_PROD_UNSERVED_FORBIDDEN) {
  console.error(
    `ABORT — EXPECTATION MISMATCH on prod: forbidden served=false count is ` +
    `${unserved.counts.forbiddenTotal}, expected exactly ${EXPECTED_PROD_UNSERVED_FORBIDDEN} ` +
    `(pre-stated 2026-08-12, WORKLOG "E3 re-measured"). Reality moved — STOP, do not adapt. ` +
    `Nothing was deleted.`,
  );
  await client.end();
  process.exit(1);
}
if (ENV === 'prod') {
  console.log(`prod assert OK: forbidden served=false = ${unserved.counts.forbiddenTotal} (expected ${EXPECTED_PROD_UNSERVED_FORBIDDEN})`);
}

if (unserved.counts.forbiddenTotal === 0) {
  console.log('No forbidden served=false rows in scope — nothing to do.');
  await client.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('DRY-RUN — re-run with --apply to snapshot + delete.');
  await client.end();
  process.exit(0);
}

// ---------- SNAPSHOT (before any delete) ----------
// id + ALL non-vector columns + metadata. NO vector, NO inverse — irreversible by
// owner ruling #8 (2026-08-13); forbidden-provenance rows must not be re-materialised.
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = new URL('../docs/evidence/phase6a/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const snapPath = join(dir, `${ENV}-snapshot-${ts}.jsonl.gz`);
console.log(`snapshotting ${unserved.ids.length} rows (non-vector columns only) -> ${snapPath}`);

const gz = createGzip();
const out = createWriteStream(snapPath);
gz.pipe(out);
const writeDone = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); gz.on('error', reject); });
let snapRows = 0;
for (let i = 0; i < unserved.ids.length; i += BATCH) {
  const batchIds = unserved.ids.slice(i, i + BATCH);
  const { rows } = await client.query(
    `SELECT id, user_id, source_type, source_id, chunk_index, content, metadata, created_at
       FROM embeddings WHERE id = ANY($1)`,
    [batchIds],
  );
  for (const r of rows) {
    if (!gz.write(JSON.stringify(r) + '\n')) await new Promise((res) => gz.once('drain', res));
    snapRows += 1;
  }
}
gz.end();
await writeDone;
if (snapRows !== unserved.ids.length) {
  console.error(`ABORT: snapshot row count ${snapRows} != ids collected ${unserved.ids.length}. Nothing deleted.`);
  await client.end();
  process.exit(1);
}
const sha256 = await new Promise((resolve, reject) => {
  const h = createHash('sha256');
  createReadStream(snapPath).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});
console.log(`snapshot: ${snapRows} rows · sha256 ${sha256} · ${snapPath}`);
console.log('NO INVERSE. Irreversible by owner ruling #8 (2026-08-13); rows are forbidden provenance and must not be re-materialised.');

// ---------- BATCHED DELETE ----------
let deleted = 0;
for (let i = 0; i < unserved.ids.length; i += BATCH) {
  const batchIds = unserved.ids.slice(i, i + BATCH);
  await client.query('BEGIN');
  try {
    const res = await client.query('DELETE FROM embeddings WHERE id = ANY($1)', [batchIds]);
    if (res.rowCount !== batchIds.length) {
      throw new Error(`batch delete count ${res.rowCount} != ${batchIds.length}`);
    }
    await client.query('COMMIT');
    deleted += res.rowCount;
    console.log(`deleted batch ${Math.floor(i / BATCH) + 1}: ${res.rowCount} rows (total ${deleted}/${unserved.ids.length})`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`DELETE BATCH FAILED, rolled back (${deleted} rows already committed in earlier batches): ${e.message}`);
    await client.end();
    process.exit(1);
  }
}

// ---------- POST-DELETE CENSUS (same run) ----------
console.log('post-delete census...');
const postServed = await scanByServed(true, false);
const postUnserved = await scanByServed(false, false);
const postServedTrueTotal = await countSql('SELECT count(*)::int AS n FROM embeddings WHERE served = true');
const postTotalEmbeddings = await countSql('SELECT count(*)::int AS n FROM embeddings');

const failures = [];
if (postServedTrueTotal !== servedTrueTotal) failures.push(`served=true total: ${servedTrueTotal} -> ${postServedTrueTotal}`);
if (postServed.counts.forbiddenTotal !== served.counts.forbiddenTotal) {
  failures.push(`forbidden served=true: ${served.counts.forbiddenTotal} -> ${postServed.counts.forbiddenTotal}`);
}
for (const d of FORBIDDEN_PROVENANCE_DOMAINS) {
  if (postServed.counts.byDomain[d] !== served.counts.byDomain[d]) {
    failures.push(`served=true domain ${d}: ${served.counts.byDomain[d]} -> ${postServed.counts.byDomain[d]}`);
  }
}
if (postUnserved.counts.forbiddenTotal !== 0) {
  failures.push(`forbidden served=false remaining after delete: ${postUnserved.counts.forbiddenTotal} (expected 0)`);
}
if (postTotalEmbeddings !== totalEmbeddings - deleted) {
  failures.push(`total embeddings: expected ${totalEmbeddings - deleted}, got ${postTotalEmbeddings}`);
}

console.log('run log:', JSON.stringify({
  env: ENV, host, deleted, snapshot: { path: snapPath, rows: snapRows, sha256 },
  pre: { total_embeddings: totalEmbeddings, served_true_total: servedTrueTotal, forbidden_served_true: served.counts.forbiddenTotal, forbidden_served_true_by_domain: served.counts.byDomain },
  post: { total_embeddings: postTotalEmbeddings, served_true_total: postServedTrueTotal, forbidden_served_true: postServed.counts.forbiddenTotal, forbidden_served_true_by_domain: postServed.counts.byDomain },
}, null, 2));

if (failures.length > 0) {
  console.error(`STOP — POST-DELETE CENSUS MISMATCH (expected delta ZERO on every serving number):\n - ${failures.join('\n - ')}`);
  await client.end();
  process.exit(1);
}
console.log(`DONE: ${deleted} forbidden served=false rows deleted on ${ENV}; every serving number unchanged (delta ZERO).`);
await client.end();
