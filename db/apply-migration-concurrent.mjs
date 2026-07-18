import { readFileSync, existsSync } from 'fs';
import pg from 'pg';

// Apply a migration containing CREATE/DROP INDEX CONCURRENTLY, which cannot run
// inside a transaction — the standard apply-migration.mjs sends the whole file
// as one implicit-transaction batch. This runner splits the file on `--SPLIT--`
// markers and sends each statement group separately, autocommitted.
//   DATABASE_URL=<owner-url> node db/apply-migration-concurrent.mjs db/migrations/018_register_partial_indexes.sql

function localEnv(name) {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

const file = process.argv[2];
if (!file) { console.error('usage: node db/apply-migration-concurrent.mjs <path-to-.sql>'); process.exit(1); }
const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!url) { console.error('owner DATABASE_URL is required'); process.exit(1); }
// Dev-only by default; Part C prod run sets MIGRATE_ALLOW_PROD=1 (A6 2026-07-17).
if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url) && process.env.MIGRATE_ALLOW_PROD !== '1') {
  console.error('✗ REFUSE: DATABASE_URL is not the dev endpoint (ep-tiny-hat). For the deliberate Part C prod run, set MIGRATE_ALLOW_PROD=1.');
  process.exit(1);
}

const parts = readFileSync(file, 'utf-8').split(/^--SPLIT--$/m).map((s) => s.trim()).filter(Boolean);
const client = new pg.Client({ connectionString: url.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const [i, sql] of parts.entries()) {
    await client.query(sql);
    console.log(`  ✓ part ${i + 1}/${parts.length}`);
  }
  console.log(`✓ applied ${file}`);
} catch (e) {
  console.error(`✗ ${file} failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
