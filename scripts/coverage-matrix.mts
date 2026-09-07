#!/usr/bin/env tsx
/**
 * COVERAGE MATRIX (corpus-coverage order, Track B3, 2026-09-07) —
 * tradition × source_type: DECLARED (manifest) vs DATABASE rows and status.
 *
 *   npx tsx scripts/coverage-matrix.mts                          # no DB target: declared column
 *                                                                # only, exit 2 (honestly unmeasured)
 *   DATABASE_URL=<dev url> npx tsx scripts/coverage-matrix.mts   # dev column
 *   COVERAGE_ALLOW_PROD=1 DATABASE_URL=<prod url> npx tsx scripts/coverage-matrix.mts
 *     — the ONE command that measures the SERVED column. Owner-terminal only (bylaw 7);
 *     against prod the `published` column IS the served column.
 *
 * Safety (same pattern as scripts/coverage-census.mts / dev-corpus-census.mjs):
 *   1. READ-ONLY enforced by the database, not the script: BEGIN; SET TRANSACTION
 *      READ ONLY; ROLLBACK always.
 *   2. No CLI parameters — target comes only from DATABASE_URL. Prod refuses unless
 *      COVERAGE_ALLOW_PROD=1 (bylaw 7: owner's explicit go, every time).
 *   3. Credentials never printed; the endpoint id (never the password) names the target.
 *   4. sources.tradition is manifest-propagated on ingest — the DB column lags the
 *      manifest until the next ingest of each work. The script reports what the DB HAS.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostOf, endpointId, isProdHost } from './lib/target-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATUSES = ['staged', 'published', 'quarantined'] as const;

type Key = string; // `${tradition}\t${source_type}`
const key = (t: string, s: string): Key => `${t}\t${s}`;

// ---- declared column: the manifest alone, always available ----
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'ingest/sources.config.json'), 'utf8')) as Array<
  { tradition?: string; source_type?: string }
>;
const declared = new Map<Key, number>();
for (const e of manifest) {
  const k = key(String(e.tradition ?? 'unassigned').toLowerCase(), String(e.source_type ?? '(none)'));
  declared.set(k, (declared.get(k) ?? 0) + 1);
}

// ---- database columns (optional) ----
const url = process.env.DATABASE_URL;
type DbCell = { rows: number; byStatus: Map<string, number> };
const db = new Map<Key, DbCell>();
let target = '(no DATABASE_URL — DB columns unmeasured)';

if (url) {
  if (isProdHost(url) && process.env.COVERAGE_ALLOW_PROD !== '1') {
    console.error(
      `STOP: ${hostOf(url)} is production. Re-run with COVERAGE_ALLOW_PROD=1 under the owner's go (bylaw 7).`,
    );
    process.exit(2);
  }
  target = endpointId(hostOf(url)) ?? hostOf(url);
  const c = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    application_name: 'coverage-matrix',
    statement_timeout: 120_000,
    query_timeout: 120_000,
  });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET TRANSACTION READ ONLY');
    const r = await c.query<{ source_type: string; tradition: string; status: string; n: number }>(
      `SELECT coalesce(source_type,'(none)') AS source_type,
              lower(coalesce(tradition,'unassigned')) AS tradition,
              coalesce(status,'(none)') AS status,
              count(*)::int AS n
         FROM sources GROUP BY 1,2,3`,
    );
    await c.query('ROLLBACK');
    if (r.rows.length === 0) throw new Error('POSITIVE CONTROL FAILED: sources grouped query returned 0 rows on a non-empty corpus');
    for (const row of r.rows) {
      const k = key(row.tradition, row.source_type);
      if (!db.has(k)) db.set(k, { rows: 0, byStatus: new Map() });
      const cell = db.get(k)!;
      cell.rows += row.n;
      cell.byStatus.set(row.status, (cell.byStatus.get(row.status) ?? 0) + row.n);
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

// ---- emit ----
const keys = new Set<Key>([...declared.keys(), ...db.keys()]);
const rows = [...keys].sort((a, b) => a.localeCompare(b));
console.log(`# coverage matrix — tradition × source_type`);
console.log(`# declared: ingest/sources.config.json (${manifest.length} entries)`);
console.log(`# database: ${target}${url ? ' (read-only transaction)' : ''}`);
console.log('');
console.log('| tradition | source_type | declared | db_rows | staged | published | quarantined | other |');
console.log('|---|---|---|---|---|---|---|---|');
const tot = { declared: 0, rows: 0, staged: 0, published: 0, quarantined: 0, other: 0 };
for (const k of rows) {
  const [tradition, sourceType] = k.split('\t');
  const d = declared.get(k) ?? 0;
  const cell = db.get(k);
  const by = (s: string) => cell?.byStatus.get(s) ?? 0;
  const known = STATUSES.reduce((a, s) => a + by(s), 0);
  const other = (cell?.rows ?? 0) - known;
  console.log(
    `| ${tradition} | ${sourceType} | ${url ? d : d} | ${url ? (cell?.rows ?? 0) : '—'} | ${url ? by('staged') : '—'} | ${url ? by('published') : '—'} | ${url ? by('quarantined') : '—'} | ${url ? other : '—'} |`,
  );
  tot.declared += d;
  tot.rows += cell?.rows ?? 0;
  tot.staged += by('staged');
  tot.published += by('published');
  tot.quarantined += by('quarantined');
  tot.other += other;
}
console.log(
  `| **TOTAL** | | **${tot.declared}** | **${url ? tot.rows : '—'}** | **${url ? tot.staged : '—'}** | **${url ? tot.published : '—'}** | **${url ? tot.quarantined : '—'}** | **${url ? tot.other : '—'}** |`,
);

if (!url) {
  console.error('\nDATABASE_URL is unset: the database columns are UNMEASURED, not zero. Set DATABASE_URL (dev) — or, under the owner\'s go, COVERAGE_ALLOW_PROD=1 + prod DATABASE_URL for the served column.');
  process.exit(2);
}
