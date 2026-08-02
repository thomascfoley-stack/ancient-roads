// Held-out launch-gate eval harness (READ-ONLY). Runs a query set through the
// SHARED production routing path (lib/teacher/routing.ts) on the LEGAL corpus and
// reports per-category HIT@1 / HIT@2 (≥2 distinct-author voices) + failure codes
// (pass / <2-voices / wrong-passage / no-content) vs the pre-registered bars.
// docs/HELDOUT_EVAL_DESIGN.md.  Default set = PILOT (plumbing); --frozen = the 120.
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts [--frozen]

import { neon } from '@neondatabase/serverless';
import { parseRef } from '../bible/ref-parse';
import { resolveIntent } from '../bible/pericopes';
import { CANDIDATE_POOL, RERANK_MODEL, RERANK_DOC_CHARS, injectionSql, mergeById, floorOnRange, selectDiverse, PASSAGE_CAP, legalBasePool, HNSW_EF_SEARCH, LEGAL_CORPUS_FILTER, chapterKeysOf, diversityBackfillSql, insertBackfill, BACKFILL_TOP_CHAPTERS } from '../lib/teacher/routing';
import { PILOT, FROZEN, type Q, type Cat } from './heldout-queries.mjs';
import { FROZEN_V3 } from './heldout-v3-queries.mjs';
import { FROZEN_V4 } from './heldout-v4-queries.mjs';

// The ONE resolver for which query set every entry point runs on. Previously main(),
// validate(), diagnose() and availability() each re-derived this and three of them
// hardcoded FROZEN — so `--v3 --availability` (etc.) silently reported on v2. A diagnostic
// that reports on the wrong set is worse than none. All four now call this.
//   --v4 → FROZEN_V4 · --v3 → FROZEN_V3 · --frozen → FROZEN · (default) → PILOT
function activeSet(): { name: string; set: Q[] } {
  if (process.argv.includes('--v4')) return { name: 'FROZEN_V4', set: FROZEN_V4 };
  if (process.argv.includes('--v3')) return { name: 'FROZEN_V3', set: FROZEN_V3 };
  if (process.argv.includes('--frozen')) return { name: 'FROZEN', set: FROZEN };
  return { name: 'PILOT', set: PILOT };
}

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = 6; // = production retrieveCommentary default `limit`
const argVal = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
// Measurement knobs (read-only; do NOT ship). --pool N overrides CANDIDATE_POOL;
// --cats a,b filters categories to speed variance runs.
const POOL = Number(argVal('--pool') ?? CANDIDATE_POOL);
const EF = Number(argVal('--ef') ?? HNSW_EF_SEARCH); // hnsw.ef_search sweep knob (§4 2026-07-14)
const CAT_FILTER = argVal('--cats')?.split(',');
const CAP = Number(argVal('--cap') ?? PASSAGE_CAP); // per-passage cap sweep knob
const NO_RERANK = process.argv.includes('--no-rerank'); // §2 diagnosis: keep pure vector order
// Sermon-lane diagnosis (2026-07-18): read-only pool-exclusion knobs. Measure the
// exegetical pool with certain source_types/works removed, through the SHIPPED
// legalBasePool path. --exclude-types sermon · --exclude-works spurgeon-sermons.
const EXCLUDE_TYPES = argVal('--exclude-types')?.split(',');
const EXCLUDE_WORKS = argVal('--exclude-works')?.split(',');
const EXCLUDE_FILTER = [
  EXCLUDE_TYPES ? `source_type NOT IN (${EXCLUDE_TYPES.map((t) => `'${t}'`).join(',')})` : '',
  EXCLUDE_WORKS ? `(metadata->>'work' IS NULL OR metadata->>'work' NOT IN (${EXCLUDE_WORKS.map((w) => `'${w}'`).join(',')}))` : '',
].filter(Boolean).join(' AND ');
const WORK_CAP = Number(argVal('--work-cap') ?? 0); // max chunks per work in the pool (0 = off)
const PRE_POOL = Number(argVal('--pre-pool') ?? 200); // pre-cap pool size when --work-cap is on
// §1b LABEL AUDIT: the v3 doctrinal labels are model-authored and DEMONSTRABLY incomplete —
// a correct retrieval is scored a miss. Each addition below is grounded in the KJV TEXT
// (verbatim phrase in the query, or a direct synoptic parallel of a labelled chapter),
// derived from the query's scripture, NOT from what retrieval returned (so this measures a
// label bug, not over-fit). --relabeled merges these at SCORING time; the frozen v3 file is
// untouched. Verified against web/public/bible/kjv: e.g. John 15:12 "love one another, as I
// have loved you" (tp-19), Lev 11:44 "be ye holy; for I am holy" (tp-01), Luke 12 = Matt 6
// synoptic (tp-18), Matt 18:15 "brother shall trespass" (tp-16), the Hallel (tp-12).
const RELABEL: Record<string, string[]> = {
  'v3-tp-01': ['Leviticus 11'],
  'v3-tp-05': ['Deuteronomy 5'],
  'v3-tp-06': ['Deuteronomy 5'],
  'v3-tp-09': ['Deuteronomy 5'],
  'v3-tp-11': ['John 15'],
  // v3-tp-12 REMOVED (A6 2026-07-17): its label additions were derived from what
  // retrieval returned, violating the harness's own non-circularity rule
  // ("derived from the query's scripture, NOT from what retrieval returned").
  'v3-tp-16': ['Matthew 18'],
  'v3-tp-18': ['Luke 12'],
  'v3-tp-19': ['John 15'],
  'v3-tp-20': ['Luke 24', 'John 20'],
  'v3-ep-13': ['Mark 14'],
  'v3-ep-25': ['Matthew 22'],
};
const RELABELED = process.argv.includes('--relabeled');
const expectedFor = (q: Q): string[] => (RELABELED && RELABEL[q.id] ? [...q.expected, ...RELABEL[q.id]!] : q.expected);
// The legal corpus filter is SINGLE-SOURCED from routing.ts (beta wall 2) so this eval
// and production retrieveCommentary can never diverge on what "the legal corpus" is.
const PUBLISHABLE = LEGAL_CORPUS_FILTER;

