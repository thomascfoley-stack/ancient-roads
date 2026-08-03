import { readFileSync, existsSync } from 'fs';
import pg from 'pg';
import { recordMigration } from './lib/record-migration.mjs';
import { isAuditAllowedHost } from '../scripts/lib/target-guard.mjs';

// Apply ONE numbered migration file as neondb_owner. The existing migrate.mjs
// only (re)applies schema.sql; numbered migrations are applied with this.
//   DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/006_sources_sections.sql
// Falls back to DATABASE_URL_UNPOOLED / DATABASE_URL in web/.env.local if the
// env var is not set (both are the neondb_owner connection in this project).
//
// A target that is neither localhost nor a DEV_ENDPOINT must be DECLARED by exact endpoint id:
//   DATABASE_URL=<owner-url> MIGRATE_TARGET_ENDPOINT=ep-snowy-bird-atmdsv3g node db/apply-migration.mjs …
// Production is refused by that path no matter what is declared; reaching prod still takes
// MIGRATE_ALLOW_PROD=1, exactly as before.

function localEnv(name) {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

const file = process.argv[2];
if (!file) { console.error('usage: node db/apply-migration.mjs <path-to-.sql>'); process.exit(1); }
const rawUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!rawUrl) { console.error('owner DATABASE_URL is required'); process.exit(1); }
const url = rawUrl.replace(/^"|"$/g, '');
// Endpoint guard (A6 line-by-line 2026-07-17: the runner silently applied to whatever
// DATABASE_URL resolved to, incl. a prod fallback in web/.env.local). Part C applies to prod
// DELIBERATELY: set MIGRATE_ALLOW_PROD=1.
//
// This used to be a private /ep-tiny-hat|localhost|127\.0\.0\.1/ regex, which was the fourth
// hand-copy of a rule scripts/lib/target-guard.mjs exists to hold in ONE place, and it carried
// that file's documented defect #2: it matched a SUBSTRING of the whole connection string, so a
// password or database name containing "ep-tiny-hat" authorized the run. isAuditAllowedHost
// compares endpoint IDs exactly, lowercased, and refuses prod before consulting the declaration.
// Reaching a new dev branch is now a declaration at the call site, not an edit to DEV_ENDPOINTS
// (whose second hand-typed copy at web/test/helpers/env.ts:60 would silently drift from it).
if (process.env.MIGRATE_ALLOW_PROD !== '1') {
  let allowed = false;
  try {
    allowed = isAuditAllowedHost(url, process.env.MIGRATE_TARGET_ENDPOINT);
  } catch {
    allowed = false; // unparseable target is a refusal, not a pass
  }
  if (!allowed) {
    console.error(
      '✗ REFUSE: DATABASE_URL is not localhost, not a known dev endpoint, and not declared.\n' +
      '  Declare a dev branch by its exact endpoint id: MIGRATE_TARGET_ENDPOINT=ep-xxxx-yyyy-zzzz\n' +
      '  For the deliberate Part C prod run, set MIGRATE_ALLOW_PROD=1.',
    );
    process.exit(1);
  }
}

const sql = readFileSync(file, 'utf-8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql); // simple-protocol: runs every statement in the file
  await recordMigration(client, file, sql);
  console.log(`✓ applied ${file}`);
} catch (e) {
  console.error(`✗ ${file} failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
