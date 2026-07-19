#!/usr/bin/env node
// GATE: the dev database must be CLEAN after a test run.
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
// PLACEMENT: a gate in scripts/audit.sh that runs AFTER the test gates, deliberately NOT a test
// inside the suite. Tests legitimately hold qa- rows WHILE running, so an in-suite residue
// assertion would race its neighbours and fail at random. Running after the suite is race-free.
//
// DEV-GUARDED: only ever inspects the dev endpoint. If no dev owner URL is available it says so
// VISIBLY and exits 0 — a skip you can see, never a silent green (that is the failure mode the
// verse-keys guard was fixed for).
//
//   node scripts/check-test-residue.mjs
// Exit 0 = clean (or visibly skipped). Exit 1 = residue survived a test run.

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const ENV = 'web/.env.local';
function localEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(ENV)) return undefined;
  return readFileSync(ENV, 'utf8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
if (!url) {
  console.log('⚠ SKIPPED (visibly): no owner DATABASE_URL — cannot check dev for test residue.');
  process.exit(0);
}
if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url)) {
  console.log('⚠ SKIPPED (visibly): DATABASE_URL is not the dev endpoint; this gate only inspects dev.');
  process.exit(0);
}

// Every table a test seeds user-scoped rows into. Add here when a new user table appears.
const USER_TABLES = ['highlights', 'notes', 'bookmarks', 'library_items', 'reading_progress', 'tags', 'annotation_tags'];
// Test-seeded rows are prefixed so they are identifiable. Keep in sync with the suites.
const TEST_PREFIXES = ['qa-%', 'qa_%', 'rls-%', 'rls2-%'];

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const problems = [];
try {
  // 1. user-scoped residue
  for (const table of USER_TABLES) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${TEST_PREFIXES.map((_, i) => `user_id LIKE $${i + 1}`).join(' OR ')}`,
      TEST_PREFIXES,
    );
    const n = rows[0].n;
    if (n > 0) problems.push(`${table}: ${n} test-seeded row(s) survived (user_id matching ${TEST_PREFIXES.join(' / ')})`);
  }

  // 2. test-seeded sources — a PUBLISHED one additionally fails Gate B repo-wide, so it is called
  //    out separately from the general "a fixture survived" case.
  const pub = await client.query(
    `SELECT id, slug, license FROM sources WHERE status = 'published' AND (${TEST_PREFIXES.map((_, i) => `slug LIKE $${i + 1}`).join(' OR ')}) ORDER BY id`,
    TEST_PREFIXES,
  );
  for (const r of pub.rows) {
    problems.push(`sources: test fixture ${r.id} (${r.slug}) left status='published' [license="${r.license}"] — this ALSO fails Gate B for the whole repo`);
  }
  const any = await client.query(
    `SELECT id, slug, status FROM sources WHERE (${TEST_PREFIXES.map((_, i) => `slug LIKE $${i + 1}`).join(' OR ')}) AND status <> 'published' ORDER BY id`,
    TEST_PREFIXES,
  );
  for (const r of any.rows) {
    problems.push(`sources: test fixture ${r.id} (${r.slug}) survived with status='${r.status}'`);
  }
} finally {
  await client.end();
}

if (problems.length === 0) {
  console.log(`✓ dev is clean — no test-seeded residue in ${USER_TABLES.length} user tables or sources.`);
  process.exit(0);
}

console.error(`✗ TEST RESIDUE SURVIVED A TEST RUN (${problems.length} problem(s)):`);
for (const p of problems) console.error(`  - ${p}`);
console.error('');
console.error('  A test seeded shared dev state and did not clean it up. Fix the TEARDOWN, not this gate.');
console.error('  Teardown must HARD-delete (removeHighlightById and friends only SOFT-delete), run each');
console.error('  step independently so one failure cannot skip the rest, and sweep by prefix so it also');
console.error('  reaps rows stranded by an earlier interrupted run.');
process.exit(1);
