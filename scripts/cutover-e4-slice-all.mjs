#!/usr/bin/env node
// E4 — slice every sources.config.json backfill entry into sections (1:1 vectors).
// Delegates to migrate-sections-slice.ts per work; asserts per-work 1:1 after each.
//
//   node scripts/cutover-e4-slice-all.mjs [--dry]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertCutoverTarget } from './lib/target-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

function urlFromEnv() {
  if (process.env.CUTOVER_DATABASE_URL) return process.env.CUTOVER_DATABASE_URL;
  return process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
}

const url = urlFromEnv();
if (!url) throw new Error('no DATABASE_URL');
// CUTOVER_EXPECT_HOST is the operator's declared target. It must name the endpoint id
// EXACTLY: the old substring test accepted CUTOVER_EXPECT_HOST=neon.tech, which
// authorized every endpoint in the account including production.
const host = assertCutoverTarget(url, {
  allow: process.env.CUTOVER_ALLOW === '1' || process.env.MIGRATE_ALLOW_PROD === '1',
  declared: process.env.CUTOVER_EXPECT_HOST,
  what: 'slice target',
});
console.log(`host: ${host} (credentials redacted)`);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'));
const entries = manifest.filter((e) => e.backfill?.match_author && !e.quarantine);
console.log(`works to slice: ${entries.length}`);

const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, MIGRATE_ALLOW_PROD: '1', CUTOVER_ALLOW: '1' };
// Same hang hazard as E2 (see register-label-embeddings.mjs): a long statement whose
// result never returns leaves the cutover asleep with no error. Fail instead of hang.
const c = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: 'cutover-e4-slice-all',
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  query_timeout: 900_000,
  statement_timeout: 900_000,
});
await c.connect();

const failures = [];
for (const e of entries) {
  const id = e.id;
  const author = e.backfill.match_author;
  console.log(`\n--- ${id} (author="${author}") ---`);
  if (dry) {
    const n = (await c.query(
      `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1`,
      [author],
    )).rows[0].n;
    console.log(`  [dry] ${n} flat rows would migrate`);
    continue;
  }
  const flatN = (await c.query(
    `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1`,
    [author],
  )).rows[0].n;
  if (flatN === 0) {
    console.log(`  skip: 0 flat rows (E3 removed forbidden or not on prod)`);
    continue;
  }
  try {
    execFileSync('npx', ['tsx', 'src/ingest/migrate-sections-slice.ts', `--source=${id}`], {
      cwd: ROOT, stdio: 'inherit', env,
    });
    const flat = (await c.query(
      `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1`,
      [author],
    )).rows[0].n;
    const sec = (await c.query(
      `SELECT count(*)::int n FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1`,
      [e.slug ?? id],
    )).rows[0].n;
    if (flat !== sec) {
      failures.push({ id, flat, sec });
      console.error(`  ✗ 1:1 FAIL flat=${flat} sections=${sec}`);
    } else {
      console.log(`  ✓ 1:1 flat=${flat} sections=${sec}`);
    }
  } catch (err) {
    failures.push({ id, error: String(err) });
    console.error(`  ✗ slice failed: ${err}`);
  }
}
await c.end();

if (failures.length) {
  console.error(`\n${failures.length} work(s) failed`);
  process.exit(1);
}
console.log('\nOK: E4 slice-all complete');
