#!/usr/bin/env node
// Set embeddings.served=true for already-PUBLISHED works, in small COMMITTED batches.
//
//   PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm CUTOVER_DATABASE_URL=<owner url> \
//     node scripts/serve-batched.mjs --slugs=<file.json> [--batch=2000] [--dry-run]
//
// WHY THIS EXISTS, measured on 2026-08-19. `publish-flip.mjs` does status+serve in ONE transaction,
// which is right for status (95 rows, instant) and impossible for serve. Every served=true update is
// structurally the most expensive write this schema allows:
//
//   * `served` appears in SIX index definitions/predicates, so a HOT update is impossible and every
//     row is re-inserted into all 14 indexes on `embeddings` — 13 GB, including an 8 GB HNSW graph
//     and a 2 GB one. HNSW insertion is a graph walk of scattered reads, served over the network by
//     Neon's pageserver.
//   * Each row is 4,100 bytes (a 1024-dim vector). One row per 8 kB page, so there is no room for a
//     second version even if `served` were unindexed. 97% of this table's 986,823 lifetime updates
//     were non-HOT.
//
// Measured throughput is 20-36 rows/sec and always has been (father 9/s, commentary 36/s, an
// isolated 414-row probe 20/s). At that rate the remaining work is ~5 HOURS in one transaction, and
// three separate runs died mid-flight leaving nothing written: sermon (146,205 rows, ~120 min),
// sermon-chunk1 (39,974, ~16 min) and a 414-row probe that died at the consent prompt with
// `57P01 admin_shutdown`.
//
// Chunking the WORK LIST does not help — each chunk is still one long transaction. Committing as we
// go does: `served IS NOT TRUE` makes every batch idempotent, so a re-run resumes and an
// interruption costs one batch.
//
// SAFETY. Serves only rows of works that are ALREADY `published`, because a served-but-unpublished
// work is a bug and this tool must not be able to create one. All legality gates run BEFORE the
// first write — the same imported lists publish-flip uses, never re-typed — since batched commits
// mean there is no "roll it all back" to fall back on.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { assertPublishTarget, assertStrongTls } from './lib/publish-flip-guard.mjs';
import { isServingBanned } from './lib/served-corpus-authors.mjs';

const val = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n) => process.argv.includes(`--${n}`);
const die = (m, c = 1) => { console.error(m); process.exit(c); };

const slugFile = val('slugs');
const batchSize = Math.max(1, Number(val('batch') ?? 2000));
const dryRun = has('dry-run');
// ── --table: WHICH vector table serves. A closed whitelist mapped to full statement strategies —
// the table name is NEVER interpolated from input, and each entry carries its own scope queries
// because the two tables key differently (embeddings by metadata->>'work'; history_embeddings by
// section_id -> sections -> sources, per HISTORY_RETRIEVAL_DESIGN §2). Adding a table here means
// writing its strategy, deliberately.
const TABLES = {
  embeddings: {
    todo: `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served IS NOT TRUE`,
    update: `UPDATE embeddings SET served = true WHERE ctid IN (
       SELECT ctid FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served IS NOT TRUE
        LIMIT $2)`,
    verify: `SELECT count(*) FILTER (WHERE served)::int s, count(*)::int n
       FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1)`,
  },
  history_embeddings: {
    todo: `SELECT count(*)::int n FROM history_embeddings he
        JOIN sections s ON s.id = he.section_id JOIN sources src ON src.id = s.source_id
       WHERE src.slug = ANY($1) AND he.served IS NOT TRUE`,
    update: `UPDATE history_embeddings SET served = true WHERE section_id IN (
       SELECT he.section_id FROM history_embeddings he
         JOIN sections s ON s.id = he.section_id JOIN sources src ON src.id = s.source_id
        WHERE src.slug = ANY($1) AND he.served IS NOT TRUE
        LIMIT $2)`,
    verify: `SELECT count(*) FILTER (WHERE he.served)::int s, count(*)::int n
       FROM history_embeddings he
        JOIN sections s ON s.id = he.section_id JOIN sources src ON src.id = s.source_id
       WHERE src.slug = ANY($1)`,
  },
};
const tableArg = val('table') ?? 'embeddings';
const T = TABLES[tableArg];
if (!T) die(`STOP: --table must be one of: ${Object.keys(TABLES).join(', ')}. Got '${tableArg}'. Nothing was written.`, 2);
if (!slugFile) die('usage: serve-batched.mjs --slugs=<file.json> [--batch=2000] [--dry-run]', 2);

