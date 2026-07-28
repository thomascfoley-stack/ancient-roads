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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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

// ── the user-row invariant ───────────────────────────────────────────────────
// 34 highlights (6 users) / 2 notes (1 user) / 1 chat on prod, but the numbers
// are never asserted from that literal — they are MEASURED on the target before
// the first write and re-measured after every migration. Migration 025 rewrites
// the annotation schema (upsertNote hard-depends on it) and 030 tightens its
// constraints, so "which migrations touch an annotation table" is not a list we
// maintain by hand: every migration is checked.
const USER_TABLES = ['highlights', 'notes', 'chats'];
async function measureUserData(sql) {
  const out = {};
  for (const t of USER_TABLES) {
    const e = await q1(sql, `SELECT to_regclass('${t}') IS NOT NULL AS ok`);
    if (!e.ok) { out[t] = { rows: -1, users: -1 }; continue; }
    const r = await q1(sql, `SELECT count(*)::int AS n, count(DISTINCT user_id)::int AS u FROM ${t}`);
    out[t] = { rows: r.n, users: r.u };
  }
  return out;
}
const userShape = (m) => USER_TABLES.map((t) => `${t}=${m[t].rows}/${m[t].users}u`).join(' ');
async function assertUserDataUnchanged(sql, base, where, rollback) {
  const now = await measureUserData(sql);
  for (const t of USER_TABLES) {
    if (base[t].rows !== now[t].rows || base[t].users !== now[t].users) {
      die(where, `USER DATA MOVED on ${t}: ${base[t].rows}/${base[t].users}u -> ${now[t].rows}/${now[t].users}u`, rollback);
    }
  }
  return now;
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

  // The user-row invariant: measured on the TARGET before the first migration,
  // then re-asserted after every single one.
  let userBase = DRY ? null : await measureUserData(sql);
  if (userBase) ok(`user-data baseline (measured on target): ${userShape(userBase)}`);

  const applyOne = async (m, runner) => {
    if (cp.done.includes(`E1:${m}`)) { console.log(`    (checkpoint) ${m} already applied`); return; }
    console.log(`  apply ${runner.includes('concurrent') ? '(concurrent) ' : ''}${m}`);
    runNode([runner, `db/migrations/${m}.sql`], url);
    if (!DRY) {
      await assertUserDataUnchanged(sql, userBase, `E1/${m}`,
        `restore highlights/notes/chats from the pre-E1 Neon branch snapshot, then re-apply from ${m}`);
      // Per-migration index validity: a CREATE INDEX that failed mid-flight leaves an
      // INVALID index behind that the planner silently ignores — a serving regression
      // with no error. Assert across the whole schema, not just idx_embeddings_%.
      const invalid = await q1(sql, `SELECT count(*)::int AS n, coalesce(string_agg(c.relname, ', '), '') AS names
        FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT i.indisvalid`);
      if (invalid.n > 0) die(`E1/${m}`, `${invalid.n} INVALID index(es) after ${m}: ${invalid.names}`,
        'DROP the invalid index and re-run this migration (idempotent)');
    }
    cp.done.push(`E1:${m}`); saveCheckpoint(cp);
  };

  for (const m of MIGRATIONS) await applyOne(m, 'db/apply-migration.mjs');
  for (const m of CONCURRENT) await applyOne(m, 'db/apply-migration-concurrent.mjs');

  // POSTCONDITION: no invalid index anywhere, and the user rows are exactly where
  // they started.
  if (!DRY) {
    const invalid = await q1(sql, `SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid`);
    if (invalid.n > 0) die('E1', `${invalid.n} index(es) are INVALID after migration`, 'DROP the invalid index and re-run the concurrent step (idempotent)');
    userBase = await assertUserDataUnchanged(sql, userBase, 'E1', 'restore from the pre-E1 Neon branch snapshot');
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
  execFileSync('node', ['scripts/register-label-embeddings.mjs', '--apply'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, CUTOVER_DATABASE_URL: url, DATABASE_URL: url, CUTOVER_ALLOW: '1' },
  });
  const after = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int unlabeled, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  console.log(`  postcondition: ${after.unlabeled}/${after.total} unlabeled (was ${base.unlabeled})`);
  if (after.unlabeled === base.unlabeled && base.unlabeled === base.total) die('E2', 'zero rows labeled — mapping missed the prod author strings', 'revert: UPDATE metadata - work key');
  if (after.total !== base.total) die('E2', `row COUNT changed during a metadata-only UPDATE: ${base.total} -> ${after.total}`, 'restore embeddings from the pre-E2 Neon branch snapshot');

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
  cp.done.push('E2'); saveCheckpoint(cp);
}

