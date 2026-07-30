// Server-only DeepInfra clients for the teacher: the BGE query embedder (must
// match the model that embedded the corpus — BAAI/bge-large-en-v1.5) and the
// Qwen composer. No OpenAI/Anthropic. Keys come from server env only.

import 'server-only';

const EMBED_MODEL = 'BAAI/bge-large-en-v1.5';
// Qwen3.5-35B-A3B: 3B-active MoE, ~4–5s/compose on DeepInfra. The prior name
// 'Qwen3.6-35B-A3B' does not exist on DeepInfra — it was silently auto-forwarded
// to a slow fallback (~60s/compose; the INFRA.md model-drift hazard). Correcting
// the name is the single biggest latency win in the teacher path.
const COMPOSE_MODEL = 'Qwen/Qwen3.5-35B-A3B';
const BASE_URL = 'https://api.deepinfra.com/v1/openai';
const MAX_INPUT_CHARS = 1800; // BGE 512-token limit ≈ 1800 chars worst case

function apiKey(): string {
  const k = process.env.DEEPINFRA_API_KEY;
  if (!k) throw new Error('DEEPINFRA_API_KEY is not set');
  return k;
}

// Embed a single query. Returns a 1024-dim vector comparable with the stored corpus.
export async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: [text.slice(0, MAX_INPUT_CHARS)],
      encoding_format: 'float',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vec = json.data[0]?.embedding;
  if (!vec || vec.length !== 1024) {
    throw new Error(`Expected a 1024-dim embedding, got ${vec?.length ?? 'none'}`);
  }
  return vec;
}

export const composeModel = COMPOSE_MODEL;

// One composition call. Returns the model's raw text (JSON, fences/think stripped).
export async function compose(
  systemPrompt: string,
  userPrompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: COMPOSE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 6000,
      // Qwen3 thinking mode wastes tokens/latency; disable it deterministically.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Compose request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  let content = json.choices[0]?.message?.content ?? '';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  return content;
}
