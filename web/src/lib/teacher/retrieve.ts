import { getDb } from '../db';

// A retrieved commentary chunk, fully hydrated (attribution + content on the row).
export interface RetrievedChunk {
  sourceId: string;
  score: number; // cosine similarity, 0..1
  content: string;
  metadata: {
    author: string;
    year: number | null;
    tradition: string | null;
    sourceTitle: string;
    sourceUrl: string | null;
    verseId: number;
    verseEnd: number;
    model: string;
  };
}

// Pure-vector search over platform commentary embeddings (user_id IS NULL). The
// query vector MUST come from the same model that embedded the corpus (BGE).
// Parameterized; app_runtime role + RLS bind. No BM25/hybrid yet — that lands
// with the full-corpus index.
export async function retrieveCommentary(queryVec: number[], limit = 6): Promise<RetrievedChunk[]> {
  const sql = getDb();
  const vecStr = `[${queryVec.join(',')}]`;

  const rows = (await sql.query(
    `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
     FROM embeddings
     WHERE user_id IS NULL AND source_type = 'commentary'
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vecStr, limit],
  )) as Array<{ source_id: string; score: number; content: string; metadata: RetrievedChunk['metadata'] }>;

  return rows.map((r) => ({
    sourceId: r.source_id,
    score: Number(r.score),
    content: r.content,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
  }));
}
