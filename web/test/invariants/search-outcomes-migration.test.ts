// search_outcomes migration shape (127) — static, no DB, runs in CI. The exact pattern of
// ask-outcomes-migration.test.ts (116): parse the shipped SQL and fail if the posture drifts.
//
// What is pinned, and the seed that turns each red:
//   * RLS enabled AT CREATION + exactly one CREATE POLICY, FOR INSERT, whose WITH CHECK
//     admits NULL user_id (the public surfaces) or the request GUC. Seed: drop the
//     `user_id IS NULL OR` branch → red.
//   * app_runtime is GRANTed INSERT and NOTHING else by this file. Seed: delete the GRANT
//     line → red (the 039/106 outage shape: "permission denied" on the first write).
//     SELECT/UPDATE/DELETE policies must NOT exist (034's narrowing: no policy = zero rows).
//   * The writer↔table contract: the INSERT column list in web/src/lib/search-outcomes.ts is
//     a subset of the CREATE TABLE columns here. Seed: rename a column on either side → red.
//   * The self-verifying DO tail (106/110 pattern): has_table_privilege assertions that
//     RAISE. Seed: remove the DO block → red.
//   * Idempotency markers (IF NOT EXISTS / DROP POLICY IF EXISTS) and the two stated indexes.
//   * The surface vocabulary is CLOSED by CHECK — the writer's SearchSurface union and the
//     table's CHECK list must agree, both ways. Seed: add a surface to either side alone → red.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'db/migrations');
const FILE = '127_search_outcomes.sql';
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8');
// Strip line comments so commented-out examples can't satisfy an assertion (and rollback
// comments can't trip one) — same reason 116's test strips them.
const stripped = sql
  .split('\n')
  .map((line) => {
    const i = line.indexOf('--');
    return i === -1 ? line : line.slice(0, i);
  })
  .join('\n');

const writer = readFileSync(path.join(ROOT, 'web/src/lib/search-outcomes.ts'), 'utf8');

