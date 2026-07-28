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
import { renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.CUTOVER_DATABASE_URL;
if (!url) throw new Error('CUTOVER_DATABASE_URL is unset');
const declared = process.env.CUTOVER_EXPECT_HOST;
if (!declared || declared.length < 6) throw new Error('CUTOVER_EXPECT_HOST must name the throwaway fork endpoint');
const host = new URL(url).host;
if (!host.includes(declared)) throw new Error(`host ${host} is not the declared target '${declared}'`);
if (/ep-odd-fog|ep-tiny-hat/.test(host)) throw new Error(`REFUSING: ${host} is production or dev — this script corrupts its target`);
console.log(`red-proof target: ${host}\n`);

function gate(phase = 'E1') {
  try {
    execFileSync('npx', ['tsx', 'scripts/cutover-regression-gate.mts', `--phase=${phase}`],
      { cwd: ROOT, stdio: 'pipe', env: process.env });
    return { red: false, out: '' };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const results = [];
async function proof(name, breakFn, restoreFn) {
  await breakFn();
  const bad = gate();
  await restoreFn();
  const good = gate();
  const verdict = bad.red && !good.red ? 'PROVEN' : `FAILED (red-on-break=${bad.red}, green-after-restore=${!good.red})`;
  const line = bad.out.split('\n').filter((l) => l.includes('✗')).slice(0, 2).join(' | ');
  console.log(`${verdict.padEnd(8)} ${name}\n           red output: ${line}\n`);
  results.push({ name, verdict });
}

// ── G1: the user-row invariant ───────────────────────────────────────────────
await proof('G1 user-data — an extra highlight row',
  () => c.query(`INSERT INTO highlights (user_id, verse_id, color) VALUES ('__redproof__', 43003016, 'yellow')`),
  () => c.query(`DELETE FROM highlights WHERE user_id = '__redproof__'`));

// ── G2: the >=2-voices floor ─────────────────────────────────────────────────
// EVERY row at that verse, not just the four unconstrained authors — the served
// pool for Psalm 23 also admits Augustine (book 19), and a seed that leaves two
// authors standing proves nothing. Leave exactly ONE author served.
const psa = (await c.query(
  `SELECT id, metadata->>'author' AS author FROM embeddings
    WHERE user_id IS NULL AND (metadata->>'verseId')::int = 19023001`)).rows;
console.log(`(Psalm 23:1 authors on the fork: ${[...new Set(psa.map((r) => r.author))].join(', ')})`);
const keep = psa.find((r) => r.author === 'John Gill') ?? psa[0];
const victims = psa.filter((r) => r.id !== keep.id);
await proof('G2 >=2 voices — all but one served author removed from Psalm 23:1',
  async () => { for (const v of victims) await c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{author}','"__redproof_author__"') WHERE id = $1`, [v.id]); },
  async () => { for (const v of victims) await c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{author}',to_jsonb($2::text)) WHERE id = $1`, [v.id, v.author]); });

// ── G3: the reader's static chapter file ─────────────────────────────────────
const f = `${ROOT}/web/public/commentaries/psa/23.json`;
await proof('G3 reader/static — the chapter file the reader renders goes missing',
  () => { renameSync(f, `${f}.redproof`); },
  () => { if (existsSync(`${f}.redproof`)) renameSync(`${f}.redproof`, f); });

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
  () => c.query(notesIdx.d));

// ── G5: the register wall ────────────────────────────────────────────────────
const donor = (await c.query(
  `SELECT id FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill' LIMIT 1`)).rows[0].id;
await proof('G5 register wall — a sermon-lane work made reachable through the exegetical filter',
  () => c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{work}','"spurgeon-sermons"') WHERE id = $1`, [donor]),
  () => c.query(`UPDATE embeddings SET metadata = metadata - 'work' WHERE id = $1`, [donor]));

// ── G6: the forbidden-provenance ratchet ─────────────────────────────────────
const donor2 = (await c.query(
  `SELECT id, metadata->>'sourceUrl' AS u FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'
     AND (metadata->>'sourceUrl' IS NULL OR metadata->>'sourceUrl' NOT ILIKE '%biblehub%') LIMIT 1`)).rows[0];
await proof('G6 ratchet — one new biblehub-provenance row appears',
  () => c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{sourceUrl}','"https://biblehub.com/redproof"') WHERE id = $1`, [donor2.id]),
  () => donor2.u === null
    ? c.query(`UPDATE embeddings SET metadata = metadata - 'sourceUrl' WHERE id = $1`, [donor2.id])
    : c.query(`UPDATE embeddings SET metadata = jsonb_set(metadata,'{sourceUrl}',to_jsonb($2::text)) WHERE id = $1`, [donor2.id, donor2.u]));

await c.end();
console.log('\n=== SUMMARY ===');
for (const r of results) console.log(`  ${r.verdict.padEnd(8)} ${r.name}`);
process.exit(results.every((r) => r.verdict === 'PROVEN') ? 0 : 1);