let slugs;
try { slugs = JSON.parse(fs.readFileSync(slugFile, 'utf8')).slugs; }
catch (e) { die(`STOP: cannot read ${slugFile}: ${e.message}`, 2); }
if (!Array.isArray(slugs) || !slugs.length) die(`STOP: no slugs in ${slugFile}`, 2);

const url = process.env.CUTOVER_DATABASE_URL;
if (!url) die('STOP: CUTOVER_DATABASE_URL is unset. Credentials come from the environment only.', 2);
// Same guard publish-flip uses, called the same way. It takes a SHAPED options object, not
// process.env — my first attempt passed process.env, `allow` came out undefined, and the guard
// correctly refused. Worth leaving the note: the refusal was the guard working, not a bug.
let host;
try {
  host = assertPublishTarget(url, {
    allow: process.env.PUBLISH_ALLOW === '1',
    declared: process.env.PUBLISH_EXPECT_HOST,
    localOk: false,   // this tool has no red-proof path; it may never point at a local stub
  });
  assertStrongTls(url, { localOk: false });
} catch (e) { die(e.message, 2); }

console.log(`serve-batched — target ${host} (credentials redacted)`);
console.log(`slugs        ${slugs.length} from ${slugFile}`);
console.log(`batch size   ${batchSize} row(s) per COMMIT`);
console.log(`table        ${tableArg}`);

