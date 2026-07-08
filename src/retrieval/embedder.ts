import type { Embedder } from './types';

const DIMS = 1024;

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

      const res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({ model, input: texts, encoding_format: 'float' }),
      });

      if (!res.ok) {
        throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      // The API may return items out of order; restore input order by index.
      const ordered = [...json.data].sort((a, b) => a.index - b.index);
      if (ordered.length !== texts.length) {
        throw new Error(`Embedding count mismatch: got ${ordered.length}, expected ${texts.length}`);
      }
      return ordered.map((d) => d.embedding);
    },
  };
}