describe('127_search_outcomes.sql — migration shape', () => {
  // Same durable ordering property as 116's test settled on (its header records why
  // "nothing higher" and "no gap" were both tried and are both wrong): the number is not reused.
  it('is uniquely numbered', () => {
    const nums = readdirSync(MIGRATIONS)
      .map((f) => /^(\d+)_/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number);
    expect(nums.filter((n) => n === 127), '127 must appear exactly once').toHaveLength(1);
  });

  it('creates search_outcomes with the query-log columns, user_id nullable', () => {
    const m = /CREATE TABLE IF NOT EXISTS search_outcomes\s*\(([\s\S]*?)\);/i.exec(stripped);
    expect(m, 'CREATE TABLE search_outcomes not found').not.toBeNull();
    const body = m![1]!;
    for (const col of ['user_id', 'surface', 'query', 'params', 'result_count', 'total', 'latency_ms', 'created_at']) {
      expect(body, `missing column ${col}`).toMatch(new RegExp(`\\b${col}\\b`));
    }
    // The public surfaces log anonymously: user_id must NOT be NOT NULL.
    expect(body).not.toMatch(/user_id\s+TEXT\s+NOT\s+NULL/i);
    // JSONB for the structured field, per the build contract.
    expect(body).toMatch(/params\s+JSONB/i);
  });

  it('the surface CHECK list and the writer SearchSurface union agree, both ways', () => {
    const check = /surface\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(surface IN \(([^)]*)\)\)/i.exec(stripped);
    expect(check, 'surface CHECK constraint not found').not.toBeNull();
    const sqlSurfaces = [...check![1]!.matchAll(/'([^']+)'/g)].map((m2) => m2[1]!).sort();
    const union = /export type SearchSurface =([^;]+);/.exec(writer);
    expect(union, 'SearchSurface union not found in search-outcomes.ts').not.toBeNull();
    const tsSurfaces = [...union![1]!.matchAll(/'([^']+)'/g)].map((m2) => m2[1]!).sort();
    expect(tsSurfaces, 'writer and CHECK disagree — a new surface must be added to BOTH').toEqual(sqlSurfaces);
    expect(sqlSurfaces.length, 'surface parse went vacuous').toBeGreaterThanOrEqual(5);
  });

  it('enables RLS at creation with exactly one policy: FOR INSERT, NULL-user or GUC-bound', () => {
    expect(stripped).toMatch(/ALTER TABLE search_outcomes ENABLE ROW LEVEL SECURITY/i);
    const policies = stripped.match(/CREATE POLICY\s+\w+\s+ON\s+search_outcomes/gi) ?? [];
    expect(policies, 'must carry exactly one policy — a second one widens runtime access').toHaveLength(1);
    expect(stripped).toMatch(/CREATE POLICY search_outcomes_insert ON search_outcomes\s+FOR INSERT TO app_runtime/i);
    expect(stripped).toMatch(
      /WITH CHECK\s*\(\s*user_id IS NULL OR user_id = current_setting\('app.current_user_id', true\)\s*\)/i,
    );
    // 034's narrowing: no SELECT/UPDATE/DELETE policy may exist (no policy = zero rows).
    expect(stripped).not.toMatch(/CREATE POLICY[\s\S]*?FOR SELECT[\s\S]*?ON search_outcomes/i);
  });

  it('grants app_runtime INSERT and nothing else', () => {
    const grants = stripped.match(/GRANT\s+[A-Z,\s]+\s+ON\s+search_outcomes\s+TO\s+app_runtime/gi) ?? [];
    expect(grants, 'the GRANT INSERT line is the whole grant matrix — it must exist').toHaveLength(1);
    expect(grants[0]).toMatch(/GRANT\s+INSERT\s+ON/i);
    expect(stripped).not.toMatch(/GRANT\s+(SELECT|UPDATE|DELETE|ALL)[\s\S]*?search_outcomes/i);
  });

  it('carries the self-verifying DO tail (106/110 pattern) with RAISE-ing grant assertions', () => {
    expect(stripped).toMatch(/DO\s+\$\$/);
    expect(stripped).toMatch(/has_table_privilege\('app_runtime', 'search_outcomes', 'INSERT'\)/);
    expect(stripped).toMatch(/has_table_privilege\('app_runtime', 'search_outcomes', 'UPDATE'\)/);
    expect(stripped).toMatch(/has_table_privilege\('app_runtime', 'search_outcomes', 'DELETE'\)/);
    expect(stripped).toMatch(/RAISE EXCEPTION '127 FAILED/g);
    expect(stripped).toMatch(/relrowsecurity/);
  });

  it('has the two stated indexes and is idempotent', () => {
    expect(stripped).toMatch(/CREATE INDEX IF NOT EXISTS idx_search_outcomes_created ON search_outcomes \(created_at\)/i);
    expect(stripped).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_search_outcomes_user_created ON search_outcomes \(user_id, created_at\)/i,
    );
    expect(stripped).toMatch(/DROP POLICY IF EXISTS search_outcomes_insert/i);
  });

  it('writer↔table contract: every INSERT column in search-outcomes.ts exists in the table', () => {
    const m = /CREATE TABLE IF NOT EXISTS search_outcomes\s*\(([\s\S]*?)\);/i.exec(stripped)!;
    const tableCols = new Set(
      [...m[1]!.matchAll(/^\s*(\w+)\s+/gm)].map((c) => c[1]!.toLowerCase()),
    );
    expect(tableCols.size, 'column parse went vacuous').toBeGreaterThanOrEqual(8);
    const ins = /INSERT INTO search_outcomes\s*\(([\s\S]*?)\)/i.exec(writer);
    expect(ins, 'INSERT column list not found in web/src/lib/search-outcomes.ts').not.toBeNull();
    const insertCols = ins![1]!.split(',').map((c) => c.trim().toLowerCase());
    const unknown = insertCols.filter((c) => !tableCols.has(c));
    expect(unknown, `search-outcomes.ts inserts columns the table lacks: ${unknown.join(', ')}`).toEqual([]);
  });
});
