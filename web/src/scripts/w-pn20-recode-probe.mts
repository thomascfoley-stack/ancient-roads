// W-PN20 label re-code probe (READ-ONLY, dev ep-tiny-hat). For the three missed cases
// (pn20-13 / pn20-16 / pn20-18), re-runs the query through the SHIPPED routing path
// stage by stage — intent scan → base pool → inject → rerank → floor → backfill →
// selectDiverse — and separately measures what the served corpus actually holds on the
// labeled chapter (chunks, distinct authors, entity mentions). Recovery order
// docs/pm/orders/2026-08-22-swarm-recovery-amendment.md "W-PN20 disposition".
//   cd web && npx tsx --env-file=.env.local src/scripts/w-pn20-recode-probe.mts
// Tunes nothing; changes nothing; writes nothing to the DB.

import { neon } from '@neondatabase/serverless';
import { scanReferences } from '../bible/ref-parse';
import { resolveIntent } from '../bible/pericopes';
import {
  CANDIDATE_POOL, RERANK_MODEL, RERANK_DOC_CHARS, injectionSql, mergeById, floorOnRange,
  selectDiverse, PASSAGE_CAP, legalBasePool, HNSW_EF_SEARCH, LEGAL_CORPUS_FILTER,
  chapterKeysOf, diversityBackfillSql, insertBackfill, BACKFILL_TOP_CHAPTERS,
} from '../lib/teacher/routing';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));
const K = 6;

type Row = { source_id: string; content: string; metadata: unknown };
const meta = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m) as { verseId: number; author: string; work?: string };

const CASES = [
  { id: 'pn18', query: 'Diotrephes who loveth to have the preeminence', book: 64, ch: 1, label: '3 John 1', entity: 'Diotrephes' },
  { id: 'pn16', query: 'Stephanas and his household, the firstfruits of Achaia', book: 46, ch: 16, label: '1 Corinthians 16', entity: 'Stephanas' },
  { id: 'pn13', query: 'Joseph of Arimathaea who begged the body of Jesus', book: 42, ch: 23, label: 'Luke 23', entity: 'Arimathaea' },
] as const;

const BOOKS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr','Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Matt','Mark','Luke','John','Acts','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev'];
const loc = (v: number) => `${BOOKS[Math.floor(v / 1e6) - 1]} ${Math.floor((v % 1e6) / 1000)}:${(v % 1000)}`;
const chOf = (v: number) => `${BOOKS[Math.floor(v / 1e6) - 1]} ${Math.floor((v % 1e6) / 1000)}`;

async function embed(text: string): Promise<string> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  if (!res.ok) throw new Error(`DeepInfra embed ${res.status}`);
  const vec = (await res.json() as { data?: { embedding: number[] }[] }).data?.[0]?.embedding;
  if (!vec) throw new Error('DeepInfra embed: no vector');
  return `[${vec.join(',')}]`;
}

