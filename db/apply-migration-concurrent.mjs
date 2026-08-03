import { readFileSync, existsSync } from 'fs';
import pg from 'pg';
import { recordMigration } from './lib/record-migration.mjs';
import { isAuditAllowedHost } from '../scripts/lib/target-guard.mjs';

// Apply a migration containing CREATE/DROP INDEX CONCURRENTLY, which cannot run
// inside a transaction — the standard apply-migration.mjs sends the whole file
// as one implicit-transaction batch. This runner splits the file on `--SPLIT--`
// markers and sends each statement group separately, autocommitted.
//   DATABASE_URL=<owner-url> node db/apply-migration-concurrent.mjs db/migrations/018_register_partial_indexes.sql
//
// INVALID-index guard (deep-audit 2026-07-18): a killed CREATE INDEX CONCURRENTLY
// leaves the new index INVALID. On a re-run, `IF NOT EXISTS` sees the NAME and
// silently skips the rebuild — then the following DROP removes the live serving
// index and RENAME promotes the INVALID one into its place: the planner never
// uses it, the runner prints success, and every query on that path starves.
// So this runner (1) DROPs any INVALID index whose name is created by this file
// BEFORE applying, so the CREATE actually rebuilds it, and (2) after applying,
// asserts every index this file touches is VALID and READY — failing loudly if not.

function localEnv(name) {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

const file = process.argv[2];
if (!file) { console.error('usage: node db/apply-migration-concurrent.mjs <path-to-.sql>'); process.exit(1); }
const rawUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!rawUrl) { console.error('owner DATABASE_URL is required'); process.exit(1); }
const url = rawUrl.replace(/^"|"$/g, '');
// Dev-only by default; Part C prod run sets MIGRATE_ALLOW_PROD=1 (A6 2026-07-17). A dev branch
// that is not a DEV_ENDPOINT is reached by declaring MIGRATE_TARGET_ENDPOINT=<exact endpoint id>.
// Shares the one guard in scripts/lib/target-guard.mjs — see apply-migration.mjs for why the
// private regex this replaces was fail-open (it substring-matched the whole connection string,
// password included).
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

const text = readFileSync(file, 'utf-8');
const parts = text.split(/^--SPLIT--$/m).map((s) => s.trim()).filter(Boolean);

// Every index name this file CREATEs (the rebuild names, e.g. *_v5) and every
// final serving name it RENAMEs to. Parsed from the file so the guard can never
// drift from the migration text.
const cleanName = (s) => s.replace(/[;,\s]+$/, '');
// Parse SQL only — `--` comment lines can contain the keywords in prose (018's
// header says "…CREATE INDEX CONCURRENTLY nor DROP…", which yielded a phantom
// created name "nor" before comments were stripped).
const sqlOnly = text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const createdNames = [...sqlOnly.matchAll(/CREATE INDEX CONCURRENTLY(?: IF NOT EXISTS)?\s+(\S+)/gi)].map((m) => cleanName(m[1]));
const renameSources = [...sqlOnly.matchAll(/ALTER INDEX\s+(\S+)\s+RENAME TO\s+\S+/gi)].map((m) => cleanName(m[1]));
const renamedTo = [...sqlOnly.matchAll(/ALTER INDEX\s+\S+\s+RENAME TO\s+(\S+)/gi)].map((m) => cleanName(m[1]));

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // (1) Pre-clean: drop INVALID leftovers among the names this file creates, so
  // IF NOT EXISTS cannot silently keep a half-built index from a prior failed run.
  if (createdNames.length > 0) {
    const { rows: invalid } = await client.query(
      `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
       WHERE NOT i.indisvalid AND c.relname = ANY($1)`, [createdNames]);
    for (const { relname } of invalid) {
      console.log(`  ⚠ dropping INVALID leftover index ${relname} from a prior failed run`);
      await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${relname}`);
    }
  }

  for (const [i, sql] of parts.entries()) {
    await client.query(sql);
    console.log(`  ✓ part ${i + 1}/${parts.length}`);
  }

  // (2) Post-assert: every index this file touches must exist, be VALID and READY —
  // the rename targets plus any created index NOT consumed by a rename (a file
  // mixing renamed and bare creates asserts both sets).
  const finalNames = [...new Set([...renamedTo, ...createdNames.filter((n) => !renameSources.includes(n))])];
  if (finalNames.length > 0) {
    const { rows } = await client.query(
      `SELECT c.relname, i.indisvalid, i.indisready FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
       WHERE c.relname = ANY($1)`, [finalNames]);
    const found = new Map(rows.map((r) => [r.relname, r]));
    const bad = finalNames.filter((n) => !found.get(n)?.indisvalid || !found.get(n)?.indisready);
    const missing = finalNames.filter((n) => !found.has(n));
    if (bad.length > 0 || missing.length > 0) {
      console.error(`✗ POST-APPLY CHECK FAILED: invalid/not-ready ${JSON.stringify(bad)} missing ${JSON.stringify(missing)} — the serving name may point at an unusable index. Do NOT proceed; re-run this migration (the pre-clean will rebuild).`);
      process.exitCode = 1;
    } else {
      console.log(`  ✓ post-apply: ${finalNames.length} index(es) VALID and READY (${finalNames.join(', ')})`);
    }
  }
  if (process.exitCode !== 1) {
    await recordMigration(client, file, text);
    console.log(`✓ applied ${file}`);
  }
} catch (e) {
  console.error(`✗ ${file} failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
