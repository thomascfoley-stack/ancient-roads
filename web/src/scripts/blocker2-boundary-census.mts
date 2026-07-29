// BLOCKER-2 boundary census: how far apart are the HARDCODED filter and the DESIGNED
// (status='published' + licensed) boundary, and is a data-driven boundary even feasible?
//
// The constants are IMPORTED from routing.ts, never retyped — retyping a filter from memory is how
// you measure something that isn't the thing the code runs. Every query carries a POSITIVE CONTROL;
// if a control returns zero the query shape is wrong and the result means nothing. Read-only: no
// DDL, no DML, no transactions.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/blocker2-boundary-census.mts

import { neon } from '@neondatabase/serverless';
import { LEGAL_CORPUS_FILTER, PROSE_TYPE_SQL, SERVED_PROSE_WORKS } from '../lib/teacher/routing.ts';

interface Q1Row {
  prose_rows: number;
  has_work_key: number;
  has_author_key: number;
  distinct_works: number;
  distinct_authors: number;
}
interface JoinBySlugRow {
  works_in_pool: number;
  works_matched: number;
  rows_total: number;
  rows_unmatched: number;
}
interface JoinByAuthorRow {
  authors_in_pool: number;
  authors_matched: number;
  rows_total: number;
  rows_unmatched: number;
}
interface WorkCountRow { work: string | null; rows: number }
interface CountRow { rows: number }
interface LegalPoolRow { legal_rows: number; legal_authors: number }
interface CandidatePoolRow { candidate_rows: number; candidate_works: number }
interface AuthorWorkCountRow { author: string | null; work: string | null; rows: number }
interface BookCountRow { rows: number; authors: number }
interface DriftRow { author: string | null; work: string | null; rows: number; status: string }