type Row = { source_id: string; content: string; metadata: unknown };
const meta = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m) as { verseId: number; author: string };
interface ExpRange { book: number; chLo: number; chHi: number }

// Resolve expected reference strings → book+chapter spans via the tested ref-parse.
function toRanges(refs: string[]): ExpRange[] {
  const out: ExpRange[] = [];
  for (const s of refs) {
    const o = parseRef(s);
    if (!o.ok) throw new Error(`bad expected ref: "${s}"`);
    for (const r of o.ref.ranges) {
      out.push({ book: Math.floor(r.start / 1e6), chLo: Math.floor((r.start % 1e6) / 1000), chHi: Math.floor((r.end % 1e6) / 1000) });
    }
  }
  return out;
}
const onTarget = (v: number, rs: ExpRange[]) => {
  const b = Math.floor(v / 1e6), c = Math.floor((v % 1e6) / 1000);
  return rs.some((r) => b === r.book && c >= r.chLo && c <= r.chHi);
};

// §1a A/B: bge-large-en-v1.5 is an asymmetric retriever — its model card says to prefix
// the QUERY (not the passages) with this instruction for short-query→long-passage search.
// The corpus was embedded with NO prefix, so this only shifts the query vector. --bge-prefix
// turns it on so we can measure the delta on v3 before touching the prod embedQuery path.
const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const BGE_PREFIX = process.argv.includes('--bge-prefix');
async function embed(text: string): Promise<string> {
  const input = BGE_PREFIX ? BGE_QUERY_PREFIX + text : text;
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [input.slice(0, 1800)], encoding_format: 'float' }),
  });
  // CHECK THE RESPONSE. Without this, a 401 fell through to `.data[0]` on an error object and the
  // eval died with "Cannot read properties of undefined (reading '0')" at line 113 — which reads
  // as a bug in the eval and is actually "your key is wrong". Measured 2026-08-02: the key file
  // held a postgres URL, and the only symptom was a TypeError with no mention of auth. A tool that
  // spends money per call should say which of the two things went wrong.
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // The key is never echoed, and the provider's message is truncated: it is untrusted output.
    throw new Error(`DeepInfra ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!vec) throw new Error('DeepInfra returned 200 with no embedding — the response shape changed');
  return `[${vec.join(',')}]`;
}
async function rerankAll(q: string, rows: Row[]): Promise<Row[]> {
  if (rows.length <= K) return rows;
  const res = await fetch(`https://api.deepinfra.com/v1/inference/${RERANK_MODEL}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, RERANK_DOC_CHARS)) }), signal: AbortSignal.timeout(30_000),
  });
  const scores = ((await res.json()) as { scores: number[] }).scores;
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).map(({ i }) => rows[i]!);
}
// Legal-corpus retrieval through the SHARED shipped orchestration (inject → merge →
// rerank → floor), returning the top-K voices' verseId + author.
async function retrieveLegal(query: string, vec: string): Promise<Array<{ verseId: number; author: string }>> {
  // Base pool via the SHARED builder — byte-identical to production retrieveCommentary.
  // EXCLUDE_FILTER is a read-only diagnostic (default '' → production SQL).
  let rows = (await legalBasePool(sql, vec, WORK_CAP ? PRE_POOL : POOL, EF, EXCLUDE_FILTER)) as Row[];
  // Per-work cap diagnostic (2026-07-18): retrieve a larger PRE_POOL, keep the top
  // WORK_CAP vector-scored chunks per work (so one huge work — Spurgeon's 118k —
  // can't dominate), then trim to POOL. Vector score is already DESC from the SQL.
  if (WORK_CAP) {
    const perWork = new Map<string, number>();
    const capped: Row[] = [];
    for (const r of rows) {
      const w = (meta(r.metadata).work as string) ?? `author:${meta(r.metadata).author}`;
      const n = perWork.get(w) ?? 0;
      if (n < WORK_CAP) { perWork.set(w, n + 1); capped.push(r); }
      if (capped.length >= POOL) break;
    }
    rows = capped;
  }
  const intent = resolveIntent(query);
  if (intent.inject.length) {
    const injFilter = EXCLUDE_FILTER ? `${PUBLISHABLE} AND ${EXCLUDE_FILTER}` : PUBLISHABLE;
    const inj = (await sql.query(injectionSql(intent.inject, injFilter), [vec])) as Row[];
    rows = mergeById(inj, rows, (r) => r.source_id);
  }
  const ranked = NO_RERANK ? rows : await rerankAll(query, rows);
  let floored = floorOnRange(ranked, intent.floor, (r) => meta(r.metadata).verseId);
  // On-passage backfill (item 2) — shared with production retrieveCommentary.
  const chapterKey = (r: Row) => Math.floor(meta(r.metadata).verseId / 1000);
  const chapters = chapterKeysOf(floored.slice(0, BACKFILL_TOP_CHAPTERS), chapterKey);
  if (chapters.length > 0) {
    const bf = (await sql.query(diversityBackfillSql(chapters, PUBLISHABLE), [vec])) as Row[];
    floored = insertBackfill(floored, bf, (r) => r.source_id, chapterKey, (r) => meta(r.metadata).author);
  }
  const onRef = (r: Row) => { const v = meta(r.metadata).verseId; return intent.floor.some((rg) => v >= rg.start && v <= rg.end); };
  return selectDiverse(floored, K, chapterKey, onRef, CAP)
    .map((r) => { const m = meta(r.metadata); return { verseId: m.verseId, author: m.author }; });
}
// Does the legal corpus hold ANY voice in the expected passages? (wrong-passage vs no-content)
async function hasContent(rs: ExpRange[]): Promise<boolean> {
  if (!rs.length) return false;
  const conds = rs.map((r) => `((metadata->>'verseId')::int BETWEEN ${r.book * 1e6 + r.chLo * 1000 + 1} AND ${r.book * 1e6 + r.chHi * 1000 + 999})`).join(' OR ');
  const res = (await sql.query(`SELECT COUNT(*)::int AS n FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} AND (${conds})`)) as Array<{ n: number }>;
  return res[0]!.n > 0;
}