async function rerankAll(q: string, rows: Row[]): Promise<Row[]> {
  if (rows.length <= K) return rows;
  const res = await fetch(`https://api.deepinfra.com/v1/inference/${RERANK_MODEL}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [q], documents: rows.map((r) => r.content.slice(0, RERANK_DOC_CHARS)) }), signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`DeepInfra rerank ${res.status}`);
  const scores = ((await res.json()) as { scores?: number[] }).scores;
  if (!Array.isArray(scores)) throw new Error('DeepInfra rerank: no scores array');
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).map(({ i }) => rows[i]!);
}

const dump = (tag: string, rows: Row[], onT: (r: Row) => boolean) => {
  console.log(`  ${tag} (n=${rows.length}):`);
  for (const r of rows) {
    const m = meta(r.metadata);
    console.log(`    ${onT(r) ? '*' : ' '} ${loc(m.verseId).padEnd(16)} ${(m.author ?? '?').padEnd(28)} ${(m.work ?? '').slice(0, 40)}`);
  }
};

for (const c of CASES) {
  const lo = c.book * 1e6 + c.ch * 1000 + 1, hi = c.book * 1e6 + c.ch * 1000 + 999;
  const onT = (r: Row) => { const v = meta(r.metadata).verseId; return v >= lo && v <= hi; };
  console.log(`\n===== ${c.id}  Q: "${c.query}"  label: ${c.label} (verseId ${lo}..${hi}) =====`);

  // Stage 0 — intent scan (e033023 surface: scanReferences overlap dedupe).
  const scanned = scanReferences(c.query);
  const intent = resolveIntent(c.query);
  console.log(`  scanReferences → ${scanned.length ? scanned.map((r) => r.display).join(', ') : '(none)'}`);
  console.log(`  resolveIntent  → inject: ${intent.inject.length} range(s), floor: ${intent.floor.length} range(s)`);

  const vec = await embed(c.query);

  // Stage 0b — base-pool SIZE vs hnsw.ef_search (read-only GUC probe): an HNSW scan may
  // return FEWER than LIMIT rows; measure how starved the shipped ef=64 pool actually is.
  for (const ef of [HNSW_EF_SEARCH, 200, 1000]) {
    const probe = (await legalBasePool(sql, vec, CANDIDATE_POOL, ef)) as Row[];
    console.log(`  base-pool size at ef=${ef}: n=${probe.length} (LIMIT ${CANDIDATE_POOL})`);
  }

  // Stage 1 — base pool (production SQL: commentary+father, served, ef=64, pool=20).
  let rows = (await legalBasePool(sql, vec, CANDIDATE_POOL, HNSW_EF_SEARCH)) as Row[];
  dump('base pool (commentary+father, served, top-20 vector)', rows, onT);

  // Stage 2 — injection (skipped when no reference was scanned).
  if (intent.inject.length) {
    const inj = (await sql.query(injectionSql(intent.inject, LEGAL_CORPUS_FILTER), [vec])) as Row[];
    dump('injection', inj, onT);
    rows = mergeById(inj, rows, (r) => r.source_id);
  } else {
    console.log('  injection: SKIPPED (no scanned references — routing cannot drop anything here)');
  }

  // Stage 3 — rerank.
  const ranked = await rerankAll(c.query, rows);
  dump('post-rerank order', ranked, onT);

  // Stage 4 — floor + backfill + final selection.
  let floored = floorOnRange(ranked, intent.floor, (r) => meta(r.metadata).verseId);
  const chapterKey = (r: Row) => Math.floor(meta(r.metadata).verseId / 1000);
  const chapters = chapterKeysOf(floored.slice(0, BACKFILL_TOP_CHAPTERS), chapterKey);
  console.log(`  backfill chapters (top-${BACKFILL_TOP_CHAPTERS}): ${chapters.map((k) => chOf(k * 1000 + 1)).join(', ') || '(none)'}`);
  if (chapters.length > 0) {
    const bf = (await sql.query(diversityBackfillSql(chapters, LEGAL_CORPUS_FILTER), [vec])) as Row[];
    floored = insertBackfill(floored, bf, (r) => r.source_id, chapterKey, (r) => meta(r.metadata).author);
  }
  const final = selectDiverse(floored, K, chapterKey, (r) => intent.floor.some((rg) => meta(r.metadata).verseId >= rg.start && meta(r.metadata).verseId <= rg.end), PASSAGE_CAP);
  dump('FINAL top-K voices', final as Row[], onT);

  // Coverage — what the served corpus actually holds on the labeled chapter.
  const cov = (await sql.query(
    `SELECT source_type, metadata->>'author' AS author, COUNT(*)::int AS n
       FROM embeddings
      WHERE user_id IS NULL AND served
        AND (metadata->>'verseId')::int BETWEEN ${lo} AND ${hi}
      GROUP BY 1, 2 ORDER BY 1, 3 DESC`)) as Array<{ source_type: string; author: string; n: number }>;
  console.log(`  served rows on ${c.label} by type/author:`);
  if (!cov.length) console.log('    (ZERO served rows on the labeled chapter — no-content)');
  for (const r of cov) console.log(`    ${r.source_type.padEnd(12)} ${(r.author ?? '?').padEnd(30)} ${r.n}`);

  // Entity mention anywhere in the served corpus (is the content anchored elsewhere?).
  const ent = (await sql.query(
    `SELECT metadata->>'author' AS author, source_type, COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE (metadata->>'verseId')::int BETWEEN ${lo} AND ${hi})::int AS on_label
       FROM embeddings
      WHERE user_id IS NULL AND served AND content ILIKE $1
      GROUP BY 1, 2 ORDER BY 4 DESC, 3 DESC LIMIT 12`, [`%${c.entity}%`])) as Array<{ author: string; source_type: string; n: number; on_label: number }>;
  console.log(`  served rows mentioning "${c.entity}" (anywhere / on-label):`);
  if (!ent.length) console.log(`    (ZERO served rows mention "${c.entity}")`);
  for (const r of ent) console.log(`    ${(r.author ?? '?').padEnd(30)} ${r.source_type.padEnd(12)} total=${r.n}  on-label=${r.on_label}`);
}
console.log('\nDONE — read-only probe, no writes.');
