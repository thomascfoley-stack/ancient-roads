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

      const MAX_RETRIES = 3;
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
            signal: AbortSignal.timeout(30_000),
          });

          if (!res.ok) {
            const body = await res.text();
            if (res.status >= 500 || res.status === 429) {
              lastErr = new Error(`Embedding request failed: ${res.status} ${body}`);
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
              continue;
            }
            throw new Error(`Embedding request failed: ${res.status} ${body}`);
          }

          const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
          return parseResponse(json, texts.length);
        } catch (e) {
          lastErr = e as Error;
          if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          if (attempt < MAX_RETRIES - 1 && (e as Error).message?.includes('fetch')) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw e;
        }
      }
      throw lastErr ?? new Error('Embedding failed after retries');
    },
  };
}

function parseResponse(json: { data: { index: number; embedding: number[] }[] }, expected: number): number[][] {
  const ordered = [...json.data].sort((a, b) => a.index - b.index);
  if (ordered.length !== expected) {
    throw new Error(`Embedding count mismatch: got ${ordered.length}, expected ${expected}`);
  }
  return ordered.map((d) => d.embedding);
}
