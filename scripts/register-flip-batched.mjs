#!/usr/bin/env node
// Durable serve-flip for the sermon/theology registers, in small COMMITTED batches.
//
//   NEON_BRANCH=dev node scripts/register-flip-batched.mjs [--batch=2000]            dry-run
//   NEON_BRANCH=dev node scripts/register-flip-batched.mjs --apply [--batch=2000]    flip
//
// WHY THIS EXISTS (WORKLOG 2026-08-19, P4.n Phase B, NOT-DONE): "sermon and theology are
// unflipped, and want a durability story better than a 7-hour transaction before they run."
// served=true is the most expensive write this schema allows (six indexes carry `served` in
// their predicate, so no HOT update; every row re-enters the HNSW graph over Neon's network
// pageserver) at a measured 20-36 rows/sec, and three single-transaction runs died mid-flight
// leaving nothing written.
//
// THE MECHANISM IS THE REPO'S EXISTING ONE, NOT A NEW FRAMEWORK (design:
// docs/pm/swarm-2026-08-22/w-regdurable/DESIGN.md). Same idiom as serve-batched.mjs and the
// 2026-08-22 prose->lexicon relabel's 2,000-row detached batches:
//
//   * each batch is ONE autocommit statement (2,000 rows default) — an interruption costs at
//     most the in-flight batch, and statement atomicity rolls even that back;
//   * THE DATABASE IS THE RESUMABLE STATE: `served IS NOT TRUE` is the checkpoint, so a
//     re-run resumes and a completed run reports "already fully served" — no state table, no
//     checkpoint file, no double-application;
//   * every legality gate runs BEFORE the first write (batched commits mean there is no
//     "roll it all back"), importing the same lists publish-flip uses, never re-typed.
//
// SELECTION IS BY source_type, NOT BY THE REGISTER LABEL. `metadata->>'register'` is
// write-only and already moved once (the 08-22 prose->lexicon relabel); on dev the
// sermon/theology content carries register='prose'. sources.source_type + status='published'
// is the stable key on both environments. Only PUBLISHED works are eligible — a
// served-but-unpublished work is a bug and this tool must not be able to create one.
//
// GUARDED TO DEV exactly like the suppression scripts (src/ingest/dev-only-target.mjs):
// NEON_BRANCH=dev|test AND an ep-tiny-hat / ep-holy-rice / localhost host. Prod is
// unreachable through this tool; the prod run is an owner-packet item (order §11).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { assertDevOnlyTarget } from '../src/ingest/dev-only-target.mjs';
import { isServingBanned } from './lib/served-corpus-authors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_TYPES = ['sermon', 'theology'];

const val = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const apply = process.argv.includes('--apply');
const batchSize = Math.max(1, Number(val('batch') ?? 2000));
if (!Number.isFinite(batchSize)) { console.error('STOP: --batch must be a number'); process.exit(2); }
const die = (m, c = 1) => { console.error(m); process.exit(c); };