async function e3_forbidden(sql, url, cp) {
  if (cp.done.includes('E3')) { console.log('\nE3 — (checkpoint) already done'); return; }
  console.log('\nE3 — forbidden-provenance cleanup (DELETE; backup-before-delete)');
  const before = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int n, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  console.log(`  precondition (re-measured): ${before.n} forbidden-provenance rows of ${before.total} platform rows`);
  // ADR-030: 4,174 of these are rows prod SERVES today (Chrysostom 2,515 / Augustine
  // 1,659). That is APPROVED and expected — measure it, print it, do not abort on it.
  const served = await q1(sql, `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL
     AND (metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')
     AND (metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
       OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
       OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
       OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%'))`);
  console.log(`  of which SERVED today: ${served.n} (ADR-030 approved this removal; expected, not a surprise)`);
  const userBase = await measureUserData(sql);
  const backupsBefore = existsSync(path.join(ROOT, 'data/quarantine'))
    ? readdirSync(path.join(ROOT, 'data/quarantine')).filter((f) => f.startsWith('forbidden-provenance-removed-')).length : 0;
  console.log('  action: npx tsx src/ingest/b2-remove-forbidden-provenance.ts --apply  (backup -> delete -> ratchet)');
  if (DRY) { console.log('    [dry-run] would run b2-remove-forbidden-provenance --apply'); return; }
  execFileSync('npx', ['tsx', 'src/ingest/b2-remove-forbidden-provenance.ts', '--apply'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, NEON_BRANCH: process.env.NEON_BRANCH ?? 'cutover-target', MIGRATE_ALLOW_PROD: '1', B2_ALLOW_PROD: '1' },
  });
  // BACKUP-BEFORE-DELETE is a precondition of the design, so verify the artifact
  // exists rather than trusting that the delegate wrote one.
  const backups = readdirSync(path.join(ROOT, 'data/quarantine')).filter((f) => f.startsWith('forbidden-provenance-removed-'));
  if (backups.length <= backupsBefore) die('E3', 'no new forbidden-provenance backup JSONL was written — refusing to accept a delete with no backup', 'restore embeddings from the pre-E3 Neon branch snapshot');
  const newest = backups.sort().at(-1);
  const lines = readFileSync(path.join(ROOT, 'data/quarantine', newest), 'utf8').split('\n').filter(Boolean).length;
  ok(`backup written: data/quarantine/${newest} (${lines} row(s))`);

  const after = await q1(sql, `SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int n, count(*)::int total FROM embeddings WHERE user_id IS NULL`);
  if (after.n !== 0) die('E3', `ratchet not 0 after cleanup (${after.n} remain)`, `restore from data/quarantine/${newest}`);
  // The delete must have removed EXACTLY the forbidden rows and nothing else.
  const expectTotal = before.total - before.n;
  if (after.total !== expectTotal) die('E3', `collateral damage: expected ${expectTotal} platform rows after removing ${before.n}, found ${after.total}`, `restore from data/quarantine/${newest}`);
  ok(`postcondition: ratchet = 0; exactly ${before.n} rows removed, ${after.total} remain`);
  await assertUserDataUnchanged(sql, userBase, 'E3', `restore from data/quarantine/${newest}`);
  ok(`postcondition: user rows unchanged (${userShape(userBase)})`);
  cp.done.push('E3'); saveCheckpoint(cp);
}

async function e4_slice(sql, url, cp) {
  if (cp.done.includes('E4')) { console.log('\nE4 — (checkpoint) already done'); return; }
  console.log('\nE4 — slice works into sections, reusing vectors 1:1');
  console.log('  per served work: migrate-sections-slice, then assert sections == flat-pool count FOR THAT WORK (hazard 1: each store its own key; assert 1:1).');
  if (DRY) { console.log('    [dry-run] would run cutover-e4-slice-all.mjs'); return; }
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
  ok(`postcondition: 1:1 sections↔flat pool for every sliced register work (${drift.length} source(s) with sections)`);
  await assertUserDataUnchanged(sql, userBase, 'E4', 'DELETE the sections rows written by this step and re-run');
  cp.done.push('E4'); saveCheckpoint(cp);
}

async function e5_deploy(cp, host) {
  if (process.env.CUTOVER_REHEARSAL === '1') { console.log('\nE5 — skipped (CUTOVER_REHEARSAL)'); return; }
  // Deploying is only ever correct when the database this run just built IS prod.
  // A rehearsal fork that reached E5 must never push a build to ancientpaths.app.
  if (host && !host.includes('ep-odd-fog')) die('E5', `target is ${host}, not the prod endpoint — refusing to deploy a build from a non-prod cutover`, 'none; nothing deployed');
  console.log('\nE5 — deploy.sh (clean-tree -> licensing ratchet -> build -> vercel --prod)');
  if (DRY) { console.log('    [dry-run] would require owner "yes", then run ./deploy.sh'); return; }
  const a = await ask('  HARD STOP (§4.1): run ./deploy.sh to PROD now? type "deploy": ');
  if (a !== 'deploy') die('E5', 'owner did not confirm deploy', 'none');
  execFileSync('bash', ['deploy.sh'], { cwd: ROOT, stdio: 'inherit' });
  cp.done.push('E5'); saveCheckpoint(cp);
}

