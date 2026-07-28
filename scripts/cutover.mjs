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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT = path.join(ROOT, '.cutover-checkpoint.json');
const DRY = process.argv.includes('--dry-run');
const PREFLIGHT_ONLY = process.argv.includes('--preflight');
const EXPECT_HOST = process.env.CUTOVER_EXPECT_HOST ?? 'ep-odd-fog'; // prod endpoint; overridable for a census-clone rehearsal
const EXPECT_ROLE = 'neondb_owner';

const die = (step, msg, rollback) => {
  console.error(`\n✗ ABORT at ${step}: ${msg}`);
  if (rollback) console.error(`  rollback: ${rollback}`);
  process.exit(1);
};
const ok = (m) => console.log(`  ✓ ${m}`);

function loadCheckpoint() { return existsSync(CHECKPOINT) ? JSON.parse(readFileSync(CHECKPOINT, 'utf8')) : { done: [], baseline: {} }; }
function saveCheckpoint(cp) { writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2)); }
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

// ────────────────────────────────────────────────────────────────────────────
// STEP ZERO — prod-credential preflight. Converts "dies mid-migration" into
// "refuses to start". Read-only; leaves nothing behind.
// ────────────────────────────────────────────────────────────────────────────
async function stepZero() {
  console.log('\nSTEP ZERO — prod-credential preflight');
  const url = process.env.CUTOVER_DATABASE_URL;
  if (!url) die('STEP ZERO', 'CUTOVER_DATABASE_URL is unset. This is the parked-rehearsal state: supply the census-clone (ep-young-hat) or prod owner string explicitly. Never sourced from .env.local.');

  let host;
  try { host = new URL(url).host; } catch { die('STEP ZERO', 'CUTOVER_DATABASE_URL is not a valid URL'); }
  console.log(`  target host: ${host}`);

  // (3) endpoint identity — this IS the intended branch, not dev or a stale copy.
  if (!host.includes(EXPECT_HOST)) die('STEP ZERO', `host ${host} does not contain expected endpoint '${EXPECT_HOST}'. Refusing (wrong target).`);
  ok(`endpoint contains ${EXPECT_HOST}`);

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
const CONCURRENT = ['018_register_partial_indexes', '019_register_columns_fts', '024_sections_unit_ordinal'];

async function e1_migrations(sql, url, cp) {
  const e1Total = MIGRATIONS.length + CONCURRENT.length;
  const e1Done = cp.done.filter((d) => d.startsWith('E1:')).length;
  if (e1Done >= e1Total) {
    console.log('\nE1 — (checkpoint) all migrations applied');
    return;
  }
  console.log('\nE1 — migrations 016-030 (fresh; prod is pre-016 per census)');
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
    if (hasSectionAnno.x) die('E1/024', 'a section-annotation table exists BEFORE 024 renumbers ordinals — 024 would invalidate stored ordinals. Order around 024 or migrate the anchors first (hazard 2).', 'restore from pre-E1 snapshot');
  }
  ok('hazard 2: no section-ordinal annotation precedes 024 (verse-offset highlights are unaffected)');

  for (const m of MIGRATIONS) {
    if (cp.done.includes(`E1:${m}`)) { console.log(`    (checkpoint) ${m} already applied`); continue; }
    console.log(`  apply ${m}`);
    runNode(['db/apply-migration.mjs', `db/migrations/${m}.sql`], url);
    cp.done.push(`E1:${m}`); saveCheckpoint(cp);
  }
  for (const m of CONCURRENT) {
    if (cp.done.includes(`E1:${m}`)) { console.log(`    (checkpoint) ${m} already applied`); continue; }
    console.log(`  apply (concurrent) ${m}`);
    runNode(['db/apply-migration-concurrent.mjs', `db/migrations/${m}.sql`], url);
    cp.done.push(`E1:${m}`); saveCheckpoint(cp);
  }
  // POSTCONDITION: the 6 serving indexes VALID+READY (the concurrent runner already asserts;
  // re-assert here as the step's own contract).
  if (!DRY) {
    const invalid = await q1(sql, `SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname LIKE 'idx_embeddings_%' AND NOT i.indisvalid`);
    if (invalid.n > 0) die('E1', `${invalid.n} serving index(es) are INVALID after migration`, 'DROP the invalid index and re-run the concurrent step (idempotent)');
  }
  ok('postcondition: no invalid serving index');
}