// Book abbreviations (1-indexed by canonical book number) for readable diagnosis.
const BOOKS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
const loc = (v: number) => `${BOOKS[Math.floor(v / 1e6) - 1]}${Math.floor((v % 1e6) / 1000)}`;
const shortAuthor = (a: string) => ({ 'John Gill': 'Gill', 'Jamieson, Fausset & Brown': 'JFB', 'Adam Clarke': 'Clarke', 'Matthew Henry': 'Henry', 'John Chrysostom': 'Chrys', 'Augustine of Hippo': 'Aug' })[a] ?? a.slice(0, 6);

type Code = 'pass' | '<2-voices' | 'wrong-passage' | 'no-content';
interface Tally { n: number; hit1: number; hit2: number; codes: Record<Code, number> }
const blank = (): Tally => ({ n: 0, hit1: 0, hit2: 0, codes: { pass: 0, '<2-voices': 0, 'wrong-passage': 0, 'no-content': 0 } });

// Label QA only (no retrieval, no accuracy): every expected ref parses, category
// counts, no duplicate ids. Safe to run before the frozen accuracy measurement.
function validate() {
  const { name, set: all } = activeSet();
  const ids = new Set<string>();
  let dup = 0, bad = 0;
  for (const q of all) {
    if (ids.has(q.id)) { dup++; console.log(`  DUP id: ${q.id}`); }
    ids.add(q.id);
    try { toRanges(q.expected); } catch (e) { bad++; console.log(`  ✗ ${q.id}: ${(e as Error).message}`); }
  }
  const byCat: Record<string, number> = {};
  for (const q of all) byCat[q.cat] = (byCat[q.cat] ?? 0) + 1;
  console.log(`${name} ${all.length}`);
  console.log(`${name} by category:`, JSON.stringify(byCat));
  console.log(`parse failures: ${bad} · duplicate ids: ${dup}`);
}

