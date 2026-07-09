import 'server-only';

const RERANK_MODEL = 'BAAI/bge-reranker-v2-m3';
const BASE_URL = 'https://api.deepinfra.com/v1/rerank';

function apiKey(): string {
  const k = process.env.DEEPINFRA_API_KEY;
  if (!k) throw new Error('DEEPINFRA_API_KEY is not set');
  return k;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

// Rerank candidate documents against a query using a cross-encoder.
// Returns indices sorted by relevance_score descending, capped at topN.
export async function rerank(
  query: string,
  documents: string[],
  topN: number,
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];
  if (documents.length <= topN) {
    return documents.map((_, i) => ({ index: i, relevance_score: 1 }));
  }

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents,
      top_n: topN,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Rerank failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { results: RerankResult[] };
  return json.results.sort((a, b) => b.relevance_score - a.relevance_score);
}
