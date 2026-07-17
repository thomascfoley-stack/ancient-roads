// Rebuild the register partial indexes (018 v2 + 019 v2) statement-by-statement
// with NO client timeout, dropping any INVALID leftover first (a killed CREATE
// INDEX CONCURRENTLY leaves an INVALID index that a plain IF NOT EXISTS re-run
// would silently keep — A6 2026-07-17).
//
//   DATABASE_URL=<dev owner UNPOOLED> NEON_BRANCH=dev npx tsx src/ingest/rebuild-register-indexes.ts

import pg from 'pg';
import { readFileSync } from 'node:fs';

async function main() {
  const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
  if (!/ep-tiny-hat/.test(url)) throw new Error('STOP: not the dev endpoint');
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    // drop INVALID leftovers so the CREATEs below rebuild them for real
    const invalid = await db.query<{ relname: string }>(
      `SELECT i.relname FROM pg_index idx JOIN pg_class i ON i.oid=idx.indexrelid
       WHERE NOT idx.indisvalid AND i.relname LIKE 'idx_%'`,
    );
    for (const r of invalid.rows) {
      console.log(`dropping INVALID ${r.relname}`);
      await db.query(`DROP INDEX CONCURRENTLY IF EXISTS ${r.relname}`);
    }
    for (const file of ['db/migrations/018_register_partial_indexes.sql', 'db/migrations/019_register_columns_fts.sql']) {
      const stmts = readFileSync(file, 'utf8').split('--SPLIT--').map((s) => s.trim()).filter((s) => s && !/^--[^\n]*$/.test(s));
      for (const stmt of stmts) {
        const label = stmt.replace(/--[^\n]*\n/g, '').slice(0, 70).replace(/\s+/g, ' ');
        const t0 = Date.now();
        await db.query(stmt);
        console.log(`ok (${Math.round((Date.now() - t0) / 1000)}s): ${label}`);
      }
    }
    const check = await db.query<{ relname: string; indisvalid: boolean }>(
      `SELECT i.relname, idx.indisvalid FROM pg_index idx JOIN pg_class i ON i.oid=idx.indexrelid
       WHERE i.relname LIKE 'idx_embeddings_vector%' OR i.relname LIKE 'idx_commentary_fts%' OR i.relname LIKE 'idx_embeddings_verseid%'`,
    );
    for (const r of check.rows) console.log(`  ${r.indisvalid ? '✓' : '✗ INVALID'} ${r.relname}`);
    if (check.rows.some((r) => !r.indisvalid)) throw new Error('an index is INVALID after rebuild');
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
