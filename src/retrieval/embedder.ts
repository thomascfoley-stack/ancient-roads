import type { Embedder } from './types';

const DIMS = 1024;
const MAX_INPUT_CHARS = 1800; // BGE 512-token limit ≈ 1800 chars worst case

// Open-weight embedder via DeepInfra's standard chat-API-shaped /embeddings
// endpoint (no OpenAI/Anthropic). Default model is a 1024-dim open model to match
// the embeddings.embedding vector(1024) column. Swap the base URL for Nebius later
// behind this same interface.
export function createDeepInfraEmbedder(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Embedder {
  const model = opts.model ?? 'BAAI/bge-large-en-v1.5';
  const baseUrl = opts.baseUrl ?? 'https://api.deepinfra.com/v1/openai';

  return {
    model,
    dims: DIMS,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const MAX_RETRIES = 5;
      // Backoff between attempts — but never after the last one (no point sleeping
      // right before we give up and throw).
      const backoff = (attempt: number): Promise<void> =>
        attempt < MAX_RETRIES - 1
          ? new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
          : Promise.resolve();

      let lastErr: Error | undefined;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify({ model, input: texts.map(t => t.slice(0, MAX_INPUT_CHARS)), encoding_format: 'float' }),
            // Batch embeds (64 texts) can be slow under provider load; be patient.
            signal: AbortSignal.timeout(60_000),
          });

          if (!res.ok) {
            const body = await res.text();
            // 5xx/429 are transient — retry; other 4xx are our bug — fail fast.
            if (res.status >= 500 || res.status === 429) {
              lastErr = new Error(`Embedding request failed: ${res.status} ${body}`);
              await backoff(attempt);
              continue;
            }
            throw new Error(`Embedding request failed: ${res.status} ${body}`);
          }

          const json = (await res.json()) as {
            model?: string;
            data: { index: number; embedding: number[] }[];
          };
          return parseResponse(json, texts.length, model);
        } catch (e) {
          lastErr = e as Error;
          const name = (e as Error).name;
          const transient =
            name === 'TimeoutError' || name === 'AbortError' || e instanceof TypeError; // TypeError = fetch network failure
          if (!transient) throw e;
          await backoff(attempt);
        }
      }
      throw lastErr ?? new Error('Embedding failed after retries');
    },
  };
}

function parseResponse(
  json: { model?: string; data: { index: number; embedding: number[] }[] },
  expected: number,
  requestedModel: string,
): number[][] {
  // Provider-drift guard (EMBEDDINGS_DESIGN v2 D5 / I-1): DeepInfra has silently forwarded a
  // requested model to a substitute before (the Qwen3.6 compose incident, deepinfra.ts:9-11).
  // A wrong-model vector is 1024-dim too (Jina v3) — it would insert, join, and score cleanly.
  // The response's self-reported model is the only value the pipeline did not write; a missing
  // or mismatched one fails fast and is NOT retried (it cannot heal).
  if (json.model !== requestedModel) {
    throw new Error(
      `Embedding model mismatch: requested ${requestedModel}, provider returned ${json.model ?? 'none'}`,
    );
  }
  const ordered = [...json.data].sort((a, b) => a.index - b.index);
  if (ordered.length !== expected) {
    throw new Error(`Embedding count mismatch: got ${ordered.length}, expected ${expected}`);
  }
  for (const d of ordered) {
    // A wrong width fails at insert with a message about the vector(1024) column rather than
    // the model. Fail here, where the cause is visible (same rule as user-corpus/embed.ts).
    if (d.embedding.length !== DIMS) {
      throw new Error(`Embedding dims mismatch: got ${d.embedding.length}, expected ${DIMS}`);
    }
  }
  return ordered.map((d) => d.embedding);
}
