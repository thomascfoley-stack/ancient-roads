#!/usr/bin/env node
/**
 * PROVE MIGRATION 044 CHANGED THE MECHANISM AND NOT ONE ANSWER.
 *
 *   DATABASE_URL=<url> node scripts/verify-served-backfill.mjs                 # verify
 *   DATABASE_URL=<url> node scripts/verify-served-backfill.mjs --red-proof    # prove it can fail
 *
 * Migration 044 replaces four hand-typed serving filters with a materialized `embeddings.served`
 * boolean. Its safety claim is one sentence: THE SET OF ROWS THE PRODUCT SERVES IS IDENTICAL
 * BEFORE AND AFTER. This is the check that could fail.
 *
 * ── WHY THE EXPECTED SET IS FROZEN, NOT DERIVED (audit 2026-08-03, finding 1, CONFIRMED) ────
 * The first version of this tool parsed its expectation out of the LIVE routing.ts, on the
 * theory that a derived expectation cannot go stale. The same commit rewrote routing.ts's
 * LEGAL_CORPUS_FILTER to `(served)` — and every load-bearing check here silently went circular:
 * the equality check diffed `served` against `served`, the licensing-cohort check became
 * `served AND NOT (served)` (unsatisfiable), and the red-proof counted ANY failure as "held",
 * so the standing false-red from a third check masked the blindness. A verifier whose
 * expectation tracks the thing it verifies is not a verifier.
 *
 * The expectation now comes from scripts/lib/served-backfill-frozen.mjs — the frozen record of
 * the PRE-cutover filters. A sync test (test/invariants/served-backfill-frozen-sync.test.ts)
 * asserts migration 044 contains those predicates verbatim, so the migration and this tool's
 * expectation cannot drift apart, and neither can track the live code by construction.
 *
 * ── VALIDITY WINDOW ─────────────────────────────────────────────────────────────────────────
 * `served` equals the frozen record only from 044's backfill until the FIRST intentional serve
 * flip (e.g. serving the 76 published-but-unserved works). After that, the equality check is
 * EXPECTED to fail in the served-but-not-frozen direction — that is the flip working, not a
 * defect, and the failure message says so. Post-flip reconciliation (sources.status vs served
 * agreement) is a different instrument, filed in the cutover order.
 *
 * FOUR THINGS ARE ASSERTED:
 *   1. SET EQUALITY   both directions, reported separately: frozen-but-unserved rows are a
 *                     broken backfill; served-but-not-frozen rows are either a broken backfill
 *                     or a later intentional flip (the message distinguishes by date context).
 *   2. TIGHTENINGS    044's sermon/theology index predicates add a source_type conjunct the old
 *                     lane filters never had. Safe only if every row each frozen leg admits
 *                     already carries that type — otherwise rows silently leave the partial
 *                     index and the pool starves (the migration-009 mechanism). Asserted.
 *   3. LICENSING      zero served rows by a MUST_NOT_SERVE author. The list is imported from
 *                     scripts/lib/served-corpus-authors.mjs, which has its own byte-equality
 *                     sync test against the shipped legal-corpus.ts. Nothing is parsed.
 *   4. UNREACHABILITY the ~125k rows with no metadata->>'work' key that are OUTSIDE the frozen
 *                     author allowlist stay served=false. That cohort holds Tyndale / CS Lewis /
 *                     Origen; the publish flip addresses rows by slug, so nothing can ever flip
 *                     them. This is the licensing regression detector — it was the check that
 *                     could never fire in the first version.
 *
 * ── THE RED-PROOF (rewritten; the old one was satisfiable by an unrelated failure) ──────────
 * `--red-proof` flips ONE row that the frozen record says must be served, re-runs the checks,
 * and passes ONLY IF (a) the equality check failed with at least one frozen-but-unserved row,
 * AND (b) the seeded row id itself is flagged by the check's own predicate — queried directly,
 * by id. A red-proof that any stray failure could satisfy proves nothing (that is how the
 * original hid its own blindness). The row is restored in a finally block.
 *
 * READ-ONLY apart from --red-proof's single restored bit. Refuses production without
 * VERIFY_SERVED_ALLOW_PROD=1 (bylaw 7: owner's go, per occasion); --red-proof refuses
 * production unconditionally.
 */
