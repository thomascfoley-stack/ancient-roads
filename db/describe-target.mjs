// PRINT WHAT IS ACTUALLY ON A MIGRATION TARGET. Read-only.
//
// WHY THIS EXISTS. `apply-pending.mjs` needs to know which migrations a target has already seen.
// When there is no ledger, that has to be declared — and on 2026-08-08 the declaration was guessed
// twice and wrong twice, burning a CI run each time to discover one more missing prerequisite
// ("applied through 103" → 105 failed on `user_documents`; "through 99" → 106 failed on
// `plan_days`). Guessing costs a round trip per attempt and never converges.
//
// So: read the target instead. This makes no changes, and prints enough to set the assumption
// correctly in one shot — the ledger if there is one, and the tables that actually exist mapped
// against the migration that creates them.
//
// SAFETY. Same target guard as the runners: localhost, a known dev endpoint, or an endpoint
// declared by exact id. Production is refused regardless. It is read-only, but a read against the
// wrong database is still a mistake worth preventing.

import pg from 'pg';
import { isAuditAllowedHost } from '../scripts/lib/target-guard.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is required.');
  process.exit(1);
}
let allowed = false;
try {
  allowed = isAuditAllowedHost(url, process.env.MIGRATE_TARGET_ENDPOINT);
} catch {
  allowed = false;
}
if (!allowed) {
  console.error('✗ REFUSE: target is not localhost, a known dev endpoint, or declared by exact id.');
  process.exit(1);
}

const isLocal = /(?:^|@)(?:localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: true } });
await client.connect();

try {
  const { rows: led } = await client
    .query(`SELECT filename FROM schema_migrations ORDER BY filename`)
    .catch(() => ({ rows: null }));
  console.log(led === null ? '\nLEDGER: absent' : `\nLEDGER: ${led.length} row(s)`);
  if (led?.length) console.log('  ' + led.map((r) => r.filename).join('\n  '));

  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log(`\nTABLES (${tables.length}):`);
  console.log('  ' + tables.map((t) => t.tablename).join(', '));

  // The load-bearing question, answered directly: for each table a migration is known to create,
  // is it here? This is what the declared assumption should have been derived from.
  const CREATED_BY = {
    '006': ['sources', 'sections'],
    '026': ['bookmarks'],
    '027': ['library_items'],
    '028': ['reading_progress'],
    '029': ['tags', 'annotation_tags'],
    '032': ['schema_migrations', 'api_rate_limit'],
    '039': ['plans', 'plan_days', 'verse_coverage', 'topical_entries'],
    '042': ['plan_day_readings'],
    '100': ['user_documents', 'user_sections', 'user_section_anchors', 'user_section_embeddings'],
    '104': ['auth_users', 'auth_sessions', 'auth_accounts', 'auth_verifications'],
    '105': ['user_document_readings'],
  };
  const have = new Set(tables.map((t) => t.tablename));
  console.log('\nPRESENCE BY MIGRATION:');
  for (const [n, names] of Object.entries(CREATED_BY)) {
    const missing = names.filter((t) => !have.has(t));
    console.log(`  ${n}: ${missing.length === 0 ? 'ALL PRESENT' : 'MISSING ' + missing.join(', ')}`);
  }
} finally {
  await client.end();
}
