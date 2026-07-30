#!/usr/bin/env node
// Work Order v2 Stage 2.1 / 2.2 — unit_ordinal instrument (read-only CLI).
//
//   NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs \
//     --read-only --target=ep-odd-fog [--json] [--out=docs/evidence/...]
//
// Mints app_runtime via neonctl in-process — never type or paste a prod connection string.
// Uses BEGIN READ ONLY + server assert, positive control, target guard, ROLLBACK always.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { endpointId } from './lib/target-guard.mjs';
import { resolveInstrumentConnection } from './lib/neon-connection.mjs';
import {
  measurePublishedUnitOrdinal,
  rollupDigest,
  CLEAN_EXCERPT_WORKS_SQL,
  EXCERPT_SECTIONS_SQL,
  pickExcerptSlugs,
  SOURCE_FORBIDDEN_PROVENANCE_SQL,
} from './lib/unit-ordinal-instrument.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const AS_JSON = args.includes('--json');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];

if (!READ_ONLY) {
  console.error('Usage: NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs --read-only --target=<endpoint-id> [--json] [--out=path]');
  process.exit(2);
}

const conn = resolveInstrumentConnection({ target: targetArg, role: 'app_runtime' });
const url = conn.url;
const host = endpointId(new URL(url).host) ?? new URL(url).host.toLowerCase();
const say = (s) => { if (!AS_JSON) console.log(s); };

say('unit_ordinal instrument — read-only');
say(`  target: ${host} (credentials redacted)`);
say(`  connection: ${conn.source}${conn.role ? ` role=${conn.role}` : ''}${conn.branch ? ` branch=${conn.branch}` : ''}`);

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
  role: conn.role ?? 'env',
  excerptPolicy: 'clean-provenance works only; unit_ordinal + ordinal + heading — no body text',
};
try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  const ro = (await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  if (ro !== 'on') throw new Error('STOP: read-only transaction not in force');

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

  // Stage 2.2 excerpt: ordering only — clean-provenance works, no body text in committed log.
  const cleanWorks = (await c.query(CLEAN_EXCERPT_WORKS_SQL)).rows;
  const sampleSlugs = pickExcerptSlugs(cleanWorks, 3);
  report.excerptSampleSlugs = sampleSlugs;
  report.excerptExcludedForbidden = (await c.query(`
    SELECT count(*)::int AS n FROM sources src
    WHERE src.status = 'published' AND (${SOURCE_FORBIDDEN_PROVENANCE_SQL})
  `)).rows[0].n;

  if (sampleSlugs.length === 0) {
    throw new Error('STOP: no clean-provenance published works available for excerpt sample');
  }

  report.excerpts = {};
  for (const slug of sampleSlugs) {
    const units = (await c.query(EXCERPT_SECTIONS_SQL, [slug])).rows;
    report.excerpts[slug] = units;
    say(`\n--- excerpt: ${slug} (first ${units.length} sections in reading order; heading only, no body) ---`);
    for (const u of units) {
      say(`  u${String(u.unit_ordinal).padStart(4)}.${String(u.ordinal).padStart(4)}  ${(u.heading || '(no heading)').slice(0, 60)}`);
    }
  }
  say(`\nexcerpt policy: ${report.excerptPolicy}`);
  say(`  forbidden-provenance sources excluded from sample: ${report.excerptExcludedForbidden}`);
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
    `excerptPolicy: ${report.excerptPolicy}`,
    `forbiddenProvenanceSourcesExcluded: ${report.excerptExcludedForbidden}`,
    `sampleSlugs: ${(report.excerptSampleSlugs ?? []).join(', ')}`,
    '',
    ...((report.errors ?? []).map((e) => `ERROR: ${e}`)),
    '',
    ...(report.excerpts ? Object.entries(report.excerpts).flatMap(([slug, rows]) => [
      `## ${slug}`,
      ...rows.map((u) => `u${u.unit_ordinal}.${u.ordinal}\t${u.heading || ''}`),
      '',
    ]) : []),
  ].join('\n'));
  say(`\nwrote ${outArg}`);
}

if (!report.ok) process.exit(1);
