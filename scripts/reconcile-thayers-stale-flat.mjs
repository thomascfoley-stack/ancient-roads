#!/usr/bin/env node
/**
 * W-THAYER — Reconcile the stale thayers-lexicon FLAT rows (embeddings table).
 * Swarm closeout order 2026-08-22 (docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md §6,
 * W-THAYER step 3). Slug-scoped; this script is ALSO the prod replay artifact cited by the
 * owner-return packet. Pattern: the repo's suppression tooling
 * (src/ingest/suppress-nonauthorial-matter.ts) — dry-run default, fail-closed expected count,
 * back up every row WITH VECTORS before deleting, verify inside the txn, roll back on any
 * failure. No hand-written DELETEs: this script is the tooling.
 *
 * THE STALE CLASS (measured in docs/evidence/thayers-source-verification.md, re-measured on
 * dev 2026-08-23): 7,570 flat rows exist for thayers-lexicon; 4,705 carry a bare-integer key
 * (`lexicon:thayers-lexicon:NNN`) mapping to a live section by ordinal; the other 2,865 carry
 * CHUNKED keys (`lexicon:thayers-lexicon:NNN.MM`) — the dead vintage of the original chunked
 * flat ingest. The sections model has no chunks: a chunked key maps to no live section, and
 * every /ask lane is type-fenced so these rows are reachable by NO shipped query. The owner
 * call to delete them is BANKED (WORKLOG 2026-08-22: "recommendation: delete") — dev execution
 * here STAGES THE EVIDENCE for that call; it does not discharge it. The prod replay is the
 * owner's, via the packet.
 *
 * Discipline:
 *   - --env=dev|prod REQUIRED; endpoint asserted BEFORE connecting (same guard idiom as
 *     scripts/backfill-section-embeddings.mjs). No secret is ever printed.
 *   - Dry-run by default. --apply writes.
 *   - Fail-closed: the stale population must match --expect (default 2,865, measured on dev
 *     2026-08-23) AND every stale key must be the chunked NNN.MM shape with a LIVE integer
 *     part (they are chunks OF live entries, not orphans of dead ones) — a moved population
 *     means re-verify, not write.
 *   - Backup: docs/evidence/swarm-2026-08-22/w-thayer/stale-flat-backup-<env>-<ts>.jsonl,
 *     every row with its vector, BEFORE the delete. Restore = re-insert from the backup;
 *     on dev the rows are also regenerable by re-copy from prod while prod still holds them.
 *
 *   node scripts/reconcile-thayers-stale-flat.mjs --env=dev           # dry-run census
 *   node scripts/reconcile-thayers-stale-flat.mjs --env=dev --apply   # backup + delete + verify
 */
import { readFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

const PROD_ENDPOINT = 'ep-odd-fog';
const SLUG = 'thayers-lexicon';

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const ENV = arg('env');
const APPLY = process.argv.includes('--apply');
const EXPECT = Number(arg('expect') ?? 2865); // stale chunked-key population, measured on dev 2026-08-23
if (!ENV || !['dev', 'prod'].includes(ENV)) {
  console.error('Usage: node scripts/reconcile-thayers-stale-flat.mjs --env=dev|prod [--apply] [--expect=N]');
  process.exit(1);
}

function loadUrl() {
  if (ENV === 'prod') return readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
  for (const p of ['../.env.local', '../web/.env.local']) {
    try {
      const raw = readFileSync(new URL(p, import.meta.url), 'utf8');
      const m = raw.match(/^DATABASE_URL_UNPOOLED=(.+)$/m) || raw.match(/^DATABASE_URL=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  console.error('No DATABASE_URL found for dev.'); process.exit(1);
}

const url = loadUrl();
const host = new URL(url).host;
if (ENV === 'prod' && !host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=prod but host is ${host}`); process.exit(1); }
if (ENV === 'dev' && host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=dev but host is prod (${host})`); process.exit(1); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = new URL('../docs/evidence/swarm-2026-08-22/w-thayer/', import.meta.url).pathname;
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `reconcile-stale-flat-${ENV}-${APPLY ? 'apply' : 'dry-run'}-${ts}.log`);
const logStream = createWriteStream(logPath);
function log(line = '') {
  console.log(line);
  logStream.write(line + '\n');
}

// The stale predicate, single-sourced for census/backup/delete/verify: a flat row keys to no
// live section iff its key (third colon-field of source_id) is NOT a bare integer naming a
// live section ordinal. Measured shape on dev 2026-08-23: every such key is the chunked
// NNN.MM form and every chunk's integer part DOES name a live section (they are dead-vintage
// chunks of live entries) — the fail-closed census below asserts exactly that, so this script
// can never delete a row whose entry has no live section at all.
const STALE_SQL = `
  SELECT e.id FROM embeddings e
   WHERE e.user_id IS NULL AND e.metadata->>'work' = $1
     AND NOT (
       split_part(e.source_id, ':', 3) ~ '^[0-9]+$'
       AND split_part(e.source_id, ':', 3)::int IN (
             SELECT sec.ordinal FROM sections sec
              JOIN sources s ON s.id = sec.source_id WHERE s.slug = $1))`;

log(`W-THAYER stale flat-row reconcile — ${SLUG}`);
log(`target: ${ENV} (${host}) · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
log(`evidence log: ${logPath}`);

const client = new Client({ connectionString: url });
await client.connect();

try {
  const totals = (await client.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE served)::int AS served
       FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [SLUG])).rows[0];
  const stale = (await client.query(
    `WITH stale AS (${STALE_SQL})
     SELECT count(*)::int AS n,
            count(*) FILTER (WHERE split_part(e.source_id, ':', 3) ~ '^[0-9]+\\.[0-9]+$')::int AS chunked_shape,
            count(*) FILTER (WHERE split_part(split_part(e.source_id, ':', 3), '.', 1)::int IN (
              SELECT sec.ordinal FROM sections sec JOIN sources s ON s.id = sec.source_id
               WHERE s.slug = $1))::int AS intpart_live,
            count(*) FILTER (WHERE e.served)::int AS served
       FROM embeddings e JOIN stale ON stale.id = e.id`, [SLUG])).rows[0];
  const sample = (await client.query(
    `WITH stale AS (${STALE_SQL})
     SELECT e.source_id, e.metadata->>'heading' AS heading
       FROM embeddings e JOIN stale ON stale.id = e.id ORDER BY e.source_id LIMIT 5`, [SLUG])).rows;

  log('');
  log(`flat rows for ${SLUG}: ${totals.total} (${totals.served} served)`);
  log(`stale (key to no live section): ${stale.n} — chunked NNN.MM shape: ${stale.chunked_shape}; chunk integer-part names a live section: ${stale.intpart_live}; served among stale: ${stale.served}`);
  for (const r of sample) log(`  e.g. ${r.source_id}  ${JSON.stringify(r.heading)}`);

  if (stale.n !== EXPECT) {
    log(`STOP: stale population is ${stale.n}, expected ${EXPECT} — the premise moved; re-verify before deleting (override only with an explicit --expect=N after re-measuring).`);
    process.exitCode = 1;
  } else if (stale.n !== stale.chunked_shape || stale.n !== stale.intpart_live) {
    log(`STOP: stale population is not the pure measured class (chunked=${stale.chunked_shape}, intpart_live=${stale.intpart_live}, n=${stale.n}) — re-verify before deleting.`);
    process.exitCode = 1;
  } else if (!APPLY) {
    log('');
    log(`DRY-RUN — nothing written. Re-run with --apply to back up and remove the ${stale.n} stale rows.`);
  } else {
    // BACK UP every stale row WITH its vector before deleting (suppression-tooling pattern).
    const backupPath = join(logDir, `stale-flat-backup-${ENV}-${ts}.jsonl`);
    const backup = (await client.query(
      `WITH stale AS (${STALE_SQL})
       SELECT e.id, e.source_id, e.source_type, e.served, e.metadata, e.embedding::text AS embedding
         FROM embeddings e JOIN stale ON stale.id = e.id ORDER BY e.source_id`, [SLUG])).rows;
    writeFileSync(backupPath, backup.map((r) => JSON.stringify(r)).join('\n') + '\n');
    log('');
    log(`✓ backed up ${backup.length} stale rows (with vectors) → ${backupPath}`);

    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM embeddings WHERE id IN (${STALE_SQL})`, [SLUG]);
    // VERIFY inside the txn: zero stale remain, and the live-mapped population is untouched.
    const after = (await client.query(
      `SELECT (SELECT count(*) FROM (${STALE_SQL}) s)::int AS stale_left,
              (SELECT count(*) FROM embeddings
                WHERE user_id IS NULL AND metadata->>'work' = $1)::int AS total_left`, [SLUG])).rows[0];
    if ((del.rowCount ?? 0) !== EXPECT) throw new Error(`VERIFY FAILED: deleted ${del.rowCount}, expected ${EXPECT}`);
    if (after.stale_left !== 0) throw new Error(`VERIFY FAILED: ${after.stale_left} stale rows remain`);
    if (after.total_left !== totals.total - EXPECT) {
      throw new Error(`VERIFY FAILED: ${after.total_left} flat rows remain, expected ${totals.total - EXPECT} — live-mapped rows were touched`);
    }
    await client.query('COMMIT');
    log(`✓ REMOVED ${del.rowCount} stale flat rows on ${ENV} (txn verified: 0 stale remain; ${after.total_left} live-mapped rows untouched).`);
    log(`  Restore: re-insert from ${backupPath}; on dev the rows are also regenerable by re-copy from prod while prod holds them.`);
    log(`  BANKED OWNER CALL — this dev execution STAGES the evidence; the prod replay (packet) is the owner's go, per occasion.`);
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  await client.end();
  logStream.end();
}
