#!/usr/bin/env node
// Guarded unit_ordinal repair — re-apply migration 024's CTE chain to named sources.
//
//   node scripts/repair-unit-ordinal.mjs --target=ep-tiny-hat [--cohort=published]
//   node scripts/repair-unit-ordinal.mjs --target=ep-tiny-bonus --branch=ci-test-20260729 --apply
//
// Default is DRY RUN. --apply writes. Production is refused with no override.
//
// Why this exists: 024 is idempotent by exclusion (need = sources with a NULL). Scripts that
// delete sections after backfill leave stale unit_ordinal and a re-run of 024 is a no-op.
// This tool swaps only the need selector to named slugs; CTEs below need stay the migration's.
//
// Weld abort: if computed_units < stored_units for any work, refuse --apply (island merge).
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import {
  backfillSqlFromMigration,
  backfillSelectSql,
  backfillRepairUpdateSql,
  measureUnitOrdinalForCohort,
  assertCohort,
} from './lib/unit-ordinal-instrument.mjs';
import { endpointId, hostOf, isProdHost, DEV_ENDPOINT, PROD_ENDPOINT } from './lib/target-guard.mjs';

const PROJECT = 'spring-heart-74819093';

/** Endpoints this WRITE tool may touch. Prod is never on the list. */
const REPAIR_TARGETS = {
  [DEV_ENDPOINT]: { branch: 'dev' },
  // CI db-invariants APP_DATABASE_URL_TEST / seed branch (audit.yml SEED_BRANCH).
  'ep-tiny-bonus': { branch: 'ci-test-20260729' },
};

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const branchOverride = args.find((a) => a.startsWith('--branch='))?.split('=')[1];
const cohortArg = args.find((a) => a.startsWith('--cohort='))?.split('=')[1] ?? 'published';
const slugsArg = args.find((a) => a.startsWith('--slugs='))?.split('=')[1];

function usage(msg) {
  if (msg) console.error(msg);
  console.error(`Usage: node scripts/repair-unit-ordinal.mjs --target=<${Object.keys(REPAIR_TARGETS).join('|')}> [--branch=name] [--cohort=published] [--slugs=a,b] [--apply]
  Default: dry-run. --apply writes unit_ordinal via 024 CTE chain (slug-scoped need).
  REFUSES ${PROD_ENDPOINT}.`);
  process.exit(2);
}

if (!targetArg) usage('--target is required');
const targetId = endpointId(targetArg) ?? String(targetArg).toLowerCase().trim();
if (targetId.startsWith(PROD_ENDPOINT) || targetId === PROD_ENDPOINT) {
  console.error(`REFUSING: production (${PROD_ENDPOINT}) — this script WRITES unit_ordinal`);
  process.exit(1);
}
const allowed = REPAIR_TARGETS[targetId];
if (!allowed) {
  usage(`REFUSING: '${targetId}' is not a repair-allowed endpoint (allowed: ${Object.keys(REPAIR_TARGETS).join(', ')})`);
}

let COHORT;
try {
  COHORT = assertCohort(cohortArg);
} catch (e) {
  usage(e.message);
}

const branch = branchOverride ?? allowed.branch;

