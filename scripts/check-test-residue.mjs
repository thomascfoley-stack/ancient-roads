#!/usr/bin/env node
// GATE: no test- or probe-seeded rows survive in a database we care about.
//
// WHY THIS EXISTS — the class, not the instances. On 2026-07-19 three separate tests were found
// poisoning shared dev state, each patched individually, with NOTHING asserting the invariant:
//   1. The Phase-1 highlight tests leaked ~2 rows per full-suite run (teardown called
//      removeHighlightById, which SOFT-deletes); 45 rows had silently accumulated.
//   2. library-published-boundary stranded PUBLISHED qa sources with a disallowed license and
//      turned Gate B red for the whole repo.
//   3. sections-unit-ordinal was safe only by accident — it seeds a disallowed license literal but
//      with status='staged', and Gate B only inspects PUBLISHED rows.
// Patching three instances does not stop the fourth. This is the guard.
//
// WHY IT WAS WIDENED (2026-07-28). The guard was DEV-ONLY: it exited 0 on sight of any non-dev
// endpoint. So when the prod census was read before the owner cleared prod user data, 5 of the 6
// "users" on PRODUCTION turned out to be `qa-hl-a-<epoch>` synthetic ids from the Phase-1 highlight
// suite — one soft-deleted row each. The residue class this script is named for had reached prod and
// this script was structurally incapable of seeing it, because the only endpoint it would look at was
// the one place the rows did not matter. A guard that refuses to look at the target it is protecting
// is not a guard. It now inspects dev by default AND an explicitly-declared second target on request.
//
// PLACEMENT: a gate in scripts/audit.sh that runs AFTER the test gates, deliberately NOT a test
// inside the suite. Tests legitimately hold qa- rows WHILE running, so an in-suite residue
// assertion would race its neighbours and fail at random. Running after the suite is race-free.
//
// READ-ONLY, ALWAYS. This script issues SELECT and nothing else. That is what makes it safe to
// point at production; it reports, it never cleans up. Fix the TEARDOWN, not the data.
//
//   node scripts/check-test-residue.mjs                      dev only (the audit.sh default)
//   CUTOVER_DATABASE_URL=<url> CUTOVER_EXPECT_HOST=ep-xxxx \
//     node scripts/check-test-residue.mjs                    dev + that declared target
//
// Exit 0 = clean (or visibly skipped). Exit 1 = residue survived.

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { hostOf, isDevHost, declaredMatches, endpointId } from './lib/target-guard.mjs';
import { USER_TABLES as G1_USER_TABLES } from './lib/user-data-invariant.mjs';

// Derived from USER_TABLE_SPEC — one list, not two (work-order v2 Stage 1.8).
const USER_TABLES = G1_USER_TABLES;

// NEVER let a malformed connection string reach an unhandled throw. `new URL()` rejects
// e.g. an unencoded character in a password, and Node's ERR_INVALID_URL error object carries
// `input:` — the ENTIRE connection string, credentials and all — which then prints to stderr
// inside `npm run audit`. CLAUDE.md: never print a secret value. scripts/cutover.mjs:124
// already wraps this call for exactly this reason; these call sites did not.
const safeHost = (url, what) => {
  try { return hostOf(url); }
  catch { throw new Error(`${what} is not a parseable connection string (value withheld — it may contain a password)`); }
};

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const ENV = 'web/.env.local';
function localEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(ENV)) return undefined;
  return readFileSync(ENV, 'utf8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

// Every table a test or a cutover probe seeds user-scoped rows into. Derived from
// USER_TABLE_SPEC via user-data-invariant.mjs — do not hand-maintain a second list.

// Seeded rows are prefixed so they are identifiable. Keep in sync with the suites AND with every
// script that writes a probe row.
//   qa- / qa_ / rls- / rls2-   the test suites. `qa-` is what covers the qa-hl-a-<epoch> class that
//                              reached prod — it is not a separate entry because `qa-` already
//                              matches it, and a redundant pattern would imply the old list missed
//                              it on the prefix. It did not; it missed it on the ENDPOINT.
//   __cutover_probe__          cutover-regression-gate.mts G4's annotation round-trip probe
//   __cutover_e6_probe__       the E6 constraint negative controls
//   __redproof__               cutover-gate-redproof.mjs seeded defects
const TEST_PREFIXES = ['qa-', 'qa_', 'rls-', 'rls2-', '__cutover_probe__', '__cutover_e6_probe__', '__redproof__'];

// LIKE treats `_` and `%` as wildcards. Every prefix above containing `_` was previously passed
// UNESCAPED, so `qa_%` silently matched `qa-anything` as well — the list was looser than it read,
// which is luck, not design. Escape, and declare the escape character on every query.
const escLike = (s) => s.replace(/([\\%_])/g, '\\$1');
const PATTERNS = TEST_PREFIXES.map((p) => `${escLike(p)}%`);
const orLike = (col) => PATTERNS.map((_, i) => `${col} LIKE $${i + 1} ESCAPE '\\'`).join(' OR ');

async function tableExists(client, table) {
  const { rows } = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [table]);
  return rows[0].ok;
}

