// APPLY EVERY MIGRATION THE TARGET HAS NOT SEEN, IN NUMERIC ORDER.
//
// THE DEFECT THIS CLOSES. The `db-invariants` CI job resolves a database URL and runs the suite.
// It never applies migrations. So a migration applied to prod and dev is simply absent on the CI
// branch until a human remembers to apply it by hand — and nothing says so, because the failure
// surfaces as ordinary test failures against a schema that looks wrong.
//
// Measured 2026-08-07: `main` had failed 12 consecutive runs, continuously since 2026-08-05 — the
// day migration 104 (the Better Auth schema) landed. Four tests were failing with
// `relation "auth_users" does not exist`. Three days of red, on a repo whose rule is "nothing
// merges red", because the gate could not see the schema it was testing against.
//
// This is the same shape as the outage found the same evening (039 citing a stale comment about
// grants): a step everyone assumed was happening, that nothing performed and nothing checked.
//
// WHY A NEW RUNNER RATHER THAN A LOOP OVER apply-migration.mjs. Deciding which files are pending
// needs the ledger, which needs a connection — so the loop would need the query anyway. Doing it
// in one place keeps "pending" defined once.
//
// SAFETY. Same target guard as apply-migration.mjs: refuses anything that is not localhost, a known
// dev endpoint, or an endpoint declared BY EXACT ID in MIGRATE_TARGET_ENDPOINT. Production is
// refused by `isAuditAllowedHost` regardless of what is declared, and this runner deliberately does
// NOT offer apply-migration.mjs's MIGRATE_ALLOW_PROD escape hatch: applying an unknown set of
// pending migrations unattended is exactly the operation that should never reach production.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { recordMigration } from './lib/record-migration.mjs';
import { isAuditAllowedHost } from '../scripts/lib/target-guard.mjs';

const DIR = path.join(import.meta.dirname, 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is required (the owner connection for the target).');
  process.exit(1);
}

// No MIGRATE_ALLOW_PROD here, on purpose — see the header.
let allowed = false;
try {
  allowed = isAuditAllowedHost(url, process.env.MIGRATE_TARGET_ENDPOINT);
} catch {
  allowed = false; // unparseable target is a refusal, not a pass
}
if (!allowed) {
  console.error(
    '✗ REFUSE: DATABASE_URL is not localhost, not a known dev endpoint, and not declared.\n' +
      '  Declare the target by its exact endpoint id: MIGRATE_TARGET_ENDPOINT=ep-xxxx-yyyy-zzzz\n' +
      '  This runner has no production escape hatch by design.',
  );
  process.exit(1);
}

// TLS: verified for remote targets, absent for local ones.
//
// NOT `rejectUnauthorized: false`. That is what apply-migration.mjs does and it is pre-deploy audit
// finding 14 — arbitrary DDL as owner over an unauthenticated channel, while this repo's read-only
// census tooling (`scripts/publish-flip.mjs`) correctly verifies. Copying the weaker pattern into a
// new file would have made the finding harder to close, not easier.
//
// And localhost gets no SSL at all: a stock `initdb` server does not speak it, so the previous
// unconditional `ssl` block made this runner unable to reach the one target class the guard
// explicitly allows. Found by running it, not by reading it.
const isLocal = /(?:^|@)(?:localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: true },
});
await client.connect();

