#!/usr/bin/env node
// Work Order v2 Stage 2.1 / 2.2 — unit_ordinal instrument (read-only CLI).
//
//   UNIT_ORDINAL_DATABASE_URL=<owner> node scripts/unit-ordinal-instrument.mjs \
//     --read-only --target=ep-odd-fog [--json] [--out=docs/evidence/...]
//
// Rails: prod connection requires owner go + exact --target endpoint id.
// Uses BEGIN READ ONLY, positive control, ROLLBACK always.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostOf, endpointId, declaredMatches } from './lib/target-guard.mjs';
import { measurePublishedUnitOrdinal, rollupDigest } from './lib/unit-ordinal-instrument.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const AS_JSON = args.includes('--json');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1];

if (!READ_ONLY) {
  console.error('Usage: node scripts/unit-ordinal-instrument.mjs --read-only --target=<endpoint-id> [--json] [--out=path]');
  process.exit(2);
}

const url = process.env.UNIT_ORDINAL_DATABASE_URL ?? process.env.CUTOVER_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('UNIT_ORDINAL_DATABASE_URL (or CUTOVER_DATABASE_URL / DATABASE_URL) is unset');
if (!targetArg) throw new Error('--target=<endpoint-id> is required (exact Neon endpoint id)');
if (!declaredMatches(url, targetArg)) {
  throw new Error(`STOP: host ${hostOf(url)} is not the declared target '${targetArg}'`);
}

const host = hostOf(url);
const say = (s) => { if (!AS_JSON) console.log(s); };

say(`unit_ordinal instrument — read-only`);
say(`  target: ${endpointId(host) ?? host} (credentials redacted)`);

const c = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: 'unit-ordinal-instrument',
  statement_timeout: 600_000,
});
await c.connect();

const report = { host: endpointId(host), target: targetArg, ts: new Date().toISOString(), ok: false };
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

  // Stage 2.2 excerpt dump: first 20 units per work (three works across registers when available)
  const picks = (await c.query(`
    SELECT slug, source_type FROM sources WHERE status = 'published'
    ORDER BY source_type, slug
  `)).rows;
  const byRegister = new Map();
  for (const p of picks) {
    if (!byRegister.has(p.source_type)) byRegister.set(p.source_type, p.slug);
  }
  const sampleSlugs = [...byRegister.values()].slice(0, 3);
  report.excerpts = {};
  for (const slug of sampleSlugs) {
    const units = (await c.query(`
      SELECT sec.unit_ordinal, sec.ordinal, left(coalesce(sec.heading, ''), 80) AS heading,
             left(regexp_replace(sec.body, E'[\\n\\r]+', ' ', 'g'), 120) AS snippet
      FROM sections sec
      JOIN sources src ON src.id = sec.source_id
      WHERE src.slug = $1
      ORDER BY sec.unit_ordinal, sec.ordinal
      LIMIT 20
    `, [slug])).rows;
    report.excerpts[slug] = units;
    say(`\n--- excerpt: ${slug} (first ${units.length} sections in reading order) ---`);
    for (const u of units) {
      say(`  u${String(u.unit_ordinal).padStart(4)}.${String(u.ordinal).padStart(4)}  ${(u.heading || '(no heading)').slice(0, 60)}  ${u.snippet.slice(0, 80)}`);
    }
  }
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
    '',
    ...((report.errors ?? []).map((e) => `ERROR: ${e}`)),
    '',
    ...(report.excerpts ? Object.entries(report.excerpts).flatMap(([slug, rows]) => [
      `## ${slug}`,
      ...rows.map((u) => `u${u.unit_ordinal}.${u.ordinal}\t${u.heading || ''}\t${u.snippet}`),
      '',
    ]) : []),
  ].join('\n'));
  say(`\nwrote ${outArg}`);
}

if (!report.ok) process.exit(1);