import { Client } from 'pg';
import { FROZEN_LEGS, FROZEN_UNION, FROZEN_LEGAL_FILTER } from './lib/served-backfill-frozen.mjs';
import { MUST_NOT_SERVE, isMustNotServe } from './lib/served-corpus-authors.mjs';

const RED_PROOF = process.argv.includes('--red-proof');
const url = process.env.DATABASE_URL;

function die(msg, code = 1) { console.error(`\x1b[31m${msg}\x1b[0m`); process.exit(code); }
if (!url) die('set DATABASE_URL', 2);

const host = (/^[a-z+]+:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(url.trim())?.[1] ?? '').toLowerCase();
const isProd = host.includes('ep-odd-fog');
if (isProd && process.env.VERIFY_SERVED_ALLOW_PROD !== '1') {
  die(`REFUSING: ${host.split('.')[0]} is production. Bylaw 7 wants the owner's go per occasion.\n` +
      '       Re-run with VERIFY_SERVED_ALLOW_PROD=1 once the owner has given it.', 2);
}
if (isProd && RED_PROOF) die('REFUSING: --red-proof writes a row. Never against production.', 2);

let failures = 0;
let equalityMissing = 0;
const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m) => { console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`); failures++; };

const c = new Client({ connectionString: url });
await c.connect();
await c.query("SET statement_timeout='600s'");
console.log(`verify-served-backfill — ${host.split('.')[0]}${isProd ? '  \x1b[33m(PRODUCTION, owner-authorized)\x1b[0m' : ''}`);
console.log(`  expected set: the FROZEN pre-044 filters (scripts/lib/served-backfill-frozen.mjs), ${FROZEN_LEGS.length} legs\n`);

let restore = null;
try {
  const col = await c.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='embeddings' AND column_name='served'");
  if (col.rowCount === 0) die('embeddings.served does not exist — apply migration 044 first', 2);

  if (RED_PROOF) {
    // The victim MUST be a row the frozen record says is served — flipping any other row would
    // be invisible to the equality check by construction, and the old tool proved exactly that.
    const victim = await c.query(
      `SELECT id FROM embeddings WHERE user_id IS NULL AND served AND (${FROZEN_UNION}) ORDER BY id LIMIT 1`);
    if (victim.rowCount === 0) die('no frozen-served row to mutate — cannot red-proof (has 044 backfilled here?)', 2);
    restore = victim.rows[0].id;
    await c.query('UPDATE embeddings SET served = false WHERE id = $1', [restore]);
    console.log(`  \x1b[33mRED-PROOF\x1b[0m seeded: row ${restore} forced served=false; the equality check MUST name a frozen-but-unserved row\n`);
  }

  // ── 1. set equality, both directions ──────────────────────────────────────────────────────
  const eq = await c.query(`
    SELECT count(*) FILTER (WHERE frozen AND NOT served)::int AS missing,
           count(*) FILTER (WHERE served AND NOT frozen)::int AS extra,
           count(*) FILTER (WHERE frozen)::int                AS frozen_total,
           count(*) FILTER (WHERE served)::int                AS served_total
      FROM (SELECT served, coalesce((${FROZEN_UNION}), false) AS frozen FROM embeddings WHERE user_id IS NULL) t`);
  const { missing, extra, frozen_total, served_total } = eq.rows[0];
  equalityMissing = missing;
  if (missing === 0 && extra === 0) {
    ok(`served set is identical to the frozen pre-044 filters (${served_total} rows)`);
  } else {
    bad(`served set differs from the frozen record: ${missing} frozen-but-unserved (broken backfill), ` +
        `${extra} served-but-not-frozen (broken backfill OR a later intentional serve flip — ` +
        `if flips have run since 042, the 'extra' direction is expected; 'missing' never is). ` +
        `frozen=${frozen_total} served=${served_total}`);
    const ex = await c.query(`
      SELECT id, metadata->>'work' AS work, metadata->>'author' AS author, source_type, served
        FROM embeddings WHERE user_id IS NULL AND served <> coalesce((${FROZEN_UNION}), false) LIMIT 8`);
    for (const r of ex.rows) console.log(`          ${r.id}  served=${r.served}  ${r.source_type}  work=${r.work ?? '(none)'}  author=${r.author ?? '(none)'}`);
  }

  // ── 2. the tightenings 044's index predicates rely on ─────────────────────────────────────
  for (const leg of FROZEN_LEGS) {
    const r = await c.query(`
      SELECT count(*)::int n, coalesce(string_agg(DISTINCT source_type, ', '), '') AS types
        FROM embeddings WHERE user_id IS NULL AND (${leg.sql}) AND source_type <> ALL($1::text[])`,
      [leg.expectTypes]);
    if (r.rows[0].n === 0) ok(`${leg.name}: every admitted row is ${leg.expectTypes.join('/')} — the index conjunct is safe`);
    else bad(`${leg.name}: ${r.rows[0].n} row(s) carry source_type ${r.rows[0].types}, outside ${leg.expectTypes.join('/')} — 044's index predicate silently drops them from the partial index`);
  }

  // ── 3. licensing: no served row by a must-not-serve author ────────────────────────────────
  const authors = await c.query(`
    SELECT metadata->>'author' AS author, count(*)::int n FROM embeddings
     WHERE user_id IS NULL AND served GROUP BY 1`);
  const bannedServed = authors.rows.filter((r) => isMustNotServe(r.author ?? ''));
  if (bannedServed.length === 0) ok(`no served row belongs to any of the ${MUST_NOT_SERVE.length} MUST_NOT_SERVE authors`);
  else for (const r of bannedServed) bad(`MUST_NOT_SERVE author is SERVED: ${r.author} (${r.n} rows)`);

  // ── 4. the work-less cohort stays unreachable ─────────────────────────────────────────────
  const orphan = await c.query(`
    SELECT count(*)::int total,
           count(*) FILTER (WHERE served)::int served_n,
           count(*) FILTER (WHERE served AND NOT coalesce((${FROZEN_LEGAL_FILTER}), false))::int served_outside_allowlist
      FROM embeddings WHERE user_id IS NULL AND metadata->>'work' IS NULL`);
  const { total, served_n, served_outside_allowlist } = orphan.rows[0];
  if (served_outside_allowlist === 0) {
    ok(`${total} work-less rows: ${served_n} served, ALL inside the frozen author allowlist; the rest are unreachable (the flip addresses rows by slug)`);
  } else {
    bad(`${served_outside_allowlist} work-less row(s) served OUTSIDE the frozen allowlist — this cohort holds the copyrighted authors. LICENSING REGRESSION.`);
  }
} finally {
  if (restore) {
    await c.query('UPDATE embeddings SET served = true WHERE id = $1', [restore]);
    console.log(`\n  \x1b[33mRED-PROOF\x1b[0m restored row ${restore} to served=true`);
  }
  if (!RED_PROOF) await c.end();
}

if (RED_PROOF) {
  // The seeded bit must have been VISIBLE TO THE CHECK'S OWN PREDICATE — queried by id, not
  // inferred from "something failed". (The row is already restored; this re-derives what the
  // equality check saw: a frozen row is exactly one the check counts as missing when unserved.)
  const seen = await c.query(
    `SELECT (${FROZEN_UNION}) AS frozen FROM embeddings WHERE id = $1 AND user_id IS NULL`, [restore]);
  await c.end();
  const frozenRow = seen.rows[0]?.frozen === true;
  if (equalityMissing >= 1 && frozenRow) {
    console.log(`\n\x1b[32mRED-PROOF HELD\x1b[0m — the equality check reported ${equalityMissing} frozen-but-unserved row(s) and the seeded row is provably one of them.`);
    process.exit(0);
  }
  die(`\nRED-PROOF DID NOT FIRE — equalityMissing=${equalityMissing}, seeded-row-in-frozen-set=${frozenRow}. ` +
      'A forced-unserved frozen row was not named by the equality check. This verifier proves nothing; do not gate on it.');
}
if (failures > 0) die(`\n${failures} check(s) FAILED — see above. 'missing' failures mean 042 is NOT behaviour-preserving here.`);
console.log('\n\x1b[32mOK\x1b[0m — served set is exactly the frozen pre-044 filters; tightenings safe; no banned author served; work-less cohort unreachable.');
