// USER_TABLE_SPEC must cover every table in db/schema.sql + db/migrations/.
//
// WHY THIS EXISTS (2026-07-29 glob ruling): USER_TABLES was a silent hand-maintained list
// while ≥13 user-scoped tables existed. This test enumerates ALL schema tables and fails if
// any is neither in USER_TABLE_SPEC nor USER_TABLE_EXCLUDED with a reason. No heuristic
// (user_id column presence) decides coverage — the class, not the instance.
//
// Red-proof: add a CREATE TABLE to a scratch migration → red until classified; remove scratch.

import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
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
function tablesFromCreate(sql: string): Map<string, Set<string>> {
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

/** Union ALTER TABLE … ADD COLUMN into existing table column sets. */
function applyAlterAddColumns(sql: string, merged: Map<string, Set<string>>): void {
  for (const m of sql.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?(\w+)\s+ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)/gi)) {
    const name = m[1]!.toLowerCase();
    const col = m[2]!.toLowerCase();
    if (!merged.has(name)) merged.set(name, new Set());
    merged.get(name)!.add(col);
  }
}

function allSchemaTables(): Map<string, Set<string>> {
  const merged = tablesFromCreate(readFileSync(SCHEMA, 'utf8'));
  applyAlterAddColumns(readFileSync(SCHEMA, 'utf8'), merged);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const [name, cols] of tablesFromCreate(sql)) {
      if (!merged.has(name)) merged.set(name, new Set());
      for (const c of cols) merged.get(name)!.add(c);
    }
    applyAlterAddColumns(sql, merged);
  }
  return merged;
}

function classifyCompleteness(tables: string[]): { missing: string[]; unreasoned: string[] } {
  const spec = new Set(Object.keys(USER_TABLE_SPEC));
  const excluded = new Set(Object.keys(USER_TABLE_EXCLUDED));
  const missing: string[] = [];
  const unreasoned: string[] = [];
  for (const t of tables) {
    if (spec.has(t)) continue;
    if (!excluded.has(t)) missing.push(t);
    else if (!USER_TABLE_EXCLUDED[t]?.trim()) unreasoned.push(t);
  }
  return { missing, unreasoned };
}

describe('user-data-invariant: USER_TABLE_SPEC is complete', () => {
  const schemaTables = allSchemaTables();
  const allTables = [...schemaTables.keys()].sort();

  it('enumerates tables from schema + migrations (not vacuous)', () => {
    expect(allTables.length).toBeGreaterThan(15);
    expect(allTables).toContain('waitlist');
    expect(allTables).toContain('messages');
    expect(allTables).toContain('bookmarks');
    expect(allTables).toContain('sources');
  });

  it('USER_TABLES is derived from USER_TABLE_SPEC (never hand-maintained)', () => {
    expect([...USER_TABLES].sort()).toEqual(Object.keys(USER_TABLE_SPEC).sort());
  });

  it('every schema table is in USER_TABLE_SPEC or USER_TABLE_EXCLUDED with a reason', () => {
    const { missing, unreasoned } = classifyCompleteness(allTables);
    expect(
      missing,
      `Table(s) missing from USER_TABLE_SPEC and not in USER_TABLE_EXCLUDED:\n`
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

  it('red-proofs: scratch CREATE TABLE fails until classified', () => {
    const scratch = path.join(MIGRATIONS, '999_scratch_user_data_invariant_redproof.sql');
    writeFileSync(scratch, 'CREATE TABLE IF NOT EXISTS scratch_redproof_xyz (id uuid PRIMARY KEY, label text);\n');
    try {
      const withScratch = [...allSchemaTables().keys(), 'scratch_redproof_xyz'].sort();
      const { missing } = classifyCompleteness(withScratch);
      expect(missing).toContain('scratch_redproof_xyz');
    } finally {
      unlinkSync(scratch);
    }
  });
});