/**
 * Inspect one target. Returns { problems, checkedTables, skippedTables }.
 * Throws only on a connection/permission failure — which must be loud, not a green.
 */
async function inspect(url, label) {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const problems = [];
  const checked = [];
  const skipped = [];
  try {
    // 1. user-scoped residue
    for (const table of USER_TABLES) {
      if (!(await tableExists(client, table))) { skipped.push(table); continue; }
      checked.push(table);
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${orLike('user_id')}`, PATTERNS);
      const n = rows[0].n;
      if (n > 0) problems.push(`${label} ${table}: ${n} seeded row(s) survived (user_id matching ${TEST_PREFIXES.join(' / ')})`);
    }

    // 2. test-seeded sources — a PUBLISHED one additionally fails Gate B repo-wide, so it is called
    //    out separately from the general "a fixture survived" case.
    if (await tableExists(client, 'sources')) {
      checked.push('sources');
      const pub = await client.query(
        `SELECT id, slug, license FROM sources WHERE status = 'published' AND (${orLike('slug')}) ORDER BY id`, PATTERNS);
      for (const r of pub.rows) {
        problems.push(`${label} sources: test fixture ${r.id} (${r.slug}) left status='published' [license="${r.license}"] — this ALSO fails Gate B for the whole repo`);
      }
      const any = await client.query(
        `SELECT id, slug, status FROM sources WHERE (${orLike('slug')}) AND status <> 'published' ORDER BY id`, PATTERNS);
      for (const r of any.rows) {
        problems.push(`${label} sources: test fixture ${r.id} (${r.slug}) survived with status='${r.status}'`);
      }
    } else skipped.push('sources');
  } finally {
    await client.end();
  }
  // NON-VACUITY. A target where none of these tables exists yields "0 problems" for the same reason
  // an unplugged instrument reads zero. That must not print as clean.
  if (checked.length === 0) {
    console.log(`⚠ ${label} SKIPPED (visibly): none of the ${USER_TABLES.length + 1} inspected tables exist on this target (pre-016 schema?). Nothing was checked.`);
    return { problems, checked, skipped, vacuous: true };
  }
  return { problems, checked, skipped, vacuous: false };
}

// ── target selection ─────────────────────────────────────────────────────────
// `problems` is declared here, ahead of selection, because a bad SECOND target must be
// recorded as a problem rather than aborting — exiting during selection threw away the dev
// result, which is the check this gate exists for.
const problems = [];
const targets = [];

// (a) dev — the historical behaviour, unchanged.
const devUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!devUrl) {
  console.log('⚠ SKIPPED (visibly): no owner DATABASE_URL — cannot check dev for test residue.');
} else {
  let devHost;
  try { devHost = safeHost(devUrl, 'DATABASE_URL'); }
  catch (e) { console.log(`⚠ SKIPPED (visibly): ${e.message}`); devHost = null; }
  if (devHost === null) { /* already reported */ }
  else if (!isDevHost(devUrl) && !/localhost|127\.0\.0\.1/.test(devUrl)) {
    console.log(`⚠ SKIPPED (visibly): DATABASE_URL is ${devHost}, not the dev endpoint. Declare a second target with CUTOVER_DATABASE_URL if you meant to inspect it.`);
  } else {
    targets.push({ url: devUrl, label: 'dev' });
  }
}

// (b) the declared second target (the cutover's). Read-only, and it must be named EXACTLY —
// for the same reason the cutover itself demands CUTOVER_EXPECT_HOST: an operator must state
// which database they believe they are touching.
//
// INSPECTING IT IS OPT-IN ON *BOTH* VARIABLES, and that is a deliberate correction. The first
// version of this treated a bare CUTOVER_DATABASE_URL as "inspect this too", and hard-failed
// when CUTOVER_EXPECT_HOST was absent. But `.env.prod` ships CUTOVER_DATABASE_URL and NOT
// CUTOVER_EXPECT_HOST, and the documented cutover workflow is
// `set -a && source .env.prod && set +a && node scripts/cutover.mjs --preflight` — so any
// `npm run audit` run in that same shell went red for a reason that had nothing to do with the
// code, at the exact moment an operator most needs a trustworthy green. An ambient env var
// must never decide the colour of the audit. Missing declaration => VISIBLE SKIP, never a
// failure; an explicitly declared target that is wrong or unreachable still fails, because at
// that point the operator has asked for it by name.
const cutUrl = process.env.CUTOVER_DATABASE_URL;
const declared = process.env.CUTOVER_EXPECT_HOST;
if (cutUrl && !declared) {
  console.log('⚠ SKIPPED (visibly): CUTOVER_DATABASE_URL is set but CUTOVER_EXPECT_HOST is not, so no second target was inspected. Set BOTH to check the cutover target (this is the .env.prod case — .env.prod carries the URL only).');
} else if (cutUrl && declared) {
  let cutHost;
  try { cutHost = safeHost(cutUrl, 'CUTOVER_DATABASE_URL'); }
  catch (e) { problems.push(`target selection: ${e.message}`); cutHost = null; }
  if (cutHost === null) { /* already recorded */ }
  else if (!declaredMatches(cutUrl, declared)) {
    // Not an exit: recorded as a problem so the dev result below is still reported. Aborting
    // here threw away the check this gate exists for in order to complain about the other one.
    problems.push(`target selection: CUTOVER_DATABASE_URL host ${cutHost} is not the declared endpoint '${declared}' (it must name the endpoint id exactly) — that target was NOT inspected`);
    // Dedupe on the ENDPOINT ID, not the raw host: ep-x-pooler.… and ep-x.… are the same
    // database behind two hostnames, and comparing raw hosts inspected it twice and
    // double-counted every problem it found.
  } else if (!targets.some((t) => endpointId(safeHost(t.url, 'target')) === endpointId(cutHost))) {
    targets.push({ url: cutUrl, label: cutHost.split('.')[0] });
  }
}

if (targets.length === 0) {
  console.log('⚠ SKIPPED (visibly): no target to inspect.');
  process.exit(0);
}

let anyReal = false;
for (const t of targets) {
  let r;
  try { r = await inspect(t.url, t.label); }
  catch (e) {
    // A target we were TOLD to inspect and could not reach is a failure, not a skip (the
    // dev-only version could only ever skip, which is why it never reported anything about
    // prod). Recorded rather than exited, so the OTHER target's result still gets reported.
    problems.push(`${t.label}: could not inspect: ${e.message}`);
    continue;
  }
  problems.push(...r.problems);
  if (!r.vacuous) {
    anyReal = true;
    const skipNote = r.skipped.length ? ` (${r.skipped.length} table(s) absent on this target: ${r.skipped.join(', ')})` : '';
    // Printed on BOTH branches. It used to print only when clean — i.e. it withheld "here is
    // what I did not look at" from precisely the run that found something.
    if (r.problems.length === 0) console.log(`✓ ${t.label} is clean — no seeded residue in ${r.checked.length} table(s)${skipNote}.`);
    else console.error(`✗ ${t.label}: ${r.problems.length} problem(s) across ${r.checked.length} table(s)${skipNote}.`);
  }
}

if (problems.length === 0) {
  if (!anyReal) console.log('⚠ nothing was actually checked on any target — treat this as UNVERIFIED, not clean.');
  process.exit(0);
}

console.error(`✗ SEEDED RESIDUE SURVIVED (${problems.length} problem(s)):`);
for (const p of problems) console.error(`  - ${p}`);
console.error('');
console.error('  A test or a cutover probe seeded shared state and did not clean it up. Fix the TEARDOWN,');
console.error('  not this gate — and never by deleting rows from a live target by hand.');
console.error('  Teardown must HARD-delete (removeHighlightById and friends only SOFT-delete), run each');
console.error('  step independently so one failure cannot skip the rest, and sweep by prefix so it also');
console.error('  reaps rows stranded by an earlier interrupted run.');
process.exit(1);