async function e2_label(sql, url, cp) {
  if (cp.done.includes('E2')) { console.log('\nE2 — (checkpoint) already done'); return; }
  console.log('\nE2 — register-label the flat embeddings (metadata UPDATE, not a re-embed)');
  const base = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int unlabeled, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  console.log(`  precondition (re-measured): ${base.unlabeled}/${base.total} rows unlabeled`);
  cp.baseline.e2 = base; saveCheckpoint(cp);
  if (DRY) { console.log('    [dry-run] would run register-label-embeddings.mjs --apply'); return; }
  execFileSync('node', ['scripts/register-label-embeddings.mjs', '--apply'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, CUTOVER_DATABASE_URL: url, DATABASE_URL: url, CUTOVER_ALLOW: '1' },
  });
  const after = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int unlabeled, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  console.log(`  postcondition: ${after.unlabeled}/${after.total} unlabeled (was ${base.unlabeled})`);
  if (after.unlabeled === base.unlabeled && base.unlabeled === base.total) die('E2', 'zero rows labeled — mapping missed the prod author strings', 'revert: UPDATE metadata - work key');
  ok('register-label applied');
  cp.done.push('E2'); saveCheckpoint(cp);
}

async function e3_forbidden(sql, url, cp) {
  if (cp.done.includes('E3')) { console.log('\nE3 — (checkpoint) already done'); return; }
  console.log('\nE3 — forbidden-provenance cleanup (DELETE; backup-before-delete)');
  const before = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int n FROM embeddings WHERE user_id IS NULL`);
  console.log(`  precondition (re-measured): ${before.n} forbidden-provenance rows`);
  console.log('  action: npx tsx src/ingest/b2-remove-forbidden-provenance.ts --apply  (backup -> delete -> ratchet)');
  if (DRY) { console.log('    [dry-run] would run b2-remove-forbidden-provenance --apply'); return; }
  execFileSync('npx', ['tsx', 'src/ingest/b2-remove-forbidden-provenance.ts', '--apply'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, NEON_BRANCH: process.env.NEON_BRANCH ?? 'census-clone', MIGRATE_ALLOW_PROD: '1', B2_ALLOW_PROD: '1' },
  });
  const after = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int n FROM embeddings WHERE user_id IS NULL`);
  if (after.n !== 0) die('E3', `ratchet not 0 after cleanup (${after.n} remain)`, 'restore from the timestamped JSONL backup b2 wrote');
  ok('postcondition: forbidden-provenance ratchet = 0');
  cp.done.push('E3'); saveCheckpoint(cp);
}

async function e4_slice(sql, url, cp) {
  if (cp.done.includes('E4')) { console.log('\nE4 — (checkpoint) already done'); return; }
  console.log('\nE4 — slice works into sections, reusing vectors 1:1');
  console.log('  per served work: migrate-sections-slice, then assert sections == flat-pool count FOR THAT WORK (hazard 1: each store its own key; assert 1:1).');
  if (DRY) { console.log('    [dry-run] would run cutover-e4-slice-all.mjs'); return; }
  execFileSync('node', ['scripts/cutover-e4-slice-all.mjs'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, CUTOVER_DATABASE_URL: url, DATABASE_URL: url, CUTOVER_ALLOW: '1', MIGRATE_ALLOW_PROD: '1' },
  });
  ok('E4 slice-all complete');
  cp.done.push('E4'); saveCheckpoint(cp);
}

async function e5_deploy(cp) {
  if (process.env.CUTOVER_REHEARSAL === '1') { console.log('\nE5 — skipped (CUTOVER_REHEARSAL)'); return; }
  console.log('\nE5 — deploy.sh (clean-tree -> licensing ratchet -> build -> vercel --prod)');
  if (DRY) { console.log('    [dry-run] would require owner "yes", then run ./deploy.sh'); return; }
  const a = await ask('  HARD STOP (§4.1): run ./deploy.sh to PROD now? type "deploy": ');
  if (a !== 'deploy') die('E5', 'owner did not confirm deploy', 'none');
  execFileSync('bash', ['deploy.sh'], { cwd: ROOT, stdio: 'inherit' });
  cp.done.push('E5'); saveCheckpoint(cp);
}