// READ-ONLY diagnosis: for epistle+topical, dump top-6 returned passages+authors so
// each failure can be judged label-incompleteness (returned a valid on-doctrine passage
// not in the acceptable set) vs genuine miss. `*` marks an on-target (in-label) result.
async function diagnose() {
  for (const q of activeSet().set.filter((x) => x.cat === 'epistle' || x.cat === 'topical')) {
    const exp = toRanges(expectedFor(q));
    const results = await retrieveLegal(q.query, await embed(q.query));
    const onT = results.filter((r) => onTarget(r.verseId, exp));
    const authors = new Set(onT.map((r) => r.author));
    const code: Code = authors.size >= 2 ? 'pass' : onT.length >= 1 ? '<2-voices' : (await hasContent(exp)) ? 'wrong-passage' : 'no-content';
    const expStr = exp.map((r) => `${BOOKS[r.book - 1]}${r.chLo === r.chHi ? r.chLo : `${r.chLo}-${r.chHi}`}`).join(',');
    const top = results.map((r) => `${loc(r.verseId)}(${shortAuthor(r.author)})${onTarget(r.verseId, exp) ? '*' : ''}`).join('  ');
    console.log(`${code === 'pass' ? '✓' : '·'} ${q.id} [${code}]  label:{${expStr}}\n    Q: ${q.query}\n    →: ${top}`);
  }
}