const sql = neon((process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const query = <T>(q: string) => sql.query(q) as Promise<T[]>;
const ALLOWED = `('Public Domain','CC BY','CC BY-SA')`;
// `sources` also has a source_type column, so in any JOINed query the imported constant must be
// qualified to the embeddings alias. Done by mechanical substitution on the REAL constant, so it
// still cannot drift from what routing.ts ships.
const PROSE_E = PROSE_TYPE_SQL.replace(/\bsource_type\b/g, 'e.source_type');
const LEGAL_E = LEGAL_CORPUS_FILTER.replace(/\bmetadata\b/g, 'e.metadata');
const n = (v: unknown) => Number(v ?? 0);
const pad = (s: string | number, w = 10) => String(s).padStart(w);

console.log('CONSTANTS AS IMPORTED FROM routing.ts (not retyped)');
console.log(`  PROSE_TYPE_SQL      = ${PROSE_TYPE_SQL}`);
console.log(`  SERVED_PROSE_WORKS  = ${SERVED_PROSE_WORKS.length} slugs: ${SERVED_PROSE_WORKS.join(', ')}`);
console.log(`  LEGAL_CORPUS_FILTER = ${LEGAL_CORPUS_FILTER.replace(/\s+/g, ' ')}`);
console.log('');

// ── Q1 ────────────────────────────────────────────────────────────────────────────────────────
console.log('── Q1  DOES A JOIN KEY EXIST? ─────────────────────────────────────────────');
const q1 = await query<Q1Row>(`
  SELECT count(*)::int AS prose_rows,
         count(*) FILTER (WHERE metadata ? 'work')::int   AS has_work_key,
         count(*) FILTER (WHERE metadata ? 'author')::int AS has_author_key,
         count(DISTINCT metadata->>'work')::int           AS distinct_works,
         count(DISTINCT metadata->>'author')::int         AS distinct_authors
  FROM embeddings WHERE user_id IS NULL AND ${PROSE_TYPE_SQL}`);
const r1 = q1[0];
console.log(`  prose_rows       ${pad(r1.prose_rows)}    <- CONTROL: must be ~127k+`);
console.log(`  has_work_key     ${pad(r1.has_work_key)}  (${((100*n(r1.has_work_key))/n(r1.prose_rows)).toFixed(1)}%)`);
console.log(`  has_author_key   ${pad(r1.has_author_key)}  (${((100*n(r1.has_author_key))/n(r1.prose_rows)).toFixed(1)}%)`);
console.log(`  distinct_works   ${pad(r1.distinct_works)}`);
console.log(`  distinct_authors ${pad(r1.distinct_authors)}`);
const controlQ1 = n(r1.prose_rows) > 100000;
console.log(`  CONTROL ${controlQ1 ? 'PASS' : 'FAIL — query shape is wrong; nothing below means anything'}`);

// ── Q2 ────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── Q2  HOW MUCH OF THE POOL MAPS TO A sources ROW? ────────────────────────');
const bySlug = (await query<JoinBySlugRow>(`
  SELECT count(DISTINCT e.metadata->>'work')::int AS works_in_pool,
         count(DISTINCT s.slug)::int              AS works_matched,
         count(*)::int                            AS rows_total,
         count(*) FILTER (WHERE s.slug IS NULL)::int AS rows_unmatched
  FROM embeddings e LEFT JOIN sources s ON s.slug = e.metadata->>'work'
  WHERE e.user_id IS NULL AND ${PROSE_E}`))[0]!;
const byAuthor = (await query<JoinByAuthorRow>(`
  SELECT count(DISTINCT e.metadata->>'author')::int AS authors_in_pool,
         count(DISTINCT s.author)::int              AS authors_matched,
         count(*)::int                              AS rows_total,
         count(*) FILTER (WHERE s.author IS NULL)::int AS rows_unmatched
  FROM embeddings e LEFT JOIN sources s ON s.author = e.metadata->>'author'
  WHERE e.user_id IS NULL AND ${PROSE_E}`))[0]!;
console.log(`  JOIN ON s.slug = metadata->>'work'`);
console.log(`    works_in_pool ${pad(bySlug.works_in_pool)}  works_matched ${pad(bySlug.works_matched)}  rows_total ${pad(bySlug.rows_total)}  rows_unmatched ${pad(bySlug.rows_unmatched)} (${((100*n(bySlug.rows_unmatched))/n(bySlug.rows_total)).toFixed(1)}%)`);
console.log(`  JOIN ON s.author = metadata->>'author'`);
console.log(`    authors_in_pool ${pad(byAuthor.authors_in_pool)} authors_matched ${pad(byAuthor.authors_matched)} rows_total ${pad(byAuthor.rows_total)}  rows_unmatched ${pad(byAuthor.rows_unmatched)} (${((100*n(byAuthor.rows_unmatched))/n(byAuthor.rows_total)).toFixed(1)}%)`);
const slugBetter = n(bySlug.rows_unmatched) <= n(byAuthor.rows_unmatched);
console.log(`  BETTER KEY: ${slugBetter ? "s.slug = metadata->>'work'" : "s.author = metadata->>'author'"}`);

console.log(`  unmatched works (slug join), top 15:`);
const unmatched = await query<WorkCountRow>(`
  SELECT e.metadata->>'work' AS work, count(*)::int AS rows
  FROM embeddings e LEFT JOIN sources s ON s.slug = e.metadata->>'work'
  WHERE e.user_id IS NULL AND ${PROSE_E} AND s.slug IS NULL
  GROUP BY 1 ORDER BY rows DESC LIMIT 15`);
if (!unmatched.length) console.log('    (none)');
for (const u of unmatched) console.log(`    ${pad(u.rows)}  ${u.work ?? '(null work key)'}`);

// ── Q3 ────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── Q3  CURRENT LEGAL POOL (baseline) ──────────────────────────────────────');
const q3 = (await query<LegalPoolRow>(`
  SELECT count(*)::int AS legal_rows, count(DISTINCT metadata->>'author')::int AS legal_authors
  FROM embeddings WHERE user_id IS NULL AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}`))[0]!;
console.log(`  legal_rows    ${pad(q3.legal_rows)}   <- CONTROL: must be ~127k`);
console.log(`  legal_authors ${pad(q3.legal_authors)}   <- CONTROL: must be ~9`);

// ── Q4 ────────────────────────────────────────────────────────────────────────────────────────
const KEY = slugBetter ? `s.slug = e.metadata->>'work'` : `s.author = e.metadata->>'author'`;
console.log(`\n── Q4  CANDIDATE POOL IF THE BOUNDARY WERE THE DATA (key: ${KEY}) ──`);
const q4 = (await query<CandidatePoolRow>(`
  SELECT count(*)::int AS candidate_rows, count(DISTINCT s.slug)::int AS candidate_works
  FROM embeddings e JOIN sources s ON ${KEY}
  WHERE e.user_id IS NULL AND ${PROSE_E}
    AND s.status='published' AND s.license IN ${ALLOWED}`))[0]!;
console.log(`  candidate_rows  ${pad(q4.candidate_rows)}`);
console.log(`  candidate_works ${pad(q4.candidate_works)}`);

// ── Q5 ────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── Q5  THE DELTA, BOTH DIRECTIONS ─────────────────────────────────────────');
const DATA_PRED = `EXISTS (SELECT 1 FROM sources s WHERE ${KEY} AND s.status='published' AND s.license IN ${ALLOWED})`;
const gains = await query<AuthorWorkCountRow>(`
  SELECT e.metadata->>'author' AS author, e.metadata->>'work' AS work, count(*)::int AS rows
  FROM embeddings e
  WHERE e.user_id IS NULL AND ${PROSE_E} AND ${DATA_PRED} AND NOT (${LEGAL_E})
  GROUP BY 1,2 ORDER BY rows DESC LIMIT 20`);
const gainTot = (await query<CountRow>(`
  SELECT count(*)::int AS rows FROM embeddings e
  WHERE e.user_id IS NULL AND ${PROSE_E} AND ${DATA_PRED} AND NOT (${LEGAL_E})`))[0]!;
const losses = await query<AuthorWorkCountRow>(`
  SELECT e.metadata->>'author' AS author, e.metadata->>'work' AS work, count(*)::int AS rows
  FROM embeddings e
  WHERE e.user_id IS NULL AND ${PROSE_E} AND ${LEGAL_E} AND NOT (${DATA_PRED})
  GROUP BY 1,2 ORDER BY rows DESC LIMIT 20`);
const lossTot = (await query<CountRow>(`
  SELECT count(*)::int AS rows FROM embeddings e
  WHERE e.user_id IS NULL AND ${PROSE_E} AND ${LEGAL_E} AND NOT (${DATA_PRED})`))[0]!;
console.log(`  GAINS  (in data-driven, NOT in hardcoded): ${gainTot.rows} rows`);
for (const g of gains) console.log(`    ${pad(g.rows)}  ${g.author ?? '?'} · ${g.work ?? '?'}`);
console.log(`  LOSSES (in hardcoded, NOT in data-driven): ${lossTot.rows} rows`);
for (const l of losses) console.log(`    ${pad(l.rows)}  ${l.author ?? '?'} · ${l.work ?? '?'}`);

// ── Q6 ────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── Q6  DOES SONG OF SOLOMON GAIN? ─────────────────────────────────────────');
const book = async (lo: number, hi: number, pred: string) => {
  const r = (await query<BookCountRow>(`
    SELECT count(*)::int AS rows, count(DISTINCT metadata->>'author')::int AS authors
    FROM embeddings e WHERE e.user_id IS NULL AND ${PROSE_E} AND ${pred}
      AND (metadata->>'verseId')::bigint >= ${lo} AND (metadata->>'verseId')::bigint < ${hi}`))[0]!;
  return `rows=${pad(r.rows,7)} authors=${pad(r.authors,3)}`;
};
for (const [label, lo, hi] of [['SoS (22)',22000000,23000000], ['CONTROL John (43)',43000000,44000000], ['CONTROL Psalms (19)',19000000,20000000]] as const) {
  console.log(`  ${String(label).padEnd(20)} Q3(hardcoded) ${await book(lo,hi,LEGAL_E)}   |   Q4(data) ${await book(lo,hi,DATA_PRED)}`);
}

// ── Q7 ────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── Q7  BOUNDARY DRIFT (a fact, not a risk) ────────────────────────────────');
const drift = await query<DriftRow>(`
  SELECT e.metadata->>'author' AS author, e.metadata->>'work' AS work, count(*)::int AS rows,
         max(COALESCE(s.status,'(no sources row)')) AS status
  FROM embeddings e LEFT JOIN sources s ON ${KEY}
  WHERE e.user_id IS NULL AND ${PROSE_E} AND ${LEGAL_E}
    AND (s.slug IS NULL OR s.status <> 'published')
  GROUP BY 1,2 ORDER BY rows DESC LIMIT 20`);
const driftTot = (await query<CountRow>(`
  SELECT count(*)::int AS rows FROM embeddings e LEFT JOIN sources s ON ${KEY}
  WHERE e.user_id IS NULL AND ${PROSE_E} AND ${LEGAL_E}
    AND (s.slug IS NULL OR s.status <> 'published')`))[0]!;
console.log(`  rows in the legal pool with no sources row, or a non-published one: ${driftTot.rows}`);
for (const d of drift) console.log(`    ${pad(d.rows)}  ${d.author ?? '?'} · ${d.work ?? '?'}  [${d.status}]`);
