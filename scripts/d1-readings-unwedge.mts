// D1 remediation — clear the readings_status the ingest drain used to write.
//
// THE DEFECT (fixed in code at commit "D1 (P1) un-wedge suggested readings"): when a document
// reached `ready`, the drain wrote readings_status='pending'. But 'pending' is ALSO what
// claimReadingsStart writes when a real job claims a document, so two writers meant opposite
// things by one word. The claim side refused for 10 minutes; the UI painted a fake 0% progress
// bar and hid the button behind `!running` — the only control that could have changed the status.
// Nothing auto-kicks, so every freshly-ingested document was wedged permanently.
//
// The code fix stops NEW documents entering that state. Rows already written are still wedged and
// need this one-time clear.
//
// SAFETY, because this touches user data:
//   * DRY RUN BY DEFAULT. --apply is required to write anything.
//   * The predicate matches the DRAIN's exact write shape — status 'pending', progress 0, step
//     NULL, error NULL — AND updated_at older than the 10-minute stale window. A genuinely
//     claimed run that is still live has a fresh updated_at and is NOT matched. A claimed run
//     that has progressed has a non-zero progress or a step and is NOT matched.
//   * It only ever sets readings_status to NULL, which is the "no search has been run" state the
//     UI already renders with its button. It deletes nothing and touches no other column.
//   * It prints the before/after counts and a sample so the operator can see what moved.
//   * IT REFUSES TO RUN UNDER RLS. `user_documents` has row security ENABLED AND FORCED, and
//     `user_documents_policy` is `user_id = current_setting('app.current_user_id', true)`. Run as
//     `app_runtime` with no user context, every query sees ZERO rows — so this script would have
//     printed "0 wedged", exited 0, and fixed nothing. A green run that repaired nothing is worse
//     than a failure. Measured on dev 2026-08-24: 3 seeded rows, 0 visible without context.
//     Use the OWNER (unpooled) connection: D1_DB_URL=$DATABASE_URL_UNPOOLED.
//
// USAGE
//   npx tsx scripts/d1-readings-unwedge.mts                 # dry run against $DATABASE_URL
//   npx tsx scripts/d1-readings-unwedge.mts --apply         # write
//   D1_DB_URL=... npx tsx scripts/d1-readings-unwedge.mts   # explicit target
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const STALE_MINUTES = 10; // READINGS_STALE_MS in web/src/lib/user-corpus/readings-state.ts

function dbUrl(): string {
  const fromEnv = process.env.D1_DB_URL ?? process.env.DATABASE_URL;
  if (fromEnv) return fromEnv.replace(/^"|"$/g, '');
  for (const f of ['.env.local', 'web/.env.local']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^(?:APP_DATABASE_URL|DATABASE_URL)=(.*)$/m);
    if (m?.[1]) return m[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('no database URL: set D1_DB_URL or DATABASE_URL');
}

// The wedged shape, stated once and used for both the count and the update so they cannot disagree.
const WEDGED = `readings_status = 'pending'
   AND COALESCE(readings_progress, 0) = 0
   AND readings_step IS NULL
   AND readings_error IS NULL
   AND updated_at < now() - interval '${STALE_MINUTES} minutes'`;

const db = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await db.connect();
async function main(): Promise<void> {
  const host = new URL(dbUrl().replace(/^postgres/, 'http')).host;
  console.log(`target: ${host}`);
  console.log(`mode:   ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);

  // RLS pre-flight. Without this the script's happy path is indistinguishable from its
  // silently-blind path: both print zero.
  const rls = await db.query(
    `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
            pg_get_userbyid(c.relowner) = current_user AS is_owner,
            (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
       FROM pg_class c WHERE c.oid = to_regclass('user_documents')`);
  const g = rls.rows[0];
  const rlsApplies = g.enabled && (g.forced || !g.is_owner) && !g.bypass && !g.is_owner;
  if (rlsApplies || (g.enabled && g.forced && !g.bypass && !g.is_owner)) {
    console.error(
      `\nREFUSING TO RUN. user_documents has row security enabled${g.forced ? ' and FORCED' : ''} and this ` +
      `connection is "${(await db.query('SELECT current_user u')).rows[0].u}", which it applies to. ` +
      `Every query would see zero rows and this script would report "0 wedged" having fixed nothing.\n` +
      `Re-run with the OWNER connection:  D1_DB_URL=$DATABASE_URL_UNPOOLED npx tsx scripts/d1-readings-unwedge.mts`);
    process.exitCode = 1;
    return;
  }

  const total = await db.query(`SELECT count(*)::int n FROM user_documents WHERE readings_status = 'pending'`);
  const wedged = await db.query(`SELECT count(*)::int n FROM user_documents WHERE ${WEDGED}`);
  console.log(`\npending rows:            ${total.rows[0].n}`);
  console.log(`of those, WEDGED:        ${wedged.rows[0].n}`);
  console.log(`left alone (live/partial): ${total.rows[0].n - wedged.rows[0].n}`);

  const sample = await db.query(
    `SELECT id, user_id, readings_status, readings_progress, updated_at
       FROM user_documents WHERE ${WEDGED} ORDER BY updated_at LIMIT 5`);
  if (sample.rows.length) {
    console.log('\nsample of what would be cleared:');
    for (const r of sample.rows) console.log(`  ${r.id}  updated_at=${r.updated_at.toISOString()}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to clear these.');
  } else if (wedged.rows[0].n === 0) {
    console.log('\nnothing to do.');
  } else {
    const res = await db.query(
      `UPDATE user_documents SET readings_status = NULL, updated_at = now() WHERE ${WEDGED} RETURNING id`);
    console.log(`\nCLEARED ${res.rowCount} row(s) to readings_status = NULL.`);
    const after = await db.query(`SELECT count(*)::int n FROM user_documents WHERE ${WEDGED}`);
    console.log(`remaining wedged: ${after.rows[0].n} (expected 0)`);
  }
}

try { await main(); } finally { await db.end(); }
