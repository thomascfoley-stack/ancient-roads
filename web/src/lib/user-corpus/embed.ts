// Batched embedding for user chunks (§6, §8: "batched, off the request path").
//
// Deliberately NOT reusing web/src/lib/teacher/deepinfra.ts: `embedQuery` takes one string, has no
// retry, and truncates to 1800 chars. Truncation is the thing that must not happen here — a chunk
// silently embedded on its first 1800 characters returns a vector for text the user can never
// retrieve, and the chunker already guarantees ≤1200 so truncation would only ever mask a bug.

import { EMBEDDING_API_MODEL, EMBEDDING_DIMS } from './model';
import { EMBED_MAX_CHARS } from './chunk';

/** DeepInfra's documented ceiling is 200 concurrent requests per model; corpus ingest sits at 64. */
export const EMBED_BATCH = 64;

const ENDPOINT = 'https://api.deepinfra.com/v1/openai/embeddings';
const TIMEOUT_MS = 90_000;
const ATTEMPTS = 5;

export class EmbeddingUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingUnavailable';
  }
}

function apiKey(): string {
  const k = process.env.DEEPINFRA_API_KEY;
  if (!k) throw new EmbeddingUnavailable('DEEPINFRA_API_KEY is not set');
  return k;
}

/** 429 and 5xx are transient; 4xx is our fault and must not be retried into a rate limit. */
const retryable = (status: number) => status === 429 || status >= 500;

async function embedBatch(texts: string[], key: string): Promise<number[][]> {
  for (const t of texts) {
    // Contract breach, loud. The chunker bounds every chunk at EMBED_MAX_CHARS; if one arrives
    // over, the chunker is broken and embedding it would hide that behind a truncated vector.
    if (t.length > EMBED_MAX_CHARS) {
      throw new Error(`contract breach: chunk ${t.length} chars > ${EMBED_MAX_CHARS} — truncation would fire`);
    }
  }

  let lastError = '';
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: EMBEDDING_API_MODEL, input: texts, encoding_format: 'float' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status}: ${body.slice(0, 200)}`;
        if (!retryable(res.status)) throw new EmbeddingUnavailable(`embed ${lastError}`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const json = (await res.json()) as { data?: { embedding: number[] }[] };
      const vectors = json.data?.map((d) => d.embedding);
      if (!vectors || vectors.length !== texts.length) {
        throw new EmbeddingUnavailable(`embed returned ${vectors?.length ?? 0} vectors for ${texts.length} inputs`);
      }
      for (const v of vectors) {
        // A wrong width is not storable in vector(1024) and would fail at insert with a message
        // about the column rather than about the model. Fail here, where the cause is visible.
        if (v.length !== EMBEDDING_DIMS) {
          throw new EmbeddingUnavailable(`embed returned ${v.length} dims, expected ${EMBEDDING_DIMS}`);
        }
      }
      return vectors;
    } catch (e) {
      if (e instanceof EmbeddingUnavailable && !/^embed (429|5\d\d)/.test(e.message)) throw e;
      lastError = String((e as Error)?.message ?? e);
      if (attempt === ATTEMPTS - 1) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new EmbeddingUnavailable(`embed failed after ${ATTEMPTS} attempts: ${lastError}`);
}

/**
 * Embed chunk texts in order. Batched, sequential across batches — a user's document is tens of
 * chunks, not thousands, and parallel batches would spend the account's concurrency budget on one
 * upload while every other user's drain waits.
 */
export async function embedChunks(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = apiKey();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH), key)));
  }
  return out;
}
