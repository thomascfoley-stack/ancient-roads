// WRITE THE MIGRATION LEDGER ROW. Shared by both runners, because neither one wrote it.
//
// THE DEFECT. Migration 032 created `schema_migrations` (deep audit M18: nothing detected a
// skipped, out-of-order or doubly-applied migration) and set its table COMMENT to
// "Written by db/apply-migration.mjs". That runner does not write it, and neither does
// apply-migration-concurrent.mjs — grep for schema_migrations in db/ returns the migrations and
// nothing else. What actually happened is that 032 and 033 each carry their own INSERT, so the
// ledger works only for as long as every future migration author remembers to hand-write one.
// That is precisely the failure class this repo keeps paying for, installed inside the fix for a
// previous instance of it. The comment made it worse than an omission: it read as done.
//
// Now the RUNNER records the row, so a migration cannot be applied without being recorded, and
// the per-file INSERTs in 032/033 become harmless duplicates (ON CONFLICT DO NOTHING).
//
// CHECKSUM. sha256 of the file as applied. 032's backfilled rows carry NULL because their
// contents at apply time are not recoverable; everything from here on is pinned, so a file edited
// after it was applied is detectable.
//
// ABSENT LEDGER IS A WARNING, NOT A FAILURE. Dev branches predating 032 have no table. Failing
// there would block dev migrations to protect a record that does not exist; a loud warning says
// the run happened and was not recorded, which is the true statement.

import { createHash } from 'node:crypto';
import path from 'node:path';

export async function recordMigration(client, file, text) {
  const filename = path.basename(file);
  const { rows } = await client.query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`);
  if (!rows[0]?.present) {
    console.warn(
      `  ⚠ NOT RECORDED: this target has no schema_migrations table (migration 032 creates it).\n` +
        `    ${filename} WAS applied; the ledger on this database does not know it.`,
    );
    return false;
  }
  const checksum = createHash('sha256').update(text).digest('hex');
  await client.query(
    `INSERT INTO schema_migrations (filename, applied_by, checksum) VALUES ($1, current_user, $2)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, checksum],
  );
  const { rows: back } = await client.query(
    `SELECT applied_at, applied_by, checksum FROM schema_migrations WHERE filename = $1`,
    [filename],
  );
  const r = back[0];
  if (r && r.checksum && r.checksum !== checksum) {
    // Already recorded under DIFFERENT contents. Not fatal — the statements just ran — but it
    // means the file changed since it was first applied, and the ledger is the only place that
    // can say so.
    console.warn(
      `  ⚠ CHECKSUM MISMATCH: ${filename} was recorded at ${r.applied_at?.toISOString?.() ?? r.applied_at} with a different sha256.\n` +
        `    recorded ${r.checksum}\n    on disk  ${checksum}\n` +
        `    The file was edited after it was first applied. The ledger keeps the ORIGINAL.`,
    );
  } else {
    console.log(`  ✓ ledger: ${filename} (${r?.applied_by ?? 'unknown'}, sha256 ${checksum.slice(0, 12)}…)`);
  }
  return true;
}
