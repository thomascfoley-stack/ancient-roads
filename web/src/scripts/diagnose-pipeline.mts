// Diagnostic harness: runs N queries through the pipeline, categorizes failures.
// Tests three retrieval modes:
//   1. Pure vector (baseline)
//   2. Hybrid BM25+vector (plainto_tsquery fusion)
//   3. Hybrid + BGE-reranker-v2-m3 (top-20 → best 6)
//
//   cd web && npx tsx --env-file=.env.local src/scripts/diagnose-pipeline.mts
//
// Environment:
//   MODE=vector|hybrid|full (default: full = hybrid+rerank)
//   QUERIES=3  (limit number of queries for quick checks)

import { neon } from '@neondatabase/serverless';
import { buildSystemPrompt, buildUserPrompt } from '../lib/teacher/prompt.ts';
import { buildCorpusLookup } from '../lib/teacher/corpus.ts';
import { normalizeContract } from '../lib/teacher/normalize-contract.ts';
import { verifyV1 } from '../verifier/v1.ts';
import type { RetrievedChunk } from '../lib/teacher/retrieve.ts';
import type { TeacherResponse } from '../contract/types.ts';

const MODEL = 'Qwen/Qwen3.5-35B-A3B';
const RETRIEVE_K = 6;
const CANDIDATE_POOL = 20;
const COMPOSE_VOICES = 5;
const MAX_RETRIES = 1;
const MODE = (process.env.MODE ?? 'full') as 'vector' | 'hybrid' | 'full';
const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));

