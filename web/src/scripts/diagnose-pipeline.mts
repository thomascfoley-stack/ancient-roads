// Diagnostic harness: runs N queries through the pipeline, captures retrieval +
// compose details, categorizes failures.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/diagnose-pipeline.mts
//
// Also runs hybrid_search (BM25+vector) alongside pure vector to compare
// retrieval quality without changing production code.

import { neon } from '@neondatabase/serverless';
import { buildSystemPrompt, buildUserPrompt } from '../lib/teacher/prompt.ts';
import { buildCorpusLookup } from '../lib/teacher/corpus.ts';
import { normalizeContract } from '../lib/teacher/normalize-contract.ts';
import { verifyV1 } from '../verifier/v1.ts';
import type { RetrievedChunk } from '../lib/teacher/retrieve.ts';
import type { TeacherResponse } from '../contract/types.ts';

const MODEL = 'Qwen/Qwen3.5-35B-A3B';
const RETRIEVE_K = 6;
const COMPOSE_VOICES = 5;
const MAX_RETRIES = 1;
const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));

// 10 queries spanning easy, hard, multi-tradition, single-tradition, OT, NT,
// topical, verse-specific, abstract, and potential adversarial.
const QUERIES = [
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

// Use the existing hybrid_search DB function (BM25+vector fusion)
async function retrieveHybrid(queryText: string, vec: number[], limit: number): Promise<RetrievedChunk[]> {
  const rows = (await sql.query(
    `SELECT * FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, NULL)`,
    [queryText, `[${vec.join(',')}]`, limit],
  )) as Array<{ id: string; source_type: string; source_id: string; content: string; metadata: unknown; bm25_score: number; vector_score: number; combined_score: number }>;
  return rows
    .filter((r) => r.source_type === 'commentary')
    .map((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
      return { sourceId: r.source_id, score: Number(r.combined_score), content: r.content, metadata: meta as RetrievedChunk['metadata'] };
    });
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

interface Diagnosis {
  query: string;
  outcome: 'composed' | 'fallback' | 'empty';
  composeMs: number;
  attempts: number;
  // Retrieval details
  vectorSources: { author: string; tradition: string | null; score: number; snippet: string }[];
  hybridSources: { author: string; tradition: string | null; score: number; bm25: number; vec: number; snippet: string }[];
  vectorTraditions: number;
  hybridTraditions: number;
  // If composed
  framing?: string;
  voices?: { author: string; tradition: string; quoteSnippet: string; sectionId: number }[];
  // If fallback
  violations?: string[];
  // Category
  failureCategory?: 'retrieval' | 'prompt' | 'coverage' | 'none';
  failureNotes?: string;
}

async function diagnoseQuery(q: string): Promise<Diagnosis> {
  const vec = await embedQuery(q);

  // Run both retrieval methods
  const [vectorPool, hybridRaw] = await Promise.all([
    retrieveVector(vec, RETRIEVE_K),
    retrieveHybrid(q, vec, RETRIEVE_K),
  ]);

  const hybridPool = hybridRaw;

  const vectorSources = vectorPool.map((r) => ({ author: r.metadata.author, tradition: r.metadata.tradition, score: r.score, snippet: r.content.slice(0, 80) }));
  const hybridSources: Diagnosis['hybridSources'] = [];
  // Re-query hybrid with scores
  const hybridRows = (await sql.query(
    `SELECT * FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, NULL)`,
    [q, `[${vec.join(',')}]`, RETRIEVE_K],
  )) as Array<{ source_id: string; source_type: string; content: string; metadata: unknown; bm25_score: number; vector_score: number; combined_score: number }>;
  for (const r of hybridRows.filter((r) => r.source_type === 'commentary')) {
    const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
    const m = meta as RetrievedChunk['metadata'];
    hybridSources.push({ author: m.author, tradition: m.tradition, score: Number(r.combined_score), bm25: Number(r.bm25_score), vec: Number(r.vector_score), snippet: r.content.slice(0, 80) });
  }

  const vectorTraditions = new Set(vectorPool.map((r) => r.metadata.tradition ?? 'unknown')).size;
  const hybridTraditions = new Set(hybridPool.map((r) => r.metadata.tradition ?? 'unknown')).size;

  if (vectorPool.length === 0) {
    return { query: q, outcome: 'empty', composeMs: 0, attempts: 0, vectorSources, hybridSources, vectorTraditions, hybridTraditions, failureCategory: 'retrieval', failureNotes: 'No embeddings matched' };
  }

  // Compose using production path (vector retrieval)
  const voices = selectVoices(vectorPool, COMPOSE_VOICES);
  const voiceTraditions = new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'));
  const system = buildSystemPrompt();
  const user = buildUserPrompt(q, voices);
  const lookup = buildCorpusLookup(voices);
  const sections = voices.map((r) => ({ author: r.metadata.author, work: r.metadata.sourceTitle, tradition: r.metadata.tradition ?? 'unknown' }));
  const ctx = { sectionIds: voices.map((_, i) => i + 1), traditions: [...voiceTraditions] };

  let final: TeacherResponse | null = null;
  let totalMs = 0, attempts = 0;
  let lastViolations: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    attempts++;
    let raw: string, ms: number;
    try {
      ({ text: raw, ms } = await composeOnce(system, attempt === 0 ? user : `${user}\n\n--- retry: fix violations ---`));
    } catch (e) {
      lastViolations = [`llm_error: ${(e as Error).message}`];
      continue;
    }
    totalMs += ms;
    let parsed: unknown;
    try {
      parsed = normalizeContract(JSON.parse(raw), sections);
    } catch {
      lastViolations = ['json_parse: not valid JSON'];
      continue;
    }
    const vr = await verifyV1(parsed, lookup, ctx);
    if (vr.ok) { final = parsed as TeacherResponse; break; }
    lastViolations = vr.violations.map((v) => `${v.check}: ${v.message}`);
  }

  const diag: Diagnosis = {
    query: q,
    outcome: final ? 'composed' : 'fallback',
    composeMs: totalMs,
    attempts,
    vectorSources,
    hybridSources,
    vectorTraditions,
    hybridTraditions,
  };

  if (final) {
    diag.framing = final.blocks.find((b) => b.type === 'framing')?.text ?? '(none)';
    diag.voices = final.blocks.filter((b) => b.type === 'voice').map((b) => ({
      author: (b as any).attribution.author,
      tradition: (b as any).attribution.tradition,
      quoteSnippet: ((b as any).quote as string).slice(0, 100),
      sectionId: (b as any).section_id,
    }));
    diag.failureCategory = 'none';
  } else {
    diag.violations = lastViolations;
    // Categorize
    if (vectorTraditions < 2) {
      diag.failureCategory = 'coverage';
      diag.failureNotes = `Only ${vectorTraditions} tradition(s) in retrieval`;
    } else if (lastViolations.some((v) => v.includes('quote') || v.includes('substring') || v.includes('verbatim'))) {
      diag.failureCategory = 'prompt';
      diag.failureNotes = 'Model had correct sources but mangled quotes';
    } else if (lastViolations.some((v) => v.includes('diversity') || v.includes('tradition'))) {
      diag.failureCategory = 'coverage';
      diag.failureNotes = `Diversity check failed despite ${vectorTraditions} traditions in retrieval`;
    } else if (lastViolations.some((v) => v.includes('json') || v.includes('schema') || v.includes('section'))) {
      diag.failureCategory = 'prompt';
      diag.failureNotes = 'Schema/structural error in model output';
    } else {
      diag.failureCategory = 'retrieval';
      diag.failureNotes = `Violations: ${lastViolations.join('; ')}`;
    }
  }

  return diag;
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`PIPELINE DIAGNOSTIC — ${QUERIES.length} queries, model=${MODEL}, voices=${COMPOSE_VOICES}`);
  console.log(`${'='.repeat(80)}\n`);

  const results: Diagnosis[] = [];
  for (const q of QUERIES) {
    console.log(`\n--- Q: ${q} ---`);
    const d = await diagnoseQuery(q);
    results.push(d);

    // Print compact summary
    console.log(`  outcome: ${d.outcome} (${d.attempts} attempt(s), ${(d.composeMs / 1000).toFixed(1)}s)`);
    console.log(`  vector retrieval: ${d.vectorSources.length} sources, ${d.vectorTraditions} tradition(s)`);
    for (const s of d.vectorSources) {
      console.log(`    ${s.score.toFixed(3)} | ${(s.tradition ?? '?').padEnd(12)} | ${s.author.padEnd(25)} | ${s.snippet}…`);
    }
    console.log(`  hybrid retrieval: ${d.hybridSources.length} sources, ${d.hybridTraditions} tradition(s)`);
    for (const s of d.hybridSources) {
      console.log(`    ${s.score.toFixed(3)} (bm25=${s.bm25.toFixed(3)} vec=${s.vec.toFixed(3)}) | ${(s.tradition ?? '?').padEnd(12)} | ${s.author.padEnd(25)} | ${s.snippet}…`);
    }

    if (d.outcome === 'composed') {
      console.log(`  framing: "${d.framing}"`);
      for (const v of d.voices!) {
        console.log(`    voice[${v.sectionId}] ${v.author} (${v.tradition}): "${v.quoteSnippet}…"`);
      }
    } else if (d.outcome === 'fallback') {
      console.log(`  FAILURE: ${d.failureCategory} — ${d.failureNotes}`);
      for (const v of d.violations!) console.log(`    violation: ${v}`);
    }

    // Flag if hybrid would have been materially different
    const vecAuthors = new Set(d.vectorSources.map((s) => s.author));
    const hybAuthors = new Set(d.hybridSources.map((s) => s.author));
    const hybOnly = [...hybAuthors].filter((a) => !vecAuthors.has(a));
    const vecOnly = [...vecAuthors].filter((a) => !hybAuthors.has(a));
    if (hybOnly.length || vecOnly.length) {
      console.log(`  *** RETRIEVAL DIFF: hybrid adds [${hybOnly.join(', ')}], vector-only has [${vecOnly.join(', ')}]`);
    }
  }

  // Summary table
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);
  const composed = results.filter((r) => r.outcome === 'composed').length;
  const fallback = results.filter((r) => r.outcome === 'fallback').length;
  const empty = results.filter((r) => r.outcome === 'empty').length;
  console.log(`  ${results.length} queries: ${composed} composed, ${fallback} fallback, ${empty} empty`);

  const byCategory = new Map<string, Diagnosis[]>();
  for (const r of results) {
    const cat = r.failureCategory ?? 'none';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }
  console.log('\n  Failure breakdown:');
  for (const [cat, items] of byCategory) {
    if (cat === 'none') continue;
    console.log(`    ${cat}: ${items.length}`);
    for (const d of items) console.log(`      - "${d.query.slice(0, 50)}…" — ${d.failureNotes}`);
  }

  // Hybrid vs vector comparison
  console.log('\n  Retrieval method comparison:');
  let hybridBetter = 0, vectorBetter = 0, same = 0;
  for (const r of results) {
    if (r.hybridTraditions > r.vectorTraditions) hybridBetter++;
    else if (r.vectorTraditions > r.hybridTraditions) vectorBetter++;
    else same++;
  }
  console.log(`    Tradition diversity: hybrid better ${hybridBetter}, vector better ${vectorBetter}, same ${same}`);
  // Score comparison — how often does hybrid resurface a source vector missed?
  let totalNewSources = 0;
  for (const r of results) {
    const vecIds = new Set(r.vectorSources.map((s) => `${s.author}:${s.snippet.slice(0, 40)}`));
    const hybNew = r.hybridSources.filter((s) => !vecIds.has(`${s.author}:${s.snippet.slice(0, 40)}`));
    totalNewSources += hybNew.length;
  }
  console.log(`    Total new sources hybrid would surface (not in vector top-6): ${totalNewSources}`);

  const avgMs = results.reduce((s, r) => s + r.composeMs, 0) / results.filter((r) => r.composeMs > 0).length;
  console.log(`\n  Avg compose latency: ${(avgMs / 1000).toFixed(1)}s`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
