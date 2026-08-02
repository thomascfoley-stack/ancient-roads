#!/usr/bin/env -S npx tsx
/**
 * PUBLISH-FLIP PREFLIGHT CENSUS — dev only, read-only.
 *
 *   PUBLISH_FLIP_DATABASE_URL=<dev url> npx tsx scripts/publish-flip-census.mts \
 *     --target=ep-tiny-hat [--cohort=staged]
 *
 * Answers, for the cohort about to be flipped:
 *   §1 is each source ADMITTED or NOT-ADMITTED by the predicates that actually serve?
 *   §2 what forbidden-provenance exposure exists, and what becomes READER-REACHABLE?
 *   §3 the voice floor, re-measured here — verses with 0 and with exactly 1 served author
 *   §4 published works per register, entry counts per catalog
 *
 * It STOPS (exit non-zero) on a published-but-not-admitted work, or on any serving count
 * that is literally zero. The STOP rules themselves live in scripts/lib/publish-flip-census.mjs
 * so they can be red-proofed without a database; this file only MEASURES.
 *
 * WHY tsx IS FINE HERE and was not fine in the unit_ordinal instrument (Tranche 0.1): this
 * tool has to import LEGAL_CORPUS_FILTER / SERVED_PROSE_WORKS / SERVED_LANE_WORKS from
 * web/src, and importing them is the whole point — a census that re-typed the serving
 * predicates would measure a population the product does not serve. It is a dev-only
 * operator tool that is never on the production instrument's path.
 *
 * PRODUCTION IS REFUSED OUTRIGHT. Not by a declaration the operator can satisfy — this
 * script has no reason to ever touch ep-odd-fog, and the flip it precedes is rehearsed on a
 * fork.
 */
import pg from 'pg';
import { endpointId, hostOf, isProdHost } from './lib/target-guard.mjs';
import {
  admissionFindings,
  forbiddenExposure,
  voiceFloorFindings,
  servingFindings,
  censusVerdict,
} from './lib/publish-flip-census.mjs';
import { LEGAL_CORPUS_FILTER, PROSE_TYPE_SQL, ALL_SERVED_WORKS, SERVED_WORK_LISTS } from '../web/src/lib/teacher/routing';

const args = process.argv.slice(2);
const declared = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const cohort = args.find((a) => a.startsWith('--cohort='))?.split('=')[1] ?? 'staged';

const url = process.env.PUBLISH_FLIP_DATABASE_URL;
if (!url) {
  console.error('PUBLISH_FLIP_DATABASE_URL is unset. This tool is dev-only and read-only.');
  process.exit(2);
}
if (!declared) {
  console.error('--target=<endpoint-id> is required and must name the endpoint exactly.');
  process.exit(2);
}
if (isProdHost(url)) {
  console.error(`REFUSING: ${hostOf(url)} is production. The publish-flip census is rehearsed on dev or a fork, never on ep-odd-fog.`);
  process.exit(2);
}
if (endpointId(hostOf(url)) !== endpointId(declared)) {
  console.error(`STOP: ${hostOf(url)} is not the declared target '${declared}' (exact endpoint id required).`);
  process.exit(2);
}

// The works the product will actually serve, from the SAME constants the router uses — and from
// ALL of them. This read `[...SERVED_PROSE_WORKS, ...SERVED_LANE_WORKS]` until 2026-08-02, which
// omitted SERVED_SONG_VERSE_WORKS and would have called all 15 hymn/poetry works NOT-ADMITTED
// against the filter that serves exactly them (routing.ts SERVED_WORK_LISTS explains the class).
const SERVED_SLUGS = ALL_SERVED_WORKS;

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'publish-flip-census' });
await c.connect();

