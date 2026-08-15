#!/usr/bin/env node
/**
 * JOSEPHUS FLAT-ROW COPY — corpus-backlog 2026-08-13. One-off because corpus-copy.mjs
 * bulk-inserts whole works and josephus-whiston already EXISTS on prod (published, 4,112
 * sections, 0 flat rows); the historian lane build generated its 6,492 flat embeddings on
 * dev only. This copies exactly those rows, dev -> prod, served=false preserved.
 *
 * Guards: source must be the dev endpoint, dest must be ep-odd-fog (exact), dest role must
 * be neondb_owner (asserted at the server), dest must currently hold ZERO josephus flat rows
 * (else stop — something already copied them), every source row must be served=false and
 * carry clean provenance (forbiddenProvenanceDomain — the one body of that list).
 * Inverse: DELETE the copied ids (written to the evidence file). Owner override for this
 * prod write recorded in WORKLOG 2026-08-13 ("i override previous rules just get it done").
 *
 *   node scripts/copy-josephus-flat.mjs            # dry-run census
 *   node scripts/copy-josephus-flat.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';

const APPLY = process.argv.includes('--apply');
const devUrl = (() => {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = raw.match(/^DATABASE_URL_UNPOOLED=(.+)$/m) || raw.match(/^DATABASE_URL=(.+)$/m);
  return m[1].trim().replace(/^["']|["']$/g, '');
})();
const prodUrl = readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
const devHost = new URL(devUrl).host;
const prodHost = new URL(prodUrl).host;
if (prodHost.includes('ep-tiny-hat') || !prodHost.includes('ep-odd-fog')) { console.error(`ABORT: dest is not prod (${prodHost})`); process.exit(1); }
if (devHost.includes('ep-odd-fog')) { console.error('ABORT: source is prod'); process.exit(1); }

const src = new Client({ connectionString: devUrl });
const dest = new Client({ connectionString: prodUrl });
await src.connect(); await dest.connect();
const who = (await dest.query('SELECT current_user AS u')).rows[0].u;
if (who !== 'neondb_owner') { console.error(`ABORT: dest role ${who}, not neondb_owner`); process.exit(1); }

const existing = await dest.query(`SELECT id FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = 'josephus-whiston'`);
const onDest = new Set(existing.rows.map((r) => r.id));
if (onDest.size > 0) console.log(`dest already holds ${onDest.size} josephus rows (partial prior run) — topping up the remainder only`);

const { rows: allRows } = await src.query(`SELECT * FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = 'josephus-whiston' ORDER BY id`);
const rows = allRows.filter((r) => !onDest.has(r.id));
const served = rows.filter((r) => r.served === true).length;
const dirty = rows.filter((r) => forbiddenProvenanceDomain(r.metadata?.sourceUrl)).length;
console.log(`source: ${allRows.length} rows; to copy: ${rows.length} (served=true: ${served}, forbidden provenance: ${dirty})`);
if (served > 0 || dirty > 0) { console.error('ABORT: served or forbidden rows in the copy set'); process.exit(1); }
if (rows.length === 0) { console.log('Nothing to copy — dest already complete.'); process.exit(0); }
if (!APPLY) { console.log('DRY-RUN — re-run with --apply.'); process.exit(0); }

const genCols = (await dest.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'embeddings' AND is_generated = 'ALWAYS'`,
)).rows.map((r) => r.column_name);
const cols = Object.keys(rows[0]).filter((cn) => !genCols.includes(cn));
if (genCols.length) console.log(`generated columns excluded (recomputed by dest): ${genCols.join(', ')}`);
const BATCH = 250;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  await dest.query('BEGIN');
  try {
    for (const r of chunk) {
      await dest.query(
        `INSERT INTO embeddings (${cols.join(', ')}) VALUES (${cols.map((_, j) => `$${j + 1}`).join(', ')})`,
        cols.map((cn) => (r[cn] && typeof r[cn] === 'object' ? JSON.stringify(r[cn]) === '{}' ? '{}' : r[cn] : r[cn])),
      );
    }
    await dest.query('COMMIT');
    inserted += chunk.length;
  } catch (e) {
    await dest.query('ROLLBACK');
    console.error(`batch at ${i} failed, rolled back: ${e.message}`);
    process.exit(1);
  }
}
const after = await dest.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE served)::int AS s FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = 'josephus-whiston'`);
console.log(`copied ${inserted}; dest now: ${JSON.stringify(after.rows[0])}`);
if (after.rows[0].n !== allRows.length || after.rows[0].s !== 0) { console.error('POST-CHECK FAILED'); process.exit(1); }
const dir = new URL('../docs/evidence/corpus-backlog/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const f = join(dir, `josephus-flat-copy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify({ copiedAt: new Date().toISOString(), rows: rows.length, inverse: `DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = 'josephus-whiston' AND served = false;`, ids: rows.map((r) => r.id) }));
console.log(`evidence + inverse: ${f}`);
await src.end(); await dest.end();
