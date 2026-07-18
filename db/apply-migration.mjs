import { readFileSync, existsSync } from 'fs';
import pg from 'pg';

// Apply ONE numbered migration file as neondb_owner. The existing migrate.mjs
// only (re)applies schema.sql; numbered migrations are applied with this.
//   DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/006_sources_sections.sql
// Falls back to DATABASE_URL_UNPOOLED / DATABASE_URL in web/.env.local if the
// env var is not set (both are the neondb_owner connection in this project).

function localEnv(name) {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

const file = process.argv[2];
if (!file) { console.error('usage: node db/apply-migration.mjs <path-to-.sql>'); process.exit(1); }
const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!url) { console.error('owner DATABASE_URL is required'); process.exit(1); }
// Default to a dev-only endpoint guard (A6 line-by-line 2026-07-17: the runner
// silently applied to whatever DATABASE_URL resolved to, incl. a prod fallback in
// web/.env.local). Part C applies to prod DELIBERATELY: set MIGRATE_ALLOW_PROD=1.
if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url) && process.env.MIGRATE_ALLOW_PROD !== '1') {
  console.error('✗ REFUSE: DATABASE_URL is not the dev endpoint (ep-tiny-hat). For the deliberate Part C prod run, set MIGRATE_ALLOW_PROD=1.');
  process.exit(1);
}

const sql = readFileSync(file, 'utf-8');
const client = new pg.Client({ connectionString: url.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql); // simple-protocol: runs every statement in the file
  console.log(`✓ applied ${file}`);
} catch (e) {
  console.error(`✗ ${file} failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
