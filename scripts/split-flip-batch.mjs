#!/usr/bin/env node
// Split a flip slug-list into chunks bounded by EMBEDDING ROWS, not work count. READ-ONLY.
//
//   node scripts/split-flip-batch.mjs <slugs.json> [--rows=40000]
//
// WHY BY ROWS. Works differ by two orders of magnitude — one sermon volume can carry more rows than
// thirty short ones — so an N-works chunk has wildly unpredictable duration. The cost that matters
// is rows, because each row flipped to served=true is re-inserted into every applicable index on
// `embeddings`, and that table carries 14 indexes totalling 13 GB including an 8 GB HNSW over all
// rows. That is the meter.
//
// WHY CHUNK AT ALL, measured not assumed: on 2026-08-19 the sermon flip (146,205 rows, one
// transaction) ran ~120 minutes and then vanished server-side with nothing committed — no rows
// written, no run log, and a client left hanging on a dead socket. `statement_timeout` is 0, so
// nothing timed the statement out; `idle_in_transaction_session_timeout` is 5 min, which a
// multi-statement transaction with long gaps can trip. Either way a two-hour transaction has no
// durability story: an hour and fifty minutes of work is discarded by any single interruption.
// Chunks make progress durable — publish-flip's `AND status='staged'` already makes a re-run flip
// only what remains, so a failed chunk costs one chunk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const file = process.argv[2];
const target = Number(process.argv.find((a) => a.startsWith('--rows='))?.split('=')[1] ?? 40_000);
if (!file) { console.error('usage: split-flip-batch.mjs <slugs.json> [--rows=N]'); process.exit(2); }

let src;
try { src = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error(`STOP: cannot read ${file}: ${e.message}`); process.exit(2); }

const url = process.env.CENSUS_DB_URL ?? fs.readFileSync(`${os.homedir()}/.neon_prod_url`, 'utf8').trim();
const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname.split('.')[0];
console.log(`sizing against ${host}${host.startsWith('ep-odd-fog') ? ' (PRODUCTION)' : ' (NOT production)'}`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('BEGIN TRANSACTION READ ONLY');
const rows = (await c.query(
  `SELECT metadata->>'work' AS work, count(*)::int AS n
     FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = ANY($1) GROUP BY 1`,
  [src.slugs])).rows;
await c.query('ROLLBACK');
await c.end();

const size = new Map(rows.map((r) => [r.work, r.n]));
// Largest first: a single work bigger than the target still gets its own chunk rather than
// straddling one, and packing the big ones first keeps the tail chunks even.
const ordered = [...src.slugs].sort((a, b) => (size.get(b) ?? 0) - (size.get(a) ?? 0));

const chunks = [];
for (const slug of ordered) {
  const n = size.get(slug) ?? 0;
  let bin = chunks.find((k) => k.rows + n <= target);
  if (!bin) { bin = { slugs: [], rows: 0 }; chunks.push(bin); }
  bin.slugs.push(slug);
  bin.rows += n;
}

const base = path.basename(file, '.json');
const dir = path.dirname(file);
const total = chunks.reduce((a, k) => a + k.rows, 0);
console.log(`${src.slugs.length} works, ${total.toLocaleString()} rows -> ${chunks.length} chunk(s) of <= ${target.toLocaleString()}\n`);
chunks.forEach((k, i) => {
  const out = path.join(dir, `${base}-chunk${i + 1}of${chunks.length}.json`);
  fs.writeFileSync(out, `${JSON.stringify({
    _: `${src._ ?? ''} CHUNK ${i + 1}/${chunks.length}, split by embedding-row count (see scripts/split-flip-batch.mjs for why rows, not works).`,
    parent: file, rows: k.rows, slugs: k.slugs.sort(),
  }, null, 2)}\n`);
  console.log(`  ${path.basename(out).padEnd(34)} ${String(k.slugs.length).padStart(3)} works  ${k.rows.toLocaleString().padStart(9)} rows`);
});
