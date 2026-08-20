// CORPUS x SURFACE MATRIX — does every work reach every surface it should, and no surface it should not?
//
// One instrument for one job (docs/pm/orders/2026-08-20-corpus-surface-reconciliation.md). It exists
// because nothing in this repo asked that question per work x per surface: the serving lists, the
// admission predicate and the register wall each answer a PIECE, and both defects found on
// 2026-08-18/19 lived in the gaps between the pieces —
//   * gill-song: legal, served, verse-anchored, NAMED in the admission predicate, and Song of Songs
//     was still the one book of 66 with zero passage-search entries.
//   * hort-james1909: a Greek critical commentary declared source_type 'poetry', taking 44 of 75
//     top-3 slots in the /ask hymns lane.
//
// READ-ONLY. It measures; it never writes. Fixing while auditing loses the map.
//
// FOUR RULES, each earned by a specific failure:
//  1. IMPORT the shipped predicates; never retype them. A retyped predicate validates a lookalike,
//     and an expectation DERIVED FROM the artifact under test is the 14th watchlist instance.
//  2. NAME THE ARTIFACT for every column read (quality-slice step 0). `commentary_entries.book` is a
//     smallint book number; `verse_start` is a verse WITHIN a chapter (max 176). On 2026-08-19 a
//     book-22 query used `verse_start/1000000`, returned 0 for ALL 66 books, and agreed with the
//     right answer by coincidence.
//  3. DERIVE the surface list from code (SERVED_WORK_LISTS), so a fifth lane grows a column without
//     anyone editing this file.
//  4. `NOT MEASURED` is distinct from `absent`. An instrument's silence is not a property of the
//     world (6th watchlist shape).
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import {
  SERVED_WORK_LISTS, PROSE_TYPE_SQL, SONG_VERSE_TYPE_SQL, EXEGETICAL_TYPE_SQL,
  SERMON_CORPUS_FILTER, THEOLOGY_CORPUS_FILTER, HISTORIAN_CORPUS_FILTER,
} from '../web/src/lib/teacher/routing';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE, PUBLISHED_WHOLE_BIBLE_AUTHORS } from '../web/src/lib/legal-corpus';

export type Cell = { slug: string; code: string; detail: string };
export type Matrix = { works: number; byCode: Record<string, number>; findings: Cell[]; emptyBooks: string };

const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
const endpoint = process.env.MATRIX_TARGET_ENDPOINT;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }
if (!endpoint) { console.error('STOP: declare MATRIX_TARGET_ENDPOINT=<exact endpoint id>'); process.exit(2); }
if (!new URL(url).hostname.split('.')[0].includes(endpoint)) {
  console.error(`STOP: connection does not resolve to declared endpoint ${endpoint}`); process.exit(2);
}

// Lane membership is a TYPE question, per the shipped filters: each /ask lane selects on
// `served` plus a source_type predicate. No lane carries a work allowlist at query time — which is
// exactly why one wrong `source_type` in the manifest put a commentary in the hymns lane.
const LANES = {
  exegetical: `served AND user_id IS NULL AND ${EXEGETICAL_TYPE_SQL}`,
  songVerse:  `served AND user_id IS NULL AND ${SONG_VERSE_TYPE_SQL}`,
  sermon:     `user_id IS NULL AND ${SERMON_CORPUS_FILTER}`,
  theology:   `user_id IS NULL AND ${THEOLOGY_CORPUS_FILTER}`,
  historian:  `user_id IS NULL AND ${HISTORIAN_CORPUS_FILTER}`,
} as const;
type Lane = keyof typeof LANES;

// A work's DECLARED register is `sources.source_type`, and nothing else.
//
// CORRECTION, 2026-08-20, first prod run. This originally treated the SERVED_*_WORKS lists in
// routing.ts as the declaration, and flagged every work absent from them — 294 of 296 findings,
// including `adam-clarke` serving the exegetical lane as a commentary, which is simply correct.
// Those lists were SUPERSEDED by migration 044: lane membership is now `served` + `source_type`
// with no work allowlist in the lane SQL at all (routing.ts:374/407). Absence from a vestigial
// list is not a defect, and an instrument that reports 294 of them buries the two that are real.
// The lists still matter for the commentary_entries surfaces, which is where they are read below.
const declaredLane = new Map<string, Lane>();
for (const [k, works] of Object.entries(SERVED_WORK_LISTS)) {
  const lane: Lane = k === 'prose' ? 'exegetical' : (k as Lane);
  for (const w of works) declaredLane.set(w, lane);
}

