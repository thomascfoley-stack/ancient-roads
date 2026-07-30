#!/usr/bin/env node
// Work Order v2 Stage 2.1 / 2.2 — unit_ordinal instrument (read-only CLI).
//
//   NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs \
//     --read-only --target=ep-odd-fog --cohort=staged [--json] [--out=docs/evidence/...]
//
// Credential: NEON_API_KEY only (mints app_runtime in-process). No DATABASE_URL fallback.
// Asserts read-only transaction AND connected role at the server. ROLLBACK always.
//
// --cohort IS REQUIRED AND HAS NO DEFAULT (Work Order v2 Tranche 1). This instrument's
// reason to exist is measuring the cohort that is ABOUT TO BE published, and it used to be
// wired permanently to `status = 'published'`. On a database where nothing is published yet
// that is not a probe that finds problems — it is a probe that cannot find anything, whose
// positive control then fails for a reason unrelated to the data under review. Naming the
// cohort at the call site is what makes the resulting report mean something, so every log
// line and the report body carry it: two runs differ by CONTENT, not by output filename.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { endpointId } from './lib/target-guard.mjs';
import { resolveInstrumentConnection, assertReadOnlySession, INSTRUMENT_ROLE } from './lib/neon-connection.mjs';
import { measureUnitOrdinalForCohort, assertCohort, sourceStatusCohorts, renderReportText, rollupDigest } from './lib/unit-ordinal-instrument.mjs';
import { buildExcerptReport, loadManifestById, renderExcerptLines } from './lib/excerpt-sample-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const AS_JSON = args.includes('--json');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];
const cohortArg = args.find((a) => a.startsWith('--cohort='))?.split('=')[1];

const EXCERPT_SECTIONS_SQL = `
  SELECT sec.unit_ordinal, sec.ordinal, coalesce(sec.heading, '') AS heading
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.slug = $1
  ORDER BY sec.unit_ordinal, sec.ordinal
  LIMIT 20`;

// The provenance scan pulls section rows into this process, so it must be bounded — the
// production `sections` table is ~73k rows today and nothing stops it growing. We ask for
// LIMIT+1: if the extra row comes back the scan did NOT see the whole population, and
// buildExcerptReport refuses to certify anything rather than reporting "no forbidden rows
// found" about a partial read.
const SECTION_SCAN_LIMIT = 200_000;

if (!READ_ONLY) {
  console.error(`Usage: NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs --read-only --target=<endpoint-id> --cohort=<${sourceStatusCohorts().join('|')}> [--json] [--out=path]`);
  process.exit(2);
}

// Refuse an unnamed or unrecognised cohort BEFORE opening a connection. A bad --cohort must
// not get as far as a query that returns zero rows and reads like a clean result.
let COHORT;
try {
  COHORT = assertCohort(cohortArg);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const conn = resolveInstrumentConnection({ target: targetArg, role: INSTRUMENT_ROLE });
const url = conn.url;
const host = endpointId(new URL(url).host) ?? new URL(url).host.toLowerCase();
const say = (s) => { if (!AS_JSON) console.log(s); };

// Every line names the cohort. Two runs of this tool against the same endpoint produce
// reports that differ by CONTENT — not by whatever the operator happened to call --out.
const CO = `[cohort=${COHORT}]`;
say(`unit_ordinal instrument — read-only ${CO}`);
say(`  ${CO} cohort under measurement: sources.status = '${COHORT}'`);
say(`  ${CO} target: ${host} (credentials redacted)`);
say(`  ${CO} connection: ${conn.source} role=${conn.role} branch=${conn.branch}`);

const c = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: 'unit-ordinal-instrument',
  statement_timeout: 600_000,
});
await c.connect();

