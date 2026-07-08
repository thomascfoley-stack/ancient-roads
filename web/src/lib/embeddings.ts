import { getDb } from './db';

const JINA_API_URL = 'https://api.jina.ai/v1/embeddings';

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(JINA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      input: texts,
      dimensions: 1024,
      task: 'retrieval.passage',
    }),
  });

  if (!res.ok) {
    throw new Error(`Jina embed failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(JINA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      input: [text],
      dimensions: 1024,
      task: 'retrieval.query',
    }),
  });

  if (!res.ok) {
    throw new Error(`Jina embed failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}

export interface SearchResult {
  id: string;
  source_type: string;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
  bm25_score: number;
  vector_score: number;
  combined_score: number;
}

export async function hybridSearch(
  query: string,
  userId: string | null,
  limit = 10,
): Promise<SearchResult[]> {
  const queryVec = await embedQuery(query);
  const sql = getDb();
  const vecStr = `[${queryVec.join(',')}]`;

  const results = await sql.query(
    `SELECT * FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, $4)`,
    [query, vecStr, limit, userId],
  );

  return results as SearchResult[];
}