// ≥2-AVAILABLE DENOMINATOR (READ-ONLY). The HIT@2 guarantee is "≥2 distinct voices",
// but a passage can only yield that if the LEGAL corpus actually holds ≥2 distinct PD
// authors on it — you cannot retrieve a 2nd voice that does not exist. This splits the
// epistle+topical failures into (a) RETRIEVAL-LIMITED — ≥2 authors are available on the
// label but the pipeline surfaced <2 (a real retrieval bug, fixable) vs (b) CONTENT-
// LIMITED — the label has <2 distinct PD authors at all (an ingest/metric limit, not a
// retrieval miss). Reports HIT@2 recomputed over the ≥2-available denominator.
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts --frozen --availability
async function availByAuthor(rs: ExpRange[]): Promise<Array<{ author: string; n: number }>> {
  if (!rs.length) return [];
  const conds = rs.map((r) => `((metadata->>'verseId')::int BETWEEN ${r.book * 1e6 + r.chLo * 1000 + 1} AND ${r.book * 1e6 + r.chHi * 1000 + 999})`).join(' OR ');
  return (await sql.query(`SELECT metadata->>'author' AS author, COUNT(*)::int AS n FROM embeddings
     WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} AND (${conds}) GROUP BY 1 ORDER BY 2 DESC`)) as Array<{ author: string; n: number }>;
}
// Max distinct authors on ANY SINGLE labeled passage (secondary lens: union ≥2 can be two
// authors on two different passages; per-passage tells whether one passage alone is thin).
async function maxAuthorsOnOnePassage(rs: ExpRange[]): Promise<number> {
  let mx = 0;
  for (const r of rs) {
    const cond = `((metadata->>'verseId')::int BETWEEN ${r.book * 1e6 + r.chLo * 1000 + 1} AND ${r.book * 1e6 + r.chHi * 1000 + 999})`;
    const res = (await sql.query(`SELECT COUNT(DISTINCT metadata->>'author')::int AS n FROM embeddings
       WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} AND ${cond}`)) as Array<{ n: number }>;
    mx = Math.max(mx, res[0]!.n);
  }
  return mx;
}
async function availability() {
  type Klass = 'pass' | 'retrieval-limited' | 'content-1author' | 'content-0author';
  interface Rec { id: string; cat: Cat; query: string; expStr: string; availN: number; perPassageMax: number; surfaced: number; hit2: boolean; klass: Klass; authors: string[] }
  const recs: Rec[] = [];
  for (const q of activeSet().set.filter((x) => x.cat === 'epistle' || x.cat === 'topical')) {
    const exp = toRanges(expectedFor(q));
    const results = await retrieveLegal(q.query, await embed(q.query));
    const onT = results.filter((r) => onTarget(r.verseId, exp));
    const surfaced = new Set(onT.map((r) => r.author)).size;
    const hit2 = surfaced >= 2;
    const avail = await availByAuthor(exp);
    const availN = avail.length;
    const perPassageMax = await maxAuthorsOnOnePassage(exp);
    const achievable = availN >= 2;
    const klass: Klass = hit2 ? 'pass' : achievable ? 'retrieval-limited' : availN === 1 ? 'content-1author' : 'content-0author';
    const expStr = exp.map((r) => `${BOOKS[r.book - 1]}${r.chLo === r.chHi ? r.chLo : `${r.chLo}-${r.chHi}`}`).join(',');
    recs.push({ id: q.id, cat: q.cat, query: q.query, expStr, availN, perPassageMax, surfaced, hit2, klass, authors: avail.map((a) => `${shortAuthor(a.author)}:${a.n}`) });
  }

  const mark = { pass: '✓', 'retrieval-limited': '✗R', 'content-1author': '·C1', 'content-0author': '·C0' } as const;
  for (const cat of ['topical', 'epistle'] as const) {
    console.log(`\n=== ${cat.toUpperCase()} — per-query (availN = distinct PD authors on the label in the legal corpus) ===`);
    console.log(`  id        avail(union/1-pass)  surfaced  HIT@2  class   label / available-authors`);
    for (const r of recs.filter((x) => x.cat === cat)) {
      console.log(`  ${r.id.padEnd(8)} ${String(r.availN).padStart(2)}/${r.perPassageMax}                ${r.surfaced}       ${r.hit2 ? 'Y' : 'n'}     ${mark[r.klass].padEnd(4)} {${r.expStr}}  [${r.authors.join(' ')}]`);
    }
  }

  console.log(`\n=== SPLIT (topical + epistle combined, n=${recs.length}) ===`);
  for (const cat of ['topical', 'epistle', 'both'] as const) {
    const rs = cat === 'both' ? recs : recs.filter((x) => x.cat === cat);
    const pass = rs.filter((r) => r.klass === 'pass').length;
    const retr = rs.filter((r) => r.klass === 'retrieval-limited').length;
    const c1 = rs.filter((r) => r.klass === 'content-1author').length;
    const c0 = rs.filter((r) => r.klass === 'content-0author').length;
    const achievable = rs.filter((r) => r.availN >= 2).length;
    const rawH2 = Math.round((100 * pass) / rs.length);
    const adjH2 = achievable ? Math.round((100 * pass) / achievable) : 0;
    console.log(`\n  ${cat.toUpperCase()} (n=${rs.length})`);
    console.log(`    passes:                 ${pass}`);
    console.log(`    retrieval-limited miss: ${retr}   (≥2 authors available on label, pipeline surfaced <2 — FIXABLE by retrieval)`);
    console.log(`    content-limited (1 au): ${c1}   (label has exactly 1 PD author — HIT@2 impossible without ingest)`);
    console.log(`    content-limited (0 au): ${c0}   (label has 0 PD authors = no-content)`);
    console.log(`    ── HIT@2 raw denom (all ${rs.length}):          ${pass}/${rs.length} = ${rawH2}%`);
    console.log(`    ── HIT@2 ≥2-available denom (${achievable}):       ${pass}/${achievable} = ${adjH2}%`);
  }
}

