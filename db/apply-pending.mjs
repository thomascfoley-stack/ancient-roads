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

  // THE INVERSE OF FORGET: record a migration as applied WITHOUT running it.
  //
  // Needed because forget + stop-on-failure can leave the ledger under-claiming. On 2026-08-08 a
  // forget list deleted rows for 039, 042, 044 and 045; 039 then failed with
  // `relation "plans" already exists` (it HAD been applied by an earlier run), the runner stopped
  // as designed, and the remaining three never re-ran — so four rows were gone while two of the
  // objects existed. Forgetting is only safe if there is a way to un-forget.
  //
  // Same posture as the bootstrap: the caller asserts, the runner records and prints. It never
  // infers "already applied" from a failure, because a DDL file that fails halfway is exactly the
  // case where that inference is wrong.
  const markApplied = (process.env.APPLY_PENDING_MARK_APPLIED ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (markApplied.length && rows !== null) {
    const names = files.filter((f) => markApplied.includes(String(Number(f.match(/^\d+/)[0]))));
    const already = new Set(rows.map((r) => r.filename));
    const toMark = names.filter((f) => !already.has(f));
    for (const f of toMark) {
      await recordMigration(client, path.join(DIR, f), readFileSync(path.join(DIR, f), 'utf-8'));
    }
    if (toMark.length) {
      console.warn(`  ⚠ marked ${toMark.length} as applied WITHOUT running (caller's assertion): ${toMark.join(', ')}`);
      rows = [...rows, ...toMark.map((filename) => ({ filename }))];
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
    // A START LINE PER FILE, BEFORE THE WORK. The db-invariants CI job died at its 30-minute step
    // timeout on 2026-08-17 while applying 12 pending migrations, and the log could not say WHICH
    // ONE: the pending list prints up front and `✓ f` prints only after success, so a hang's last
    // line is the previous file's checkmark. Everyone then guesses (044's whole-table backfill and
    // 114's HNSW build are the plausible suspects — but plausible is not measured). With this line
    // the next timeout names its culprit in the last line of the log, which converts "raise the
    // timeout and hope" into "make THIS migration cheaper".
    const t0 = Date.now();
    console.log(`  ▶ applying ${f} …`);
    try {
      // CONCURRENTLY CANNOT RUN IN A TRANSACTION, AND `client.query(wholeFile)` IS ONE.
      //
      // A multi-statement simple query is wrapped in an implicit transaction by Postgres, so a file
      // containing `CREATE INDEX CONCURRENTLY` does not error cleanly — it WEDGES. Measured
      // 2026-08-08: migration 044 sat in a CI step for 35 minutes with no output and no failure,
      // and I read it as "a slow backfill on a big table" until I opened the file. Its own header
      // says, in as many words, "run via db/apply-migration-concurrent.mjs (splits on --SPLIT--;
      // single client)". Eleven migrations carry CONCURRENTLY; this runner would have wedged on any
      // of them.
      //
      // So: same split the concurrent runner uses, each part its own statement, no implicit
      // transaction spanning them. The cost is that a file which fails halfway is half-applied —
      // which is exactly why those files are written with IF NOT EXISTS and idempotent backfills,
      // as 044's header records.
      if (/CONCURRENTLY/i.test(text)) {
        const parts = text.split(/^--SPLIT--$/m).map((s) => s.trim()).filter(Boolean);
        for (const part of parts) await client.query(part);
      } else {
        await client.query(text); // simple protocol: one implicit transaction per file
      }
      await recordMigration(client, full, text);
      console.log(`  ✓ ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      // Stop at the first failure. Continuing would apply later migrations over a schema the
      // failed one was supposed to establish, which turns one clear error into an unrecoverable
      // mess.
      console.error(`  ✗ ${f} failed: ${e.message}`);
      await reportLockHolders(client, e);
      console.error('  Stopped. Later migrations were NOT applied.');
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}

// WHO HELD THE LOCK. A lock timeout names the victim and never the culprit, and on this repo that
// difference is the whole diagnosis: `✗ 044 failed: canceling statement due to lock timeout` is
// the same line whether the branch needs FIVE MORE MINUTES or human intervention, and the two ask
// for opposite actions. 044 opens `SET lock_timeout='5s'` then ALTER TABLE embeddings — and
// `ADD COLUMN IF NOT EXISTS` still takes ACCESS EXCLUSIVE even when the column is already there,
// so ANY conflicting lock kills it in five seconds. The likeliest holder is a long
// `CREATE INDEX CONCURRENTLY` from an out-of-band apply or a previous run whose step GitHub killed
// while the server-side build carried on.
//
// So on failure, say who was busy. Strictly READ-ONLY (pg_stat_activity / pg_locks), and
// FAIL-SOFT: a diagnostic that throws would replace the real error with its own, which is worse
// than no diagnostic. The original message is already printed before this runs.
async function reportLockHolders(client, err) {
  const isLock = /lock timeout|deadlock|could not obtain lock/i.test(err?.message ?? '');
  try {
    // THE CONNECTION IS USUALLY UNUSABLE HERE, which made the first version of this useless in the
    // commonest case. A multi-statement file runs in an implicit transaction, so a failure inside
    // one leaves the session in "current transaction is aborted, commands ignored until end of
    // transaction block" — and the diagnostic query is a command, so it was ignored and reported
    // itself unavailable. Observed 2026-08-18 on 110_studies.sql. ROLLBACK first; it is harmless
    // when there is no open transaction, and it is the only thing that makes the session answer.
    await client.query('ROLLBACK').catch(() => {});
    const { rows } = await client.query(
      `SELECT pid, state, wait_event_type, wait_event,
              date_trunc('second', now() - query_start)::text AS age,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 140) AS q
         FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
        ORDER BY query_start NULLS LAST
        LIMIT 10`,
    );
    if (!rows.length) {
      console.error(
        isLock
          ? '  ⓘ no other non-idle backend on this database — the blocker finished between the failure and this query, or holds the lock from an idle-in-transaction session.'
          : '  ⓘ no other non-idle backend on this database.',
      );
      return;
    }
    console.error(`  ⓘ ${rows.length} other non-idle backend(s) on this database:`);
    for (const r of rows) {
      console.error(`     pid ${r.pid}  ${r.state}  age ${r.age}  ${r.wait_event_type ?? '-'}/${r.wait_event ?? '-'}`);
      console.error(`       ${r.q}`);
    }
    if (isLock) {
      console.error(
        '  → A CREATE INDEX CONCURRENTLY above with a long age is the expected culprit: it holds\n' +
        '    ShareUpdateExclusive, which conflicts with the ACCESS EXCLUSIVE this migration needs.\n' +
        '    If it is still progressing, WAIT for it. If it is orphaned, it must be terminated on\n' +
        '    the target before this job can pass.',
      );
    }
  } catch (e2) {
    // Deliberately swallowed: see FAIL-SOFT above.
    console.error(`  ⓘ lock-holder diagnostic unavailable (${e2.message})`);
  }
}
