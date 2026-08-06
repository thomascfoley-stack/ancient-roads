// Migration 104 hand-writes DDL for tables that Better Auth generates from `authOptions`. That is
// two descriptions of one schema, which is the repo's most-punished defect class (MASTER.md
// watchlist, twelve instances). This test makes the second one checked rather than trusted: the
// expected shape is DERIVED by handing the app's real options object to Better Auth's own
// `getAuthTables()`, so upgrading the library and gaining a column turns this red instead of
// turning production red on the first sign-in.
//
// It also confines the tables. Migration 104 deliberately runs these four WITHOUT RLS, because
// authentication happens before there is a `app.current_user_id` to key a policy on -- sign-in
// looks a user up by email with no session, and a reset token is looked up by identifier by
// definition before identity exists. The honest consequence is that `auth_accounts.password` (the
// bcrypt hashes) is readable by any query the app runs as `app_runtime`. What actually protects it
// is that no query outside the auth layer goes near these tables, so that is asserted here rather
// than assumed.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthTables } from 'better-auth/db';
import { describe, expect, it } from 'vitest';
import { authOptions } from '@/lib/auth/better-auth';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(HERE, '../../../db/migrations/104_better_auth_schema.sql');
const SRC = path.resolve(HERE, '../../src');

/** table -> column names, parsed from the migration. Quoted camelCase identifiers unwrapped. */
function migrationTables(): Map<string, Set<string>> {
  const sql = readFileSync(MIGRATION, 'utf8');
  const out = new Map<string, Set<string>>();
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const cols = new Set<string>();
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      const c = line.match(/^"?([A-Za-z_]\w*)"?\s/);
      if (c) cols.add(c[1]);
    }
    out.set(m[1], cols);
  }
  return out;
}

/** table -> column names, derived from Better Auth's own schema for the app's real options. */
function expectedTables(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const model of Object.values(getAuthTables(authOptions))) {
    // `id` is implicit in Better Auth's field list but is a real column.
    const cols = new Set<string>(['id']);
    for (const [name, def] of Object.entries(model.fields)) {
      cols.add((def as { fieldName?: string }).fieldName ?? name);
    }
    out.set(model.modelName, cols);
  }
  return out;
}

describe('migration 104 matches the Better Auth schema it claims to implement', () => {
  const expected = expectedTables();
  const actual = migrationTables();

  it('derives a non-empty expected schema, and parses a non-empty migration', () => {
    // Non-vacuity on both sides. If either parse silently yields nothing, every comparison below
    // passes over an empty set -- green having compared two empty maps.
    expect(expected.size).toBe(4);
    expect(actual.size).toBe(4);
    for (const cols of expected.values()) expect(cols.size).toBeGreaterThan(3);
  });

  it.each([...expectedTables().keys()])('%s exists with exactly the expected columns', (table) => {
    const want = expected.get(table)!;
    const got = actual.get(table);
    expect(got, `migration 104 has no CREATE TABLE ${table}`).toBeDefined();

    const missing = [...want].filter((c) => !got!.has(c));
    const extra = [...got!].filter((c) => !want.has(c));
    expect(
      missing,
      `${table} is missing column(s) Better Auth will query: ${missing.join(', ')}`,
    ).toEqual([]);
    expect(
      extra,
      `${table} declares column(s) Better Auth does not know about: ${extra.join(', ')}`,
    ).toEqual([]);
  });

  it('names the tables the app config actually asks for', () => {
    // Guards the other direction of the same drift: renaming modelName in better-auth.ts without
    // renaming the table. The migration is keyed by literal table name, so this would otherwise
    // only surface as a runtime "relation does not exist".
    expect([...expected.keys()].sort()).toEqual([
      'auth_accounts',
      'auth_sessions',
      'auth_users',
      'auth_verifications',
    ]);
  });
});

describe('the auth tables are confined to the auth layer', () => {
  const TABLES = [...expectedTables().keys()];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  }

  it('no module outside src/lib/auth/ references them', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50); // non-vacuity: the walk found the tree

    const offenders = files.filter((f) => {
      const rel = path.relative(SRC, f);
      if (rel.startsWith(path.join('lib', 'auth'))) return false;
      const src = readFileSync(f, 'utf8');
      return TABLES.some((t) => src.includes(t));
    });

    expect(
      offenders.map((f) => path.relative(SRC, f)),
      'These tables hold the password hashes and run WITHOUT RLS (migration 104). Reading them ' +
        'from outside the auth layer removes the only protection they have.',
    ).toEqual([]);
  });
});
