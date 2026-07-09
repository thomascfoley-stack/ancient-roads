// Full rendered answers, OLD model vs NEW pipeline, same queries — to judge
// that answer quality held, not just latency. Prints framing + each cited voice
// (author, tradition, verbatim quote) exactly as the client would render it.
//
//   npx tsx --env-file=.env.local src/scripts/compare-answers.mts

import { neon } from '@neondatabase/serverless';
import { buildSystemPrompt, buildUserPrompt } from '../lib/teacher/prompt.ts';
import { buildCorpusLookup } from '../lib/teacher/corpus.ts';
import { normalizeContract } from '../lib/teacher/normalize-contract.ts';
import { verifyV1 } from '../verifier/v1.ts';
import type { RetrievedChunk } from '../lib/teacher/retrieve.ts';
import type { TeacherResponse } from '../contract/types.ts';

const apiKey = process.env.DEEPINFRA_API_KEY!;
const sql = neon((process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/^"|"$/g, ''));

const ALL_QUERIES = [
  'What does the Gospel of John say about the Word becoming flesh?',
  'How have commentators understood being born again?',
  'What have commentators said about the good shepherd?',
  'What is said about the vine and the branches?',
];
const QUERIES = process.env.ONLY ? ALL_QUERIES.filter((q) => q.toLowerCase().includes(process.env.ONLY!.toLowerCase())) : ALL_QUERIES;

interface Cfg { label: string; model: string; voices: number; normalize: boolean }
const OLD: Cfg = { label: 'OLD', model: 'Qwen/Qwen3.6-35B-A3B', voices: 6, normalize: false };
const NEW: Cfg = { label: 'NEW', model: 'Qwen/Qwen3.5-35B-A3B', voices: Number(process.env.NEW_VOICES ?? 3), normalize: true };

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: [text.slice(0, 1800)], encoding_format: 'float' }),
  });
  return ((await res.json()) as { data: { embedding: number[] }[] }).data[0]!.embedding;
}
async function retrieve(vec: number[], limit: number): Promise<RetrievedChunk[]> {
  const rows = (await sql.query(
    `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata FROM embeddings
     WHERE user_id IS NULL AND source_type = 'commentary' ORDER BY embedding <=> $1::vector LIMIT $2`,
    [`[${vec.join(',')}]`, limit],
  )) as Array<{ source_id: string; score: number; content: string; metadata: RetrievedChunk['metadata'] }>;
  return rows.map((r) => ({ sourceId: r.source_id, score: Number(r.score), content: r.content, metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata }));
}
async function composeOnce(model: string, system: string, user: string): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const res = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 6000, chat_template_kwargs: { enable_thinking: false } }),
    signal: AbortSignal.timeout(180_000),
  });
  let c = ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content;
  c = c.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  return { text: c, ms: performance.now() - t0 };
}
function selectVoices(pool: RetrievedChunk[], n: number): RetrievedChunk[] {
  if (pool.length <= n) return pool;
  const top = pool.slice(0, n);
  const t = new Set(top.map((r) => r.metadata.tradition ?? 'unknown'));
  if (t.size >= 2) return top;
  const other = pool.find((r) => (r.metadata.tradition ?? 'unknown') !== [...t][0]);
  return other ? [...top.slice(0, n - 1), other] : top;
}

async function runOne(cfg: Cfg, q: string, pool: RetrievedChunk[]): Promise<void> {
  const voices = cfg.normalize ? selectVoices(pool, cfg.voices) : pool.slice(0, cfg.voices);
  const traditions = new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'));
  const system = buildSystemPrompt();
  const user = buildUserPrompt(q, voices);
  const lookup = buildCorpusLookup(voices);
  const sections = voices.map((r) => ({ author: r.metadata.author, work: r.metadata.sourceTitle, tradition: r.metadata.tradition ?? 'unknown' }));
  const ctx = { sectionIds: voices.map((_, i) => i + 1), traditions: [...traditions] };

  let final: TeacherResponse | null = null, totalMs = 0, attempts = 0;
  for (let attempt = 0; attempt <= 1; attempt++) {
    attempts++;
    let raw: string, ms: number;
    try { ({ text: raw, ms } = await composeOnce(cfg.model, system, attempt === 0 ? user : `${user}\n\n--- retry: fix violations ---`)); } catch { continue; }
    totalMs += ms;
    let parsed: unknown;
    try { parsed = cfg.normalize ? normalizeContract(JSON.parse(raw), sections) : JSON.parse(raw); } catch { continue; }
    const vr = await verifyV1(parsed, lookup, ctx);
    if (vr.ok) { final = parsed as TeacherResponse; break; }
  }

  console.log(`\n  ── ${cfg.label} (${cfg.model.split('/')[1]}, ${cfg.voices} voices) — ${(totalMs / 1000).toFixed(1)}s, ${attempts} attempt(s) ──`);
  if (!final) { console.log('     [fell back to raw sources — no composed answer]'); return; }
  for (const b of final.blocks) {
    if (b.type === 'framing') console.log(`     FRAMING: ${b.text}`);
    else if (b.type === 'voice') console.log(`     • ${b.attribution.author} (${b.attribution.tradition}): “${b.quote}”`);
  }
}

async function main() {
  for (const q of QUERIES) {
    console.log(`\n${'='.repeat(78)}\nQ: ${q}`);
    const pool = await retrieve(await embedQuery(q), 6);
    await runOne(OLD, q, pool);
    await runOne(NEW, q, pool);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
