import { getDb } from '../db';
import { rerank } from './rerank';

// A retrieved commentary chunk, fully hydrated (attribution + content on the row).
export interface RetrievedChunk {
  sourceId: string;
  score: number; // cosine similarity or combined/rerank score, 0..1
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

// Hybrid BM25+vector retrieval with cross-encoder reranking.
//
// 1. hybrid_search (DB function) fuses BM25 keyword matches with vector cosine
//    similarity over a wide candidate pool (CANDIDATE_POOL results).
// 2. BGE-reranker-v2-m3 cross-encoder rescores the candidates against the raw
//    query, picking the topically best `limit` results.
//
// The reranker is the direct fix for the "semantically similar but topically
// wrong" precision bug: it understands that "good shepherd" means John 10, not
// any mention of shepherds.
const CANDIDATE_POOL = 20;

export async function retrieveCommentary(
  queryVec: number[],
  limit = 6,
  opts?: { query?: string },
): Promise<RetrievedChunk[]> {
  const sql = getDb();
  const vecStr = `[${queryVec.join(',')}]`;
  const queryText = opts?.query ?? '';

  let candidates: RetrievedChunk[];

  if (queryText) {
    // Hybrid: BM25 (plainto_tsquery OR semantics) + vector cosine fusion
    const rows = (await sql.query(
      `SELECT * FROM hybrid_search($1, $2::vector, $3, 0.4, 0.6, NULL)`,
      [queryText, vecStr, CANDIDATE_POOL],
    )) as Array<{
      source_id: string; content: string; metadata: unknown;
      bm25_score: number; vector_score: number; combined_score: number;
    }>;

    candidates = rows.map((r) => ({
      sourceId: r.source_id,
      score: Number(r.combined_score),
      content: r.content,
      metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RetrievedChunk['metadata'],
    }));
  } else {
    // Fallback: pure vector (no query text available)
    const rows = (await sql.query(
      `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
       FROM embeddings
       WHERE user_id IS NULL AND source_type = 'commentary'
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vecStr, CANDIDATE_POOL],
    )) as Array<{ source_id: string; score: number; content: string; metadata: RetrievedChunk['metadata'] }>;

    candidates = rows.map((r) => ({
      sourceId: r.source_id,
      score: Number(r.score),
      content: r.content,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    }));
  }

  if (candidates.length <= limit) return candidates;

  // Rerank: cross-encoder rescores the candidate pool against the raw query,
  // picking the topically best `limit` results.
  try {
    const docs = candidates.map((c) => c.content.slice(0, 1200));
    const ranked = await rerank(queryText || 'commentary', docs, limit);
    return ranked.map((r) => ({
      ...candidates[r.index]!,
      score: r.relevance_score,
    }));
  } catch {
    // Reranker failure: fall back to the hybrid/vector ordering
    return candidates.slice(0, limit);
  }
}
