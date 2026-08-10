#!/usr/bin/env tsx
/**
 * CANON-COVERAGE CENSUS (cutover order P0.4) — what admitting a corpus is FOR.
 *
 *   DATABASE_URL=<url> npx tsx scripts/coverage-census.mts --target=<endpoint-id>
 *   ... --write-baseline=<file.json>     snapshot the census
 *   ... --baseline=<file.json>           diff against a prior snapshot; exits 1
 *                                      if the floor breaks (a chapter that had
 *                                      ≥2-author coverage lost any of it)
 *
 * Per Bible book/chapter: real verses, verses with ANY served exegetical voice,
 * verses with ≥2 DISTINCT served exegetical authors. Exegetical = commentary +
 * father (EXEGETICAL_SOURCE_TYPES — the same pair idx_embeddings_served_legal
 * predicates on). READ-ONLY. Runnable against dev and prod; prod requires
 * COVERAGE_ALLOW_PROD=1 under the owner's go (bylaw 7).
 */
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { endpointId, hostOf, isProdHost } from './lib/target-guard.mjs';
import { EXEGETICAL_SOURCE_TYPES } from './lib/verse-coverage-core.js';
import { RAW_VERSE_COUNTS } from '../web/src/bible/verse-counts.js';
import { buildCensus, diffCensus, type ChapterStat } from './lib/coverage-census-core.mjs';

const args = process.argv.slice(2);
const val = (f: string) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const declared = val('--target');
const baselineFile = val('--baseline');
const writeBaseline = val('--write-baseline');

const url = process.env.DATABASE_URL;
if (!url) { console.error('set DATABASE_URL'); process.exit(2); }
if (!declared) { console.error('--target=<endpoint-id> is required and must name the endpoint exactly.'); process.exit(2); }
if (endpointId(hostOf(url)) !== endpointId(declared)) {
  console.error(`STOP: ${hostOf(url)} is not the declared target '${declared}' (exact endpoint id required).`);
  process.exit(2);
}
if (isProdHost(url) && process.env.COVERAGE_ALLOW_PROD !== '1') {
  console.error(`STOP: ${hostOf(url)} is production. Re-run with COVERAGE_ALLOW_PROD=1 under the owner's go (bylaw 7).`);
  process.exit(2);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'coverage-census' });
await c.connect();
try {
  // One grouped pass over the served exegetical pool — ≤31k rows out, not one
  // row per embedding. Verse-less rows (metadata->>'verseId' IS NULL) cannot
  // claim chapter coverage and are counted apart so the number is visible.
  const rows = (await c.query<{ verse_id: number; authors: number }>(
    `SELECT (metadata->>'verseId')::int AS verse_id,
            count(DISTINCT metadata->>'author')::int AS authors
       FROM embeddings
      WHERE user_id IS NULL AND served
        AND source_type = ANY($1)
        AND metadata->>'verseId' IS NOT NULL
      GROUP BY 1`,
    [EXEGETICAL_SOURCE_TYPES],
  )).rows;
  const unkeyed = (await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embeddings
      WHERE user_id IS NULL AND served
        AND source_type = ANY($1)
        AND metadata->>'verseId' IS NULL`,
    [EXEGETICAL_SOURCE_TYPES],
  )).rows[0]!.n;

  const census = buildCensus(rows.map((r) => ({ verseId: r.verse_id, authors: r.authors })), RAW_VERSE_COUNTS);
  const totals = census.reduce(
    (t, ch) => ({
      verses: t.verses + ch.verses,
      withVoice: t.withVoice + ch.withVoice,
      with2Plus: t.with2Plus + ch.with2Plus,
    }),
    { verses: 0, withVoice: 0, with2Plus: 0 },
  );

  console.log(`coverage-census — target ${hostOf(url)} (read-only)`);
  console.log(`  exegetical pool: source_type IN (${EXEGETICAL_SOURCE_TYPES.join(', ')}) AND served`);
  console.log(`  canon verses:            ${totals.verses}`);
  console.log(`  with any voice:          ${totals.withVoice} (${(100 * totals.withVoice / totals.verses).toFixed(1)}%)`);
  console.log(`  with ≥2 distinct authors:${totals.with2Plus} (${(100 * totals.with2Plus / totals.verses).toFixed(1)}%)`);
  console.log(`  served exegetical rows with NO verse key (not counted above): ${unkeyed}`);

  if (writeBaseline) {
    writeFileSync(writeBaseline, JSON.stringify({ host: hostOf(url), at: new Date().toISOString(), census }, null, 2));
    console.log(`  baseline written: ${writeBaseline} (${census.length} chapters)`);
  }

  if (baselineFile) {
    const before = JSON.parse(readFileSync(baselineFile, 'utf8')) as { host?: string; census: ChapterStat[] };
    const d = diffCensus(before.census, census);
    console.log(`\n  diff vs ${baselineFile} (${before.host ?? '?'}):`);
    console.log(`    chapters newly at ≥2 authors: ${d.chaptersGained2Plus}`);
    console.log(`    verses gained at ≥2 authors:  ${d.versesGained2Plus}`);
    console.log(`    verses gained any voice:      ${d.versesGainedVoice}`);
    if (d.floorBreaks.length > 0) {
      console.error(`\n\x1b[31m  FLOOR BREAK — ${d.floorBreaks.length} chapter(s) LOST ≥2-author coverage:\x1b[0m`);
      for (const f of d.floorBreaks) {
        console.error(`    book ${f.book} ch ${f.chapter}: ${f.before} -> ${f.after}`);
      }
      process.exit(1);
    }
    console.log('  \x1b[32mfloor held: no chapter with ≥2-author coverage lost any.\x1b[0m');
  }
} finally {
  await c.end();
}