const ALL_QUERIES = [
  'What does the Gospel of John say about the Word becoming flesh?',
  'How have commentators understood being born again?',
  'What have commentators said about the good shepherd?',
  'What is said about the vine and the branches?',
  'What do commentators say about the Sermon on the Mount and the Beatitudes?',
  'How has the church understood predestination and election?',
  'What have theologians said about the eucharist or Lord\'s Supper?',
  'What do commentators say about Psalm 23?',
  'How have scholars interpreted the creation account in Genesis 1?',
  'What has been said about Paul\'s thorn in the flesh?',
];
const QUERIES = process.env.QUERIES ? ALL_QUERIES.slice(0, Number(process.env.QUERIES)) : ALL_QUERIES;

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return ((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding;
}

async function retrieveVector(vec: number[], limit: number): Promise<RetrievedChunk[]> {
  const rows = (await sql.query(
    `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata FROM embeddings
     WHERE user_id IS NULL AND source_type = 'commentary' ORDER BY embedding <=> $1::vector LIMIT $2`,
    [`[${vec.join(',')}]`, limit],
  )) as Array<{ source_id: string; score: number; content: string; metadata: RetrievedChunk['metadata'] }>;
  return rows.map((r) => ({ sourceId: r.source_id, score: Number(r.score), content: r.content, metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata }));
}

async function retrieveHybrid(queryText: string, vec: number[], limit: number): Promise<RetrievedChunk[]> {
  const rows = (await sql.query(
    `SELECT * FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, NULL)`,
    [queryText, `[${vec.join(',')}]`, limit],
  )) as Array<{ source_id: string; source_type: string; content: string; metadata: unknown; bm25_score: number; vector_score: number; combined_score: number }>;
  return rows.map((r) => {
    const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
    return { sourceId: r.source_id, score: Number(r.combined_score), content: r.content, metadata: meta as RetrievedChunk['metadata'] };
  });
}

async function rerankCandidates(query: string, candidates: RetrievedChunk[], topN: number): Promise<RetrievedChunk[]> {
  if (candidates.length <= topN) return candidates;
  const docs = candidates.map((c) => c.content.slice(0, 1200));
  const res = await fetch('https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-0.6B', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ queries: [query], documents: docs }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Rerank failed: ${res.status}`);
  const json = (await res.json()) as { scores: number[] };
  const scored = json.scores.map((score, index) => ({ index, relevance_score: score }));
  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  const top = scored.slice(0, topN);
  return top.map((r) => ({ ...candidates[r.index]!, score: r.relevance_score }));
}

async function retrieve(query: string, vec: number[]): Promise<RetrievedChunk[]> {
  if (MODE === 'vector') return retrieveVector(vec, RETRIEVE_K);
  const pool = await retrieveHybrid(query, vec, CANDIDATE_POOL);
  if (MODE === 'hybrid') return pool.slice(0, RETRIEVE_K);
  // full = hybrid + rerank
  return rerankCandidates(query, pool, RETRIEVE_K);
}

function selectVoices(pool: RetrievedChunk[], n: number): RetrievedChunk[] {
  if (pool.length <= n) return pool;
  const top = pool.slice(0, n);
  const t = new Set(top.map((r) => r.metadata.tradition ?? 'unknown'));
  if (t.size >= 2) return top;
  const other = pool.find((r) => (r.metadata.tradition ?? 'unknown') !== [...t][0]);
  return other ? [...top.slice(0, n - 1), other] : top;
}

async function composeOnce(system: string, user: string): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const res = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 6000, chat_template_kwargs: { enable_thinking: false } }),
    signal: AbortSignal.timeout(180_000),
  });
  let c = ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content;
  c = c.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  return { text: c, ms: performance.now() - t0 };
}

// Whether the sources are topically relevant to the query (manual heuristic)
function assessSourceQuality(query: string, sources: RetrievedChunk[]): { correct: boolean; notes: string } {
  const q = query.toLowerCase();
  // Spot-check known bad retrievals from the baseline
  if (q.includes('good shepherd') && sources.some((s) => s.content.toLowerCase().includes('shepherds returned') && s.content.toLowerCase().includes('bethlehem'))) {
    return { correct: false, notes: 'Luke 2 nativity shepherds instead of John 10 Good Shepherd' };
  }
  if (q.includes('vine') && q.includes('branches') && !sources.some((s) => s.content.toLowerCase().includes('vine') || s.content.toLowerCase().includes('abide in me'))) {
    return { correct: false, notes: 'No John 15 vine/branches content in retrieval' };
  }
  if (q.includes('eucharist') || q.includes('lord\'s supper')) {
    const hasEucharist = sources.some((s) => {
      const t = s.content.toLowerCase();
      return t.includes('eucharist') || t.includes('communion') || t.includes('lord\'s supper') || t.includes('this is my body') || t.includes('bread') || t.includes('last supper');
    });
    if (!hasEucharist) return { correct: false, notes: 'No eucharist/communion content — got food metaphors instead' };
  }
  if (q.includes('psalm 23') && !sources.some((s) => {
    const vid = s.metadata.verseId;
    return vid >= 19023001 && vid <= 19023006;
  })) {
    return { correct: false, notes: 'No Psalm 23 verse references in retrieval' };
  }
  if (q.includes('thorn') && q.includes('flesh') && !sources.some((s) => s.content.toLowerCase().includes('thorn'))) {
    return { correct: false, notes: 'No "thorn" content in retrieval' };
  }
  return { correct: true, notes: 'Sources appear topically relevant' };
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`PIPELINE DIAGNOSTIC — mode=${MODE}, ${QUERIES.length} queries, model=${MODEL}, voices=${COMPOSE_VOICES}`);
  console.log(`${'='.repeat(80)}\n`);

  // Count embeddings
  const [{ cnt }] = (await sql.query(`SELECT count(*)::int AS cnt FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`)) as [{ cnt: number }];
  console.log(`Corpus: ${cnt} commentary embeddings\n`);

  let composed = 0, fallback = 0, trueSuccess = 0;

  for (const q of QUERIES) {
    console.log(`--- Q: ${q} ---`);
    const vec = await embedQuery(q);
    const sources = await retrieve(q, vec);

    const traditions = new Set(sources.map((r) => r.metadata.tradition ?? 'unknown'));
    console.log(`  retrieval: ${sources.length} sources, ${traditions.size} tradition(s)`);
    for (const s of sources) {
      console.log(`    ${s.score.toFixed(3)} | ${(s.metadata.tradition ?? '?').padEnd(14)} | ${s.metadata.author.padEnd(28)} | ${s.content.slice(0, 70)}…`);
    }

    const quality = assessSourceQuality(q, sources);
    if (!quality.correct) console.log(`  ⚠ WRONG SOURCES: ${quality.notes}`);

    if (sources.length === 0) {
      console.log('  outcome: EMPTY\n');
      fallback++;
      continue;
    }

    // Compose
    const voices = selectVoices(sources, COMPOSE_VOICES);
    const system = buildSystemPrompt();
    const user = buildUserPrompt(q, voices);
    const lookup = buildCorpusLookup(voices);
    const sections = voices.map((r) => ({ author: r.metadata.author, work: r.metadata.sourceTitle, tradition: r.metadata.tradition ?? 'unknown' }));
    const ctx = { sectionIds: voices.map((_, i) => i + 1), traditions: [...new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'))] };

    let final: TeacherResponse | null = null;
    let totalMs = 0;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let raw: string, ms: number;
      try { ({ text: raw, ms } = await composeOnce(system, attempt === 0 ? user : `${user}\n\n--- retry: fix violations ---`)); } catch { continue; }
      totalMs += ms;
      let parsed: unknown;
      try { parsed = normalizeContract(JSON.parse(raw), sections); } catch { continue; }
      const vr = await verifyV1(parsed, lookup, ctx);
      if (vr.ok) { final = parsed as TeacherResponse; break; }
    }

    if (final) {
      composed++;
      const isTrue = quality.correct;
      if (isTrue) trueSuccess++;
      const badge = isTrue ? '✓' : '⚠ wrong sources';
      console.log(`  outcome: COMPOSED ${badge} (${(totalMs / 1000).toFixed(1)}s)`);
      const framing = final.blocks.find((b) => b.type === 'framing');
      if (framing) console.log(`  framing: "${(framing as { text: string }).text.slice(0, 100)}…"`);
    } else {
      fallback++;
      console.log(`  outcome: FALLBACK (${(totalMs / 1000).toFixed(1)}s)`);
    }
    console.log();
  }

  console.log(`${'='.repeat(80)}`);
  console.log(`SUMMARY — mode=${MODE}`);
  console.log(`  ${QUERIES.length} queries: ${composed} composed, ${fallback} fallback`);
  console.log(`  True success (composed + correct sources): ${trueSuccess}/${QUERIES.length}`);
  console.log(`${'='.repeat(80)}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
