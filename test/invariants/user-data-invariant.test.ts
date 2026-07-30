// USER_TABLE_SPEC must cover every user-scoped table in db/schema.sql + db/migrations/.
//
// WHY THIS EXISTS (2026-07-29 glob ruling): USER_TABLES was a silent hand-maintained list
// of five tables while ≥13 user-scoped tables existed. A DELETE FROM messages would read
// green at G1 because nothing measured it. This test enumerates user-scoped tables from
// the schema sources and fails if any is neither in USER_TABLE_SPEC nor in the explicit
// USER_TABLE_EXCLUDED list with a reason.
//
// Red-proof: remove one table from USER_TABLE_SPEC, run this test, watch it go RED, restore.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  USER_TABLE_EXCLUDED,
  USER_TABLE_SPEC,
  USER_TABLES,
} from '../../scripts/lib/user-data-invariant.mjs';

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA = path.join(ROOT, 'db/schema.sql');
const MIGRATIONS = path.join(ROOT, 'db/migrations');

/** Parse CREATE TABLE blocks from SQL text; returns tableName -> column names (lowercase). */
function tablesFromSql(sql: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\);/gi)) {
    const name = m[1]!.toLowerCase();
    const body = m[2]!;
    const cols = new Set<string>();
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CONSTRAINT')) continue;
      const col = trimmed.match(/^(\w+)/);
      if (col) cols.add(col[1]!.toLowerCase());
    }
    out.set(name, cols);
  }
  return out;
}

function allSchemaTables(): Map<string, Set<string>> {
  const merged = tablesFromSql(readFileSync(SCHEMA, 'utf8'));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    for (const [name, cols] of tablesFromSql(readFileSync(path.join(MIGRATIONS, file), 'utf8'))) {
      merged.set(name, cols);
    }
  }
  return merged;
}

/** User-scoped: per-user RLS content, or waitlist (public signup list in G1 inventory). */
function isUserScoped(name: string, cols: Set<string>): boolean {
  if (name === 'waitlist') return true;
  if (cols.has('user_id') || cols.has('auth_user_id')) return true;
  return false;
}

describe('user-data-invariant: USER_TABLE_SPEC is complete', () => {
  const schemaTables = allSchemaTables();
  const userScoped = [...schemaTables.entries()]
    .filter(([name, cols]) => isUserScoped(name, cols))
    .map(([name]) => name)
    .sort();

  it('enumerates user-scoped tables from schema + migrations (not vacuous)', () => {
    expect(userScoped.length).toBeGreaterThan(10);
    expect(userScoped).toContain('waitlist');
    expect(userScoped).toContain('messages');
    expect(userScoped).toContain('bookmarks');
  });

  it('USER_TABLES is derived from USER_TABLE_SPEC (never hand-maintained)', () => {
    expect([...USER_TABLES].sort()).toEqual(Object.keys(USER_TABLE_SPEC).sort());
  });

  it('every user-scoped table is in USER_TABLE_SPEC or USER_TABLE_EXCLUDED with a reason', () => {
    const spec = new Set(Object.keys(USER_TABLE_SPEC));
    const excluded = new Set(Object.keys(USER_TABLE_EXCLUDED));
    const missing: string[] = [];
    const unreasoned: string[] = [];

    for (const t of userScoped) {
      if (spec.has(t)) continue;
      if (!excluded.has(t)) missing.push(t);
      else if (!USER_TABLE_EXCLUDED[t]?.trim()) unreasoned.push(t);
    }

    expect(
      missing,
      `User-scoped table(s) missing from USER_TABLE_SPEC and not in USER_TABLE_EXCLUDED:\n`
        + `${missing.join(', ')}\nAdd a spec entry or an explicit exclusion with reason.`,
    ).toEqual([]);
    expect(unreasoned).toEqual([]);
  });

  it('USER_TABLE_EXCLUDED entries are not also measured by G1', () => {
    for (const t of Object.keys(USER_TABLE_EXCLUDED)) {
      expect(USER_TABLE_SPEC[t], `${t} is both excluded and spec'd`).toBeUndefined();
    }
  });

  it('USER_TABLE_SPEC entries correspond to real schema tables', () => {
    const unknown = Object.keys(USER_TABLE_SPEC).filter((t) => !schemaTables.has(t));
    expect(unknown, `USER_TABLE_SPEC names tables absent from schema/migrations: ${unknown.join(', ')}`).toEqual([]);
  });
});
