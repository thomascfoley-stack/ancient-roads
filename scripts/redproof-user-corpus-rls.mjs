#!/usr/bin/env node
// TWO-ACCOUNT RLS PROOF for the user-corpus tables (Slice 1, gate B5).
//
// CLAUDE.md: "RLS is the data-isolation boundary. Verify it with two accounts, not by reading
// policy." The Slice 1 order adds: not through the owner URL either — neondb_owner carries
// rolbypassrls=true on this branch, so an owner-connection isolation test is an unearned green
// (THE_LOOP §6). This runs every assertion over app_runtime.
//
// THE VACUITY TRAP THIS AVOIDS. "User B sees 0 rows of user A's data" is also what you get when
// user A has no data. A test that cannot tell those apart proves nothing. So leg 0 opens a
// SECOND connection as the owner and confirms the rows are really there and really visible to
// someone — the 0 that B sees is then RLS, not emptiness. If the owner connection is absent the
// script ABORTS rather than skipping the anti-vacuity leg and reporting the rest as green.
//
// THE TABLE LIST IS DERIVED, NOT TYPED (uploader deep dive 2026-08-20, finding D6). The old
// hand-typed four-table array silently missed user_document_readings (migration 105) for the
// life of that table — while user-data-invariant.mjs excluded it on the stated grounds that
// this suite covers it. Derivation: information_schema, schema public, BASE TABLEs named
// 'user\_%' that carry a user_id column — the 100-block's own naming convention. WHY THIS
// DERIVATION AND NOT "tables with an app.current_user_id policy": a policy-based derivation
// delists a table at the exact moment its policy is dropped — the derivation source would be
// the property under test, which is the watchlist's instance-fourteen shape (MASTER.md). The
// name+column derivation is independent of every property this script asserts: a table that
// loses RLS, its policy, or its FORCE stays IN the list and its precondition leg goes RED.
// Two welds keep the derivation honest:
//   * a FLOOR (>= 5): an empty or narrowed derivation aborts loudly instead of proving
//     isolation over nothing;
//   * a SEED WELD: leg 1's per-table seed map must cover EXACTLY the derived set — a new
//     user_* table with no seed leg ABORTS the run ("extend the seed map") rather than being
//     silently skipped by the write-path legs.
//
// Mirrors the app's real mechanism: web/src/lib/db.ts runAsUser sets app.current_user_id with
// set_config(..., true) — TRANSACTION-local, because the pooler pools in transaction mode and a
// session-level SET would leak the identity to whoever gets that backend next. This script does
// the same inside explicit BEGIN/COMMIT, so it exercises the path the product actually takes.
//
//   DATABASE_URL_APP="$(cat ~/.neon_lane_b_url)" \
//   DATABASE_URL_OWNER="$(cat ~/.neon_lane_b_owner_url)" \
//     node scripts/redproof-user-corpus-rls.mjs [--keep]
//
// Exit 0 = every leg passed. Exit 1 = a leg failed, and the message says which.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const APP_URL = process.env.DATABASE_URL_APP;
const OWNER_URL = process.env.DATABASE_URL_OWNER;
const KEEP = process.argv.includes('--keep');

if (!APP_URL || !OWNER_URL) {
  console.error('✗ ABORT: DATABASE_URL_APP and DATABASE_URL_OWNER are both required.');
  console.error('  The owner connection is not optional — it is the anti-vacuity leg.');
  process.exit(1);
}

const RUN = `rlsprobe-${Date.now().toString(36)}`;
const USER_A = `${RUN}-A`;
const USER_B = `${RUN}-B`;
const VEC = `[${Array(1024).fill('0.01').join(',')}]`;

const pass = [];
const fail = [];
const ok = (label, detail) => { pass.push(label); console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); };
const bad = (label, detail) => { fail.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); };
const check = (cond, label, detail) => (cond ? ok(label, detail) : bad(label, detail));

// sslmode=disable in the URL is respected (a throwaway local Postgres has no SSL); anything
// else keeps the Neon posture: TLS on, chain unverified (same as every runner script here).
const sslFor = (url) => (/[?&]sslmode=disable\b/.test(url) ? false : { rejectUnauthorized: false });
const app = new Client({ connectionString: APP_URL, ssl: sslFor(APP_URL) });
const owner = new Client({ connectionString: OWNER_URL, ssl: sslFor(OWNER_URL) });
await app.connect();
await owner.connect();

