// Held-out launch-gate eval harness (READ-ONLY). Runs a query set through the
// SHARED production routing path (lib/teacher/routing.ts) on the LEGAL corpus and
// reports per-category HIT@1 / HIT@2 (≥2 distinct-author voices) + failure codes
// (pass / <2-voices / wrong-passage / no-content) vs the pre-registered bars.
// docs/HELDOUT_EVAL_DESIGN.md.  Default set = PILOT (plumbing); --frozen = the 120.
//   cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts [--frozen]

import { neon } from '@neondatabase/serverless';
import { parseRef } from '../bible/ref-parse';
import { resolveIntent } from '../bible/pericopes';
import { CANDIDATE_POOL, RERANK_MODEL, RERANK_DOC_CHARS, injectionSql, mergeById, floorOnRange } from '../lib/teacher/routing';
import { PILOT, FROZEN, type Q, type Cat } from './heldout-queries.mjs';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = 6; // = production retrieveCommentary default `limit`
const argVal = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
// Measurement knobs (read-only; do NOT ship). --pool N overrides CANDIDATE_POOL;
// --corpus pre drops the CrossWire authors (= pre-ingest legal corpus, for the
// variance/A-B band); --cats a,b filters categories to speed variance runs.
const POOL = Number(argVal('--pool') ?? CANDIDATE_POOL);
const CORPUS = argVal('--corpus') ?? 'post';
const CAT_FILTER = argVal('--cats')?.split(',');
const PUB_BASE = `metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
  OR (metadata->>'author'='John Chrysostom'   AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
  OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))`;
const PUB_NEW = `OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')`;
const PUBLISHABLE = `(${PUB_BASE} ${CORPUS === 'pre' ? '' : PUB_NEW})`;

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

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return `[${((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding.join(',')}]`;
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
  let rows = (await sql.query(
    `SELECT source_id, content, metadata FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${PUBLISHABLE} ORDER BY embedding <=> $1::vector LIMIT ${POOL}`, [vec],
  )) as Row[];
  const intent = resolveIntent(query);
  if (intent.inject.length) {
    const inj = (await sql.query(injectionSql(intent.inject, PUBLISHABLE), [vec])) as Row[];
    rows = mergeById(inj, rows, (r) => r.source_id);
  }
  const ranked = await rerankAll(query, rows);
  return floorOnRange(ranked, intent.floor, (r) => meta(r.metadata).verseId)
    .slice(0, K)
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
  const all = [...PILOT, ...FROZEN];
  const ids = new Set<string>();
  let dup = 0, bad = 0;
  for (const q of all) {
    if (ids.has(q.id)) { dup++; console.log(`  DUP id: ${q.id}`); }
    ids.add(q.id);
    try { toRanges(q.expected); } catch (e) { bad++; console.log(`  ✗ ${q.id}: ${(e as Error).message}`); }
  }
  const byCat: Record<string, number> = {};
  for (const q of FROZEN) byCat[q.cat] = (byCat[q.cat] ?? 0) + 1;
  console.log(`FROZEN ${FROZEN.length} · PILOT ${PILOT.length}`);
  console.log('FROZEN by category:', JSON.stringify(byCat));
  console.log(`parse failures: ${bad} · duplicate ids: ${dup}`);
}

// READ-ONLY diagnosis: for epistle+topical, dump top-6 returned passages+authors so
// each failure can be judged label-incompleteness (returned a valid on-doctrine passage
// not in the acceptable set) vs genuine miss. `*` marks an on-target (in-label) result.
async function diagnose() {
  for (const q of FROZEN.filter((x) => x.cat === 'epistle' || x.cat === 'topical')) {
    const exp = toRanges(q.expected);
    const results = await retrieveLegal(q.query, await embed(q.query));
    const onT = results.filter((r) => onTarget(r.verseId, exp));
    const authors = new Set(onT.map((r) => r.author));
    const code: Code = authors.size >= 2 ? 'pass' : onT.length >= 1 ? '<2-voices' : (await hasContent(exp)) ? 'wrong-passage' : 'no-content';
    const expStr = exp.map((r) => `${BOOKS[r.book - 1]}${r.chLo === r.chHi ? r.chLo : `${r.chLo}-${r.chHi}`}`).join(',');
    const top = results.map((r) => `${loc(r.verseId)}(${shortAuthor(r.author)})${onTarget(r.verseId, exp) ? '*' : ''}`).join('  ');
    console.log(`${code === 'pass' ? '✓' : '·'} ${q.id} [${code}]  label:{${expStr}}\n    Q: ${q.query}\n    →: ${top}`);
  }
}

async function main() {
  let set: Q[] = process.argv.includes('--frozen') ? FROZEN : PILOT;
  if (CAT_FILTER) set = set.filter((q) => CAT_FILTER.includes(q.cat));
  const cats: Cat[] = ['verse-ref', 'pericope', 'epistle', 'topical', 'proper-noun', 'control'];
  const tally: Record<string, Tally> = Object.fromEntries(cats.map((c) => [c, blank()]));
  let hijacks = 0;

  console.log(`Held-out eval — ${process.argv.includes('--frozen') ? 'FROZEN' : 'PILOT'} · ${set.length} q · K=${K} · corpus=${CORPUS} · pool=${POOL}${CAT_FILTER ? ` · cats=${CAT_FILTER.join(',')}` : ''}\n`);
  for (const q of set) {
    const t = tally[q.cat]!; t.n++;
    if (q.cat === 'control') {
      const floored = resolveIntent(q.query).floor.length > 0;
      if (floored) { hijacks++; console.log(`  ✗ [control] ${q.id}  HIJACK (floor fired) — ${q.query}`); }
      else { t.hit1++; console.log(`  ✓ [control] ${q.id}  clean (no floor) — ${q.query}`); }
      continue;
    }
    const exp = toRanges(q.expected);
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
  console.log(`TAG corpus=${CORPUS} pool=${POOL} :: topicalH2=${g('topical', 'hit2')} pericopeH1=${g('pericope', 'hit1')} epistleH2=${g('epistle', 'hit2')} verserefH1=${g('verse-ref', 'hit1')}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--validate')) validate();
  else if (process.argv.includes('--diagnose')) diagnose().catch((e) => { console.error(e); process.exit(1); });
  else main().catch((e) => { console.error(e); process.exit(1); });
}
