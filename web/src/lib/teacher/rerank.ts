import 'server-only';

const RERANK_MODEL = 'Qwen/Qwen3-Reranker-0.6B';
const BASE_URL = `https://api.deepinfra.com/v1/inference/${RERANK_MODEL}`;

function apiKey(): string {
  const k = process.env.DEEPINFRA_API_KEY;
  if (!k) throw new Error('DEEPINFRA_API_KEY is not set');
  return k;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

// topN defaults to "all" so callers can get the full reranked order (needed by
// reference-routing's on-passage floor). Only the trivial 0/1-doc case skips the
// API; anything larger is actually reranked, then sliced to topN.
export async function rerank(
  query: string,
  documents: string[],
  topN: number = documents.length,
): Promise<RerankResult[]> {
  if (documents.length <= 1) {
    return documents.map((_, i) => ({ index: i, relevance_score: 1 }));
  }

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      queries: [query],
      documents,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Rerank failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { scores: number[] };
  const scored = json.scores.map((score, index) => ({ index, relevance_score: score }));
  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  return scored.slice(0, topN);
}
