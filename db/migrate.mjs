import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { assertDevOnlyTarget } from '../src/ingest/dev-only-target.mjs';

// Owner connection, migrations/DDL only. Never hardcode credentials here — this file is
// committed. Provide the owner URL via the environment (e.g. `DATABASE_URL=... node db/migrate.mjs`).
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required (neondb_owner connection for migrations). Set it in the environment.');
  process.exit(1);
}

// TARGET GUARD (2026-08-02 deep audit, M19). This script had none: `DATABASE_URL=<anything>
// node db/migrate.mjs` applied all of db/schema.sql to whatever it pointed at. Against a
// post-031 production database most statements error harmlessly, but
// `CREATE OR REPLACE FUNCTION hybrid_search` SUCCEEDS and silently reverts migration 004 —
// back to websearch_to_tsquery with no source_type filter. That was survivable only because
// hybrid_search currently has no callers, which is luck, not a design.
//
// Migrations against a real target go through db/apply-migration.mjs, which has always had
// its own override. This runner is for bootstrapping a dev or local database from schema.sql.
assertDevOnlyTarget(DATABASE_URL, process.env.NEON_BRANCH, 'the schema.sql bootstrap runner');

const sql = neon(DATABASE_URL);
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf-8');

// Split on semicolons but respect $$ blocks (function bodies)
function splitStatements(text) {
  const stmts = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollarBlock) continue;

    if (trimmed.includes('$$')) {
      const count = (trimmed.match(/\$\$/g) || []).length;
      if (count % 2 === 1) inDollarBlock = !inDollarBlock;
    }

    current += line + '\n';

    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 1) stmts.push(stmt);
      current = '';
    }
  }

  if (current.trim().length > 1) stmts.push(current.trim());
  return stmts;
}

const statements = splitStatements(schema);
let ok = 0;
let errors = [];

for (const stmt of statements) {
  try {
    await sql.query(stmt);
    ok++;
    process.stdout.write('.');
  } catch (e) {
    const preview = stmt.split('\n')[0].substring(0, 60);
    errors.push({ preview, error: e.message });
    process.stdout.write('x');
  }
}

console.log(`\n\nDone: ${ok}/${statements.length} statements succeeded`);
if (errors.length > 0) {
  console.log('\nErrors:');
  for (const e of errors) {
    console.log(`  ${e.preview}`);
    console.log(`    → ${e.error}\n`);
  }
  // EXIT NON-ZERO. This printed every failure and then exited 0, so a caller, a shell `&&`
  // chain or a CI step read "Done: 41/52 statements succeeded" as success (2026-08-02 deep
  // audit, M19). A runner that reports its own failures and then claims victory is the
  // "unearned green" shape in its purest form.
  process.exitCode = 1;
}
