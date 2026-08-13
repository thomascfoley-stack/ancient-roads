#!/usr/bin/env node
/**
 * PHASE 1 KILL-WORK RUNNER — corpus-backlog plan, decisions #1/#2 (ruled 2026-08-13).
 *
 * Deletes one killed work's rows: section_embeddings, section_anchors, sections,
 * the sources row, and (for --flat-work) flat `embeddings` rows by work slug.
 *
 * Discipline (non-negotiable):
 *   - Census first, always read-only. --apply REFUSES if any user-data dependent
 *     (notes/highlights/bookmarks/library_items/reading_progress/study_blocks) is
 *     non-zero — that is an owner call, not a runner's.
 *   - Snapshot BEFORE delete: every row to be deleted is written verbatim to
 *     docs/evidence/phase1-kills/<slug>-<env>-snapshot-<ts>.json, plus a generated
 *     inverse SQL file (plain INSERTs) that restores exactly those rows.
 *   - --env=dev reads .env.local (root) or web/.env.local; --env=prod reads
 *     ~/.neon_prod_url. The endpoint is asserted BEFORE connecting: prod requires
 *     ep-odd-fog in the host, dev refuses it. No secret is ever printed.
 *
 *   node scripts/phase1-kill-work.mjs --env=dev  --slug=spurgeon-talks-to-farmers
 *   node scripts/phase1-kill-work.mjs --env=prod --slug=spurgeon-talks-to-farmers --apply
 *   node scripts/phase1-kill-work.mjs --env=prod --flat-work=calvin-crosswire \
 *        --flat-where="source_url LIKE '%books.google.com%'" --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

const PROD_ENDPOINT = 'ep-odd-fog';

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const ENV = arg('env');
const SLUG = arg('slug');
const FLAT_WORK = arg('flat-work');
const FLAT_WHERE = arg('flat-where');
const APPLY = process.argv.includes('--apply');
if (!ENV || !['dev', 'prod'].includes(ENV) || (!SLUG && !FLAT_WORK) || (FLAT_WORK && !FLAT_WHERE)) {
  console.error('Usage: --env=dev|prod (--slug=<slug> | --flat-work=<slug> --flat-where=<sql>) [--apply]');
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

const USER_DATA_TABLES = ['notes', 'highlights', 'bookmarks', 'library_items', 'reading_progress', 'study_blocks'];

const client = new Client({ connectionString: url });
await client.connect();

const snapshot = { env: ENV, host, slug: SLUG, flatWork: FLAT_WORK, flatWhere: FLAT_WHERE, takenAt: new Date().toISOString(), tables: {} };
const counts = {};
async function count(label, sql, params) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${sql}`, params);
  counts[label] = rows[0].n;
  return rows[0].n;
}
async function snap(table, sql, params) {
  const { rows } = await client.query(`SELECT * FROM ${sql}`, params);
  snapshot.tables[table] = rows;
  return rows;
}

let sourceId = null;
if (SLUG) {
  const src = await client.query('SELECT * FROM sources WHERE slug = $1', [SLUG]);
  if (src.rows.length === 0) { console.log(`No sources row for slug ${SLUG} on ${ENV} — nothing to do.`); await client.end(); process.exit(0); }
  sourceId = src.rows[0].id;
  snapshot.tables.sources = src.rows;
  console.log(`source: ${SLUG} (id=${sourceId}, status=${src.rows[0].status})`);
  await snap('sections', 'sections WHERE source_id = $1', [sourceId]);
  await snap('section_anchors', 'section_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id = $1)', [sourceId]);
  await snap('section_embeddings', 'section_embeddings WHERE section_id IN (SELECT id FROM sections WHERE source_id = $1)', [sourceId]);
  await snap('flat_embeddings', "embeddings WHERE metadata->>'work' = $1", [SLUG]);
  counts.sections = snapshot.tables.sections.length;
  counts.section_anchors = snapshot.tables.section_anchors.length;
  counts.section_embeddings = snapshot.tables.section_embeddings.length;
  counts.flat_embeddings = snapshot.tables.flat_embeddings.length;
  // user-data dependents — any non-zero REFUSES apply
  for (const t of USER_DATA_TABLES) {
    const exists = await client.query('SELECT to_regclass($1) AS r', [`public.${t}`]);
    if (!exists.rows[0].r) { counts[t] = 'table-absent'; continue; }
    const col = t === 'library_items' || t === 'reading_progress' ? 'source_id' : 'section_id';
    await count(t, `${t} WHERE ${col} ${col === 'source_id' ? '= $1' : 'IN (SELECT id FROM sections WHERE source_id = $1)'}`, [sourceId]);
  }
} else {
  await snap('flat_embeddings', `embeddings WHERE metadata->>'work' = $1 AND ${FLAT_WHERE}`, [FLAT_WORK]);
  counts.flat_embeddings = snapshot.tables.flat_embeddings.length;
  const served = snapshot.tables.flat_embeddings.filter((r) => r.served === true).length;
  counts.flat_served = served;
  if (served > 0) { console.error(`ABORT: ${served} of the targeted flat rows have served=true — this runner only deletes unserved rows.`); await client.end(); process.exit(1); }
}

console.log('census:', JSON.stringify(counts));
const userData = USER_DATA_TABLES.filter((t) => typeof counts[t] === 'number' && counts[t] > 0);
if (userData.length > 0) {
  console.error(`REFUSED: user-data dependents exist (${userData.map((t) => `${t}=${counts[t]}`).join(', ')}). Owner call required.`);
  await client.end(); process.exit(1);
}

if (!APPLY) { console.log('DRY-RUN — re-run with --apply to delete (snapshot + inverse are written on apply).'); await client.end(); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = new URL('../docs/evidence/phase1-kills/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const snapPath = join(dir, `${SLUG || FLAT_WORK}-${ENV}-snapshot-${ts}.json`);
writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));

// inverse SQL: plain INSERTs for every snapshotted row
const esc = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'object' ? `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb` : `'${String(v).replaceAll("'", "''")}'`;
const inverse = [];
for (const [table, rows] of Object.entries(snapshot.tables)) {
  const realTable = table === 'flat_embeddings' ? 'embeddings' : table;
  for (const r of rows) inverse.push(`INSERT INTO ${realTable} (${Object.keys(r).join(', ')}) VALUES (${Object.values(r).map(esc).join(', ')});`);
}
const invPath = join(dir, `${SLUG || FLAT_WORK}-${ENV}-inverse-${ts}.sql`);
writeFileSync(invPath, `-- EXACT INVERSE of the ${ENV} delete below (${snapshot.takenAt})\n` + inverse.join('\n') + '\n');

await client.query('BEGIN');
try {
  if (SLUG) {
    await client.query('DELETE FROM section_embeddings WHERE section_id IN (SELECT id FROM sections WHERE source_id = $1)', [sourceId]);
    await client.query('DELETE FROM section_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id = $1)', [sourceId]);
    await client.query('DELETE FROM sections WHERE source_id = $1', [sourceId]);
    await client.query("DELETE FROM embeddings WHERE metadata->>'work' = $1", [SLUG]);
    await client.query('DELETE FROM sources WHERE id = $1', [sourceId]);
  } else {
    await client.query(`DELETE FROM embeddings WHERE metadata->>'work' = $1 AND ${FLAT_WHERE}`, [FLAT_WORK]);
  }
  // post-delete verification inside the transaction
  if (SLUG) {
    const chk = await client.query('SELECT (SELECT count(*) FROM sources WHERE slug=$1)::int AS s, (SELECT count(*) FROM sections WHERE source_id=$2)::int AS x', [SLUG, sourceId]);
    if (chk.rows[0].s !== 0 || chk.rows[0].x !== 0) throw new Error('post-delete check failed');
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  console.error(`DELETE FAILED, rolled back: ${e.message}`);
  await client.end(); process.exit(1);
}
console.log(`DELETED on ${ENV}. snapshot: ${snapPath}`);
console.log(`inverse:  ${invPath}`);
await client.end();