async function main() {
  const { name: setName, set: fullSet } = activeSet();
  let set: Q[] = fullSet;
  if (CAT_FILTER) set = set.filter((q) => CAT_FILTER.includes(q.cat));
  const cats: Cat[] = ['verse-ref', 'pericope', 'epistle', 'topical', 'proper-noun', 'control'];
  const tally: Record<string, Tally> = Object.fromEntries(cats.map((c) => [c, blank()]));
  let hijacks = 0;

  console.log(`Held-out eval — ${setName} · ${set.length} q · K=${K} · corpus=legal(shared) · pool=${POOL} · ef=${EF}${CAT_FILTER ? ` · cats=${CAT_FILTER.join(',')}` : ''}\n`);
  for (const q of set) {
    const t = tally[q.cat]!; t.n++;
    if (q.cat === 'control') {
      const floored = resolveIntent(q.query).floor.length > 0;
      if (floored) { hijacks++; console.log(`  ✗ [control] ${q.id}  HIJACK (floor fired) — ${q.query}`); }
      else { t.hit1++; console.log(`  ✓ [control] ${q.id}  clean (no floor) — ${q.query}`); }
      continue;
    }
    const exp = toRanges(expectedFor(q));
    const results = await retrieveLegal(q.query, await embed(q.query));
    const onT = results.filter((r) => onTarget(r.verseId, exp));
    const hit1 = results.length > 0 && onTarget(results[0]!.verseId, exp);
    const authors = new Set(onT.map((r) => r.author));
    const hit2 = authors.size >= 2;
    let code: Code;
    if (hit2) code = 'pass';
    else if (onT.length >= 1) code = '<2-voices';
    else code = (await hasContent(exp)) ? 'wrong-passage' : 'no-content';
    if (hit1) t.hit1++; if (hit2) t.hit2++; t.codes[code]++;
    console.log(`  ${hit2 ? '✓' : '·'} [${q.cat}] ${q.id}  HIT@1=${hit1 ? 'Y' : 'n'} voices=${authors.size} ${code}  — ${q.query.slice(0, 46)}`);
  }

  const pct = (x: number, d: number) => (d === 0 ? '  —  ' : `${Math.round((100 * x) / d)}%`.padStart(4));
  console.log(`\ncategory        n   HIT@1  HIT@2   pass / <2 / wrong / none`);
  for (const c of cats) {
    const t = tally[c]!; if (t.n === 0) continue;
    if (c === 'control') { console.log(`  ${c.padEnd(13)} ${String(t.n).padStart(2)}   clean ${t.hit1}/${t.n}  hijacks=${hijacks}`); continue; }
    const k = t.codes;
    console.log(`  ${c.padEnd(13)} ${String(t.n).padStart(2)}   ${pct(t.hit1, t.n)}  ${pct(t.hit2, t.n)}    ${k.pass} / ${k['<2-voices']} / ${k['wrong-passage']} / ${k['no-content']}`);
  }
  const g = (c: Cat, m: 'hit1' | 'hit2') => { const t = tally[c]!; return t.n ? Math.round((100 * t[m]) / t.n) : 0; };
  console.log(`TAG corpus=legal(shared) pool=${POOL} ef=${EF} cap=${CAP} :: topicalH2=${g('topical', 'hit2')} pericopeH1=${g('pericope', 'hit1')} epistleH2=${g('epistle', 'hit2')} verserefH1=${g('verse-ref', 'hit1')}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--validate')) validate();
  else if (process.argv.includes('--diagnose')) diagnose().catch((e) => { console.error(e); process.exit(1); });
  else if (process.argv.includes('--availability')) availability().catch((e) => { console.error(e); process.exit(1); });
  else main().catch((e) => { console.error(e); process.exit(1); });
}