/** Run queries with app.current_user_id bound transaction-locally, exactly as runAsUser does. */
async function asUser(userId, fn) {
  await app.query('BEGIN');
  try {
    await app.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const out = await fn();
    await app.query('COMMIT');
    return out;
  } catch (e) {
    await app.query('ROLLBACK');
    throw e;
  }
}

/** Same, but the block is expected to throw; returns the error instead of propagating. */
async function asUserExpectingError(userId, fn) {
  await app.query('BEGIN');
  try {
    await app.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await fn();
    await app.query('ROLLBACK');
    return null;
  } catch (e) {
    await app.query('ROLLBACK');
    return e;
  }
}

// Populated in leg 0 by derivation (see header). Never hand-type a table name into this list.
let TABLES = [];
const TABLE_FLOOR = 5; // 100-block (4 tables) + 105 (user_document_readings)
let docA;

try {
  console.log(`two-account RLS proof over the user-corpus tables (run ${RUN})\n`);

  // ---- leg 0: preconditions. An unmet precondition reported as green is the whole failure mode.
  console.log('preconditions:');
  const who = await app.query('SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass');
  check(who.rows[0].u === 'app_runtime', 'app connection is app_runtime', `got ${who.rows[0].u}`);
  check(who.rows[0].bypass === false, 'app_runtime rolbypassrls = false', `got ${who.rows[0].bypass}`);
  const ownerWho = await owner.query('SELECT current_user AS u');
  check(ownerWho.rows[0].u === 'neondb_owner', 'owner connection is neondb_owner', `got ${ownerWho.rows[0].u}`);

  // Derive the table set (header: name+column, NOT policy — a dropped policy must not delist).
  const derived = await owner.query(
    `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND c.column_name = 'user_id' AND c.table_name LIKE 'user\\_%'
      ORDER BY c.table_name`,
  );
  TABLES = derived.rows.map((r) => r.table_name);
  console.log(`  derived table set: ${TABLES.join(', ')}`);
  check(TABLES.length >= TABLE_FLOOR,
    `derivation floor: >= ${TABLE_FLOOR} user tables derived`,
    `got ${TABLES.length} — an empty/narrowed derivation proves isolation over nothing`);

  for (const t of TABLES) {
    const r = await owner.query('SELECT relrowsecurity FROM pg_class WHERE relname = $1', [t]);
    check(r.rows[0]?.relrowsecurity === true, `${t}: RLS enabled`);
  }
  if (fail.length) throw new Error('preconditions failed — refusing to report the rest as green');

  // ---- leg 1: user A writes one row into EVERY derived table through app_runtime, under RLS.
  // THE SEED WELD (header): the map below is necessarily hand-written — each table has its own
  // shape — so it is welded to the derived set: a derived table with no seed, or a seed whose
  // table no longer derives, ABORTS the run. A new user_* table cannot be silently skipped.
  console.log('\nleg 1 — user A writes one row per table (through app_runtime, RLS active):');
  const seeded = [];
  docA = await asUser(USER_A, async () => {
    const d = await app.query(
      `INSERT INTO user_documents (user_id, title, doc_type, status) VALUES ($1,$2,'sermon','ready') RETURNING id`,
      [USER_A, `${RUN} A sermon`],
    );
    seeded.push('user_documents');
    const did = d.rows[0].id;
    const s = await app.query(
      `INSERT INTO user_sections (document_id, user_id, ordinal, body) VALUES ($1,$2,0,$3) RETURNING id`,
      [did, USER_A, 'A private paragraph belonging to user A.'],
    );
    seeded.push('user_sections');
    const sid = s.rows[0].id;
    await app.query(
      `INSERT INTO user_section_embeddings (section_id, user_id, model_slug, embedding) VALUES ($1,$2,'bge-large-en-v1.5',$3)`,
      [sid, USER_A, VEC],
    );
    seeded.push('user_section_embeddings');
    await app.query(
      `INSERT INTO user_section_anchors (section_id, user_id, verse_id_start, verse_id_end) VALUES ($1,$2,45008028,45008028)`,
      [sid, USER_A],
    );
    seeded.push('user_section_anchors');
    await app.query(
      `INSERT INTO user_document_readings (document_id, user_id, category, author, work, work_title, similarity)
       VALUES ($1,$2,'commentaries','Probe Author','probe-work','Probe Work',0.5)`,
      [did, USER_A],
    );
    seeded.push('user_document_readings');
    // The two tables the derivation FOUND that the hand-typed list never knew (2026-08-21, first
    // run against lane-b): user_integrations and user_library predate this script and had never
    // had a two-account proof. Seeds are conditional on existence — the 100-block dev branches
    // may not carry them — but where a table derives, the weld demands its seed.
    if (TABLES.includes('user_integrations')) {
      await app.query(
        `INSERT INTO user_integrations (user_id, provider, composio_account_id) VALUES ($1,'probe-provider',$2)`,
        [USER_A, `${RUN}-acct-A`],
      );
      seeded.push('user_integrations');
    }
    if (TABLES.includes('user_library')) {
      await app.query(
        `INSERT INTO user_library (user_id, title, file_type, storage_key) VALUES ($1,$2,'notes',$3)`,
        [USER_A, `${RUN} A library item`, `${RUN}-key-A`],
      );
      seeded.push('user_library');
    }
    return { did, sid };
  });
  ok(`A inserted one row into each of: ${seeded.join(', ')}`);

  const missingSeed = TABLES.filter((t) => !seeded.includes(t));
  const staleSeed = seeded.filter((t) => !TABLES.includes(t));
  if (missingSeed.length || staleSeed.length) {
    if (missingSeed.length) bad('seed weld: every derived table is seeded', `NO SEED for: ${missingSeed.join(', ')} — extend leg 1's seed map`);
    if (staleSeed.length) bad('seed weld: every seed targets a derived table', `stale seed for: ${staleSeed.join(', ')}`);
    throw new Error('seed weld failed — the write-path legs below would silently skip a table');
  }
  ok('seed weld: seed map covers exactly the derived table set');

  // ---- leg 2: THE ANTI-VACUITY LEG. The owner must see A's rows.
  // Without this, every "B sees 0" below is equally consistent with "nothing was ever written".
  console.log('\nleg 2 — anti-vacuity: the rows exist and are visible to someone:');
  for (const t of TABLES) {
    const r = await owner.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [USER_A]);
    check(r.rows[0].n === 1, `owner sees 1 row in ${t} for A`, `n=${r.rows[0].n}`);
  }

  // ---- leg 3: user B is blind to all of it.
  console.log('\nleg 3 — user B cannot see A (the isolation claim):');
  await asUser(USER_B, async () => {
    for (const t of TABLES) {
      const r = await app.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [USER_A]);
      check(r.rows[0].n === 0, `B sees 0 rows in ${t} for A`, `n=${r.rows[0].n}`);
    }
    const byId = await app.query('SELECT count(*)::int AS n FROM user_documents WHERE id = $1', [docA.did]);
    check(byId.rows[0].n === 0, "B cannot fetch A's document by its exact id", `n=${byId.rows[0].n}`);
    const bodies = await app.query('SELECT count(*)::int AS n FROM user_sections');
    check(bodies.rows[0].n === 0, 'B sees an empty user_sections table entirely', `n=${bodies.rows[0].n}`);
  });

  // ---- leg 4: B cannot mutate A.
  console.log("\nleg 4 — B cannot write to A's rows:");
  await asUser(USER_B, async () => {
    const u = await app.query(`UPDATE user_documents SET title = 'HIJACKED' WHERE id = $1`, [docA.did]);
    check(u.rowCount === 0, "B's UPDATE of A's document affects 0 rows", `rowCount=${u.rowCount}`);
    const d = await app.query('DELETE FROM user_documents WHERE id = $1', [docA.did]);
    check(d.rowCount === 0, "B's DELETE of A's document affects 0 rows", `rowCount=${d.rowCount}`);
  });
  const stillThere = await owner.query('SELECT title FROM user_documents WHERE id = $1', [docA.did]);
  check(stillThere.rows[0]?.title === `${RUN} A sermon`, "A's document survived B's attempts unmodified", stillThere.rows[0]?.title);

  // ---- leg 5: B cannot forge a row owned by A (WITH CHECK).
  console.log('\nleg 5 — B cannot forge a row attributed to A (WITH CHECK):');
  const forge = await asUserExpectingError(USER_B, () =>
    app.query(`INSERT INTO user_documents (user_id, title) VALUES ($1,$2)`, [USER_A, 'forged by B']),
  );
  check(forge !== null, 'B inserting user_id=A is rejected', forge ? forge.message.split('\n')[0] : 'INSERT SUCCEEDED');

  // ---- leg 6: no identity set at all must fail CLOSED.
  console.log('\nleg 6 — an unset app.current_user_id denies (fails closed):');
  await app.query('BEGIN');
  const naked = await app.query('SELECT count(*)::int AS n FROM user_documents');
  await app.query('ROLLBACK');
  check(naked.rows[0].n === 0, 'no GUC set -> 0 rows, not all rows', `n=${naked.rows[0].n}`);

  // ---- leg 7: the delete cascade, run by the owner of the data.
  // The orphan sweep covers the DOCUMENT-CHILD tables — DERIVED from the FK graph (which
  // derived tables reach user_documents through a foreign-key chain), not assumed: the first
  // lane-b run flagged user_integrations/user_library as "orphans" when they are standalone
  // per-user tables no document cascade could or should collect. Assuming every user_* table is
  // a document child was this script's own superset-instrument error (watchlist 17/18 shape).
  console.log('\nleg 7 — A deleting its document cascades to sections/embeddings/anchors:');
  const fkReach = await owner.query(
    `WITH RECURSIVE reach AS (
       SELECT 'user_documents'::text AS tbl
       UNION
       SELECT c.conrelid::regclass::text
         FROM pg_constraint c JOIN reach r ON c.confrelid = r.tbl::regclass
        WHERE c.contype = 'f'
     ) SELECT tbl FROM reach`,
  );
  const documentChildren = TABLES.filter((t) => fkReach.rows.some((r) => r.tbl === t));
  const standalone = TABLES.filter((t) => !documentChildren.includes(t));
  console.log(`  document-child tables (FK-derived): ${documentChildren.join(', ')}`);
  if (standalone.length) console.log(`  standalone per-user tables (no cascade expected): ${standalone.join(', ')}`);
  check(documentChildren.length >= TABLE_FLOOR, 'FK derivation floor: the 100/105 chain still derives',
    `got ${documentChildren.length}`);
  await asUser(USER_A, async () => {
    const d = await app.query('DELETE FROM user_documents WHERE id = $1', [docA.did]);
    check(d.rowCount === 1, "A's DELETE of its own document affects 1 row", `rowCount=${d.rowCount}`);
  });
  for (const t of documentChildren) {
    const r = await owner.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [USER_A]);
    check(r.rows[0].n === 0, `cascade left 0 orphans in ${t}`, `n=${r.rows[0].n}`);
  }
  // Standalone tables keep their rows past a document delete BY DESIGN — assert presence, so a
  // future wrong-way FK that starts cascading them is caught, then rely on cleanup.
  for (const t of standalone) {
    const r = await owner.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [USER_A]);
    check(r.rows[0].n === 1, `${t} is standalone: its row SURVIVES the document delete`, `n=${r.rows[0].n}`);
  }
} catch (e) {
  bad('unexpected error', e.message);
} finally {
  if (!KEEP) {
    await owner.query('DELETE FROM user_documents WHERE user_id LIKE $1', [`${RUN}%`]).catch(() => {});
    // No FK ties these two to user_documents, so the cascade cannot collect them.
    await owner.query('DELETE FROM user_integrations WHERE user_id LIKE $1', [`${RUN}%`]).catch(() => {});
    await owner.query('DELETE FROM user_library WHERE user_id LIKE $1', [`${RUN}%`]).catch(() => {});
  }
  const residue = await owner.query(
    'SELECT count(*)::int AS n FROM user_documents WHERE user_id LIKE $1', [`${RUN}%`],
  ).catch(() => ({ rows: [{ n: -1 }] }));
  console.log(`\nresidue after cleanup: ${residue.rows[0].n} probe document(s)`);
  await app.end();
  await owner.end();
}

console.log(`\n${fail.length === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass.length} legs passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); }
process.exit(fail.length === 0 ? 0 : 1);
