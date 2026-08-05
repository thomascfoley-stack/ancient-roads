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

// POOLER REFUSAL (main, bylaw-4 refuter 2026-08-03). Session SETs (lock_timeout,
// maintenance_work_mem) and the multi-group apply protocol assume ONE server session. Through a
// Neon pooler in transaction mode every group can land on a different backend: the SETs silently
// apply to nothing and CIC coordination degrades.
if (/-pooler\./.test(url)) {
  console.error('✗ REFUSE: DATABASE_URL is a POOLED host (-pooler). Migrations need the direct endpoint - session SETs and CONCURRENTLY coordination do not survive transaction pooling.');
  process.exit(1);
}

// TARGET GUARD (lane-b). Dev-only by default; the Part C prod run sets MIGRATE_ALLOW_PROD=1 (A6
// 2026-07-17). A dev branch that is not a DEV_ENDPOINT is reached by declaring
// MIGRATE_TARGET_ENDPOINT=<exact endpoint id>. Shares the one guard in scripts/lib/target-guard.mjs.
//
// BOTH sides of this merge are kept deliberately. main hardcoded /ep-tiny-hat|localhost/, which
// cannot express any other dev branch and is the substring-match shape apply-migration.mjs already
// records as fail-open (it matched the whole connection string, password included). The shared
// guard replaces that. main's pooler check above is orthogonal and is not in the shared guard.
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
const sqlOnly = text
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  // Trailing comments too, but ONLY on quote-free lines: a literal like 'https://x--y' must
  // never be truncated. Full-line stripping alone let an inline `-- comment` smuggle keywords
  // past this parser (bylaw-4 refuter, LOW).
  .map((l) => (l.includes("'") ? l : l.replace(/--.*$/, '')))
  .join('\n');
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
