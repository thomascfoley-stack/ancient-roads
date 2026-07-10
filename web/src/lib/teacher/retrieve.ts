import { getDb } from '../db';
import { rerank } from './rerank';
import { resolveIntent } from '../../bible/pericopes';
import type { VerseRange } from '../../bible/ref-parse';
import { CANDIDATE_POOL, RERANK_DOC_CHARS, injectionSql, mergeById, floorOnRange } from './routing';

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
// any mention of shepherds. The routing orchestration (inject cap, injection SQL,
// pool merge, on-passage floor) lives in ./routing — the SINGLE source shared with
// the accuracy eval so the measured number can't drift from this shipped path.

// The top on-range vector matches, hydrated to RetrievedChunk (SQL from ./routing).
async function fetchOnRange(
  sql: ReturnType<typeof getDb>,
  vecStr: string,
  ranges: readonly VerseRange[],
): Promise<RetrievedChunk[]> {
  const rows = (await sql.query(injectionSql(ranges), [vecStr])) as Array<{
    source_id: string; score: number; content: string; metadata: unknown;
  }>;
  return rows.map((r) => ({
    sourceId: r.source_id,
    score: Number(r.score),
    content: r.content,
    metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RetrievedChunk['metadata'],
  }));
}

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

  // Reference/pericope routing. `intent.inject` = every named range (soft-boost
  // the pool, false-positive-safe); `intent.floor` = the high-confidence subset
  // (numeric refs + corroborated pericopes) that earns the reserved top slots.
  // Retrieval-only — the JSON contract + verifier are untouched, so the
  // concordance guarantee holds. Topical queries yield empty on both.
  const intent = queryText ? resolveIntent(queryText) : { inject: [], floor: [] };
  if (intent.inject.length > 0) {
    const injected = await fetchOnRange(sql, vecStr, intent.inject);
    candidates = mergeById(injected, candidates, (c) => c.sourceId);
  }

  if (candidates.length <= limit && intent.floor.length === 0) return candidates;

  // Rerank the full pool, then floor the top on-passage voices into the lead slots
  // (only for the high-confidence `floor` ranges) before taking `limit`.
  try {
    const docs = candidates.map((c) => c.content.slice(0, RERANK_DOC_CHARS));
    const ranked = await rerank(queryText || 'commentary', docs);
    let ordered = ranked.map((r) => ({ ...candidates[r.index]!, score: r.relevance_score }));
    if (intent.floor.length > 0) ordered = floorOnRange(ordered, intent.floor, (c) => c.metadata.verseId);
    return ordered.slice(0, limit);
  } catch {
    // Reranker failure: fall back to the hybrid/vector ordering
    return candidates.slice(0, limit);
  }
}