// TTY checked before connecting — pure environment; finding out after connect would mean holding a
// production connection for the sole purpose of refusing.
if (!dryRun && !process.stdin.isTTY) {
  die('STOP: stdin is not a terminal. The owner gate cannot be satisfied by a pipe or a CI job.', 2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
try { await client.connect(); }
catch (e) { die(`STOP: could not connect to ${host}: ${e.message}. Nothing was written.`, 2); }

let written = 0;
try {
  const who = (await client.query('SELECT current_user AS role')).rows[0]?.role;
  if (who !== 'neondb_owner') die(`STOP: connected as '${who}', not neondb_owner. Nothing was written.`, 2);
  console.log(`role         ${who} (asserted at the server)`);

  // ── PREFLIGHT. Every legality question answered BEFORE the first commit ───────────────────
  const src = (await client.query(
    `SELECT slug, status, license, author, provenance->>'url' AS url FROM sources WHERE slug = ANY($1)`,
    [slugs])).rows;

  const missing = slugs.filter((s) => !src.some((r) => r.slug === s));
  const unpublished = src.filter((r) => r.status !== 'published');
  const badLicense = src.filter((r) => !isAllowedLicense(r.license));
  const badProv = src.filter((r) => r.url && forbiddenProvenanceDomain(r.url) !== null);
  // Surname-aware, identical to publish-flip's flip-time gate: `sources.author` is surname-first
  // ("Chesterton, Gilbert Keith"), which `isMustNotServe()` cannot see. `isServingBanned` applies
  // the surname rule AND its ADR-112 per-work / reviewed-clearance ways out, so this gate and
  // publish-flip.mjs agree in every format (this script is the served writer for --status-only).
  const vetoed = src.filter((r) => isServingBanned(r.author, r.slug));
  const badSections = (await client.query(
    `SELECT DISTINCT s.slug, sec.source_url AS url FROM sections sec JOIN sources s ON s.id = sec.source_id
      WHERE s.slug = ANY($1) AND sec.source_url IS NOT NULL`, [slugs]))
    .rows.filter((r) => forbiddenProvenanceDomain(r.url) !== null);

  const stops = [];
  if (missing.length) stops.push(`not in sources: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5})` : ''}`);
  if (unpublished.length) stops.push(`NOT published (serve one and it is invisible-but-served, a bug): ${unpublished.slice(0, 5).map((r) => `${r.slug}=${r.status}`).join(', ')}`);
  if (badLicense.length) stops.push(`licence not allowed: ${badLicense.slice(0, 5).map((r) => `${r.slug}=${r.license}`).join(', ')}`);
  if (badProv.length) stops.push(`forbidden provenance: ${badProv.slice(0, 5).map((r) => r.slug).join(', ')}`);
  if (badSections.length) stops.push(`forbidden sections.source_url: ${badSections.slice(0, 5).map((r) => r.slug).join(', ')}`);
  if (vetoed.length) stops.push(`MUST_NOT_SERVE author: ${vetoed.slice(0, 5).map((r) => `${r.slug} ("${r.author}")`).join(', ')}`);
  if (stops.length) {
    console.error('\nSTOP — preflight failed, nothing was written:');
    stops.forEach((s) => console.error(`  * ${s}`));
    process.exit(1);
  }
  console.log(`preflight    ${src.length} work(s): all published, licences allowed, provenance clean, none vetoed`);

  const todo = (await client.query(
    T.todo,
    [slugs])).rows[0].n;
  console.log(`to serve     ${todo.toLocaleString()} row(s)  (~${Math.ceil(todo / batchSize)} commits, ~${(todo / 28 / 60).toFixed(0)} min at the measured 28 rows/sec)`);
  if (todo === 0) { console.log('\nNothing to do — already fully served.'); process.exit(0); }
  if (dryRun) { console.log('\n--dry-run: stopping before the gate. Nothing was written.'); process.exit(0); }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question(`\nType serve to SERVE ${todo.toLocaleString()} row(s) on ${host}: `, (a) => { rl.close(); res(a); }));
  if (answer.trim() !== 'serve') die('STOP: not confirmed. Nothing was written.', 2);

  // ── the loop. Each statement autocommits: no explicit transaction, nothing long-lived ─────
  const startedAt = Date.now();
  for (let i = 1; ; i += 1) {
    const t0 = Date.now();
    const r = await client.query(T.update, [slugs, batchSize]);
    if (r.rowCount === 0) break;
    written += r.rowCount;
    const secs = (Date.now() - startedAt) / 1000;
    const rate = written / secs;
    const left = Math.max(0, todo - written);
    console.log(`  batch ${String(i).padStart(4)}  +${String(r.rowCount).padStart(5)}  total ${written.toLocaleString().padStart(9)}/${todo.toLocaleString()}  ${(100 * written / todo).toFixed(1)}%  ${rate.toFixed(0)}/s  eta ${(left / Math.max(rate, 1) / 60).toFixed(0)}m  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  const check = (await client.query(T.verify, [slugs])).rows[0];
  console.log(`\nOK — ${written.toLocaleString()} row(s) served across ${slugs.length} work(s).`);
  console.log(`Verified: ${check.s.toLocaleString()}/${check.n.toLocaleString()} row(s) for these works now carry served=true.`);
  console.log(`To UNDO: node scripts/publish-flip.mjs --slugs=${slugFile} --reverse --snapshot=<flip-pre-snapshot>.json`);

  const dir = 'docs/evidence/work-order-v2-stage2';
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `serve-batched-${stamp}.json`),
    `${JSON.stringify({ host, table: tableArg, slugFile, slugs: slugs.length, batchSize, rowsWritten: written, verified: check }, null, 2)}\n`);
} catch (e) {
  console.error(`\nSTOPPED: ${e.message}`);
  console.error(`${written.toLocaleString()} row(s) were already COMMITTED and are safe. Re-run the same command to resume.`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