try {
  // Numeric order, not lexicographic: `100_x.sql` must follow `099_x.sql`, and a plain sort puts it
  // before `011_x.sql`.
  const files = readdirSync(DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => Number(a.match(/^\d+/)[0]) - Number(b.match(/^\d+/)[0]));

  let { rows } = await client.query(
    `SELECT filename FROM schema_migrations`,
  ).catch(() => ({ rows: null }));

  // ONE-SHOT LEDGER CORRECTION. A bootstrap assumption can be wrong, and when it is, the wrong rows
  // persist and the missing migrations are skipped forever. That happened on 2026-08-08: the CI
  // branch was declared "applied through 103" on the evidence that its suite was green apart from
  // auth, and 105 then failed with `relation "user_documents" does not exist` — migrations 100..103
  // are Lane B's and had only ever been applied to `lane-b-uploader`.
  //
  // So the ledger needs to be able to forget a claim it should not have made. Comma-separated
  // numbers; deletes only those rows, logs what it removed, and is a no-op once they are gone.
  const forget = (process.env.APPLY_PENDING_FORGET ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (forget.length && rows !== null) {
    const names = files.filter((f) => forget.includes(String(Number(f.match(/^\d+/)[0]))));
    if (names.length) {
      const { rowCount } = await client.query(
        `DELETE FROM schema_migrations WHERE filename = ANY($1::text[])`,
        [names],
      );
      console.warn(`  ⚠ forgot ${rowCount} ledger row(s) so they re-apply: ${names.join(', ')}`);
      rows = rows.filter((r) => !names.includes(r.filename));
    }
  }

  let applied;
  if (rows === null) {
    // No ledger on this target. Replaying 001 onward against a populated database is destructive,
    // so we cannot simply proceed — but refusing outright leaves a target permanently unusable,
    // which is where the CI branch was: no ledger, so no migration had ever been recorded there,
    // so nothing could compute "pending".
    //
    // The escape is an EXPLICIT, DECLARED ASSUMPTION rather than a guess. The caller states the
    // highest migration number it believes is already applied; this records 001..N as applied
    // WITHOUT running them, and applies N+1 onward normally. The assumption is the caller's and it
    // is printed, so a wrong one is visible in the log rather than silent.
    const through = Number(process.env.APPLY_PENDING_ASSUME_APPLIED_THROUGH);
    if (!Number.isInteger(through) || through < 0) {
      console.error(
        '✗ REFUSE: this target has no schema_migrations table, so "pending" cannot be computed.\n' +
          '  Replaying from 001 against a populated database is destructive, so this is not a guess\n' +
          '  the runner will make.\n' +
          '  If you know the target is already migrated through N, say so explicitly:\n' +
          '    APPLY_PENDING_ASSUME_APPLIED_THROUGH=N node db/apply-pending.mjs\n' +
          '  That records 001..N as applied WITHOUT running them, then applies N+1 onward.',
      );
      process.exit(1);
    }
    console.warn(
      `  ⚠ no ledger on this target. BOOTSTRAPPING on the caller's declared assumption that\n` +
        `    migrations 001..${String(through).padStart(3, '0')} are ALREADY APPLIED. They will be recorded, not run.\n` +
        `    If that is wrong, the missing ones stay missing and their tests will say so.`,
    );
    const assumed = files.filter((f) => Number(f.match(/^\d+/)[0]) <= through);
    for (const f of assumed) {
      await recordMigration(client, path.join(DIR, f), readFileSync(path.join(DIR, f), 'utf-8'));
    }
    console.log(`  ✓ recorded ${assumed.length} migration(s) as pre-applied`);
    applied = new Set(assumed);
  } else {
    applied = new Set(rows.map((r) => r.filename));
  }
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`✓ up to date — ${applied.size} migration(s) already recorded on this target`);
    process.exit(0);
  }

  console.log(`▶ ${pending.length} pending: ${pending.join(', ')}`);
  for (const f of pending) {
    const full = path.join(DIR, f);
    const text = readFileSync(full, 'utf-8');
    try {
      await client.query(text); // simple protocol: one implicit transaction per file
      await recordMigration(client, full, text);
      console.log(`  ✓ ${f}`);
    } catch (e) {
      // Stop at the first failure. Continuing would apply later migrations over a schema the
      // failed one was supposed to establish, which turns one clear error into an unrecoverable
      // mess.
      console.error(`  ✗ ${f} failed: ${e.message}`);
      console.error('  Stopped. Later migrations were NOT applied.');
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}
