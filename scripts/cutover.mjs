#!/usr/bin/env node
// scripts/cutover.mjs — the ONE resumable prod cutover orchestrator (CUTOVER_DESIGN.md).
// Thin and boring: every step is  assert precondition -> one dull action ->
// assert postcondition -> checkpoint. Hard abort (exit 1) on any failed assertion,
// printing the failing step and its stated rollback. Measured by ABORT-COVERAGE.
//
// The credential comes ONLY from CUTOVER_DATABASE_URL (an explicit env), never from
// .env.local — so ingest-preflight and the dev gates never scan a live prod string.
//
//   node scripts/cutover.mjs --dry-run           print the plan; STEP ZERO read-only if a target is set
//   CUTOVER_DATABASE_URL=<owner> node scripts/cutover.mjs --preflight   STEP ZERO only
//   CUTOVER_DATABASE_URL=<owner> node scripts/cutover.mjs               full run (two owner gates inside)
//
// Owner workflow (prod cred quarantined in .env.prod — see .env.prod.example):
//   set -a && source .env.prod && set +a && node scripts/cutover.mjs --preflight
//
// HARD STOPS honored: E5 (deploy.sh) and the first prod write both require an
// interactive owner "yes". Nothing writes before STEP ZERO passes.
import { neon } from '@neondatabase/serverless';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { hostOf, isProdHost, endpointId } from './lib/target-guard.mjs';
import { loadCheckpoint, saveCheckpoint as writeCheckpoint, assertCheckpointOwner, SESSION_ID, OWNERSHIP_ERROR } from './lib/checkpoint.mjs';
import { USER_TABLES, measureSql, ownersSql, ABSENT, userShape, diffUserData } from './lib/user-data-invariant.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT = path.join(ROOT, '.cutover-checkpoint.json');
const NEON_PROJECT = process.env.NEON_PROJECT_ID ?? 'spring-heart-74819093';
// Children (the regression gate) must share this session or they look like a second
// writer to the checkpoint's ownership marker.
process.env.CUTOVER_SESSION_ID = SESSION_ID;
const DRY = process.argv.includes('--dry-run');
const PREFLIGHT_ONLY = process.argv.includes('--preflight');
// --e6-only: run STEP ZERO and then E6's smoke + the full regression battery, and NOTHING
// else. It exists so the gate can be re-run and re-proven WITHOUT the cutover — the only
// alternative was to run the whole thing, which is not a thing you do to check a check.
// It takes no snapshot and never writes (E6 is read-only apart from its rolled-back
// probes), so the completion guard is deliberately bypassed: re-running the gate must
// always actually re-run it, never report "(checkpoint) already done".
const E6_ONLY = process.argv.includes('--e6-only');
// ARGV IS VALIDATED. `process.argv.includes()` means a typo — `--e6only`, `--e6-only=1`,
// `--E6-only`, `--dryrun` — matches nothing and falls through to a FULL CUTOVER against the
// default target, which is production. Two owner gates still stand in front of a migration
// and the deploy, but a typo in the read-only mode should not reach STEP ZERO, a real Neon
// branch creation on prod, and a checkpoint write. Reject anything not on the list.
const KNOWN_FLAGS = new Set(['--dry-run', '--preflight', '--e6-only']);
const unknownFlags = process.argv.slice(2).filter((a) => a.startsWith('-') && !KNOWN_FLAGS.has(a));
if (unknownFlags.length > 0) {
  console.error(`✗ unknown flag(s): ${unknownFlags.join(' ')}`);
  console.error(`  known flags: ${[...KNOWN_FLAGS].join(' ')}`);
  console.error('  Refusing to run. An unrecognised flag used to mean "full cutover against the default target".');
  process.exit(1);
}
// `||` not `??`: CUTOVER_EXPECT_HOST="" is an empty string, not undefined, and
// `host.includes('')` is TRUE for every host — which turned STEP ZERO's endpoint-identity
// assertion into a no-op that printed "✓ endpoint contains " and passed against dev.
const EXPECT_HOST = process.env.CUTOVER_EXPECT_HOST || 'ep-odd-fog'; // prod endpoint; overridable for a fork rehearsal
const EXPECT_ROLE = 'neondb_owner';

const die = (step, msg, rollback) => {
  console.error(`\n✗ ABORT at ${step}: ${msg}`);
  if (rollback) console.error(`  rollback: ${rollback}`);
  process.exit(1);
};
const ok = (m) => console.log(`  ✓ ${m}`);

// MERGE + ATOMIC WRITE + OWNERSHIP, all in scripts/lib/checkpoint.mjs — see that file.
// The merge exists because the regression gate runs as a CHILD PROCESS and writes its E0
// baseline into this same file; the parent then saved its own copy — loaded before the
// child ran — and silently destroyed that baseline. The gate reads
// `baseline.regression ?? {}`, so with it missing G1 took its "no baseline yet" branch
// and printed a GREEN "baseline captured" at E1/E2/E4/E6 instead of comparing: the
// user-row invariant became a check that could not fail. The atomic write and the
// ownership marker exist because the file was clobbered three times by concurrent
// processes during the 2026-07-27 deep-audit, once mid-proof.
function saveCheckpoint(cp) {
  try { writeCheckpoint(CHECKPOINT, cp); }
  catch (e) {
    if (String(e.message).startsWith(OWNERSHIP_ERROR)) die('checkpoint', e.message, 'nothing was written by this process');
    throw e;
  }
}
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