function localEnv(name) {
  if (process.env[name]) return process.env[name];
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return undefined;
  return fs.readFileSync(p, 'utf8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

const url = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
const branch = localEnv('NEON_BRANCH');
let host;
try { host = assertDevOnlyTarget(url, branch, 'the sermon/theology register flip'); }
catch (e) { die(e.message, 2); }
console.log(`register-flip-batched — target ${host} (credentials redacted)`);
console.log(`source_types  ${SOURCE_TYPES.join(', ')} (published works only)`);
console.log(`batch size    ${batchSize} row(s) per COMMIT`);
console.log(`mode          ${apply ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`);

// Client options copy the observed-hang idiom from register-label-embeddings.mjs (2026-07-27:
// a completed UPDATE's result never reached the client and the script slept at 0% CPU for
// 10+ minutes — `pg` has no read timeout by default). The step is idempotent, so failing and
// resuming is safe and strictly better than hanging.
const client = new pg.Client({
  connectionString: url,
  ssl: host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]') || host.startsWith('::1') ? false : { rejectUnauthorized: false },
  application_name: 'register-flip-batched',
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  query_timeout: 900_000,
  statement_timeout: 900_000,
});
try { await client.connect(); }
catch (e) { die(`STOP: could not connect to ${host}: ${e.message}. Nothing was written.`, 2); }

let written = 0;
try {
  // ── PREFLIGHT. Every legality question answered BEFORE the first commit ─────────────────
  const src = (await client.query(
    `SELECT slug, status, license, author, provenance->>'url' AS url
       FROM sources WHERE source_type = ANY($1) ORDER BY slug`,
    [SOURCE_TYPES])).rows;

  const published = src.filter((r) => r.status === 'published');
  const excluded = src.filter((r) => r.status !== 'published');
  const badLicense = published.filter((r) => !isAllowedLicense(r.license));
  const badProv = published.filter((r) => r.url && forbiddenProvenanceDomain(r.url) !== null);
  // Surname-aware, identical to publish-flip's flip-time gate: `sources.author` is surname-first,
  // which `isMustNotServe()` cannot see. `isServingBanned` applies the surname rule AND its
  // ADR-112 per-work / reviewed-clearance ways out, so this gate and publish-flip.mjs agree.
  const vetoed = published.filter((r) => isServingBanned(r.author, r.slug));

  const stops = [];
  if (badLicense.length) stops.push(`licence not allowed: ${badLicense.map((r) => `${r.slug}=${r.license}`).join(', ')}`);
  if (badProv.length) stops.push(`forbidden provenance: ${badProv.map((r) => r.slug).join(', ')}`);
  if (vetoed.length) stops.push(`MUST_NOT_SERVE author: ${vetoed.map((r) => `${r.slug} ("${r.author}")`).join(', ')}`);
  if (stops.length) {
    console.error('\nSTOP — preflight failed, nothing was written:');
    stops.forEach((s) => console.error(`  * ${s}`));
    process.exit(1);
  }
  console.log(`preflight     ${published.length} published work(s): licences allowed, provenance clean, none vetoed`);
  if (excluded.length) {
    console.log(`excluded      ${excluded.length} non-published work(s) are NOT eligible and are NOT touched:`);
    for (const r of excluded) console.log(`                ${r.slug} (${r.status})`);
  }
  if (published.length === 0) { console.log('\nNo published sermon/theology works. Nothing to do.'); process.exit(0); }

  const slugs = published.map((r) => r.slug);
  const TODO = `SELECT count(*)::int n FROM embeddings
     WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served IS NOT TRUE`;
  const UPDATE = `UPDATE embeddings SET served = true WHERE ctid IN (
     SELECT ctid FROM embeddings
      WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served IS NOT TRUE
      LIMIT $2)`;
  const VERIFY = `SELECT count(*) FILTER (WHERE served)::int s, count(*)::int n
     FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1)`;

  const todo = (await client.query(TODO, [slugs])).rows[0].n;
  console.log(`to serve      ${todo.toLocaleString()} row(s)  (~${Math.ceil(todo / batchSize)} commits, ~${(todo / 28 / 60).toFixed(0)} min at the measured 28 rows/sec)`);

  if (!apply) {
    const perWork = (await client.query(
      `SELECT metadata->>'work' AS work, count(*)::int n FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' = ANY($1) AND served IS NOT TRUE
        GROUP BY 1 ORDER BY 2 DESC`, [slugs])).rows;
    for (const r of perWork) console.log(`  would serve ${String(r.n).padStart(8)}  ${r.work}`);
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to flip.');
    process.exit(0);
  }

  // ── the loop. Each statement autocommits: no explicit transaction, nothing long-lived ───
  const startedAt = Date.now();
  for (let i = 1; ; i += 1) {
    const t0 = Date.now();
    const r = await client.query(UPDATE, [slugs, batchSize]);
    if (r.rowCount === 0) break;
    written += r.rowCount;
    const secs = (Date.now() - startedAt) / 1000;
    const rate = written / secs;
    const left = Math.max(0, todo - written);
    console.log(`  batch ${String(i).padStart(4)}  +${String(r.rowCount).padStart(5)}  total ${written.toLocaleString().padStart(9)}/${todo.toLocaleString()}  ${(100 * written / todo).toFixed(1)}%  ${rate.toFixed(0)}/s  eta ${(left / Math.max(rate, 1) / 60).toFixed(0)}m  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  const check = (await client.query(VERIFY, [slugs])).rows[0];
  console.log(`\nOK — ${written.toLocaleString()} row(s) served across ${slugs.length} work(s).`);
  console.log(`Verified: ${check.s.toLocaleString()}/${check.n.toLocaleString()} row(s) for these works now carry served=true.`);
} catch (e) {
  console.error(`\nSTOPPED: ${e.message}`);
  console.error(`${written.toLocaleString()} row(s) were already COMMITTED and are safe. Re-run the same command to resume.`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
