#!/usr/bin/env node
// TWO-ACCOUNT RLS PROOF for the 100_user_corpus tables (Slice 1, gate B5).
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

const app = new Client({ connectionString: APP_URL, ssl: { rejectUnauthorized: false } });
const owner = new Client({ connectionString: OWNER_URL, ssl: { rejectUnauthorized: false } });
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

const TABLES = ['user_documents', 'user_sections', 'user_section_embeddings', 'user_section_anchors'];
let docA;

try {
  console.log(`two-account RLS proof over 100_user_corpus (run ${RUN})\n`);

  // ---- leg 0: preconditions. An unmet precondition reported as green is the whole failure mode.
  console.log('preconditions:');
  const who = await app.query('SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass');
  check(who.rows[0].u === 'app_runtime', 'app connection is app_runtime', `got ${who.rows[0].u}`);
  check(who.rows[0].bypass === false, 'app_runtime rolbypassrls = false', `got ${who.rows[0].bypass}`);
  const ownerWho = await owner.query('SELECT current_user AS u');
  check(ownerWho.rows[0].u === 'neondb_owner', 'owner connection is neondb_owner', `got ${ownerWho.rows[0].u}`);
  for (const t of TABLES) {
    const r = await owner.query('SELECT relrowsecurity FROM pg_class WHERE relname = $1', [t]);
    check(r.rows[0]?.relrowsecurity === true, `${t}: RLS enabled`);
  }
  if (fail.length) throw new Error('preconditions failed — refusing to report the rest as green');

  // ---- leg 1: user A writes a full document through app_runtime, under RLS.
  console.log('\nleg 1 — user A writes (through app_runtime, RLS active):');
  docA = await asUser(USER_A, async () => {
    const d = await app.query(
      `INSERT INTO user_documents (user_id, title, doc_type, status) VALUES ($1,$2,'sermon','ready') RETURNING id`,
      [USER_A, `${RUN} A sermon`],
    );
    const did = d.rows[0].id;
    const s = await app.query(
      `INSERT INTO user_sections (document_id, user_id, ordinal, body) VALUES ($1,$2,0,$3) RETURNING id`,
      [did, USER_A, 'A private paragraph belonging to user A.'],
    );
    const sid = s.rows[0].id;
    await app.query(
      `INSERT INTO user_section_embeddings (section_id, user_id, model_slug, embedding) VALUES ($1,$2,'bge-large-en-v1.5',$3)`,
      [sid, USER_A, VEC],
    );
    await app.query(
      `INSERT INTO user_section_anchors (section_id, user_id, verse_id_start, verse_id_end) VALUES ($1,$2,45008028,45008028)`,
      [sid, USER_A],
    );
    return { did, sid };
  });
  ok('A inserted document + section + embedding + anchor');

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
  console.log('\nleg 7 — A deleting its document cascades to sections/embeddings/anchors:');
  await asUser(USER_A, async () => {
    const d = await app.query('DELETE FROM user_documents WHERE id = $1', [docA.did]);
    check(d.rowCount === 1, "A's DELETE of its own document affects 1 row", `rowCount=${d.rowCount}`);
  });
  for (const t of TABLES) {
    const r = await owner.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [USER_A]);
    check(r.rows[0].n === 0, `cascade left 0 orphans in ${t}`, `n=${r.rows[0].n}`);
  }
} catch (e) {
  bad('unexpected error', e.message);
} finally {
  if (!KEEP) {
    await owner.query('DELETE FROM user_documents WHERE user_id LIKE $1', [`${RUN}%`]).catch(() => {});
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
