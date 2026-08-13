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
  NOT_MEASURED,
} from './lib/publish-flip-census.mjs';
import {
  LEGAL_CORPUS_FILTER,
  PROSE_TYPE_SQL,
  ALL_SERVED_WORKS,
  SERVED_WORK_LISTS,
  SONG_VERSE_CORPUS_FILTER,
  SERMON_CORPUS_FILTER,
  THEOLOGY_CORPUS_FILTER,
} from '../web/src/lib/teacher/routing';
import { isMustNotServeAuthor } from '../web/src/lib/legal-corpus';

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
  const sourceRows = (await c.query<{ slug: string; status: string; register: string | null; author: string }>(
    `SELECT slug, status, source_type AS register, author FROM sources WHERE status IN ($1, 'published') ORDER BY source_type, slug`,
    [cohort],
  )).rows;
  // ADMISSION IS MEASURED, NOT MODELLED (2026-08-02).
  //
  // This was `SERVED_SLUGS.includes(s.slug)` — admission by list membership. It produced FALSE
  // STOPS on four published, genuinely-served works, because `LEGAL_CORPUS_FILTER` admits
  // `john-gill`, `jfb`, `adam-clarke` and `matthew-henry` by AUTHOR NAME, not by work slug. The
  // A3 rule would have halted the flip over works A7 watched answer live in /ask. That is the
  // TWELFTH instance of the watchlist's first artefact and the exact mirror of the eleventh:
  // A8/B2 made admission cover every slug LIST and left the author clauses unmodelled.
  //
  // Importing `PUBLISHED_WHOLE_BIBLE_AUTHORS` would have been the thirteenth: it is a SECOND
  // hand-typed author list that merely has to agree with the filter. So nothing is re-typed and
  // nothing is modelled. The shipped predicates are run against the real rows, and a work is
  // lane-admitted if they return anything attributable to it.
  //
  // AND ADMISSION NOW HAS TWO SURFACES, WHICH IS THE JOSEPHUS RULING'S WHOLE PROBLEM. The A3
  // rule ("published but served by nothing is a STOP") was written when /ask was the only
  // consumer; its stated harm is a reader linking to a work retrieval cannot return. The app has
  // since grown a SHELF (catalog + Book Reader) which serves published works directly, without
  // retrieval. `josephus-whiston` has 4,112 sections, 439 verse anchors and ZERO flat rows: it is
  // unreachable by every lane and perfectly readable on the shelf, which is exactly what the
  // owner ruling ordered. Under list-admission the rule STOPped the thing the ruling required,
  // and no re-reading of either resolved it, because the rule had one category where the product
  // has two. A work with sections is shelf-reachable once published; that is a serving surface,
  // so it is admission.
  const LANE_FILTERS = [
    LEGAL_CORPUS_FILTER,
    SONG_VERSE_CORPUS_FILTER,
    SERMON_CORPUS_FILTER,
    THEOLOGY_CORPUS_FILTER,
  ].map((f) => `(${f})`).join(' OR ');
  const measured = (await c.query<{ slug: string; lane: boolean; shelf: boolean }>(
    `SELECT s.slug,
            EXISTS (SELECT 1 FROM embeddings e
                     WHERE e.user_id IS NULL
                       AND (e.metadata->>'work' = s.slug OR e.metadata->>'author' = s.author)
                       AND (${LANE_FILTERS})) AS lane,
            EXISTS (SELECT 1 FROM sections sec WHERE sec.source_id = s.id) AS shelf
       FROM sources s WHERE s.status IN ($1, 'published')`,
    [cohort],
  )).rows;
  const bySlug = new Map(measured.map((m) => [m.slug, m]));
  const admission = admissionFindings(
    sourceRows.map((s) => {
      const m = bySlug.get(s.slug);
      const lane = m?.lane === true;
      const shelf = m?.shelf === true;
      // `banned` uses the SHIPPED predicate, not a copy of the list: isMustNotServeAuthor also
      // normalises ("Origen of Alexandria" ~ 'Origen'), which a membership test here would lose.
      return { ...s, banned: isMustNotServeAuthor(s.author ?? ''), admitted: lane || shelf, surface: lane && shelf ? 'lane+shelf' : lane ? 'lane' : shelf ? 'shelf' : 'none' };
    }),
  );
  // Name the lists that decided admission, and their sizes. A reader must be able to see from the
  // log alone whether the population was the whole served corpus or a subset of it — the omission
  // this line exists to expose left no trace at all when it was live.
  const consulted = Object.entries(SERVED_WORK_LISTS).map(([k, v]) => `${k}=${v.length}`).join(' ');
  console.log(`§1 ADMISSION (${admission.length} source(s)) — admitted against ${SERVED_SLUGS.length} served work(s): ${consulted}`);
  for (const a of admission) {
    console.log(`  ${a.verdict === 'STOP' ? '✗' : ' '} ${a.slug.padEnd(30)} ${a.status.padEnd(10)} ${a.admitted ? (a.surface === "shelf" ? "SHELF-ONLY  " : "ADMITTED    ") : "NOT-ADMITTED"}  ${a.note}`);
  }

  // ── §2 forbidden provenance ────────────────────────────────────────────────
  // `sections.source_url` is migration 031, and it is NOT on every database this tool can be
  // pointed at: it exists on production and not on dev (measured 2026-08-02). This tool refuses
  // production outright, by design — so the unguarded query below crashed the census on the only
  // target it accepts, and §2, §3 and §4 had therefore NEVER RUN. A tool that cannot complete
  // anywhere is not a preflight.
  //
  // The absence is reported as NOT MEASURED, never as clean. Nothing here silently downgrades a
  // provenance question to a pass: an unmeasured §2 is exactly the "unearned green" this repo
  // keeps cataloguing, and the run log has to say which one it was.
  const hasSourceUrl = (await c.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.columns
      WHERE table_name = 'sections' AND column_name = 'source_url'`,
  )).rows[0]!.n !== '0';
  if (!hasSourceUrl) {
    console.log(
      '\n§2 FORBIDDEN PROVENANCE — NOT MEASURED on this target: sections.source_url is absent ' +
        '(migration 031 is not applied here). This is NOT a clean result; the row-level ' +
        'provenance question is unanswered and must be answered where the column exists.',
    );
  }
  const forbiddenRows = !hasSourceUrl ? [] : (await c.query<{ slug: string; count: string; status: string }>(
    `SELECT src.slug, src.status, count(*)::text AS count
       FROM sections sec JOIN sources src ON src.id = sec.source_id
      WHERE src.status IN ($1, 'published')
        AND (sec.source_url ILIKE '%biblehub.com%' OR sec.source_url ILIKE '%studylight.org%'
             OR sec.source_url ILIKE '%historicalchristian.faith%')
      GROUP BY src.slug, src.status ORDER BY 1`,
    [cohort],
  )).rows;
  // NOT_MEASURED, never an OK computed from an empty row set. The first version of this guard
  // printed the NOT MEASURED banner above and then fell through to `forbiddenExposure([])`, which
  // reported "0 row(s) ... 0 become reachable" and returned OK — so an unrun §2 contributed a
  // clean leg to the final verdict and read, to anyone scanning the log, as a measured pass. That
  // is the same fail-open `NOT_MEASURED` was introduced to close for §2/§3/§4 in the 2026-08-02
  // audit, reintroduced one line below a comment warning about it.
  const forbidden = !hasSourceUrl ? NOT_MEASURED : forbiddenExposure(
    forbiddenRows.map((r) => ({
      slug: r.slug,
      count: Number(r.count),
      // "Reachable once published" = it is in the cohort about to be flipped, or already published.
      willBePublished: r.status === cohort || r.status === 'published',
    })),
  );
  if (forbidden !== NOT_MEASURED) {
    console.log(`\n§2 FORBIDDEN PROVENANCE — ${forbidden.totalRows} row(s) across ${forbidden.works.length} work(s); ${forbidden.reachableRows} row(s) in ${forbidden.reachableWorks.length} work(s) become reachable at the flip`);
    for (const w of forbidden.works) console.log(`  ${w.willBePublished ? 'REACHABLE' : 'held    '} ${w.slug.padEnd(30)} ${w.count}`);
    console.log(`  ${forbidden.note}`);
  }

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
  // `censusVerdict` has tracked notMeasured since the 2026-08-02 audit and this file never
  // printed it. So a run with §2 unmeasured ended on a bare "no STOP condition found", which is
  // the exact sentence a four-clean-legs run ends on — the distinction the mechanism exists to
  // draw, drawn in the return value and thrown away at the console. A leg that did not run is
  // named here, every time, before the verdict.
  for (const n of verdict.notMeasured) console.log(`  NOT MEASURED  ${n} — unanswered, not clean`);
  if (verdict.stop) {
    for (const s of verdict.stops) console.error(`  STOP  ${s}`);
    console.error('\n✗ CENSUS STOPS THE FLIP.');
  } else if (verdict.notMeasured.length > 0) {
    console.log(`  ✓ no STOP among the legs that RAN. ${verdict.notMeasured.length} leg(s) were not measured (above); this is not a clean census.`);
  } else {
    console.log('  ✓ no STOP condition found. This is a census, not an authorisation.');
  }
  process.exitCode = verdict.exitCode;
} finally {
  await c.query('ROLLBACK').catch(() => {});
  await c.end();
}
