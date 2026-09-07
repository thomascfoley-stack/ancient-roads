#!/usr/bin/env node
// Shard the two whole-year devotional exports into one static file per calendar day.
//
// WHY. /home fetched `morning-evening.json` (1.42 MB) and `daily-light.json` (0.82 MB) on every
// load and rendered ONE day-key out of 366 from each — 4,056 bytes of 1,489,403, or 0.27%. That
// is 2.24 MB of fixed cost on the critical path of a screen that shows a date, a paragraph of
// Spurgeon and at most two commentary cards, and it is why /home reads as a hang on a phone and
// as merely slow on a laptop: the block is transfer, not parse (node parses the 9 MB Psalm 119
// commentary in 12 ms).
//
// This is the shape the corpus already uses — `/commentaries/<slug>/<chapter>.json`, one static
// CDN-cacheable file per unit of reading, fetched by key (lib/bible.ts fetchCommentary). The day
// stays a CLIENT-side decision: the calendar day and the AM/PM half key off the reader's LOCAL
// clock, and a server renders in UTC.
//
// THE TWO SOURCES STAY SEPARATE. today-view.tsx degrades them independently — "a missing file or
// a signed-out 401 must never cost the reader the rest of the page" — and one combined file per
// day would couple those two failures into one.
//
// The whole-year files are NOT deleted: they remain the source of truth that the generators
// (ingest-morning-evening.mts, export-daily-light.mjs) write and that this script and
// test/invariants/daily-light-json.test.ts read. This script is a pure derivation of them, and
// test/invariants/home-day-scoped-devotional.test.tsx re-derives it to prove the split is
// lossless — every day present, and each day's value byte-identical to the year file's.
//
//   node scripts/split-devotional-by-day.mjs
//
// Re-run it after either exporter. It is idempotent: same input, same bytes out.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devotional = join(root, 'web', 'public', 'devotional');

const SOURCES = ['morning-evening', 'daily-light'];
let failed = false;

for (const source of SOURCES) {
  const yearPath = join(devotional, `${source}.json`);
  if (!existsSync(yearPath)) {
    console.error(`STOP: ${yearPath} is missing — run its exporter first.`);
    failed = true;
    continue;
  }
  const year = JSON.parse(readFileSync(yearPath, 'utf8'));
  const keys = Object.keys(year);

  // Both modules are a complete calendar. A short year here means the export upstream is broken,
  // and sharding a broken export would spread the damage across 366 files instead of one.
  if (keys.length !== 366) {
    console.error(`STOP: ${source}.json holds ${keys.length} days, expected 366.`);
    failed = true;
    continue;
  }
  if (keys.some((k) => !/^\d{2}-\d{2}$/.test(k))) {
    console.error(`STOP: ${source}.json has a key that is not MM-DD.`);
    failed = true;
    continue;
  }

  // Rebuild from scratch so a day dropped upstream cannot survive as a stale file on disk and
  // keep serving last release's reading.
  const outDir = join(devotional, source);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let bytes = 0;
  for (const key of keys) {
    // JSON.stringify of the day's value verbatim — no re-shaping, no re-ordering, no pretty
    // printing. The invariant test compares this against the year file by exact string.
    const body = JSON.stringify(year[key]);
    writeFileSync(join(outDir, `${key}.json`), body);
    bytes += Buffer.byteLength(body);
  }

  const yearBytes = Buffer.byteLength(readFileSync(yearPath));
  const perDay = Math.round(bytes / keys.length);
  console.log(
    `${source}: ${keys.length} day files, ${perDay} bytes average ` +
      `(was ${yearBytes.toLocaleString()} bytes fetched to render ${perDay} of them — ` +
      `${Math.round(yearBytes / perDay)}x over-fetch, now gone).`,
  );
}

if (failed) process.exit(1);