async function e6_smoke(sql, url, host) {
  console.log('\nE6 — smoke + regression gate');
  if (DRY) { console.log('    [dry-run] would run the smoke counts + the full regression battery'); return; }
  // (a) corpus smoke — the positive control and the two ratchets.
  const gill = (await sql`SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`)[0].n;
  const secs = (await sql`SELECT count(*)::int AS n FROM sections`)[0].n;
  const forb = (await sql`SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int AS n FROM embeddings WHERE user_id IS NULL`)[0].n;
  console.log(`  Gill rows: ${gill}  sections: ${secs}  forbidden-provenance: ${forb}`);
  if (gill === 0) die('E6', 'Gill positive control dead after cutover', 'restore the target from its pre-cutover Neon branch snapshot');
  if (forb !== 0) die('E6', `forbidden-provenance ratchet not 0 (${forb})`, 're-run E3');
  ok('smoke counts pass');
  // (b) the full regression battery — the same gate every chunk ran, once more at the
  // end. Set CUTOVER_ASK_URL to add the live /ask probe (only meaningful after E5).
  regressionGate('E6', url, host);
}

// ────────────────────────────────────────────────────────────────────────────
function printPlan() {
  console.log(`
CUTOVER DRY-RUN PLAN (prod is a BUILD; census 2026-07-23, re-verified 2026-07-27)
  STEP ZERO  preflight: host~${EXPECT_HOST}, role=${EXPECT_ROLE}, write-capability, positive control
  E0  regression gate --capture: the pre-cutover baseline (user rows, voices, reader,
      annotation write path, register wall, forbidden ratchet), measured on the TARGET
  E1  migrations 016-030 in order (018/019 concurrent)
      after EVERY migration: user rows unchanged + no INVALID index
      HAZARD 2 guard: refuse if a section-ordinal annotation precedes 024's renumber
  E2  register-label the flat embeddings (UPDATE); assert per-work label coverage
      against the TARGET's own author counts, and that no row was added or lost
  E3  DELETE forbidden-provenance rows (backup first, backup artifact verified);
      assert ratchet = 0 and exactly that many rows gone (ADR-030: the served subset
      is approved, printed, and not an abort condition)
  E4  slice served works into sections reusing vectors 1:1; re-assert per-work 1:1
      across every sliced work (ADR-029 addendum 2: each store, its own key)
  E5  [HARD STOP] deploy.sh
  E6  smoke counts + the full regression battery
  REGRESSION GATE RUNS AFTER EVERY CHUNK (E0/E1/E2/E3/E4/E6), not just at the end.
  Any gate failure ABORTS and rolls back that chunk — never fix forward mid-cutover.
  Every count re-measured at runtime; NO dev literals baked into a target assertion.
  Resumable: completed steps recorded in .cutover-checkpoint.json, which is BOUND to
  the target endpoint — a checkpoint from another target is refused, not replayed.
`);
}

(async () => {
  const cp = loadCheckpoint();
  if (DRY) printPlan();
  // STEP ZERO runs in dry-run too IF a target is supplied (proves reachability read-only);
  // with no target it prints the parked-rehearsal message and exits 0 for --dry-run.
  if (DRY && !process.env.CUTOVER_DATABASE_URL) { console.log('(no CUTOVER_DATABASE_URL set — STEP ZERO parked; supply the census clone to rehearse)'); return; }

  const { url, host } = await stepZero();
  if (PREFLIGHT_ONLY) { console.log('\n--preflight only: done.'); return; }
  if (!DRY) bindCheckpoint(cp, host);

  const sql = neon(url);
  // E0 — capture the pre-cutover baseline and prove every surface is green BEFORE
  // the first write. A regression gate with no "before" reading cannot tell a
  // cutover-caused break from one that was already there.
  if (!cp.done.includes('E0')) {
    regressionGate('E0', url, host, { capture: true });
    if (!DRY) { cp.done.push('E0'); saveCheckpoint(cp); }
  } else console.log('\nE0 — (checkpoint) baseline already captured');

  const e1Total = MIGRATIONS.length + CONCURRENT.length;
  const e1Complete = cp.done.filter((d) => d.startsWith('E1:')).length >= e1Total;
  if (!DRY && !e1Complete && process.env.CUTOVER_REHEARSAL !== '1') {
    const a = await ask('\nHARD STOP (§4.1): STEP ZERO passed. Proceed to the FIRST PROD WRITE (E1 migrations)? type "write": ');
    if (a !== 'write') die('pre-E1', 'owner did not confirm the first prod write', 'nothing written');
  }
  await e1_migrations(sql, url, cp); regressionGate('E1', url, host);
  await e2_label(sql, url, cp);      regressionGate('E2', url, host);
  await e3_forbidden(sql, url, cp);  regressionGate('E3', url, host);
  await e4_slice(sql, url, cp);      regressionGate('E4', url, host);
  await e5_deploy(cp, host);
  await e6_smoke(sql, url, host);
  console.log('\nCUTOVER COMPLETE.');
})().catch((e) => die('unhandled', e.message));
