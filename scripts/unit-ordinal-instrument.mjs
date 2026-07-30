#!/usr/bin/env node
// Work Order v2 Stage 2.1 / 2.2 — unit_ordinal instrument (read-only CLI).
//
//   NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs \
//     --read-only --target=ep-odd-fog [--json] [--out=docs/evidence/...]
//
// Credential: NEON_API_KEY only (mints app_runtime in-process). No DATABASE_URL fallback.
// Asserts read-only transaction AND connected role at the server. ROLLBACK always.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { endpointId } from './lib/target-guard.mjs';
import { resolveInstrumentConnection, assertReadOnlySession, INSTRUMENT_ROLE } from './lib/neon-connection.mjs';
import { measurePublishedUnitOrdinal, rollupDigest } from './lib/unit-ordinal-instrument.mjs';
import { buildExcerptReport, loadManifestById, renderExcerptLines } from './lib/excerpt-sample-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const AS_JSON = args.includes('--json');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];

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
  console.error('Usage: NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs --read-only --target=<endpoint-id> [--json] [--out=path]');
  process.exit(2);
}

const conn = resolveInstrumentConnection({ target: targetArg, role: INSTRUMENT_ROLE });
const url = conn.url;
const host = endpointId(new URL(url).host) ?? new URL(url).host.toLowerCase();
const say = (s) => { if (!AS_JSON) console.log(s); };

say('unit_ordinal instrument — read-only');
say(`  target: ${host} (credentials redacted)`);
say(`  connection: ${conn.source} role=${conn.role} branch=${conn.branch}`);

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
  ts: new Date().toISOString(),
  ok: false,
  connectionSource: conn.source,
  role: conn.role,
};
try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  await assertReadOnlySession(c, { role: INSTRUMENT_ROLE });
  say(`  server role: ${INSTRUMENT_ROLE} ✓  (read-only transaction confirmed at the server)`);

  const control = (await c.query(`SELECT count(*)::int AS n FROM sources WHERE status = 'published'`)).rows[0];
  say(`\nPOSITIVE CONTROL: published sources = ${control.n} ${control.n > 0 ? '✓' : '✗ ABORT'}`);
  if (!control.n) throw new Error('positive control returned 0');

  const result = await measurePublishedUnitOrdinal(c);
  report.publishedWorks = result.publishedWorks;
  report.nulls = result.nulls;
  report.digests = result.digests;
  report.rollupDigest = rollupDigest(result.digests);
  report.errors = result.errors;
  report.ok = result.ok;

  say(`\n=== PUBLISHED WORKS (${result.publishedWorks}) ===`);
  say('  slug                          sections   units  digest');
  for (const row of result.digests) {
    say(`  ${row.slug.padEnd(28)} ${String(row.sections).padStart(8)} ${String(row.units).padStart(6)}  ${row.digest.slice(0, 12)}…`);
  }
  say(`\nrollup digest: ${report.rollupDigest}`);

  if (!result.ok) {
    say('\n✗ FAIL');
    for (const e of result.errors) say(`  - ${e}`);
    process.exitCode = 1;
  } else {
    say('\n✓ PASS — all published works satisfy unit_ordinal instrument');
  }

  const publishedSources = (await c.query(`
    SELECT slug, source_type, status, provenance
    FROM sources WHERE status = 'published'
    ORDER BY source_type, slug
  `)).rows;
  const scanRows = (await c.query(`
    SELECT src.slug, sec.source_url
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    WHERE src.status = 'published'
    LIMIT ${SECTION_SCAN_LIMIT + 1}
  `)).rows;
  const sectionScan = { rows: scanRows.slice(0, SECTION_SCAN_LIMIT), truncated: scanRows.length > SECTION_SCAN_LIMIT };

  const excerpt = buildExcerptReport(publishedSources, sectionScan, loadManifestById());
  report.excerptHeader = excerpt.header;
  report.excerptSampleSlugs = excerpt.sampleSlugs;
  report.excerptEligibility = excerpt.eligibility;
  report.excerptScanTruncated = excerpt.scanTruncated;

  if (excerpt.scanTruncated) {
    throw new Error(`STOP: section source_url scan hit its ${SECTION_SCAN_LIMIT}-row limit — the provenance filter did not see the whole population and may not certify any work`);
  }
  if (excerpt.sampleSlugs.length === 0) {
    throw new Error('STOP: no manifest-eligible published works for excerpt sample');
  }

  report.excerpts = {};
  for (const slug of excerpt.sampleSlugs) {
    const units = (await c.query(EXCERPT_SECTIONS_SQL, [slug])).rows;
    report.excerpts[slug] = units;
    say(`\n--- excerpt: ${slug} (first ${units.length} sections; ordering fields only) ---`);
    for (const line of renderExcerptLines(units)) say(`  ${line}`);
  }
  say(`\n${excerpt.header}`);
} finally {
  await c.query('ROLLBACK').catch((e) => console.error(`ROLLBACK failed: ${e.message}`));
  await c.end();
}

if (AS_JSON) console.log(JSON.stringify(report, null, 2));
if (outArg) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, outArg)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, outArg), AS_JSON ? JSON.stringify(report, null, 2) : [
    `# unit_ordinal instrument — ${report.ts}`,
    `target: ${report.target}`,
    `ok: ${report.ok}`,
    `rollupDigest: ${report.rollupDigest}`,
    `excerptHeader: ${report.excerptHeader ?? ''}`,
    `sampleSlugs: ${(report.excerptSampleSlugs ?? []).join(', ')}`,
    '',
    ...((report.errors ?? []).map((e) => `ERROR: ${e}`)),
    '',
    ...(report.excerpts ? Object.entries(report.excerpts).flatMap(([slug, rows]) => [
      `## ${slug}`,
      ...renderExcerptLines(rows),
      '',
    ]) : []),
  ].join('\n'));
  say(`\nwrote ${outArg}`);
}

if (!report.ok) process.exit(1);
