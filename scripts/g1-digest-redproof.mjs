#!/usr/bin/env node
// RED-PROOF: G1 catches in-place mutation via DIGEST, not row count alone.
//
// Seeds four waitlist rows (count stays 4 when one email is mutated) and one channel row,
// captures an E0 baseline, then proves:
//   waitlist email UPDATE  → G1 RED on DIGEST (not row count)
//   revert                 → GREEN
//   channels name UPDATE   → G1 RED on DIGEST (not row count)
//   revert                 → GREEN
//
// ⚠ THROWAWAY FORK ONLY. Requires CUTOVER_DATABASE_URL + CUTOVER_EXPECT_HOST.
//   node scripts/g1-digest-redproof.mjs
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { assertThrowawayTarget } from './lib/target-guard.mjs';
import { measureSql, diffUserData } from './lib/user-data-invariant.mjs';

process.env.CUTOVER_SESSION_ID ??= randomUUID();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.CUTOVER_DATABASE_URL;
if (!url) throw new Error('CUTOVER_DATABASE_URL is unset');
const declared = process.env.CUTOVER_EXPECT_HOST;
if (!declared) throw new Error('CUTOVER_EXPECT_HOST must name the throwaway fork endpoint');
const host = assertThrowawayTarget(url, declared);
console.log(`g1-digest-redproof target: ${host}\n`);

const PROOF_CHECKPOINT = path.join(ROOT, '.g1-digest-redproof-checkpoint.json');
const WAITLIST_EMAILS = [
  'g1-redproof-1@example.invalid',
  'g1-redproof-2@example.invalid',
  'g1-redproof-3@example.invalid',
  'g1-redproof-4@example.invalid',
];
const CHANNEL_USER = '__g1_digest_redproof__';

function childEnv() {
  const env = { ...process.env, CUTOVER_CHECKPOINT: PROOF_CHECKPOINT };
  delete env.CUTOVER_ASK_URL;
  delete env.CUTOVER_ASK_COOKIE;
  return env;
}