/** Registers whose lane is "sung and poetic responses" — where prose does not belong. */
const VERSE_TYPES = new Set(['hymn', 'poetry']);
/** Title words that mean prose exposition, not verse. Deliberately narrow; it only nominates. */
const PROSE_TITLE = /(commentary|exposition|notes on|lectures|greek text|critical|homil)/i;

/**
 * The whole detection, as ONE function both the CLI and the red-proof call. Factoring this out is
 * not tidiness: a red-proof that re-implements the detection proves the re-implementation works.
 * The seed harness drives exactly these queries, inside a transaction it rolls back.
 */
export async function detect(c: pg.Client): Promise<Matrix> {
  const rows = async (sql: string): Promise<Record<string, unknown>[]> => (await c.query(sql)).rows;
  const one = async (sql: string) => (await rows(sql))[0]!;

  // ── surface: /ask lanes. Actual membership, measured per work. ──────────────────────────────
  const laneRows: Record<Lane, Map<string, number>> = {
    exegetical: new Map(), songVerse: new Map(), sermon: new Map(), theology: new Map(), historian: new Map(),
  };
  const laneRowType: Record<Lane, Map<string, string>> = {
    exegetical: new Map(), songVerse: new Map(), sermon: new Map(), theology: new Map(), historian: new Map(),
  };
  for (const [lane, pred] of Object.entries(LANES) as [Lane, string][]) {
    for (const r of await rows(
      `SELECT metadata->>'work' AS work, count(*)::int AS n, max(source_type) AS row_type
         FROM embeddings WHERE ${pred} AND metadata->>'work' IS NOT NULL GROUP BY 1`)) {
      laneRows[lane].set(String(r.work), Number(r.n));
      laneRowType[lane].set(String(r.work), String(r.row_type));
    }
  }

  // ── surface: passage search. Admitted rows only, via the SHIPPED predicate. ─────────────────
  // commentary_entries has no `work` column populated (0 of 371,406), so admission is by AUTHOR
  // here — which is itself one of the findings, not a workaround.
  const admittedByAuthor = new Map<string, number>();
  for (const r of await rows(
    `SELECT author, count(*)::int AS n FROM commentary_entries
      WHERE ${LEGAL_COMMENTARY_ENTRIES_PREDICATE} GROUP BY 1`)) {
    admittedByAuthor.set(String(r.author), Number(r.n));
  }

  // ── the corpus population: every published source, with its declared type and its author ────
  // ONE pass over embeddings, aggregated by work, then joined — not four correlated subqueries per
  // source. The first version did the latter and took >10 minutes on dev: 800+ sources x a scan of
  // 1.1M rows each. An instrument nobody will wait for is an instrument nobody runs.
  const works = await rows(
    `WITH agg AS (
       SELECT metadata->>'work' AS work,
              count(*)::int AS emb,
              count(*) FILTER (WHERE served)::int AS served,
              max(metadata->>'author') AS author
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' IS NOT NULL GROUP BY 1)
     SELECT src.slug, src.title, src.source_type, src.status, src.license,
            coalesce(agg.emb, 0) AS emb, coalesce(agg.served, 0) AS served, agg.author
       FROM sources src LEFT JOIN agg ON agg.work = src.slug
      WHERE src.status = 'published' ORDER BY src.slug`);

  const findings: Cell[] = [];

  for (const w of works) {
    const slug = String(w.slug);
    const served = Number(w.served);
    const declared = declaredLane.get(slug);
    const actual = (Object.keys(LANES) as Lane[]).filter((l) => (laneRows[l].get(slug) ?? 0) > 0);

    // MISPLACED-REGISTER: the row-level register disagrees with the work's declared one. This is
    // mechanical and exact — a work whose `sources.source_type` says commentary while its embedding
    // rows say poetry is served by the wrong lane, because the lane SQL selects on the ROW's type.
    for (const lane of actual) {
      const rowType = laneRowType[lane].get(slug);
      if (rowType && rowType !== String(w.source_type)) {
        findings.push({ slug, code: 'MISPLACED-REGISTER',
          detail: `sources.source_type=${w.source_type} but ${laneRows[lane].get(slug)} embedding row(s) carry source_type=${rowType}, serving the ${lane} lane` });
      }
    }

    // SUSPECT-REGISTER: declared and row-level registers AGREE, and the declaration itself looks
    // wrong. This is the hort-james1909 shape and the reason a purely mechanical check would have
    // missed it: its source row said `poetry`, its embedding rows said `poetry`, everything was
    // internally consistent, and it was a Greek critical commentary on James winning the hymns
    // lane. Heuristic BY DESIGN — it flags for a human read (P2), it never auto-resolves.
    if (served > 0 && VERSE_TYPES.has(String(w.source_type)) && PROSE_TITLE.test(String(w.title))) {
      findings.push({ slug, code: 'SUSPECT-REGISTER',
        detail: `declared ${w.source_type} and serving the verse lane, but titled "${String(w.title).slice(0, 70)}"` });
    }

    // MISSING-MATERIALIZATION: an exegetical work whose author the passage-search predicate
    // admits, that nonetheless contributes no admitted rows. The gill-song shape.
    const author = w.author == null ? null : String(w.author);
    if (served > 0 && declared === 'exegetical' && author && (PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)
        && !admittedByAuthor.has(author)) {
      findings.push({ slug, code: 'MISSING-MATERIALIZATION',
        detail: `author "${author}" is admitted by the predicate but contributes 0 admitted commentary_entries rows` });
    }
  }

  // ── B4: is any disjunct of the admission predicate STRUCTURALLY DEAD? ───────────────────────
  // A clause is DEAD when it is PRESENT and matches nothing — not merely when the column it would
  // read is empty. The first version keyed on the column alone and kept firing after the clause was
  // deleted, reporting a disjunct that "names 0 slugs". A finding that survives its own remedy
  // trains people to ignore the report.
  const workClauseMatch = LEGAL_COMMENTARY_ENTRIES_PREDICATE.match(/work IN \(([^)]*)\)/);
  if (workClauseMatch) {
    const rowsWithWork = await one(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE work IS NOT NULL)::int AS with_work FROM commentary_entries`);
    if (Number(rowsWithWork.with_work) === 0) {
      findings.push({ slug: '(predicate)', code: 'DEAD-CLAUSE',
        detail: `work-slug disjunct names ${workClauseMatch[1]!.split(',').length} slugs; work IS NOT NULL is 0 of ${rowsWithWork.n} rows, so it matches nothing` });
    }
  }

  // ── B3: every book of 66 reachable in passage search ────────────────────────────────────────
  const emptyBooks = await one(
    `SELECT coalesce(string_agg(b::text, ', '), 'NONE') AS m FROM generate_series(1,66) b
      WHERE NOT EXISTS (SELECT 1 FROM commentary_entries WHERE book = b AND ${LEGAL_COMMENTARY_ENTRIES_PREDICATE})`);
  if (emptyBooks.m !== 'NONE') {
    findings.push({ slug: '(passage search)', code: 'MISSING-ADMISSION', detail: `books with zero admitted entries: ${emptyBooks.m}` });
  }

  const byCode: Record<string, number> = {};
  for (const f of findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;

  return { works: works.length, byCode, findings, emptyBooks: String(emptyBooks.m) };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
if (process.env.MATRIX_AS_MODULE !== '1') {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('SET default_transaction_read_only = on');
    await c.query("SET statement_timeout = '600s'");
    const m = await detect(c);
    console.log(`  published works measured: ${m.works}`);
    console.log(`  lanes derived from SERVED_WORK_LISTS: ${Object.keys(LANES).join(', ')}`);
    console.log(`  books of 66 with zero admitted entries: ${m.emptyBooks}`);
    console.log(`  FINDINGS: ${m.findings.length} ${JSON.stringify(m.byCode)}`);
    for (const f of m.findings) console.log(`    [${f.code}] ${f.slug} — ${f.detail}`);
    const out = process.env.MATRIX_OUT;
    if (out) { writeFileSync(out, JSON.stringify(m, null, 2)); console.log(`  matrix written to ${out}`); }
    if (m.findings.length > 0) process.exitCode = 1;
  } finally { await c.end(); }
}
