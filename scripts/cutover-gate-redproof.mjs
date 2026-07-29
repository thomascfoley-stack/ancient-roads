#!/usr/bin/env node
// SEEDED-BUG PROOF for scripts/cutover-regression-gate.mts (THE LOOP rule 4: a
// check you have never seen fail is not a check). Each case: BREAK the target ->
// expect the gate RED -> RESTORE -> expect the gate GREEN.
//
//   CUTOVER_DATABASE_URL=<throwaway fork owner> CUTOVER_EXPECT_HOST=ep-xxxx \
//     node scripts/cutover-gate-redproof.mjs
//
// ⚠ THIS SCRIPT DELIBERATELY CORRUPTS ITS TARGET. It runs ONLY against a
// disposable fork: production (ep-odd-fog) and dev (ep-tiny-hat) are refused
// outright, and the target must match an explicitly declared CUTOVER_EXPECT_HOST.
// Every break is reverted from a value captured immediately beforehand, and the
// final GREEN re-run is what proves the revert landed.
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { renameSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { assertThrowawayTarget } from './lib/target-guard.mjs';

// Parent and child must share ONE checkpoint session, or the gate's --capture write is
// refused as a foreign writer (scripts/lib/checkpoint.mjs). The orchestrator does the same.
process.env.CUTOVER_SESSION_ID ??= randomUUID();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.CUTOVER_DATABASE_URL;
if (!url) throw new Error('CUTOVER_DATABASE_URL is unset');
const declared = process.env.CUTOVER_EXPECT_HOST;
if (!declared) throw new Error('CUTOVER_EXPECT_HOST must name the throwaway fork endpoint');
// Case-insensitive, exact-endpoint-id. An UPPERCASE prod URL used to satisfy both legs
// of the old test and reach this script, which corrupts whatever it is pointed at.
const host = assertThrowawayTarget(url, declared);
console.log(`red-proof target: ${host}\n`);

// The predicates come from the GATE, which imports them from web/src/lib/teacher/routing.ts.
// Never hand-copied here: a seed aimed at a population the check does not measure is a proof
// that cannot fire, and re-typing LEGAL_CORPUS_FILTER in a second place is the precise defect
// this whole round of work exists to remove.
const { prose: PROSE_TYPE_SQL, legal: LEGAL_CORPUS_FILTER, forbidden: FORBIDDEN_PROVENANCE_SQL } = JSON.parse(
  execFileSync('npx', ['tsx', 'scripts/cutover-regression-gate.mts', '--print-predicates'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));

// THIS SCRIPT GETS ITS OWN CHECKPOINT. It captures a baseline before seeding defects, and
// that write previously landed in `.cutover-checkpoint.json` — the file that holds a live
// cutover's restore-point branch id and step ledger. A destructive proof harness must not be
// able to merge a throwaway fork's baseline into the record of a production run, and the
// operator must never be nudged toward deleting that file to unstick this one.
const PROOF_CHECKPOINT = path.join(ROOT, '.cutover-redproof-checkpoint.json');

// The child env is SCRUBBED of the live-probe variables. Left in, ~19 child gate runs would
// each POST a real question to the deployed /api/ask (billed embeddings + LLM, 120s timeout
// apiece) — and worse, every PROVEN/FAILED verdict below would become partly a function of
// production's health rather than of the seeded defect.
function childEnv() {
  const env = { ...process.env, CUTOVER_CHECKPOINT: PROOF_CHECKPOINT };
  delete env.CUTOVER_ASK_URL;
  delete env.CUTOVER_ASK_COOKIE;
  return env;
}

function gate(phase = 'E1', { capture = false } = {}) {
  const argv = ['tsx', 'scripts/cutover-regression-gate.mts', `--phase=${phase}`];
  if (capture) argv.push('--capture');
  try {
    execFileSync('npx', argv, { cwd: ROOT, stdio: 'pipe', env: childEnv() });
    return { red: false, out: '' };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

// ── THE BASELINE THIS SCRIPT DEPENDS ON, made explicit ───────────────────────
// Roughly half the gate's legs are RATCHETS against the E0 reading (user data, both voice
// floors, the forbidden count, section integrity). With no stored baseline every one of
// them takes its "capture" branch, reports a measurement, and CANNOT GO RED — so a proof
// run without one would report PROVEN for the four checks that do not ratchet and silently
// fail to exercise the rest. This script used to leave that precondition implicit: it
// simply ran `--phase=E1` and hoped a baseline was on disk from some earlier cutover.
//
// Capture one here, on purpose, from the fork's own CURRENT state — and assert it landed.
// A baseline captured off an already-broken target would be a check that can never fail
// again, so the capture run must itself be GREEN before any defect is seeded.
console.log('capturing an E0 baseline on this fork (the ratcheted legs cannot go red without one)...');
const captureRun = gate('E0', { capture: true });
if (captureRun.red) {
  console.error('✗ the E0 capture run is already RED on this fork. Every proof below would be measuring a');
  console.error('  pre-existing break rather than a seeded one. Pick a cleaner fork.');
  console.error(captureRun.out.split('\n').filter((l) => l.includes('✗')).join('\n'));
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(PROOF_CHECKPOINT, 'utf8'))?.baseline?.regression;
if (!baseline?.userData || !baseline?.voices) {
  console.error(`✗ the capture run reported green but wrote no baseline to ${PROOF_CHECKPOINT}. Refusing to proceed:`);
  console.error('  without it the ratcheted checks below would report PROVEN without ever being exercised.');
  process.exit(1);
}
console.log(`✓ baseline captured for ${baseline.host} — ratcheted legs are live\n`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const results = [];
// `expect` is the gate label the seeded defect is supposed to trip (e.g. 'G2 durable floor').
// WITHOUT IT THIS HARNESS LIES. It used to score `bad.red && !good.red` — any non-zero exit
// of the whole gate counted as proof the NAMED check fired. The durable-floor seed makes a
// clean row forbidden, which necessarily pushes the G6 ratchet above its baseline, so G6 goes
// red and the harness printed `PROVEN  G2 durable floor` for a leg that may never have fired.
// That is the false-attribution class this repo's own false-confidence-audit skill exists to
// catch, and it was the only proof that check had.
async function proof(name, breakFn, restoreFn, expect) {
  if (!expect) throw new Error(`proof("${name}") has no expected gate label — refusing to score an unattributed red`);
  await breakFn();
  // E0 on pre-E1 forks (G9 is a skip at E0, a hard fail at E1). E1 on post-E1 forks
  // (the normal gate-redproof path after cutover E0–E1). CUTOVER_GATE_REDPROOF_PHASE
  // overrides when needed.
  const gatePhase = process.env.CUTOVER_GATE_REDPROOF_PHASE ?? 'E0';
  const bad = gate(gatePhase);
  await restoreFn();
  const good = gate(gatePhase);
  const redLines = bad.out.split('\n').filter((l) => l.includes('✗'));
  const attributed = redLines.some((l) => l.includes(expect));
  let verdict;
  if (!bad.red) verdict = 'FAILED (stayed GREEN on the seeded defect)';
  else if (!attributed) verdict = `FAILED (red, but NOT from "${expect}" — another gate fired; unattributed)`;
  else if (good.red) verdict = 'FAILED (still red after restore — the restore did not land)';
  else verdict = 'PROVEN';
  console.log(`${verdict.padEnd(8)} ${name}\n           red output: ${redLines.slice(0, 2).join(' | ')}\n`);
  results.push({ name, verdict });
}

// ── G1: the user-row invariant ───────────────────────────────────────────────
await proof('G1 user-data — an extra highlight row',
  () => c.query(`INSERT INTO highlights (user_id, verse_id, color) VALUES ('__redproof__', 43003016, 'yellow')`),
  () => c.query(`DELETE FROM highlights WHERE user_id = '__redproof__'`),
  'G1 user-data');

// ── G2: the >=2-voices floor ─────────────────────────────────────────────────
// TWO CORRECTIONS, both found by RUNNING this against a branch whose `work` leg is
// populated (2026-07-28) — where the previous seed STAYED GREEN and the harness correctly
// reported FAILED:
//
//  (a) RENAMING TO A SENTINEL DOES NOT REMOVE AN AUTHOR, IT ADDS ONE. The old seed set every
//      row but one to '__redproof_author__' and its comment claimed that left "exactly ONE
//      author served". It left TWO — the kept author plus the sentinel — so the verse still
//      cleared the >=2 floor and G2 was right to stay green. Measured at Psalm 23:1: 5
//      admitted rows / 4 authors, of which the two keil-delitzsch rows are admitted by the
//      `metadata->>'work'` leg, which an author rename does not touch. The fix is to COLLAPSE
//      the victims into the kept author's own name, so DISTINCT genuinely falls to 1.
//  (b) SEED ONLY WHAT THE FILTER ADMITS. The old seed rewrote all 97 rows at the verse when
//      only 5 are in the served pool; the other 92 were invisible to the check, and every
//      UPDATE on `embeddings` costs ~5s because each one maintains the HNSW indexes.
//      Scoping to the admitted rows is both more precise and ~20x faster.
const PSA_VID = 19023001;
const psa = (await c.query(
  `SELECT id, metadata->>'author' AS author FROM embeddings
    WHERE user_id IS NULL AND (metadata->>'verseId')::int = $1
      AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}`, [PSA_VID])).rows;
const psaAuthors = [...new Set(psa.map((r) => r.author))];
console.log(`(Psalm 23:1 ADMITTED rows: ${psa.length}, distinct served authors: ${psaAuthors.join(', ')})`);
if (psaAuthors.length < 2) {
  console.log('SKIPPED  G2 — Psalm 23:1 is already below the >=2-author floor on this fork; nothing to knock down.\n');
  results.push({ name: 'G2 >=2 voices (skipped: verse already below the floor)', verdict: 'SKIPPED' });
} else {
  const keepAuthor = psa.find((r) => r.author === 'John Gill')?.author ?? psa[0].author;
  const victims = psa.filter((r) => r.author !== keepAuthor);
  await proof(`G2 >=2 voices — Psalm 23:1 collapsed from ${psaAuthors.length} served authors to 1 ("${keepAuthor}"), ${victims.length} row(s)`,
    async () => { for (const v of victims) await c.query(
      `UPDATE embeddings SET metadata = jsonb_set(metadata,'{author}',to_jsonb($2::text)) WHERE id = $1`, [v.id, keepAuthor]); },
    async () => { for (const v of victims) await c.query(
      `UPDATE embeddings SET metadata = jsonb_set(metadata,'{author}',to_jsonb($2::text)) WHERE id = $1`, [v.id, v.author]); },
    // NOT the bare 'G2': that also matches "G2 durable floor", "G2 work leg" and
    // "G2 spot check", any of which this seed also moves — so a corpus-wide-leg regression
    // could be scored PROVEN off the wrong red line. Name the leg exactly.
    'G2 >=2 voices');
}

// ── G3: the reader's static chapter file ─────────────────────────────────────
const f = `${ROOT}/web/public/commentaries/psa/23.json`;
await proof('G3 reader/static — the chapter file the reader renders goes missing',
  () => { renameSync(f, `${f}.redproof`); },
  () => { if (existsSync(`${f}.redproof`)) renameSync(`${f}.redproof`, f); },
  'G3 reader/static');

// ── G4: upsertNote's arbiter index ───────────────────────────────────────────
// Capture the index's ACTUAL definition and replay that, rather than hardcoding one.
// A literal `WHERE deleted_at IS NULL` restore is wrong on a post-025 target, where the
// predicate also carries `target_kind = 'verse'` — and the green re-run does NOT catch
// it, because arbiter inference only needs the index predicate to be IMPLIED by the
// ON CONFLICT clause, and the post-025 clause implies the weaker pre-025 predicate. The
// harness would have silently left the fork with a degraded index and reported success.
const notesIdx = (await c.query(
  `SELECT pg_get_indexdef(i.indexrelid) d FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_notes_user_verse'`)).rows[0];
if (!notesIdx) throw new Error('idx_notes_user_verse not present — refusing to drop what cannot be restored');
console.log(`(captured for restore: ${notesIdx.d})`);
await proof('G4 write — upsertNote loses its partial unique index (the 025 hazard)',
  () => c.query(`DROP INDEX IF EXISTS idx_notes_user_verse`),
  () => c.query(notesIdx.d),
  'G4 write');

// ── G5: the register wall ────────────────────────────────────────────────────
const donorRow = (await c.query(
  `SELECT id FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill' LIMIT 1`)).rows[0];
if (!donorRow) throw new Error('no John Gill row on this fork — the G5 seed cannot be built; pick a fork with the served corpus');
const donor = donorRow.id;
await proof('G5 register wall — a sermon-lane work made reachable through the exegetical filter',
  () => c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{work}','"spurgeon-sermons"') WHERE id = $1`, [donor]),
  () => c.query(`UPDATE embeddings SET metadata = metadata - 'work' WHERE id = $1`, [donor]),
  'G5 register wall');

// ── G6: the forbidden-provenance ratchet ─────────────────────────────────────
const donor2 = (await c.query(
  `SELECT id, metadata->>'sourceUrl' AS u FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'
     AND (metadata->>'sourceUrl' IS NULL OR metadata->>'sourceUrl' NOT ILIKE '%biblehub%') LIMIT 1`)).rows[0];
await proof('G6 ratchet — one new biblehub-provenance row appears',
  () => c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{sourceUrl}','"https://biblehub.com/redproof"') WHERE id = $1`, [donor2.id]),
  () => donor2.u === null
    ? c.query(`UPDATE embeddings SET metadata = metadata - 'sourceUrl' WHERE id = $1`, [donor2.id])
    : c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{sourceUrl}',to_jsonb($2::text)) WHERE id = $1`, [donor2.id, donor2.u]),
  'G6 ratchet');

// ── G8: sections <-> section_embeddings integrity ────────────────────────────
// The defect E4 can actually produce: section rows written, their vectors not. Seeded by
// deleting embeddings for real sections, which is exactly the shape of a slice whose
// INSERT INTO section_embeddings half failed.
// ALL rows for one section, not one row. The PK is (section_id, model_slug), so a section
// may legitimately carry several models' vectors; `DELETE ... WHERE section_id = $1` removes
// every one of them, and restoring only the single captured triple left the rest permanently
// gone — while G8 (which counts sections with NO embedding) returned to baseline and the
// harness reported success on a target it had silently degraded. That is the exact class the
// G4 index-restore comment above was written to prevent.
const sectionPick = (await c.query(
  `SELECT section_id FROM section_embeddings ORDER BY section_id LIMIT 1`)).rows[0];
const orphanRows = sectionPick ? (await c.query(
  `SELECT section_id, model_slug, embedding FROM section_embeddings WHERE section_id = $1`,
  [sectionPick.section_id])).rows : [];
const orphanTarget = orphanRows[0];
if (!orphanTarget) {
  console.log('SKIPPED  G8 — section_embeddings is empty on this fork; the unembedded seed cannot be built.\n');
  results.push({ name: 'G8 unembedded (skipped: no section_embeddings on fork)', verdict: 'SKIPPED' });
} else {
  await proof(`G8 unembedded — a section loses its embedding(s) (the slice wrote text, not vectors) [${orphanRows.length} row(s) captured]`,
    () => c.query(`DELETE FROM section_embeddings WHERE section_id = $1`, [orphanTarget.section_id]),
    async () => { for (const r of orphanRows) await c.query(
      `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ($1,$2,$3)`,
      [r.section_id, r.model_slug, r.embedding]); },
    'G8 unembedded');
}

// ── G9: the annotation constraints ───────────────────────────────────────────
// DROP the constraint 030 adds and watch the gate notice. This is the check that answers
// "did 030 actually land", so the seed is precisely "030 did not land".
const hlXor = (await c.query(
  `SELECT pg_get_constraintdef(con.oid) AS d
     FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'highlights' AND con.conname = 'highlights_anchor_xor'`)).rows[0];
if (!hlXor) {
  console.log('SKIPPED  G9 — highlights_anchor_xor is absent on this fork (pre-025/030); nothing to drop.\n');
  results.push({ name: 'G9 constraints (skipped: pre-025 fork)', verdict: 'SKIPPED' });
} else {
  console.log(`(captured for restore: highlights_anchor_xor ${hlXor.d})`);
  // Restore to the PRE-030 body, then back. Dropping to the 025 shape is the realistic
  // failure — "030 silently did not apply" — and it is the one a bare existence check
  // misses, because the constraint is still THERE, just weaker.
  await proof('G9 constraints — 030 reverts to the 025 body (constraint present but weaker)',
    () => c.query(`ALTER TABLE highlights DROP CONSTRAINT highlights_anchor_xor;
                   ALTER TABLE highlights ADD CONSTRAINT highlights_anchor_xor CHECK (
                     (target_kind = 'verse'   AND verse_id   IS NOT NULL AND section_id IS NULL) OR
                     (target_kind = 'section' AND section_id IS NOT NULL AND verse_id   IS NULL))`),
    () => c.query(`ALTER TABLE highlights DROP CONSTRAINT highlights_anchor_xor;
                   ALTER TABLE highlights ADD CONSTRAINT highlights_anchor_xor ${hlXor.d.replace(/^CHECK\s*/i, 'CHECK ')}`),
    'G9 constraints');

  await proof('G9 constraints — notes_anchor_xor is dropped entirely',
    () => c.query(`ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_anchor_xor`),
    () => c.query(`ALTER TABLE notes ADD CONSTRAINT notes_anchor_xor CHECK (
                     (target_kind = 'verse'   AND verse_id   IS NOT NULL AND section_id IS NULL) OR
                     (target_kind = 'section' AND section_id IS NOT NULL AND verse_id   IS NULL))`),
    'G9 constraints');
}

// ── G2 durable floor: a forbidden-provenance row is the ONLY thing holding a verse up ──
// The defect this catches is subtle and is the one ADR-030 was corrected for: the headline
// floor stays flat while the floor that survives the provenance cleanup quietly drops.
// Seed it by making a verse's second CLEAN voice forbidden — the headline count does not
// move (the row is still served), the durable count does.
// THREE CORRECTIONS over the first draft, each of which made this proof unable to fire:
//  (a) POPULATION. The donor query ran over the whole `embeddings` table, while
//      measureVoiceFloor() applies BOTH PROSE_TYPE_SQL and LEGAL_CORPUS_FILTER. A verse with
//      2 authors table-wide but 1 inside the served legal pool is not in cleanFloor at all,
//      so corrupting it moves nothing. The predicates below are pulled from routing.ts by
//      the same import the gate uses, so they cannot drift from what is being measured.
//  (b) AUTHOR, NOT ROW. cleanFloor counts count(DISTINCT author); knocking out ONE row of an
//      author who has other clean rows on the same verse leaves the author standing and the
//      count unchanged. Every row of the chosen author is seeded, exactly as the G2 headline
//      proof above already does.
//  (c) NULL-SAFETY. `NOT (NULL ILIKE …)` is NULL, so the unguarded version silently excluded
//      every NULL-sourceUrl row — the same bug the gate itself carried. coalesce, as b2
//      (src/ingest/b2-remove-forbidden-provenance.ts) does: a NULL sourceUrl counts as CLEAN.
// Same NOT-forbidden predicate the gate's durable-floor leg uses — pulled from the gate,
// not hand-inlined, so a seed aimed at a row the check excludes cannot fire.
const CLEAN = `NOT (${FORBIDDEN_PROVENANCE_SQL})`;
const SERVED = `user_id IS NULL AND metadata->>'verseId' ~ '^[0-9]+$'
                AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}`;
{
  const durable = (await c.query(
    `SELECT (metadata->>'verseId')::int AS vid FROM embeddings
      WHERE ${SERVED} AND ${CLEAN}
      GROUP BY 1 HAVING count(DISTINCT metadata->>'author') = 2 LIMIT 1`)).rows[0];
  if (!durable) {
    console.log('SKIPPED  G2 durable floor — no verse in the SERVED pool on this fork has exactly 2 clean voices to knock down.\n');
    results.push({ name: 'G2 durable floor (skipped: no 2-clean-voice verse in the served pool)', verdict: 'SKIPPED' });
  } else {
    // Re-query victims inside break/restore so earlier proofs cannot leave stale ids.
    const pickVictims = async () => {
      const victimAuthor = (await c.query(
        `SELECT metadata->>'author' AS a FROM embeddings
          WHERE ${SERVED} AND ${CLEAN} AND (metadata->>'verseId')::int = $1
          GROUP BY 1 ORDER BY 1 LIMIT 1`, [durable.vid])).rows[0]?.a;
      if (!victimAuthor) return [];
      return (await c.query(
        `SELECT id, metadata->>'sourceUrl' AS u FROM embeddings
          WHERE ${SERVED} AND ${CLEAN} AND (metadata->>'verseId')::int = $1 AND metadata->>'author' = $2`,
        [durable.vid, victimAuthor])).rows;
    };
    const preview = await pickVictims();
    if (preview.length === 0) {
      console.log(`SKIPPED  G2 durable floor — verse ${durable.vid} had 2 clean voices at selection time but none remain to seed.\n`);
      results.push({ name: 'G2 durable floor (skipped: victims vanished before seed)', verdict: 'SKIPPED' });
    } else {
      const victimAuthor = (await c.query(`SELECT metadata->>'author' AS a FROM embeddings WHERE id = $1`, [preview[0].id])).rows[0].a;
      let victims2 = preview;
      await proof(`G2 durable floor — verse ${durable.vid} loses its 2nd clean voice "${victimAuthor}" to forbidden provenance (${preview.length} row(s))`,
        async () => {
          victims2 = await pickVictims();
          if (victims2.length === 0) throw new Error(`G2 durable floor seed: no clean rows left at verse ${durable.vid}`);
          for (const v of victims2) await c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{sourceUrl}','"https://biblehub.com/redproof-durable"') WHERE id = $1`, [v.id]);
        },
        async () => { for (const v of victims2) await (v.u === null
          ? c.query(`UPDATE embeddings SET metadata = metadata - 'sourceUrl' WHERE id = $1`, [v.id])
          : c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{sourceUrl}',to_jsonb($2::text)) WHERE id = $1`, [v.id, v.u])); },
        'G2 durable floor');
    }
  }
}

await c.end();
console.log('\n=== SUMMARY ===');
for (const r of results) console.log(`  ${r.verdict.padEnd(8)} ${r.name}`);
// A SKIPPED case is NOT a pass. It means the fork could not host that defect, so the check
// it names is UNPROVEN on this target — say so and fail, rather than letting a fork with an
// empty sections table quietly reduce this script to the six checks it can still run.
const skipped = results.filter((r) => r.verdict === 'SKIPPED');
if (skipped.length > 0) {
  console.error(`\n✗ ${skipped.length} scenario(s) could not be seeded on this fork — those checks are UNPROVEN here, not passing.`);
  console.error('  Pick a fork that carries sections, section_embeddings and the 025/030 constraints, and re-run.');
}
process.exit(results.every((r) => r.verdict === 'PROVEN') ? 0 : 1);
