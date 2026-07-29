import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

// Owner connection, migrations/DDL only. Never hardcode credentials here — this file is
// committed. Provide the owner URL via the environment (e.g. `DATABASE_URL=... node db/migrate.mjs`).
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required (neondb_owner connection for migrations). Set it in the environment.');
  process.exit(1);
}

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
}