const report = {
  host,
  target: targetArg,
  cohort: COHORT,
  ts: new Date().toISOString(),
  ok: false,
  connectionSource: conn.source,
  role: conn.role,
};
try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  await assertReadOnlySession(c, { role: INSTRUMENT_ROLE });
  say(`  ${CO} server role: ${INSTRUMENT_ROLE} ✓  (read-only transaction confirmed at the server)`);

  // POSITIVE CONTROL over the cohort being measured — the ABORT names it, so an empty
  // staged cohort can never be reported as "0 problems found".
  const control = (await c.query(`SELECT count(*)::int AS n FROM sources WHERE status = $1`, [COHORT])).rows[0];
  report.cohortWorks = control.n;
  say(`\n${CO} POSITIVE CONTROL: sources with status='${COHORT}' = ${control.n} ${control.n > 0 ? '✓' : '✗ ABORT'}`);
  if (!control.n) {
    throw new Error(`STOP ${CO}: positive control returned 0 — there are no sources in cohort '${COHORT}' on ${host}. The instrument measured nothing; this is an ABORT, not a pass.`);
  }

  const result = await measureUnitOrdinalForCohort(c, { cohort: COHORT });
  report.cohortWorks = result.cohortWorks;
  report.nulls = result.nulls;
  report.digests = result.digests;
  report.rollupDigest = rollupDigest(result.digests);
  report.errors = result.errors;
  report.ok = result.ok;

  say(`\n=== ${CO} WORKS IN COHORT '${COHORT}' (${result.cohortWorks}) ===`);
  say(`  ${CO} slug                     sections   units  digest`);
  for (const row of result.digests) {
    say(`  ${CO} ${row.slug.padEnd(28)} ${String(row.sections).padStart(8)} ${String(row.units).padStart(6)}  ${row.digest.slice(0, 12)}…`);
  }
  say(`\n${CO} rollup digest: ${report.rollupDigest}`);

  if (!result.ok) {
    say(`\n${CO} ✗ FAIL`);
    for (const e of result.errors) say(`  ${CO} - ${e}`);
    process.exitCode = 1;
  } else {
    say(`\n${CO} ✓ PASS — every work in cohort '${COHORT}' satisfies the unit_ordinal instrument`);
  }

  const cohortSources = (await c.query(`
    SELECT slug, source_type, status, provenance
    FROM sources WHERE status = $1
    ORDER BY source_type, slug
  `, [COHORT])).rows;
  const scanRows = (await c.query(`
    SELECT src.slug, sec.source_url
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    WHERE src.status = $1
    LIMIT ${SECTION_SCAN_LIMIT + 1}
  `, [COHORT])).rows;
  const sectionScan = { rows: scanRows.slice(0, SECTION_SCAN_LIMIT), truncated: scanRows.length > SECTION_SCAN_LIMIT };

  const excerpt = buildExcerptReport(cohortSources, sectionScan, loadManifestById(), { cohort: COHORT });
  report.excerptHeader = excerpt.header;
  report.excerptSampleSlugs = excerpt.sampleSlugs;
  report.excerptEligibility = excerpt.eligibility;
  report.excerptScanTruncated = excerpt.scanTruncated;

  if (excerpt.scanTruncated) {
    throw new Error(`STOP ${CO}: section source_url scan hit its ${SECTION_SCAN_LIMIT}-row limit — the provenance filter did not see the whole population and may not certify any work`);
  }
  if (excerpt.sampleSlugs.length === 0) {
    throw new Error(`STOP ${CO}: no manifest-eligible works in cohort '${COHORT}' for the excerpt sample`);
  }

  report.excerpts = {};
  for (const slug of excerpt.sampleSlugs) {
    const units = (await c.query(EXCERPT_SECTIONS_SQL, [slug])).rows;
    report.excerpts[slug] = units;
    say(`\n--- ${CO} excerpt: ${slug} (first ${units.length} sections; ordering fields only) ---`);
    for (const line of renderExcerptLines(units)) say(`  ${CO} ${line}`);
  }
  say(`\n${CO} ${excerpt.header}`);
} finally {
  await c.query('ROLLBACK').catch((e) => console.error(`ROLLBACK failed: ${e.message}`));
  await c.end();
}

if (AS_JSON) console.log(JSON.stringify(report, null, 2));
if (outArg) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, outArg)), { recursive: true });
  fs.writeFileSync(
    path.resolve(ROOT, outArg),
    AS_JSON ? JSON.stringify(report, null, 2) : renderReportText(report, renderExcerptLines),
  );
  say(`\n${CO} wrote ${outArg} — the cohort is recorded INSIDE the file; do not rely on this filename to tell two runs apart`);
}

if (!report.ok) process.exit(1);
