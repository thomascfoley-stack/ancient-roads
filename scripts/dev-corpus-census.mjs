#!/usr/bin/env node
// §A0 — READ-ONLY per-register census of the DEV corpus, plus the work-by-work queue
// the ingest run works against. Nothing downstream may run off memory; it runs off this.
//
//   DEV_DATABASE_URL=<dev owner> node scripts/dev-corpus-census.mjs [--json]
//
// Safety, in the prod-census.cjs order:
//   1. BEGIN; SET TRANSACTION READ ONLY — the database refuses writes, not the script.
//   2. ROLLBACK always.
//   3. Host asserted to be the DEV endpoint id EXACTLY (never a substring of the whole
//      URL — a password or database name containing "ep-tiny-hat" must not authorize a
//      different endpoint).
//   4. Credentials never printed.
//   5. POSITIVE CONTROL first: a count that MUST be non-zero, so every 0 below means
//      "absent", not "the probe is blind".
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostOf, endpointId, DEV_ENDPOINT } from './lib/target-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AS_JSON = process.argv.includes('--json');

const url = process.env.DEV_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('no DEV_DATABASE_URL');
const host = hostOf(url);
if (endpointId(host) !== DEV_ENDPOINT && !endpointId(host)?.startsWith(`${DEV_ENDPOINT}-`)) {
  throw new Error(`STOP: host ${host} is not the dev endpoint (${DEV_ENDPOINT}) — refusing`);
}
const say = (s) => { if (!AS_JSON) console.log(s); };
say(`host: ${host} (credentials redacted)`);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'));
const manifestBySlug = new Map(manifest.map((e) => [e.slug ?? e.id, e]));

const c = new pg.Client({
  connectionString: url, ssl: { rejectUnauthorized: false },
  application_name: 'dev-corpus-census', statement_timeout: 600_000, query_timeout: 600_000,
});
await c.connect();
const out = {};
try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  const ro = (await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  if (ro !== 'on') throw new Error('STOP: read-only transaction not in force');
  say(`read-only txn: ${ro}   role: ${(await c.query('SELECT current_user u')).rows[0].u}`);

  // ── POSITIVE CONTROL ────────────────────────────────────────────────────────
  const control = (await c.query(`SELECT count(*)::int n FROM sources`)).rows[0].n;
  say(`\nPOSITIVE CONTROL: sources rows = ${control} ${control > 0 ? '✓ probe fires' : '✗ ABORT — probe is blind'}`);
  if (control === 0) throw new Error('positive control returned 0');
  out.control = control;

  // ── per-register roll-up ────────────────────────────────────────────────────
  const reg = await c.query(`
    SELECT s.source_type, s.status,
           count(DISTINCT s.id)::int AS works,
           count(sec.id)::int        AS sections,
           count(sec.id) FILTER (WHERE sec.unit_ordinal IS NULL)::int AS null_units
      FROM sources s LEFT JOIN sections sec ON sec.source_id = s.id
     GROUP BY 1,2 ORDER BY 1,2`);
  out.registers = reg.rows;
  say('\n=== PER-REGISTER (sources x status) ===');
  say('  register      status       works  sections  unit_ordinal NULL');
  for (const r of reg.rows) {
    say(`  ${r.source_type.padEnd(13)} ${r.status.padEnd(12)} ${String(r.works).padStart(5)} ${String(r.sections).padStart(9)} ${String(r.null_units).padStart(17)}`);
  }

  // ── work-by-work ────────────────────────────────────────────────────────────
  const works = await c.query(`
    SELECT s.slug, s.title, s.author, s.source_type, s.status, s.license,
           s.provenance->>'url' AS prov_url,
           count(sec.id)::int AS sections,
           count(sec.id) FILTER (WHERE sec.unit_ordinal IS NULL)::int AS null_units,
           count(DISTINCT sec.unit_ordinal)::int AS units,
           count(se.section_id)::int AS vectors,
           count(sa.section_id)::int AS anchors
      FROM sources s
      LEFT JOIN sections sec           ON sec.source_id = s.id
      LEFT JOIN section_embeddings se  ON se.section_id = sec.id
      LEFT JOIN section_anchors sa     ON sa.section_id = sec.id
     GROUP BY s.id ORDER BY s.source_type, s.slug`);

  const flat = await c.query(`
    SELECT metadata->>'work' AS work, count(*)::int AS rows
      FROM embeddings WHERE user_id IS NULL AND metadata->>'work' IS NOT NULL
     GROUP BY 1`);
  const flatByWork = new Map(flat.rows.map((r) => [r.work, r.rows]));
  out.works = works.rows.map((w) => ({ ...w, flat: flatByWork.get(w.slug) ?? 0, quarantine: manifestBySlug.get(w.slug)?.quarantine ?? null }));

  say('\n=== WORK-BY-WORK ===');
  say('  status    register     slug                        sections   units  vectors  anchors    flat  q');
  for (const w of out.works) {
    say(`  ${w.status.padEnd(9)} ${w.source_type.padEnd(12)} ${w.slug.padEnd(27)} ${String(w.sections).padStart(8)} ${String(w.units).padStart(7)} ${String(w.vectors).padStart(8)} ${String(w.anchors).padStart(8)} ${String(w.flat).padStart(7)}  ${w.quarantine ? 'Q' : ''}`);
  }

  // ── flat-store works with NO source row (sliced? never sliced?) ─────────────
  const slugs = new Set(out.works.map((w) => w.slug));
  out.flatOnly = flat.rows.filter((r) => !slugs.has(r.work));
  if (out.flatOnly.length) {
    say('\n=== FLAT-STORE works with NO sources row (never sliced) ===');
    for (const r of out.flatOnly) say(`  ${r.work.padEnd(30)} ${String(r.rows).padStart(8)} flat rows`);
  }

  // ── manifest entries with NO source row at all (never ingested) ─────────────
  out.neverIngested = manifest.filter((e) => !slugs.has(e.slug ?? e.id)).map((e) => ({
    id: e.id, slug: e.slug ?? e.id, source_type: e.source_type, quarantine: e.quarantine ?? null,
  }));
  say('\n=== MANIFEST entries with NO sources row (never ingested) ===');
  for (const e of out.neverIngested) say(`  ${(e.slug ?? e.id).padEnd(30)} ${String(e.source_type).padEnd(12)} ${e.quarantine ? 'QUARANTINED: ' + e.quarantine.slice(0, 90) : ''}`);

  // ── the other two stores, for completeness ──────────────────────────────────
  const ce = (await c.query(`SELECT count(*)::int n FROM commentary_entries`)).rows[0].n;
  const emb = (await c.query(`SELECT count(*)::int n, count(*) FILTER (WHERE metadata->>'work' IS NULL)::int unlabeled FROM embeddings WHERE user_id IS NULL`)).rows[0];
  out.stores = { commentary_entries: ce, embeddings: emb.n, embeddings_unlabeled: emb.unlabeled };
  say(`\n=== OTHER STORES ===\n  commentary_entries: ${ce}\n  embeddings (served): ${emb.n}, unlabeled work key: ${emb.unlabeled}`);
} finally {
  await c.query('ROLLBACK').catch((e) => console.error(`ROLLBACK failed: ${e.message}`));
  await c.end();
}
if (AS_JSON) console.log(JSON.stringify(out, null, 2));