async function e6_smoke(sql) {
  if (process.env.CUTOVER_REHEARSAL === '1') {
    console.log('\nE6 — rehearsal smoke (counts only)');
    const gill = (await sql`SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`)[0].n;
    const secs = (await sql`SELECT count(*)::int AS n FROM sections`)[0].n;
    const forb = (await sql`SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int AS n FROM embeddings WHERE user_id IS NULL`)[0].n;
    console.log(`  Gill rows: ${gill}  sections: ${secs}  forbidden-provenance: ${forb}`);
    if (gill === 0) die('E6', 'Gill positive control dead after cutover', 'restore clone from branch');
    if (forb !== 0) die('E6', `forbidden-provenance ratchet not 0 (${forb})`, 're-run E3');
    ok('rehearsal smoke passed');
    return;
  }
  console.log('\nE6 — smoke + regression gate');
  console.log('  /ask answers with >=2 distinct voices on a known-good query; reader renders + tap-verse opens commentaries; existing highlights/notes load AND write; register wall holds.');
  if (DRY) { console.log('    [dry-run] would run the smoke + regression battery against prod'); return; }
  die('E6', 'smoke battery must be wired here (reuse register-wall-check + a live /ask probe + annotation round-trip). PARKED until rehearsal.', 'redeploy the previous Vercel build');
}

// ────────────────────────────────────────────────────────────────────────────
function printPlan() {
  console.log(`
CUTOVER DRY-RUN PLAN (prod is a BUILD; census 2026-07-23)
  STEP ZERO  preflight: host~${EXPECT_HOST}, role=${EXPECT_ROLE}, write-capability, positive control
  E1  migrations 016-030 in order (018/019 concurrent); assert every serving index VALID
      HAZARD 2 guard: refuse if a section-ordinal annotation precedes 024's renumber
  E2  register-label ~190,635 flat embeddings (UPDATE); assert label coverage vs re-measured shape
  E3  DELETE ~71,884 forbidden-provenance rows (backup first); assert ratchet = 0
  E4  slice served works into sections reusing vectors 1:1; assert per-work 1:1 (hazard 1)
  E5  [HARD STOP] deploy.sh
  E6  smoke + regression (>=2 voices, reader, annotation round-trip, register wall)
  Every count re-measured at runtime; NO dev literals baked into a prod assertion (hazard 4).
  Resumable: completed steps recorded in .cutover-checkpoint.json and skipped on re-run.
`);
}

(async () => {
  const cp = loadCheckpoint();
  if (DRY) printPlan();
  // STEP ZERO runs in dry-run too IF a target is supplied (proves reachability read-only);
  // with no target it prints the parked-rehearsal message and exits 0 for --dry-run.
  if (DRY && !process.env.CUTOVER_DATABASE_URL) { console.log('(no CUTOVER_DATABASE_URL set — STEP ZERO parked; supply the census clone to rehearse)'); return; }

  const { url } = await stepZero();
  if (PREFLIGHT_ONLY) { console.log('\n--preflight only: done.'); return; }

  const sql = neon(url);
  const e1Total = MIGRATIONS.length + CONCURRENT.length;
  const e1Complete = cp.done.filter((d) => d.startsWith('E1:')).length >= e1Total;
  if (!DRY && !e1Complete && process.env.CUTOVER_REHEARSAL !== '1') {
    const a = await ask('\nHARD STOP (§4.1): STEP ZERO passed. Proceed to the FIRST PROD WRITE (E1 migrations)? type "write": ');
    if (a !== 'write') die('pre-E1', 'owner did not confirm the first prod write', 'nothing written');
  }
  await e1_migrations(sql, url, cp);
  await e2_label(sql, url, cp);
  await e3_forbidden(sql, url, cp);
  await e4_slice(sql, url, cp);
  await e5_deploy(cp);
  await e6_smoke(sql);
  console.log('\nCUTOVER COMPLETE.');
})().catch((e) => die('unhandled', e.message));