// A checkpoint is only resumable against the target it was written for. The
// 2026-07-24 census-clone rehearsal left a FULL checkpoint on disk; without this
// binding a later run against a different endpoint would read "E1..E4 done" and
// skip the entire cutover, reporting success having written nothing. Resumability
// must not silently become "skip everything".
function bindCheckpoint(cp, host) {
  if (cp.target && cp.target !== host) {
    die('checkpoint', `.cutover-checkpoint.json was written for ${cp.target}, but the target is ${host}. A checkpoint is not portable across targets — re-running would skip steps that never ran here.`,
      'move .cutover-checkpoint.json aside (or delete it) and start this target from E0');
  }
  if (!cp.target) {
    if (cp.done.length > 0) {
      die('checkpoint', `.cutover-checkpoint.json records ${cp.done.length} completed step(s) but names no target — it predates target binding and cannot be trusted for ${host}.`,
        'move .cutover-checkpoint.json aside and start this target from E0');
    }
    cp.target = host; saveCheckpoint(cp);
  }
}

// The regression gate, run after EVERY chunk (CUTOVER_DESIGN.md §"Regression
// gates"). Any failure ABORTS — the design forbids fixing forward mid-cutover.
function regressionGate(phase, url, host, { capture = false } = {}) {
  if (DRY) { console.log(`    [dry-run] would run the regression gate at ${phase}`); return; }
  const argv = ['tsx', 'scripts/cutover-regression-gate.mts', `--phase=${phase}`];
  if (capture) argv.push('--capture');
  try {
    execFileSync('npx', argv, {
      cwd: ROOT, stdio: 'inherit',
      env: { ...process.env, CUTOVER_DATABASE_URL: url, CUTOVER_EXPECT_HOST: process.env.CUTOVER_EXPECT_HOST ?? EXPECT_HOST, CUTOVER_GATE_HOST: host },
    });
  } catch {
    die(phase, 'REGRESSION GATE FAILED — a pre-existing surface regressed',
      `roll back the ${phase} chunk (see that step's stated rollback). Do NOT fix forward mid-cutover.`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP ZERO — prod-credential preflight. Converts "dies mid-migration" into
// "refuses to start". Read-only; leaves nothing behind.
// ────────────────────────────────────────────────────────────────────────────
async function stepZero() {
  console.log('\nSTEP ZERO — prod-credential preflight');
  const url = process.env.CUTOVER_DATABASE_URL;
  if (!url) die('STEP ZERO', 'CUTOVER_DATABASE_URL is unset. This is the parked-rehearsal state: supply the census-clone (ep-young-hat) or prod owner string explicitly. Never sourced from .env.local.');

  let host;
  // hostOf() LOWERCASES. `new URL()` does not normalize the host for the non-special
  // `postgresql:` scheme, so every downstream `includes('ep-odd-fog')` used to miss an
  // UPPERCASE prod URL — including the CUTOVER_REHEARSAL guard at the bottom of this file.
  try { host = hostOf(url); } catch { die('STEP ZERO', 'CUTOVER_DATABASE_URL is not a valid URL'); }
  console.log(`  target host: ${host}`);

  // (3) endpoint identity — this IS the intended branch, not dev or a stale copy.
  // startsWith, not includes: the endpoint id is the FIRST dns label, so a generic
  // declared value such as "neon.tech" can no longer satisfy this for every endpoint
  // in the account. A bare prefix ('ep-odd-fog') and a full id both still work.
  if (!host.startsWith(EXPECT_HOST.toLowerCase())) die('STEP ZERO', `host ${host} does not begin with expected endpoint '${EXPECT_HOST}'. Refusing (wrong target).`);
  ok(`endpoint is ${EXPECT_HOST}`);

  const sql = neon(url);
  // (2) role — migrations run as owner, not app_runtime.
  let role;
  try { role = (await sql`SELECT current_user AS u`)[0].u; }
  catch (e) { die('STEP ZERO', `cannot connect: ${e.message} (stale/lapsed credential?)`); }
  if (role !== EXPECT_ROLE) die('STEP ZERO', `current_user is '${role}', expected '${EXPECT_ROLE}'. Refusing (wrong role).`);
  ok(`current_user = ${role}`);

  // (4) WRITE capability, proven by a no-op that leaves nothing behind.
  try {
    await sql`BEGIN`; await sql`CREATE TEMP TABLE _cutover_preflight(x int)`; await sql`ROLLBACK`;
  } catch (e) { die('STEP ZERO', `write-capability probe failed: ${e.message} (read-only or lapsed credential)`); }
  ok('write capability proven (BEGIN; CREATE TEMP; ROLLBACK)');

  // Positive control: a non-zero legal corpus row count, so a silently-empty target is caught.
  const gill = (await sql`SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`)[0].n;
  console.log(`  positive control (Gill rows): ${gill}`);
  if (gill === 0) die('STEP ZERO', 'positive control returned 0 — wrong DB or empty target');
  ok('positive control fires');

  console.log('STEP ZERO PASSED — safe to proceed.');
  return { url, host, role };
}

// Re-measure prod at RUNTIME (hazard 4: never a dev literal).
const q1 = async (sql, text) => (await sql.query(text))[0];

// ── the user-row invariant ───────────────────────────────────────────────────
// 34 highlights (6 users, only 24 ACTIVE) / 2 notes (1 user) / 1 chat on prod, but no
// number is ever asserted from that literal — they are MEASURED on the target before the
// first write and re-measured after every migration. Migration 025 rewrites the
// annotation schema (upsertNote hard-depends on it) and 030 tightens its constraints, so
// "which migrations touch an annotation table" is not a list we maintain by hand: every
// migration is checked.
//
// WHAT IS MEASURED: not count(*) — an md5 digest over ordered rows (id, owner, anchors,
// tombstone, body hash), the ACTIVE row count, and the owner distribution. See
// scripts/lib/user-data-invariant.mjs for the three seeded corruptions that passed the
// old count-only version green.
async function measureUserData(sql) {
  const out = {};
  for (const t of USER_TABLES) {
    const e = await q1(sql, `SELECT to_regclass('${t}') IS NOT NULL AS ok`);
    if (!e.ok) { out[t] = { ...ABSENT }; continue; }
    // A column the invariant covers being GONE is itself the regression, and it must
    // read as one. Unwrapped, it surfaced as a raw pg stack trace under "ABORT at
    // unhandled" — red, but unreadable at 3am, which is the only hour this matters.
    let m, owners;
    try { m = await q1(sql, measureSql(t)); owners = await sql.query(ownersSql(t)); }
    catch (err) {
      die('user-data invariant', `cannot MEASURE ${t}: ${err.message}. A column this invariant covers has been dropped or renamed — that is a schema regression on live user data, not a gate bug.`,
        'restore the target from its pre-cutover Neon branch snapshot (id in .cutover-checkpoint.json)');
    }
    out[t] = { rows: m.rows, users: m.users, active: m.active, digest: m.digest, owners: Object.fromEntries(owners.map((r) => [r.owner, r.n])) };
  }
  return out;
}
async function assertUserDataUnchanged(sql, base, where, rollback) {
  const now = await measureUserData(sql);
  const moved = diffUserData(base, now);
  if (moved.length > 0) die(where, `USER DATA MOVED — ${moved.join('; ')}`, rollback);
  return now;
}
// The WHOLE-CUTOVER invariant, not just the within-step one. Each step measures its own
// base when that step starts, so anything that moves BETWEEN steps — including between
// two runs of this resumable script — is invisible to it. The E0 reading is the only one
// taken before anything wrote; every step re-checks against that too.
async function assertUserDataVsE0(sql, cp, where) {
  const base = cp.baseline?.userData;
  if (!base) return;
  const now = await measureUserData(sql);
  const moved = diffUserData(base, now);
  if (moved.length > 0) die(where, `USER DATA MOVED since the E0 baseline — ${moved.join('; ')}`, restoreFrom(cp));
  ok(`user data matches the E0 baseline (${userShape(now)})`);
}

// ── the restore point ────────────────────────────────────────────────────────
// Every rollback string used to say "restore from the pre-E1 Neon branch snapshot" while
// nothing created one, and Neon's PITR retention on this project is 21600 s (6 hours)
// against a ~2 h 20 m run — so by the time a bad migration is noticed the window can be
// gone. The snapshot is a Neon branch off the target, taken as the FIRST action after
// STEP ZERO passes and before anything writes. Its id is recorded in the checkpoint and
// quoted in every rollback below.
const restoreFrom = (cp) => cp.snapshot?.id
  ? `restore the target from the pre-cutover Neon branch ${cp.snapshot.name} (${cp.snapshot.id})`
  : 'restore the target from its pre-cutover Neon branch snapshot — NONE IS RECORDED, which means this run should never have written';

const neonctl = (args) => JSON.parse(execFileSync('npx', ['neonctl', ...args],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
const branchList = () => neonctl(['branches', 'list', '--project-id', NEON_PROJECT, '-o', 'json']);

function preCutoverSnapshot(cp, host) {
  if (cp.snapshot?.id) { ok(`pre-cutover snapshot already recorded: ${cp.snapshot.name} (${cp.snapshot.id})`); return; }
  if (DRY) { console.log('  [dry-run] would create a Neon branch snapshot of the target before the first write'); return; }
  const ep = endpointId(host);
  const name = `pre-cutover-${ep}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  let parent;
  // The endpoint -> branch mapping is not exposed by `neonctl branches list`; the API
  // passthrough is. Resolve the TARGET's own branch rather than trusting a name.
  try { parent = neonctl(['api', `/projects/${NEON_PROJECT}/endpoints`]).endpoints.find((e) => e.id === ep)?.branch_id; }
  catch (e) { die('SNAPSHOT', `neonctl could not list endpoints: ${e.message}`, 'nothing written'); }
  if (!parent) die('SNAPSHOT', `no Neon branch owns endpoint ${ep} — cannot take a restore point`, 'nothing written');
  let id;
  try { id = neonctl(['branches', 'create', '--project-id', NEON_PROJECT, '--parent', parent, '--name', name, '-o', 'json'])?.branch?.id; }
  catch (e) { die('SNAPSHOT', `could not create the pre-cutover snapshot branch: ${e.message}`, 'nothing written'); }
  // ASSERT IT EXISTS. A create that reports success and leaves no branch is exactly the
  // failure this guard is for; the whole point is a restore point that is really there.
  if (!id || !branchList().some((b) => b.id === id)) die('SNAPSHOT', `snapshot branch was not created (id=${id ?? 'none'}) — refusing to write with no restore point`, 'nothing written');
  cp.snapshot = { id, name, parent, at: new Date().toISOString() };
  saveCheckpoint(cp);
  ok(`pre-cutover snapshot: branch ${name} (${id}) off ${parent} — every rollback below restores from it`);
}

// ────────────────────────────────────────────────────────────────────────────
// The E-steps. Each: precondition -> dull action (delegates to a proven runner)
// -> postcondition -> checkpoint. In --dry-run, actions are printed, not run.
// ────────────────────────────────────────────────────────────────────────────
// Run a proven runner script with argv passed as a real array (never a joined
// string, which node would treat as one bad path). Prod env is explicit.
function runNode(argv, url) {
  if (DRY) { console.log(`    [dry-run] would run: node ${argv.join(' ')}`); return; }
  execFileSync('node', argv, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, MIGRATE_ALLOW_PROD: '1' } });
}

const MIGRATIONS = ['016_history_sections', '017_source_type_registers', '020_embeddings_source_type_registers',
  '021_revoke_app_runtime_anchor_writes', '022_embeddings_write_policy_user_scope', '023_sources_status_ingesting',
  '025_annotations_polymorphic', '026_bookmarks', '027_library_items',
  '028_reading_progress', '029_tags', '030_annotation_constraints_tighten'];
const CONCURRENT = ['018_register_partial_indexes', '019_register_columns_fts'];
// 024 IS NOT IN E1. It backfills sections.unit_ordinal, and E4 is what creates the
// sections it backfills — running it here left 71,563 of 72,863 sections NULL on the
// last rehearsal fork (deep-audit finding 11), invisible because the consumers
// (web/src/lib/work-reader.ts, web/src/lib/search-sections.ts) COALESCE and degrade
// silently and E4's postcondition only compared 1:1 counts. It runs in E4, AFTER the
// slice, and E4 asserts the column is populated.
const POST_SLICE_MIGRATION = '024_sections_unit_ordinal';

async function e1_migrations(sql, url, cp) {
  const e1Total = MIGRATIONS.length + CONCURRENT.length;
  const e1Done = cp.done.filter((d) => d.startsWith('E1:')).length;
  if (e1Done >= e1Total) {
    // Still re-assert E1's postconditions on a resume. The early return used to skip
    // them, so a fully-resumed E1 never re-checked "no INVALID index" or the user rows.
    console.log('\nE1 — (checkpoint) all migrations applied; re-asserting postconditions');
    if (!DRY) {
      const inv = await q1(sql, `SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid`);
      if (inv.n > 0) die('E1', `${inv.n} index(es) are INVALID`, 'DROP the invalid index and re-run the concurrent step (idempotent)');
      ok('postcondition (resume): no invalid index');
      await assertUserDataVsE0(sql, cp, 'E1');
    }
    return;
  }
  console.log('\nE1 — migrations 016-023 + 025-030 (fresh; prod is pre-016 per census; 024 runs in E4)');
  const hasE1Progress = cp.done.some((d) => d.startsWith('E1:'));
  // PRECONDITION: prod really is pre-016 (else this is not the build we designed).
  const pre = await q1(sql, `SELECT to_regclass('section_history_anchors') IS NULL AS pre016`);
  if (!DRY && !hasE1Progress && !pre.pre016) die('E1', 'prod already has 016 objects; this orchestrator assumes a pre-016 BUILD. Re-census before proceeding.', 'none written yet');
  if (hasE1Progress) ok(`resuming E1 (${cp.done.filter((d) => d.startsWith('E1:')).length} step(s) checkpointed)`);
  else ok('precondition: prod is pre-016 (BUILD)');

  // HAZARD 2: migration 024 dense_rank() renumbers section ordinals and would
  // invalidate any stored #s{ordinal} deep-link or SECTION annotation. DETECT-AND-REFUSE:
  // on a fresh build, section-annotation tables (025+) do not exist yet, and prod's live
  // 34 highlights / 2 notes are verse-offset annotations (pre-025 schema), NOT section-
  // ordinal. Assert no section-ordinal annotation exists before 024 renumbers.
  if (!DRY) {
    const hasSectionAnno = await q1(sql, `SELECT to_regclass('section_annotations') IS NOT NULL OR to_regclass('annotations') IS NOT NULL AS x`);
    if (hasSectionAnno.x) die('E1/024', 'a section-annotation table exists BEFORE 024 renumbers ordinals — 024 would invalidate stored ordinals. Order around 024 or migrate the anchors first (hazard 2).', restoreFrom(cp));
  }
  // NOTE 024 now runs in E4, not here, so this guard runs earlier than the thing it
  // guards. That is deliberate: it is a PRE-flight, and the answer cannot become "yes"
  // in between — nothing between E1 and E4 creates a section-ordinal annotation, and
  // 024 only writes the new unit_ordinal column; it never renumbers sections.ordinal,
  // which is what annotation anchoring (section_id + offset) actually depends on.
  ok('hazard 2: no section-ordinal annotation precedes 024 (verse-offset highlights are unaffected)');

  // The user-row invariant: measured on the TARGET before the first migration,
  // then re-asserted after every single one — and separately against the E0 reading,
  // which is the only one taken before anything at all had written.
  if (!DRY) await assertUserDataVsE0(sql, cp, 'E1');
  let userBase = DRY ? null : await measureUserData(sql);
  if (userBase) ok(`user-data baseline (measured on target): ${userShape(userBase)}`);

  const applyOne = async (m, runner) => {
    if (cp.done.includes(`E1:${m}`)) { console.log(`    (checkpoint) ${m} already applied`); return; }
    console.log(`  apply ${runner.includes('concurrent') ? '(concurrent) ' : ''}${m}`);
    runNode([runner, `db/migrations/${m}.sql`], url);
    if (!DRY) {
      await assertUserDataUnchanged(sql, userBase, `E1/${m}`,
        `${restoreFrom(cp)}, then re-apply from ${m}`);
      // Per-migration index validity: a CREATE INDEX that failed mid-flight leaves an
      // INVALID index behind that the planner silently ignores — a serving regression
      // with no error. Assert across the whole schema, not just idx_embeddings_%.
      const invalid = await q1(sql, `SELECT count(*)::int AS n, coalesce(string_agg(c.relname, ', '), '') AS names
        FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT i.indisvalid`);
      if (invalid.n > 0) die(`E1/${m}`, `${invalid.n} INVALID index(es) after ${m}: ${invalid.names}`,
        'DROP the invalid index and re-run this migration (idempotent)');
      // CHECKPOINT ONLY ON A REAL APPLY. This push used to sit outside the !DRY guard,
      // so `--dry-run` recorded all 15 migrations as applied without applying any. A
      // later REAL run then read that checkpoint, skipped every migration (the E1
      // early-return only re-checks for INVALID indexes, trivially true on a pre-016
      // schema), and — because `e1Complete` was true — SUPPRESSED THE OWNER GATE that
      // stands in front of the first prod write. Net: no migrations, prod rows deleted
      // unattended, and "CUTOVER COMPLETE" printed. A dry run must leave no trace.
      cp.done.push(`E1:${m}`); saveCheckpoint(cp);
    }
  };

  for (const m of MIGRATIONS) await applyOne(m, 'db/apply-migration.mjs');
  for (const m of CONCURRENT) await applyOne(m, 'db/apply-migration-concurrent.mjs');

  // POSTCONDITION: no invalid index anywhere, and the user rows are exactly where
  // they started.
  if (!DRY) {
    const invalid = await q1(sql, `SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid`);
    if (invalid.n > 0) die('E1', `${invalid.n} index(es) are INVALID after migration`, 'DROP the invalid index and re-run the concurrent step (idempotent)');
    userBase = await assertUserDataUnchanged(sql, userBase, 'E1', restoreFrom(cp));
    ok(`postcondition: user rows unchanged across all ${MIGRATIONS.length + CONCURRENT.length} migrations (${userShape(userBase)})`);
  }
  ok('postcondition: no invalid index');
}

async function e2_label(sql, url, cp) {
  if (cp.done.includes('E2')) { console.log('\nE2 — (checkpoint) already done'); return; }
  console.log('\nE2 — register-label the flat embeddings (metadata UPDATE, not a re-embed)');
  const base = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int unlabeled, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  console.log(`  precondition (re-measured): ${base.unlabeled}/${base.total} rows unlabeled`);
  cp.baseline.e2 = base; saveCheckpoint(cp);
  if (DRY) { console.log('    [dry-run] would run register-label-embeddings.mjs --apply'); return; }
  // E2 was the ONE chunk with no user-data assertion, which (with the gate's G1 dead)
  // left the user-row invariant genuinely unguarded across it. A metadata UPDATE has no
  // business touching an annotation table; assert that it didn't.
  await assertUserDataVsE0(sql, cp, 'E2');
  const userBase = await measureUserData(sql);
  execFileSync('node', ['scripts/register-label-embeddings.mjs', '--apply'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, CUTOVER_DATABASE_URL: url, DATABASE_URL: url, CUTOVER_ALLOW: '1' },
  });
  const after = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int unlabeled, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  console.log(`  postcondition: ${after.unlabeled}/${after.total} unlabeled (was ${base.unlabeled})`);
  if (after.unlabeled === base.unlabeled && base.unlabeled === base.total) die('E2', 'zero rows labeled — mapping missed the prod author strings', 'revert: UPDATE metadata - work key');
  if (after.total !== base.total) die('E2', `row COUNT changed during a metadata-only UPDATE: ${base.total} -> ${after.total}`, restoreFrom(cp));

  // POSTCONDITION, re-measured on the TARGET (design §"assert label coverage against
  // prod's own re-measured shape"): for every manifest work, the rows now carrying
  // that slug must equal the rows this target holds for that author. Never a dev
  // literal, never a doc's number — the target's own shape, both sides.
  // NOTE the manifest is NOT a 1:1 author->slug map: "Barnes' Notes" is claimed by
  // both `barnes-notes` (quarantined) and `barnes-crosswire-nt`, and the labeler
  // only writes rows whose work is still NULL, so the first entry wins. A per-entry
  // 1:1 assertion therefore false-aborts on the second entry — it did, on the first
  // rehearsal fork. The real invariant is per AUTHOR: every row of a mapped author
  // must carry one of the slugs that author maps to.
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'));
  const byAuthor = new Map();
  for (const e of manifest.filter((x) => x.backfill?.match_author)) {
    const a = e.backfill.match_author;
    if (!byAuthor.has(a)) byAuthor.set(a, []);
    byAuthor.get(a).push(e.slug ?? e.id);
  }
  let covered = 0, authors = 0;
  for (const [author, slugs] of byAuthor) {
    const r = (await sql.query(
      `SELECT count(*) FILTER (WHERE metadata->>'author' = $1)::int AS by_author,
              count(*) FILTER (WHERE metadata->>'author' = $1 AND metadata->>'work' = ANY($2::text[]))::int AS labeled
         FROM embeddings WHERE user_id IS NULL`, [author, slugs]))[0];
    if (r.by_author === 0) continue;
    authors++;
    if (r.labeled !== r.by_author) die('E2', `"${author}": ${r.by_author - r.labeled} of ${r.by_author} rows carry no manifest work key (expected one of ${slugs.join('|')})`,
      `UPDATE embeddings SET metadata = metadata - 'work' WHERE metadata->>'work' = ANY(ARRAY[${slugs.map((s) => `'${s}'`).join(',')}])`);
    console.log(`    ${author} -> ${slugs.join('|')}: ${r.labeled}/${r.by_author}`);
    covered += r.by_author;
  }
  ok(`postcondition: ${authors} mapped author(s), every row labeled, ${covered} rows — measured against the target's own author counts`);
  await assertUserDataUnchanged(sql, userBase, 'E2', "UPDATE embeddings SET metadata = metadata - 'work' for the slugs this step wrote");
  ok(`postcondition: user rows unchanged (${userShape(userBase)})`);
  cp.done.push('E2'); saveCheckpoint(cp);
}

// E3 (forbidden-provenance deletion) IS NOT PART OF THIS CUTOVER.
// ADR-030 approved it on the premise that "the clean NPNF/CCEL re-ingest replaces those
// voices in the same cutover". That premise is false — the cutover has no ingest step,
// so the deletion would have been a pure subtraction: measured read-only on production,
// 580 verses drop below the >=2-distinct-authors floor and 24 lose every served voice,
// with nothing in this script to refill them. Owner ruling 2026-07-27: E3 is DROPPED and
// provenance cleanup is DEFERRED to its own slice, after a re-ingest exists.
// src/ingest/b2-remove-forbidden-provenance.ts is deliberately kept — it is the tool
// that slice will use. The cutover is E0, E1, E2, E4, E5, E6.

async function e4_slice(sql, url, cp) {
  if (cp.done.includes('E4')) { console.log('\nE4 — (checkpoint) already done'); return; }
  console.log('\nE4 — slice works into sections, reusing vectors 1:1');
  console.log('  per served work: migrate-sections-slice, then assert sections == flat-pool count FOR THAT WORK (hazard 1: each store its own key; assert 1:1).');
  console.log(`  then ${POST_SLICE_MIGRATION} (it backfills the sections THIS step creates — running it in E1 left 71,563 of 72,863 NULL).`);
  if (DRY) { console.log(`    [dry-run] would run cutover-e4-slice-all.mjs, then ${POST_SLICE_MIGRATION}`); return; }
  await assertUserDataVsE0(sql, cp, 'E4');
  const userBase = await measureUserData(sql);
  execFileSync('node', ['scripts/cutover-e4-slice-all.mjs'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, CUTOVER_DATABASE_URL: url, DATABASE_URL: url, CUTOVER_ALLOW: '1', MIGRATE_ALLOW_PROD: '1' },
  });
  // POSTCONDITION (ADR-029 addendum 2): 1:1 per work, expressed in EACH store's own
  // key. The slice runner asserts this per work as it goes; re-assert it here across
  // every sliced work as this step's own contract, because "the runner checked" is
  // the kind of claim this project has been burned by.
  const drift = await sql.query(`
    SELECT src.slug, count(s.id)::int AS sections,
           (SELECT count(*)::int FROM embeddings e WHERE e.user_id IS NULL AND e.metadata->>'work' = src.slug) AS flat
      FROM sources src LEFT JOIN sections s ON s.source_id = src.id
     GROUP BY src.slug HAVING count(s.id) > 0`);
  const mismatched = drift.filter((r) => r.flat > 0 && r.flat !== r.sections);
  for (const r of drift) console.log(`    ${r.slug}: sections=${r.sections} flat=${r.flat}${r.flat === 0 ? ' (pre-register source, no flat work key — not a 1:1 target)' : ''}`);
  if (mismatched.length > 0) die('E4', `sections vs flat-pool 1:1 broken for: ${mismatched.map((r) => `${r.slug} (${r.sections} vs ${r.flat})`).join(', ')}`, 'DELETE the sections rows for the failing slug(s) and re-run E4 for those works only');
  // The query above only sees sources that HAVE sections, so a work whose slice produced
  // ZERO sections — a total failure for that work — was invisible to the 1:1 check.
  // Assert the other direction too: every non-quarantined work that has flat rows must
  // have produced sections.
  const sliced = new Set(drift.map((r) => r.slug));
  const manifest4 = JSON.parse(readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'));
  const missing = [];
  for (const e of manifest4.filter((x) => x.backfill?.match_author && !x.quarantine)) {
    const slug = e.slug ?? e.id;
    if (sliced.has(slug)) continue;
    const n = (await sql.query(`SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [slug]))[0].n;
    if (n > 0) missing.push(`${slug} (${n} flat rows, 0 sections)`);
  }
  if (missing.length > 0) die('E4', `work(s) with flat rows produced NO sections: ${missing.join(', ')}`, 're-run E4 for those works only');
  ok(`postcondition: 1:1 sections↔flat pool for every sliced register work (${drift.length} source(s) with sections), and no work with flat rows was skipped`);

  // 024 runs HERE, after the rows it backfills exist. In E1 it ran against a sections
  // table that E4 had not filled yet.
  if (!cp.done.includes(`E4:${POST_SLICE_MIGRATION}`)) {
    console.log(`  apply (concurrent) ${POST_SLICE_MIGRATION}`);
    runNode(['db/apply-migration-concurrent.mjs', `db/migrations/${POST_SLICE_MIGRATION}.sql`], url);
    cp.done.push(`E4:${POST_SLICE_MIGRATION}`); saveCheckpoint(cp);
  } else console.log(`    (checkpoint) ${POST_SLICE_MIGRATION} already applied`);

  // POSTCONDITION: unit_ordinal is POPULATED, not merely present. The old postcondition
  // compared 1:1 counts only and reported green while 71,563 of 72,863 sections carried a
  // NULL unit_ordinal. It is invisible at runtime because both consumers degrade instead
  // of erroring: work-reader.ts makes every null-unit row "stand alone", so the Book
  // Reader lists one reading unit per retrieval chunk instead of per chapter, and
  // search-sections.ts falls back to COALESCE(unit_ordinal, -ordinal), which makes its
  // DISTINCT ON dedup-by-unit collapse into dedup-by-row — i.e. no dedup at all.
  const hasCol = await q1(sql, `SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='sections' AND column_name='unit_ordinal') AS ok`);
  if (!hasCol.ok) die('E4', `sections.unit_ordinal does not exist — ${POST_SLICE_MIGRATION} did not apply`, `re-run ${POST_SLICE_MIGRATION}`);
  const uo = await q1(sql, `SELECT count(*)::int AS total, count(*) FILTER (WHERE unit_ordinal IS NULL)::int AS nulls,
      count(DISTINCT source_id)::int AS srcs, count(DISTINCT (source_id, unit_ordinal))::int AS units FROM sections`);
  if (uo.total === 0) die('E4', 'zero sections exist after E4 — the slice produced nothing', 're-run E4');
  if (uo.nulls > 0) die('E4', `sections.unit_ordinal is NULL for ${uo.nulls} of ${uo.total} sections — the Book Reader would list one reading unit per retrieval chunk instead of per chapter, and section search would lose its dedup (both consumers COALESCE, so neither errors)`,
    `re-run ${POST_SLICE_MIGRATION} AFTER E4's slice (it backfills only sources that still have a NULL unit_ordinal)`);
  ok(`postcondition: unit_ordinal populated on all ${uo.total} sections — ${uo.units} reading unit(s) across ${uo.srcs} source(s)`);

  await assertUserDataUnchanged(sql, userBase, 'E4', 'DELETE the sections rows written by this step and re-run');
  cp.done.push('E4'); saveCheckpoint(cp);
}

async function e5_deploy(cp, url, host) {
  // COMPLETION GUARD. Every other step has one; E5 did not, so a resume after E6 failed
  // would have run `vercel --prod` a second time.
  if (cp.done.includes('E5')) { console.log('\nE5 — (checkpoint) already deployed'); return; }
  if (process.env.CUTOVER_REHEARSAL === '1') { console.log('\nE5 — skipped (CUTOVER_REHEARSAL)'); return; }
  // Deploying is only ever correct when the database this run just built IS prod.
  // A rehearsal fork that reached E5 must never push a build to ancientpaths.app.
  // (This read `isProdHost(url)` with no `url` in scope — a ReferenceError that made
  // EVERY E5, prod included, abort as 'unhandled' with no rollback text. `url` is now a
  // parameter.)
  if (host && !isProdHost(url)) die('E5', `target is ${host}, not the prod endpoint — refusing to deploy a build from a non-prod cutover`, 'none; nothing deployed');
  console.log('\nE5 — deploy.sh (clean-tree -> licensing ratchet -> build -> vercel --prod)');
  if (DRY) { console.log('    [dry-run] would require owner "yes", then run ./deploy.sh'); return; }
  const a = await ask('  HARD STOP (§4.1): run ./deploy.sh to PROD now? type "deploy": ');
  if (a !== 'deploy') die('E5', 'owner did not confirm deploy', 'none');
  execFileSync('bash', ['deploy.sh'], { cwd: ROOT, stdio: 'inherit' });
  cp.done.push('E5'); saveCheckpoint(cp);
}

async function e6_smoke(sql, url, host, cp, { standalone = false } = {}) {
  // COMPLETION GUARD. Without it a resume re-ran the whole battery and pushed a second
  // 'E6' onto cp.done (the rehearsal checkpoint carried it twice).
  // In --e6-only the guard is SKIPPED on purpose: the whole point of that mode is to
  // re-run the battery on demand, and a checkpoint that made it print "already done" and
  // exit 0 would be a gate that stops gating after its first success.
  if (!standalone && cp.done.includes('E6')) { console.log('\nE6 — (checkpoint) already done'); return; }
  console.log('\nE6 — smoke + regression gate');
  if (DRY) { console.log('    [dry-run] would run the smoke counts + the full regression battery'); return; }
  // (a) corpus smoke — the positive control and the forbidden-provenance count.
  const gill = (await sql`SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`)[0].n;
  const secs = (await sql`SELECT count(*)::int AS n FROM sections`)[0].n;
  const forb = (await sql`SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int AS n FROM embeddings WHERE user_id IS NULL`)[0].n;
  console.log(`  Gill rows: ${gill}  sections: ${secs}  forbidden-provenance: ${forb}`);
  if (gill === 0) die('E6', 'Gill positive control dead after cutover', restoreFrom(cp));
  // NOT "forb must be 0": E3 is dropped from this cutover (see the note above e4_slice),
  // so the forbidden rows are still here on purpose. The gate's G6 holds the real
  // invariant — the count must never INCREASE against the E0 baseline. Asserting 0 here
  // would abort every run of the re-scoped cutover.
  const base = cp.baseline?.regression?.forbidden;
  if (base !== undefined && forb > base) die('E6', `forbidden-provenance rows INCREASED ${base} -> ${forb}`, restoreFrom(cp));
  ok(`smoke counts pass (forbidden-provenance ${forb}${base !== undefined ? `, baseline ${base}, not increased` : ''}; E3 deferred — cleanup is a later slice)`);
  // (b) the full regression battery — the same gate every chunk ran, once more at the
  // end. Set CUTOVER_ASK_URL to add the live /ask probe (only meaningful after E5).
  regressionGate('E6', url, host);
  // Do NOT checkpoint in --e6-only. Recording 'E6' from a standalone gate run would make a
  // LATER real cutover skip its own E6 entirely — the cutover would deploy and then report
  // the battery "already done" on the strength of a run that happened against a different
  // moment, possibly a different database. A gate rehearsal must leave no claim behind.
  if (standalone) { console.log('  (--e6-only: not checkpointed — this run makes no claim about a cutover)'); return; }
  cp.done.push('E6'); saveCheckpoint(cp);
}

// ────────────────────────────────────────────────────────────────────────────
function printPlan() {
  console.log(`
CUTOVER DRY-RUN PLAN (prod is a BUILD; census 2026-07-23, re-verified 2026-07-27)
  THE CUTOVER IS E0, E1, E2, E4, E5, E6. There is no E3 — forbidden-provenance
  deletion is DEFERRED to its own slice after a re-ingest exists to refill the
  corpus (owner ruling 2026-07-27; ADR-030 correction).
  STEP ZERO  preflight: host~${EXPECT_HOST}, role=${EXPECT_ROLE}, write-capability, positive control
  SNAPSHOT   a Neon branch off the target, created BEFORE the first write and
      asserted to exist; its id is quoted in every rollback (Neon PITR retention on
      this project is 6 h against a ~2 h 20 m run — the window can close first)
  E0  regression gate --capture: the pre-cutover baseline (user-data digests +
      active counts + owner distribution, the corpus-wide >=2-distinct-authors
      floor, reader, annotation write path, register wall, forbidden ratchet)
  E1  migrations 016-023 + 025-030 in order (018/019 concurrent)
      after EVERY migration: user data unchanged (digest, not count) + no INVALID index
      HAZARD 2 guard: refuse if a section-ordinal annotation precedes 024's renumber
  E2  register-label the flat embeddings (UPDATE); assert per-work label coverage
      against the TARGET's own author counts, and that no row was added or lost
  E4  slice served works into sections reusing vectors 1:1; re-assert per-work 1:1
      across every sliced work (ADR-029 addendum 2: each store, its own key), THEN
      apply 024 and assert sections.unit_ordinal is POPULATED (it backfills what E4
      creates; in E1 it left 71,563 of 72,863 NULL and the old 1:1 check said green)
  E5  [HARD STOP] deploy.sh
  E6  smoke counts + the full regression battery
  REGRESSION GATE RUNS AFTER EVERY CHUNK (E0/E1/E2/E4/E6), not just at the end.
  Any gate failure ABORTS and rolls back that chunk — never fix forward mid-cutover.
  Every count re-measured at runtime; NO dev literals baked into a target assertion.
  Resumable: completed steps recorded in .cutover-checkpoint.json, which is BOUND to
  the target endpoint and to ONE writing session — a checkpoint from another target
  is refused, and a second live process is refused rather than allowed to clobber it.
`);
}

(async () => {
  // Before anything else: is another cutover already running against this checkpoint?
  // Waiting for the first write would mean discovering it after connecting, snapshotting
  // and possibly migrating.
  try { assertCheckpointOwner(CHECKPOINT); }
  catch (e) { die('checkpoint', e.message, 'nothing written'); }
  const cp = loadCheckpoint(CHECKPOINT);
  printPlan(); // the design says "prints a dry-run plan FIRST" — a real run gets it too
  // STEP ZERO runs in dry-run too IF a target is supplied (proves reachability read-only);
  // with no target it prints the parked-rehearsal message and exits 0 for --dry-run.
  if (DRY && !process.env.CUTOVER_DATABASE_URL) { console.log('(no CUTOVER_DATABASE_URL set — STEP ZERO parked; supply the census clone to rehearse)'); return; }

  const { url, host } = await stepZero();
  if (PREFLIGHT_ONLY) { console.log('\n--preflight only: done.'); return; }

  // --e6-only: the gate, standalone. No snapshot (nothing writes), no checkpoint binding
  // (this run is not a cutover and must not inherit or create one's state), no owner gate,
  // and above all no E5. It is the mode you use to prove the battery still works.
  if (E6_ONLY) {
    console.log('\n=== --e6-only: E6 smoke + regression battery ONLY ===');
    console.log('  No migrations, no labelling, no slicing, NO DEPLOY. Nothing is checkpointed.');
    // CROSS-TARGET BASELINE, refused here rather than 200 lines later. --e6-only deliberately
    // skips bindCheckpoint (this run is not a cutover and must not create or inherit one's
    // state) — but e6_smoke then read cp.baseline.regression.forbidden and ratcheted THIS
    // target against a number measured on ANOTHER one, and on a mismatch printed
    // restoreFrom(cp), i.e. "restore the target from the pre-cutover Neon branch
    // pre-cutover-<other-fork>". Against production that is an instruction to restore prod
    // from a fork's snapshot. The child gate has this guard; the orchestrator's own leg did not.
    const baseHost = cp.baseline?.regression?.host;
    if (baseHost && baseHost !== host) {
      console.log(`  ⚠ the checkpoint's baseline belongs to ${baseHost}, not ${host}. IGNORING it for this run —`);
      console.log('    a ratchet against another database is meaningless, and its rollback text names another');
      console.log("    database's snapshot branch. This run reports readings instead of asserting on them.");
      cp.baseline = { ...cp.baseline, regression: undefined };
    }
    if (!cp.baseline?.regression) {
      console.log('  ⚠ NO E0 BASELINE on this checkpoint. Every ratcheted check (user data, the');
      console.log('    voice floors, the forbidden ratchet, section integrity) has nothing to compare');
      console.log('    against and will REPORT its reading instead of asserting on it. That is a');
      console.log('    weaker run than a cutover E6 — read the gate\'s own verdict line, which says so.');
    }
    await e6_smoke(neon(url), url, host, cp, { standalone: true });
    console.log('\n--e6-only: done.');
    return;
  }
  // CUTOVER_REHEARSAL=1 suppresses the FIRST-PROD-WRITE owner gate (and E5). It existed
  // to let a fork run unattended — but it never checked the target, so
  // CUTOVER_REHEARSAL=1 with a prod URL would apply all 16 migrations, relabel 190,635
  // rows and delete 71,884 of them on PRODUCTION with zero owner confirmation. The
  // design allows exactly two gates; it does not allow an env var to reach zero.
  if (process.env.CUTOVER_REHEARSAL === '1' && isProdHost(url)) {
    die('pre-E1', 'CUTOVER_REHEARSAL=1 is set and the target is PRODUCTION. Rehearsal mode suppresses the owner gate and must never point at prod.', 'nothing written');
  }
  if (!DRY) bindCheckpoint(cp, host);

  // THE RESTORE POINT, before anything else. Every rollback string in this file names
  // it; until 2026-07-27 they all named a snapshot nothing created.
  preCutoverSnapshot(cp, host);

  const sql = neon(url);
  // E0 — capture the pre-cutover baseline and prove every surface is green BEFORE
  // the first write. A regression gate with no "before" reading cannot tell a
  // cutover-caused break from one that was already there.
  if (!cp.done.includes('E0')) {
    regressionGate('E0', url, host, { capture: true });
    if (!DRY) {
      // The orchestrator's own copy of the E0 user-data reading. The gate captures its
      // own; this one is what every step compares against in assertUserDataVsE0, so the
      // orchestrator's leg of the invariant does not depend on the child process having
      // written the file it was asked to write.
      cp.baseline.userData = await measureUserData(sql);
      ok(`E0 user-data baseline: ${userShape(cp.baseline.userData)}`);
      cp.done.push('E0'); saveCheckpoint(cp);
    }
  } else console.log('\nE0 — (checkpoint) baseline already captured');

  const e1Total = MIGRATIONS.length + CONCURRENT.length;
  const e1Complete = cp.done.filter((d) => d.startsWith('E1:')).length >= e1Total;
  if (!DRY && !e1Complete && process.env.CUTOVER_REHEARSAL !== '1') {
    const a = await ask('\nHARD STOP (§4.1): STEP ZERO passed. Proceed to the FIRST PROD WRITE (E1 migrations)? type "write": ');
    if (a !== 'write') die('pre-E1', 'owner did not confirm the first prod write', 'nothing written');
  }
  await e1_migrations(sql, url, cp); regressionGate('E1', url, host);
  await e2_label(sql, url, cp);      regressionGate('E2', url, host);
  await e4_slice(sql, url, cp);      regressionGate('E4', url, host);
  await e5_deploy(cp, url, host);
  await e6_smoke(sql, url, host, cp);
  console.log('\nCUTOVER COMPLETE.');
})().catch((e) => die('unhandled', e.message));