function mintOwnerUrl(branchName) {
  const apiKey = process.env.NEON_API_KEY?.trim();
  const neonArgs = [
    'connection-string', branchName,
    '--project-id', PROJECT,
    '--role-name', 'neondb_owner',
    '--database-name', 'neondb',
  ];
  if (apiKey) neonArgs.push('--api-key', apiKey);
  const url = execFileSync('neonctl', neonArgs, {
    encoding: 'utf8',
    env: { ...process.env, ...(apiKey ? { NEON_API_KEY: apiKey } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!url.startsWith('postgres')) throw new Error(`neonctl returned non-URL for branch ${branchName}`);
  return url;
}

const url = mintOwnerUrl(branch);
const host = hostOf(url);
const actualId = endpointId(host);
if (isProdHost(url)) {
  console.error(`REFUSING: minted host ${host} is production`);
  process.exit(1);
}
if (!actualId || !actualId.startsWith(targetId)) {
  console.error(`STOP: minted host ${host} (id=${actualId}) does not match --target=${targetId}`);
  process.exit(1);
}

console.log(`unit_ordinal repair — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`  target: ${actualId}  branch: ${branch}  role: neondb_owner  (credentials redacted)`);
console.log(`  cohort: ${COHORT}`);

const backfill = backfillSqlFromMigration();
const selectSql = backfillSelectSql(backfill, { scope: 'slugs' });
const repairSql = backfillRepairUpdateSql(backfill);

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: 'repair-unit-ordinal',
  statement_timeout: 600_000,
});
await client.connect();

try {
  const role = (await client.query('SELECT current_user')).rows[0]?.current_user;
  if (role !== 'neondb_owner') {
    throw new Error(`STOP: connected as '${role}', need neondb_owner for UPDATE`);
  }

  let slugs;
  if (slugsArg) {
    slugs = slugsArg.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    // Auto: works in cohort where stored ≠ computed for any section.
    const cohortSelect = backfillSelectSql(backfill, { scope: 'cohort' });
    const { rows } = await client.query(`
      WITH computed AS (${cohortSelect})
      SELECT DISTINCT src.slug
      FROM sections sec
      JOIN sources src ON src.id = sec.source_id
      JOIN computed c ON c.section_id = sec.id
      WHERE src.status = $1
        AND sec.unit_ordinal IS DISTINCT FROM c.computed_unit_ordinal
      ORDER BY src.slug
    `, [COHORT]);
    slugs = rows.map((r) => r.slug);
  }

  if (slugs.length === 0) {
    console.log('  nothing to repair — stored already matches 024 recomputation');
    const after = await measureUnitOrdinalForCohort(client, { cohort: COHORT });
    console.log(`  instrument cohort '${COHORT}': ok=${after.ok} errors=${after.errors.length}`);
    process.exit(after.ok ? 0 : 1);
  }

  console.log(`  slugs (${slugs.length}): ${slugs.join(', ')}`);

  const weld = (await client.query(`
    WITH computed AS (${selectSql})
    SELECT src.slug,
           count(DISTINCT sec.unit_ordinal)::int AS stored_units,
           count(DISTINCT c.computed_unit_ordinal)::int AS computed_units,
           count(*) FILTER (WHERE sec.unit_ordinal IS DISTINCT FROM c.computed_unit_ordinal)::int AS changed_sections
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    JOIN computed c ON c.section_id = sec.id
    WHERE src.slug = ANY($1::text[])
    GROUP BY src.slug
    ORDER BY src.slug
  `, [slugs])).rows;

  console.log('  per-work preview:');
  for (const w of weld) {
    const flag = w.computed_units < w.stored_units ? ' WELD_RISK' : '';
    console.log(
      `    ${w.slug}: stored_units=${w.stored_units} computed_units=${w.computed_units} ` +
      `changed_sections=${w.changed_sections}${flag}`,
    );
  }

  const welds = weld.filter((w) => w.computed_units < w.stored_units);
  if (welds.length) {
    console.error('STOP: weld detector — computed_units < stored_units (island merge). Refusing apply.');
    for (const w of welds) {
      console.error(`  ${w.slug}: stored=${w.stored_units} computed=${w.computed_units}`);
    }
    process.exit(1);
  }

  if (!APPLY) {
    console.log('  dry-run complete — re-run with --apply to write');
    process.exit(0);
  }

  await client.query('BEGIN');
  const upd = await client.query(repairSql, [slugs]);
  console.log(`  UPDATE rowCount=${upd.rowCount ?? '(n/a)'}`);

  const after = await measureUnitOrdinalForCohort(client, { cohort: COHORT });
  if (!after.ok) {
    await client.query('ROLLBACK');
    console.error('STOP: instrument still RED after repair — rolled back');
    for (const e of after.errors) console.error(`  ${e}`);
    process.exit(1);
  }
  await client.query('COMMIT');
  console.log(`  COMMIT — instrument cohort '${COHORT}' ok=${after.ok}`);
  if (after.uniformOffsets?.length) {
    for (const u of after.uniformOffsets) {
      console.log(`  note: ${u.slug} still has uniform offset ${u.offset} (allowed)`);
    }
  }
} finally {
  await client.end();
}