try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  const ro = (await c.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only;
  if (ro !== 'on') throw new Error('STOP: read-only transaction not in force');

  console.log(`publish-flip census — target ${hostOf(url)} — cohort '${cohort}'\n`);

  // ── §1 admission ───────────────────────────────────────────────────────────
  const sourceRows = (await c.query<{ slug: string; status: string; register: string | null }>(
    `SELECT slug, status, source_type AS register FROM sources WHERE status IN ($1, 'published') ORDER BY source_type, slug`,
    [cohort],
  )).rows;
  const admission = admissionFindings(
    sourceRows.map((s) => ({ ...s, admitted: SERVED_SLUGS.includes(s.slug) })),
  );
  // Name the lists that decided admission, and their sizes. A reader must be able to see from the
  // log alone whether the population was the whole served corpus or a subset of it — the omission
  // this line exists to expose left no trace at all when it was live.
  const consulted = Object.entries(SERVED_WORK_LISTS).map(([k, v]) => `${k}=${v.length}`).join(' ');
  console.log(`§1 ADMISSION (${admission.length} source(s)) — admitted against ${SERVED_SLUGS.length} served work(s): ${consulted}`);
  for (const a of admission) {
    console.log(`  ${a.verdict === 'STOP' ? '✗' : ' '} ${a.slug.padEnd(30)} ${a.status.padEnd(10)} ${a.admitted ? 'ADMITTED    ' : 'NOT-ADMITTED'}  ${a.note}`);
  }

  // ── §2 forbidden provenance ────────────────────────────────────────────────
  const forbiddenRows = (await c.query<{ slug: string; count: string; status: string }>(
    `SELECT src.slug, src.status, count(*)::text AS count
       FROM sections sec JOIN sources src ON src.id = sec.source_id
      WHERE src.status IN ($1, 'published')
        AND (sec.source_url ILIKE '%biblehub.com%' OR sec.source_url ILIKE '%studylight.org%'
             OR sec.source_url ILIKE '%historicalchristian.faith%')
      GROUP BY src.slug, src.status ORDER BY 1`,
    [cohort],
  )).rows;
  const forbidden = forbiddenExposure(
    forbiddenRows.map((r) => ({
      slug: r.slug,
      count: Number(r.count),
      // "Reachable once published" = it is in the cohort about to be flipped, or already published.
      willBePublished: r.status === cohort || r.status === 'published',
    })),
  );
  console.log(`\n§2 FORBIDDEN PROVENANCE — ${forbidden.totalRows} row(s) across ${forbidden.works.length} work(s); ${forbidden.reachableRows} row(s) in ${forbidden.reachableWorks.length} work(s) become reachable at the flip`);
  for (const w of forbidden.works) console.log(`  ${w.willBePublished ? 'REACHABLE' : 'held    '} ${w.slug.padEnd(30)} ${w.count}`);
  console.log(`  ${forbidden.note}`);

  // ── §3 voice floor, re-measured here ───────────────────────────────────────
  const vf = (await c.query<{ zero: number; one: number; measured: number }>(
    `SELECT count(*) FILTER (WHERE voices = 0)::int AS zero,
            count(*) FILTER (WHERE voices = 1)::int AS one,
            count(*)::int AS measured
       FROM (SELECT (metadata->>'verseId')::int AS vid,
                    count(DISTINCT metadata->>'author') AS voices
               FROM embeddings
              WHERE user_id IS NULL AND metadata->>'verseId' ~ '^[0-9]+$'
                AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}
              GROUP BY 1) t`,
  )).rows[0]!;
  const voices = voiceFloorFindings({ versesWithZero: vf.zero, versesWithOne: vf.one, versesMeasured: vf.measured });
  console.log(`\n§3 VOICE FLOOR — ${voices.note}`);

  // ── §4 what actually serves ────────────────────────────────────────────────
  const byRegister = (await c.query<{ register: string; n: number }>(
    `SELECT coalesce(source_type, '(none)') AS register, count(*)::int AS n
       FROM sources WHERE status = 'published' GROUP BY 1 ORDER BY 1`,
  )).rows;
  const byCatalog: Record<string, number> = {
    sections: (await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sections sec JOIN sources src ON src.id = sec.source_id WHERE src.status = 'published'`,
    )).rows[0]!.n,
    commentary_entries: (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM commentary_entries`)).rows[0]!.n,
    embeddings_served: (await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}`,
    )).rows[0]!.n,
  };
  const serving = servingFindings({
    worksByRegister: Object.fromEntries(byRegister.map((r) => [r.register, r.n])),
    entriesByCatalog: byCatalog,
  });
  console.log(`\n§4 SERVING — ${serving.note}`);
  for (const [r, n] of Object.entries(serving.worksByRegister)) console.log(`  register ${r.padEnd(20)} ${n} published work(s)`);
  for (const [k, n] of Object.entries(serving.entriesByCatalog)) console.log(`  catalog  ${k.padEnd(20)} ${n} entry/entries`);

  // ── verdict ────────────────────────────────────────────────────────────────
  const verdict = censusVerdict({ admission, forbidden, voices, serving });
  console.log('\n=== VERDICT ===');
  for (const w of verdict.warnings) console.log(`  WARN  ${w}`);
  if (verdict.stop) {
    for (const s of verdict.stops) console.error(`  STOP  ${s}`);
    console.error('\n✗ CENSUS STOPS THE FLIP.');
  } else {
    console.log('  ✓ no STOP condition found. This is a census, not an authorisation.');
  }
  process.exitCode = verdict.exitCode;
} finally {
  await c.query('ROLLBACK').catch(() => {});
  await c.end();
}
