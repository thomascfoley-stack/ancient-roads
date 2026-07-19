import { readFileSync, existsSync } from 'fs';
import pg from 'pg';

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
const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!url) { console.error('owner DATABASE_URL is required'); process.exit(1); }
// Dev-only by default; Part C prod run sets MIGRATE_ALLOW_PROD=1 (A6 2026-07-17).
if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url) && process.env.MIGRATE_ALLOW_PROD !== '1') {
  console.error('✗ REFUSE: DATABASE_URL is not the dev endpoint (ep-tiny-hat). For the deliberate Part C prod run, set MIGRATE_ALLOW_PROD=1.');
  process.exit(1);
}

const text = readFileSync(file, 'utf-8');
const parts = text.split(/^--SPLIT--$/m).map((s) => s.trim()).filter(Boolean);

// Every index name this file CREATEs (the rebuild names, e.g. *_v5) and every
// final serving name it RENAMEs to. Parsed from the file so the guard can never
// drift from the migration text.
const cleanName = (s) => s.replace(/[;,\s]+$/, '');
const createdNames = [...text.matchAll(/CREATE INDEX CONCURRENTLY(?: IF NOT EXISTS)?\s+(\S+)/gi)].map((m) => cleanName(m[1]));
const renamedTo = [...text.matchAll(/ALTER INDEX\s+\S+\s+RENAME TO\s+(\S+)/gi)].map((m) => cleanName(m[1]));

const client = new pg.Client({ connectionString: url.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
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

  // (2) Post-assert: every index this file touches must exist, be VALID and READY.
  const finalNames = [...new Set(renamedTo.length > 0 ? renamedTo : createdNames)];
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
  if (process.exitCode !== 1) console.log(`✓ applied ${file}`);
} catch (e) {
  console.error(`✗ ${file} failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
