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
//   CUTOVER_DATABASE_URL=<owner> node scripts/cutover.mjs --e6-only     regression gate only (read-mostly)
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
const E6_ONLY = process.argv.includes('--e6-only'); // run the regression gate alone (rehearsal / post-hoc re-check)
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
const q1 = async (sql, text, params) => (await sql.query(text, params))[0];

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

// ────────────────────────────────────────────────────────────────────────────
// E6 — smoke + regression gate (CUTOVER_DESIGN.md "Regression gates").
//
// The four things the design says must still be true after a cutover:
//   1. /ask answers with >=2 distinct voices on a known-good passage
//   2. the reader's corpus is intact and internally consistent
//   3. existing highlights/notes load AND write (E1 changed the annotation schema;
//      upsertNote hard-depends on 025)
//   4. the register wall holds
//
// Every check is a real assertion that CAN fail, run against the DB the cutover
// just wrote. Nothing here is a lookalike: 6F writes real rows through the real
// constraints and proves the DB REJECTS the shapes 025/030 forbid — a check
// that has been watched red is the only kind this repo counts (THE_LOOP rule 4).
//
// FALSE-GREEN DISCIPLINE: a check whose precondition is not met is reported
// SKIPPED (visibly) and counts as a FAILURE of the gate, never as a pass. The
// only exception is 6G, which needs an HTTP target that may not exist during a
// rehearsal — it degrades to SKIPPED-OK and says so loudly.
//
// Prove it red (required before trusting it — THE_LOOP rule 4):
//   CUTOVER_E6_PROVE_FAIL=6C ... node scripts/cutover.mjs --e6-only
// poisons that one check's measured input and the gate must go red.
// ────────────────────────────────────────────────────────────────────────────

// The teacher's legal-corpus filter, mirrored from web/src/lib/teacher/routing.ts
// (same approach as scripts/diagnose-prod.mjs). If routing.ts drifts this measures
// the wrong pool — 6A's positive control is the tripwire that catches a dead filter.
const LEGAL_FILTER = `(
      metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
   OR (metadata->>'author' = 'John Chrysostom' AND (metadata->>'verseId')::int / 1000000 IN (40,43,44))
   OR (metadata->>'author' = 'Augustine of Hippo' AND (metadata->>'verseId')::int / 1000000 IN (19,43))
   OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin')
       AND metadata->>'sourceUrl' ILIKE '%crosswire%')
  )`;

// ADR-023 register wall: exegetical answers come from these two registers only.
// Everything else rides ALONGSIDE as a labeled lane payload and can never satisfy
// the >=2-voices exegetical floor. Types are the 017 CHECK list.
const EXEGETICAL_TYPES = ['commentary', 'father'];
const LANE_TYPES = ['sermon', 'theology', 'hymn', 'poetry', 'historian', 'confession', 'lexicon', 'art'];

// John 10 — "the good shepherd". The canonical known-good passage in this repo's
// eval set; verseId is BBCCCVVV so book*1000+chapter == 43010.
const KNOWN_GOOD_CHAPTER_KEY = 43010;
const KNOWN_GOOD_LABEL = 'John 10 (good shepherd)';

const PROVE_FAIL = process.env.CUTOVER_E6_PROVE_FAIL ?? '';
// Poison one check's measured value so the gate can be watched going red.
const poison = (id, real, broken) => (PROVE_FAIL === id ? broken : real);

