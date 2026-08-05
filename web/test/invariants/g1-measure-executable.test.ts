// G1's digest SQL must be EXECUTABLE for every classified table.
//
// This test exists because it did not. `measureSql` hardcoded `id` in both the
// identity list and `ORDER BY id::text` — true of every table classified before
// 2026-08-02, false for plans' children (composite PKs, no `id`). Nothing ran
// the SQL, so two tables were classified, shipped, and unmeasurable: cutover.mjs
// would have reported 42703 as "a column this invariant covers has been dropped
// or renamed ... restore from the pre-cutover snapshot" — a false schema-
// regression verdict on a healthy database — and the regression gate's G1 would
// have thrown raw. A classification nobody executed is not coverage.
//
// The table set is DERIVED from USER_TABLE_SPEC, so a future table is covered
// by existing, not by remembering to extend a list here.

import { describe, expect, it } from 'vitest';
import { measureSql, ownersSql, USER_TABLES } from '../../../scripts/lib/user-data-invariant.mjs';
import { getDb } from '@/lib/db';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'G1 digest SQL is executable for every classified table',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'that every USER_TABLE_SPEC entry can actually be measured',
);

describe.skipIf(SKIP)('G1 digest SQL is executable for every classified table', () => {
  it.each(USER_TABLES)('measureSql(%s) runs against the real schema', async (table) => {
    // SEED: drop `idColumns` from plan_days' spec and this goes red with
    // 42703 — the exact failure that shipped unnoticed on 2026-08-02.
    const sql = getDb();
    const exists = (await sql.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [table])) as Array<{ ok: boolean }>;
    if (!exists[0]?.ok) {
      // A table absent on this target is a fact about the target, not a pass:
      // say so out loud rather than counting it as coverage.
      console.warn(`⚠ NOT RUN: ${table} does not exist on this target`);
      return;
    }
    await expect(sql.query(measureSql(table))).resolves.toBeDefined();
    await expect(sql.query(ownersSql(table))).resolves.toBeDefined();
  }, 30_000);
});