function gate(phase = 'E0', { capture = false } = {}) {
  const argv = ['tsx', 'scripts/cutover-regression-gate.mts', `--phase=${phase}`];
  if (capture) argv.push('--capture');
  try {
    execFileSync('npx', argv, { cwd: ROOT, stdio: 'pipe', env: childEnv() });
    return { red: false, out: '' };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

async function measureTable(c, table) {
  const m = await c.query(measureSql(table));
  return m.rows[0];
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Ensure waitlist exists (some forks predate 014). Apply idempotent DDL directly —
// db/apply-migration.mjs refuses non-dev targets, and this script runs on throwaway forks.
const waitlistExists = (await c.query(
  `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist'`)).rowCount;
if (!waitlistExists) {
  console.log('creating waitlist table (014 DDL, fork predates migration)...');
  await c.query(readFileSync(path.join(ROOT, 'db/migrations/014_waitlist.sql'), 'utf8'));
}

// Clean prior runs and seed exactly four waitlist rows + one channel.
await c.query(`DELETE FROM waitlist WHERE email LIKE 'g1-redproof-%@example.invalid'`);
await c.query(`DELETE FROM channels WHERE user_id = $1`, [CHANNEL_USER]);
for (const email of WAITLIST_EMAILS) {
  await c.query(`INSERT INTO waitlist (email, source) VALUES ($1, 'g1-digest-redproof')`, [email]);
}
const ch = await c.query(
  `INSERT INTO channels (user_id, name, description) VALUES ($1, 'Original Channel Name', 'redproof')
   RETURNING id`, [CHANNEL_USER]);
const channelId = ch.rows[0].id;

const waitBefore = await measureTable(c, 'waitlist');
const chanBefore = await measureTable(c, 'channels');
console.log(`seeded waitlist=${waitBefore.rows}r digest=${String(waitBefore.digest).slice(0, 8)}`);
console.log(`seeded channels=${chanBefore.rows}r digest=${String(chanBefore.digest).slice(0, 8)}\n`);

console.log('capturing E0 baseline...');
if (existsSync(PROOF_CHECKPOINT)) unlinkSync(PROOF_CHECKPOINT);
const captureRun = gate('E0', { capture: true });
if (captureRun.red) {
  console.error('✗ E0 capture failed on this fork:');
  console.error(captureRun.out.split('\n').filter((l) => l.includes('✗')).join('\n'));
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(PROOF_CHECKPOINT, 'utf8'))?.baseline?.regression?.userData;
if (!baseline?.waitlist || !baseline?.channels) {
  console.error('✗ baseline missing waitlist/channels readings');
  process.exit(1);
}
console.log('✓ baseline captured\n');

const results = [];

async function digestProof(name, breakFn, restoreFn, table, expectNotRowCount = true) {
  await breakFn();
  const afterBreak = await measureTable(c, table);
  const diffs = diffUserData(baseline, { ...baseline, [table]: afterBreak });
  const bad = gate('E0');
  await restoreFn();
  const afterRestore = await measureTable(c, table);
  const good = gate('E0');

  const digestHit = diffs.some((d) => d.includes('DIGEST'));
  const rowHit = diffs.some((d) => d.includes('row count'));
  const gateDigest = bad.out.includes('DIGEST');
  const gateRow = bad.out.includes('row count');
  const redLines = bad.out.split('\n').filter((l) => l.includes('✗ G1'));

  let verdict;
  if (!bad.red) verdict = 'FAILED (stayed GREEN on in-place mutation)';
  else if (!digestHit || !gateDigest) verdict = 'FAILED (RED but not on DIGEST)';
  else if (expectNotRowCount && (rowHit || gateRow)) verdict = 'FAILED (row count moved — not a digest proof)';
  else if (good.red) verdict = 'FAILED (still RED after restore)';
  else if (afterRestore.digest !== baseline[table].digest) verdict = 'FAILED (digest not restored)';
  else verdict = 'PROVEN';

  console.log(`${verdict.padEnd(8)} ${name}`);
  console.log(`           measure diffs: ${diffs.join(' | ') || '(none)'}`);
  console.log(`           break rows=${afterBreak.rows} digest=${String(afterBreak.digest).slice(0, 8)}`);
  console.log(`           gate: ${redLines.slice(0, 1).join(' | ') || bad.out.split('\n').find((l) => l.includes('G1'))}\n`);
  results.push({ name, verdict, diffs, afterBreak, redLines });
}

await digestProof(
  'waitlist — in-place email mutation (count unchanged)',
  async () => {
    await c.query(
      `UPDATE waitlist SET email = 'mutated-redproof@example.invalid' WHERE email = $1`,
      [WAITLIST_EMAILS[0]],
    );
  },
  async () => {
    await c.query(
      `UPDATE waitlist SET email = $1 WHERE email = 'mutated-redproof@example.invalid'`,
      [WAITLIST_EMAILS[0]],
    );
  },
  'waitlist',
);

await digestProof(
  'channels — in-place name mutation (count unchanged)',
  async () => {
    await c.query(`UPDATE channels SET name = 'Mutated Channel Name' WHERE id = $1`, [channelId]);
  },
  async () => {
    await c.query(`UPDATE channels SET name = 'Original Channel Name' WHERE id = $1`, [channelId]);
  },
  'channels',
);

// Cleanup seeded rows.
await c.query(`DELETE FROM waitlist WHERE email LIKE 'g1-redproof-%@example.invalid'`);
await c.query(`DELETE FROM channels WHERE user_id = $1`, [CHANNEL_USER]);
if (existsSync(PROOF_CHECKPOINT)) unlinkSync(PROOF_CHECKPOINT);
await c.end();

console.log('=== SUMMARY ===');
for (const r of results) console.log(`  ${r.verdict.padEnd(8)} ${r.name}`);
process.exit(results.every((r) => r.verdict === 'PROVEN') ? 0 : 1);