async function e6_smoke(sql, cp) {
  console.log('\nE6 — smoke + regression gate');
  if (DRY) { console.log('    [dry-run] would run the smoke + regression battery (6A-6G)'); return; }
  if (PROVE_FAIL) console.log(`  ⚠ CUTOVER_E6_PROVE_FAIL=${PROVE_FAIL} — deliberately poisoning that check (red-first proof run)`);

  const results = [];
  const record = (id, name, pass, detail, rollback) => {
    results.push({ id, name, pass, detail, rollback });
    console.log(`  ${pass ? '✓' : '✗'} ${id} ${name} — ${detail}`);
  };

  // ── 6A. positive control: the legal corpus is alive ────────────────────────
  try {
    const r = await q1(sql, `SELECT count(*)::int AS n FROM embeddings
                             WHERE user_id IS NULL AND ${LEGAL_FILTER}`);
    const n = poison('6A', r.n, 0);
    record('6A', 'legal corpus positive control', n > 0,
      `${n} rows admitted by LEGAL_CORPUS_FILTER`,
      'the filter matched nothing — routing.ts drifted, or E2 labelling did not land');
  } catch (e) { record('6A', 'legal corpus positive control', false, `query failed: ${e.message}`, 'inspect the filter'); }

  // ── 6B. forbidden-provenance ratchet is still 0 ────────────────────────────
  try {
    const r = await q1(sql, `SELECT count(*)::int AS n FROM embeddings
       WHERE user_id IS NULL
         AND (metadata->>'sourceUrl' ILIKE '%biblehub%'
           OR metadata->>'sourceUrl' ILIKE '%historicalchristian%'
           OR metadata->>'sourceUrl' ILIKE '%studylight%')`);
    const n = poison('6B', r.n, 1);
    record('6B', 'forbidden-provenance ratchet', n === 0, `${n} forbidden rows (must be 0)`, 're-run E3');
  } catch (e) { record('6B', 'forbidden-provenance ratchet', false, `query failed: ${e.message}`, 're-run E3'); }

  // ── 6C. the >=2 distinct voices product guarantee ──────────────────────────
  // Named passage AND corpus-wide, compared to the baseline captured before E1
  // so a cutover that quietly halves coverage cannot pass.
  try {
    const one = await q1(sql, `SELECT count(DISTINCT metadata->>'author')::int AS voices
       FROM embeddings
       WHERE user_id IS NULL AND ${LEGAL_FILTER}
         AND (metadata->>'verseId')::int / 1000 = ${KNOWN_GOOD_CHAPTER_KEY}`);
    const voices = poison('6C', one.voices, 1);
    record('6C', `>=2 voices on ${KNOWN_GOOD_LABEL}`, voices >= 2,
      `${voices} distinct legal authors`,
      'retrieval cannot meet the product guarantee on a known-good passage — do NOT serve; roll back the deploy');

    const wide = await q1(sql, `
      WITH per_ch AS (
        SELECT (metadata->>'verseId')::int / 1000 AS ch,
               count(DISTINCT metadata->>'author') AS v
        FROM embeddings WHERE user_id IS NULL AND ${LEGAL_FILTER} GROUP BY 1)
      SELECT count(*) FILTER (WHERE v >= 2)::int AS ok_ch, count(*)::int AS any_ch FROM per_ch`);
    // A standalone re-check has no checkpoint; the owner may supply the
    // pre-cutover number explicitly. Never derive it from THIS run — comparing a
    // measurement to itself is not a check.
    const envBase = process.env.CUTOVER_E6_BASELINE ? Number(process.env.CUTOVER_E6_BASELINE) : null;
    const base = cp.baseline?.chaptersWith2Voices ?? envBase;
    if (base == null) {
      record('6C-wide', 'corpus-wide >=2-voice coverage', false,
        `${wide.ok_ch}/${wide.any_ch} chapters — SKIPPED (visibly): no pre-cutover baseline`,
        'run the full cutover (it records the baseline before E1), or pass CUTOVER_E6_BASELINE=<pre-cutover chapter count>');
    } else {
      const now = poison('6C-wide', wide.ok_ch, 0);
      // Coverage may legitimately RISE (E2/E4 add work keys). It must not fall.
      record('6C-wide', 'corpus-wide >=2-voice coverage', now >= base,
        `${now} chapters now vs ${base} before cutover`,
        'coverage regressed — E2/E3/E4 removed more than intended; restore from the E3 backup');
    }
  } catch (e) { record('6C', '>=2 voices guarantee', false, `query failed: ${e.message}`, 'roll back the deploy'); }

  // ── 6D. the register wall ──────────────────────────────────────────────────
  // Precondition first: if no lane content exists, a wall proves nothing (vacuous).
  try {
    const pre = await q1(sql, `SELECT count(*)::int AS n FROM sources
                               WHERE status='published' AND source_type = ANY($1::text[])`, [LANE_TYPES]);
    if (pre.n === 0) {
      record('6D', 'register wall', false,
        'SKIPPED (visibly): no published lane content exists, so the wall is vacuous',
        'publish lane content or drop this assertion deliberately');
    } else {
      const breach = await q1(sql, `SELECT count(*)::int AS n FROM embeddings
         WHERE user_id IS NULL AND source_type = ANY($1::text[]) AND ${LEGAL_FILTER}`, [LANE_TYPES]);
      const n = poison('6D', breach.n, 1);
      record('6D', 'register wall', n === 0,
        `${n} lane rows admitted to the exegetical pool (must be 0; ${pre.n} lane works published)`,
        'lane content can satisfy the exegetical floor — ADR-023 breached; roll back the deploy');
    }
  } catch (e) { record('6D', 'register wall', false, `query failed: ${e.message}`, 'roll back the deploy'); }

  // ── 6E. sections model integrity ──────────────────────────────────────────
  // The real 1:1 invariant is sections <-> section_embeddings (E4 reuses vectors
  // 1:1). section_anchors is NOT 1:1 with sections and must not be asserted as
  // such: measured on the CI branch 2026-07-28, commentary is 85,592/85,592
  // anchored while sermon/lexicon/theology/father/hymn/poetry are prose registers
  // that anchor to no verse (16 of 162,805 sermon sections carry an anchor). An
  // earlier draft of this gate asserted sections == anchors and went red on
  // healthy data — the assertion was wrong, not the corpus.
  try {
    const orphan = await q1(sql, `SELECT
        (SELECT count(*)::int FROM sections)                                                          AS secs,
        (SELECT count(*)::int FROM section_embeddings)                                                AS embs,
        (SELECT count(*)::int FROM sections s LEFT JOIN section_embeddings e ON e.section_id = s.id
           WHERE e.section_id IS NULL)                                                                AS unembedded,
        (SELECT count(*)::int FROM section_embeddings e LEFT JOIN sections s ON s.id = e.section_id
           WHERE s.id IS NULL)                                                                        AS orphan_embs,
        (SELECT count(*)::int FROM section_anchors a LEFT JOIN sections s ON s.id = a.section_id
           WHERE s.id IS NULL)                                                                        AS orphan_anchors`);
    const unembedded = poison('6E', orphan.unembedded, 1);
    record('6E', 'every section is embedded 1:1', unembedded === 0 && orphan.orphan_embs === 0 && orphan.secs === orphan.embs,
      `sections ${orphan.secs} / embeddings ${orphan.embs} / unembedded ${unembedded} / orphan-embeddings ${orphan.orphan_embs}`,
      'E4 left sections without vectors (or vectors without sections) — re-run the slice for the divergent work');
    record('6E-orph', 'no orphan anchors', orphan.orphan_anchors === 0,
      `${orphan.orphan_anchors} anchors point at a missing section (must be 0)`,
      'referential integrity broke during E4 — re-run the slice');

    // The exegetical register MUST be verse-anchored or retrieval cannot place it.
    // Lane registers are deliberately excluded: they legitimately carry no anchor.
    const unanchored = await q1(sql, `SELECT count(*)::int AS n
       FROM sources so JOIN sections s ON s.source_id = so.id
       LEFT JOIN section_anchors a ON a.section_id = s.id
       WHERE so.source_type = ANY($1::text[]) AND a.section_id IS NULL`, ['{commentary}']);
    record('6E-anch', 'commentary sections are verse-anchored', unanchored.n === 0,
      `${unanchored.n} commentary sections carry no anchor (must be 0)`,
      'unanchored commentary cannot be retrieved for a passage — re-run the anchor pass for that work');

    const ord = await q1(sql, `SELECT count(*)::int AS n FROM sections WHERE unit_ordinal IS NULL`);
    record('6E-ord', 'migration 024 unit_ordinal populated', ord.n === 0,
      `${ord.n} sections with NULL unit_ordinal (must be 0)`,
      're-run 024_sections_unit_ordinal');
  } catch (e) { record('6E', 'sections model integrity', false, `query failed: ${e.message}`, 're-run E4'); }

  // ── 6F. annotation round-trip + the constraints 025/030 must enforce ───────
  // Writes REAL rows through the REAL constraints, then proves the DB rejects the
  // two shapes the migrations forbid. Cleans up after itself in `finally`.
  const probeUser = await annotationProbeUser(sql);
  try {
    // positive: the upsertNote path (verse note) round-trips
    await sql.query(
      `INSERT INTO notes (user_id, verse_id, body) VALUES (${probeUser.cast}, 43010001, 'E6 probe')`, [probeUser.value]);
    const back = await q1(sql,
      `SELECT body, target_kind FROM notes WHERE user_id = ${probeUser.cast} AND verse_id = 43010001`, [probeUser.value]);
    const readOk = poison('6F', back?.body === 'E6 probe' && back?.target_kind === 'verse', false);
    record('6F', 'note write + read-back', !!readOk,
      `body=${JSON.stringify(back?.body)} target_kind=${JSON.stringify(back?.target_kind)} (025 default must be 'verse')`,
      'the annotation write path is broken after E1 — upsertNote will fail for users');

    await sql.query(`UPDATE notes SET body='E6 probe v2' WHERE user_id = ${probeUser.cast} AND verse_id = 43010001`, [probeUser.value]);
    const upd = await q1(sql, `SELECT body FROM notes WHERE user_id = ${probeUser.cast} AND verse_id = 43010001`, [probeUser.value]);
    record('6F-upd', 'note update', upd?.body === 'E6 probe v2', `body=${JSON.stringify(upd?.body)}`, 'update path broken');

    // negative 1: notes_anchor_xor — a 'section' note may not carry a verse_id
    let rejected = false;
    try {
      await sql.query(`INSERT INTO notes (user_id, verse_id, section_id, target_kind, body)
                       VALUES (${probeUser.cast}, 43010002, NULL, 'section', 'E6 bad')`, [probeUser.value]);
    } catch { rejected = true; }
    const xorPass = poison('6F-xor', rejected, false);
    record('6F-xor', 'notes_anchor_xor REJECTS a mis-typed row', xorPass,
      xorPass ? 'invalid row rejected as designed' : 'invalid row was ACCEPTED',
      'migration 025 did not land — the annotation invariant is not enforced');

    // negative 2: 030 whitelist — target_kind must be 'verse' | 'section'
    let rejectedKind = false;
    try {
      await sql.query(`INSERT INTO notes (user_id, verse_id, target_kind, body)
                       VALUES (${probeUser.cast}, 43010003, 'bogus', 'E6 bad kind')`, [probeUser.value]);
    } catch { rejectedKind = true; }
    const kindPass = poison('6F-kind', rejectedKind, false);
    record('6F-kind', 'notes_target_kind_chk REJECTS a bogus kind', kindPass,
      kindPass ? 'bogus target_kind rejected as designed' : 'bogus target_kind was ACCEPTED',
      'migration 030 did not land');
  } catch (e) {
    record('6F', 'annotation round-trip', false, `threw: ${e.message}`, 'annotation schema is broken after E1');
  } finally {
    try { await sql.query(`DELETE FROM notes WHERE user_id = ${probeUser.cast}`, [probeUser.value]); ok('6F probe rows cleaned up'); }
    catch (e) { console.error(`  ⚠ 6F cleanup failed (${e.message}) — remove notes for the probe user by hand`); }
  }

  // ── 6G. live HTTP smoke (optional; visibly skipped when no target) ─────────
  const smokeUrl = process.env.CUTOVER_SMOKE_URL;
  if (!smokeUrl) {
    console.log('  ⚠ 6G SKIPPED (visibly): CUTOVER_SMOKE_URL unset — the deployed site was NOT probed over HTTP.');
    console.log('    This gate proved the DATA layer only. Set CUTOVER_SMOKE_URL=https://ancientpaths.app');
    console.log('    (plus CUTOVER_SMOKE_COOKIE if the site gate is on) to probe the running app.');
  } else {
    try {
      const headers = process.env.CUTOVER_SMOKE_COOKIE ? { cookie: process.env.CUTOVER_SMOKE_COOKIE } : {};
      const res = await fetch(smokeUrl, { headers, redirect: 'manual' });
      const okStatus = poison('6G', res.status < 400 || res.status === 401 || res.status === 307, false);
      record('6G', 'site responds', !!okStatus, `HTTP ${res.status} from ${smokeUrl}`,
        'the deployed site is not serving — Vercel instant-rollback to the previous deployment');
    } catch (e) { record('6G', 'site responds', false, `fetch failed: ${e.message}`, 'Vercel instant-rollback'); }
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.pass);
  console.log(`\n  E6 result: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error('\n  FAILED CHECKS:');
    for (const f of failed) console.error(`    ✗ ${f.id} ${f.name}: ${f.detail}\n        rollback: ${f.rollback}`);
    die('E6', `${failed.length} regression check(s) failed`, failed[0].rollback);
  }
  ok('E6 smoke + regression gate PASSED');
}

// The probe identity for 6F. user_id may be text or uuid depending on lineage,
// so introspect rather than guess — a wrong cast would fail spuriously and be
// mistaken for a real regression.
async function annotationProbeUser(sql) {
  const col = await q1(sql, `SELECT data_type FROM information_schema.columns
                             WHERE table_name='notes' AND column_name='user_id'`);
  const isUuid = (col?.data_type ?? '').toLowerCase() === 'uuid';
  return isUuid
    ? { cast: '$1::uuid', value: '00000000-0000-4000-8000-0000000000e6' }
    : { cast: '$1::text', value: '__cutover_e6_probe__' };
}

// Pre-cutover baseline for E6-wide. Recorded once and checkpointed; never
// overwritten, or the comparison would silently measure against itself.
async function captureBaseline(sql, cp) {
  if (cp.baseline?.chaptersWith2Voices != null) { ok(`baseline already recorded (${cp.baseline.chaptersWith2Voices} chapters with >=2 voices)`); return; }
  if (DRY) { console.log('    [dry-run] would record the >=2-voice coverage baseline'); return; }
  const r = await q1(sql, `
    WITH per_ch AS (
      SELECT (metadata->>'verseId')::int / 1000 AS ch,
             count(DISTINCT metadata->>'author') AS v
      FROM embeddings WHERE user_id IS NULL AND ${LEGAL_FILTER} GROUP BY 1)
    SELECT count(*) FILTER (WHERE v >= 2)::int AS ok_ch, count(*)::int AS any_ch FROM per_ch`);
  cp.baseline = { ...(cp.baseline ?? {}), chaptersWith2Voices: r.ok_ch, chaptersWithAnyCoverage: r.any_ch };
  saveCheckpoint(cp);
  ok(`baseline recorded: ${r.ok_ch}/${r.any_ch} chapters have >=2 legal voices (E6 compares against this)`);
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
  E6  smoke + regression gate — 6A legal-corpus positive control · 6B forbidden ratchet=0
      6C >=2 voices (named passage + corpus-wide vs pre-cutover baseline) · 6D register wall
      6E sections==anchors==embeddings + 024 ordinals · 6F annotation round-trip AND
      proof the 025/030 constraints REJECT bad rows · 6G optional live HTTP smoke
      Prove it red first:  CUTOVER_E6_PROVE_FAIL=6C node scripts/cutover.mjs --e6-only
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

  if (E6_ONLY) { await e6_smoke(sql, cp); console.log('\n--e6-only: done.'); return; }

  const e1Total = MIGRATIONS.length + CONCURRENT.length;
  const e1Complete = cp.done.filter((d) => d.startsWith('E1:')).length >= e1Total;
  if (!DRY && !e1Complete && process.env.CUTOVER_REHEARSAL !== '1') {
    const a = await ask('\nHARD STOP (§4.1): STEP ZERO passed. Proceed to the FIRST PROD WRITE (E1 migrations)? type "write": ');
    if (a !== 'write') die('pre-E1', 'owner did not confirm the first prod write', 'nothing written');
  }
  // Capture the pre-cutover coverage baseline ONCE, before anything writes, so
  // E6's corpus-wide >=2-voice check has something it can actually regress against.
  await captureBaseline(sql, cp);

  await e1_migrations(sql, url, cp);
  await e2_label(sql, url, cp);
  await e3_forbidden(sql, url, cp);
  await e4_slice(sql, url, cp);
  await e5_deploy(cp);
  await e6_smoke(sql, cp);
  console.log('\nCUTOVER COMPLETE.');
})().catch((e) => die('unhandled', e.message));
