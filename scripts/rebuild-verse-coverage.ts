// Rebuild `verse_coverage` from the shipped admission predicates
// (STUDY_PLANS_DESIGN §6). Run after every publish flip; the table is
// derived, never hand-maintained.
//
//   npx tsx scripts/rebuild-verse-coverage.ts [--dry-run]
//
// Admission here is IMPORTED, never re-typed (the failure-mode watchlist is
// at eleven instances of a hand-typed expected set): the exegetical type
// pool from verse-coverage-core (one home, cited to routing.ts), the banned
// authors via isMustNotServeAuthor (web/src/lib/legal-corpus), and the
// forbidden-provenance domains via forbiddenProvenanceDomain
// (src/ingest/forbidden-provenance.mjs). status='published' is the DB truth.
//
// Dev/test only by default; the deliberate prod run (post-flip) sets
// COVERAGE_ALLOW_PROD=1, mirroring db/apply-migration.mjs's guard shape.

import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';
import { isMustNotServeAuthor } from '../web/src/lib/legal-corpus.js';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { EXEGETICAL_SOURCE_TYPES, sweepCoverage, verseUniverse, type CoverageAnchor } from './lib/verse-coverage-core.js';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const url = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  if (!url) throw new Error('DATABASE_URL required (owner connection)');
  if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url) && process.env.COVERAGE_ALLOW_PROD !== '1') {
    throw new Error('REFUSE: DATABASE_URL is not the dev endpoint. For the deliberate post-flip prod run, set COVERAGE_ALLOW_PROD=1.');
  }

  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query<{
      author: string; url: string | null; section_id: string; verse_id_start: number; verse_id_end: number;
    }>(
      `SELECT src.author, src.provenance->>'url' AS url, a.section_id::text, a.verse_id_start, a.verse_id_end
       FROM section_anchors a
       JOIN sections s ON s.id = a.section_id
       JOIN sources src ON src.id = s.source_id
       WHERE src.status = 'published' AND src.source_type = ANY($1)`,
      [[...EXEGETICAL_SOURCE_TYPES]],
    );

    const admitted: CoverageAnchor[] = [];
    let droppedAuthor = 0, droppedProvenance = 0;
    for (const r of rows) {
      if (isMustNotServeAuthor(r.author)) { droppedAuthor++; continue; }
      if (r.url && forbiddenProvenanceDomain(r.url)) { droppedProvenance++; continue; }
      admitted.push({ author: r.author, sectionId: Number(r.section_id), verseIdStart: r.verse_id_start, verseIdEnd: r.verse_id_end });
    }

    const universe = verseUniverse();
    const coverage = sweepCoverage(admitted, universe);
    const twoPlus = coverage.filter((c) => c.authorCount >= 2).length;
    console.log(
      `anchors: ${rows.length} fetched, ${admitted.length} admitted ` +
      `(${droppedAuthor} banned-author, ${droppedProvenance} forbidden-provenance)\n` +
      `coverage: ${coverage.length}/${universe.length} verses covered, ${twoPlus} with >=2 authors`,
    );
    if (dryRun) return;

    await db.query('BEGIN');
    try {
      await db.query('TRUNCATE verse_coverage');
      for (let i = 0; i < coverage.length; i += 2000) {
        const batch = coverage.slice(i, i + 2000);
        const params: unknown[] = [];
        const tuples = batch.map((c, j) => {
          const p = j * 3;
          params.push(c.verseId, c.authorCount, c.sectionCount);
          return `($${p + 1}::int, $${p + 2}::smallint, $${p + 3}::int)`;
        });
        await db.query(`INSERT INTO verse_coverage (verse_id, author_count, section_count) VALUES ${tuples.join(',')}`, params);
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    }
    console.log(`✓ verse_coverage rebuilt: ${coverage.length} rows`);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error('FAILED:', (e as Error).message); process.exit(1); });
