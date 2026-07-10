import { getDb } from '../db';
import { rerank } from './rerank';
import { resolveIntent } from '../../bible/pericopes';
import type { VerseRange } from '../../bible/ref-parse';

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
// Cap on injected on-passage candidates, so a false-positive reference detection
// can't flood the reranker pool (docs/REFERENCE_ROUTING_DESIGN.md §2).
const INJECT_CAP = 8;

// The top INJECT_CAP vector matches WITHIN the named passage's verse range(s).
// MATERIALIZED CTE range-scan (not an HNSW post-filter, which returns empty on a
// selective filter) — served by the 007 partial expression index on verseId.
async function fetchOnRange(
  sql: ReturnType<typeof getDb>,
  vecStr: string,
  ranges: readonly VerseRange[],
): Promise<RetrievedChunk[]> {
  const conds = ranges
    .map((r) => `(metadata->>'verseId')::int BETWEEN ${r.start} AND ${r.end}`)
    .join(' OR ');
  const rows = (await sql.query(
    `WITH inrange AS MATERIALIZED (
       SELECT source_id, content, metadata, embedding FROM embeddings
       WHERE user_id IS NULL AND source_type = 'commentary' AND (${conds})
     )
     SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
     FROM inrange ORDER BY embedding <=> $1::vector LIMIT ${INJECT_CAP}`,
    [vecStr],
  )) as Array<{ source_id: string; score: number; content: string; metadata: unknown }>;
  return rows.map((r) => ({
    sourceId: r.source_id,
    score: Number(r.score),
    content: r.content,
    metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RetrievedChunk['metadata'],
  }));
}

// FLOOR: reserve the top 2 slots for the best-reranked on-passage voices. The
// reranker alone drifts to semantically-near but off-reference passages (e.g.
// "1 Corinthians 13" → John 15 "greater love"); the floor pins the named passage
// to the lead (measured: verse-ref HIT=1 46%→96%, no full-corpus regression).
function floorOnRange(ordered: RetrievedChunk[], ranges: readonly VerseRange[]): RetrievedChunk[] {
  const onRange = (c: RetrievedChunk) =>
    ranges.some((r) => c.metadata.verseId >= r.start && c.metadata.verseId <= r.end);
  const promote = ordered.filter(onRange).slice(0, 2);
  const rest = ordered.filter((c) => !promote.includes(c));
  return [...promote, ...rest];
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

  // Reference/pericope routing (soft-boost). If the query names a passage, inject
  // that passage's top voices into the candidate pool. Retrieval-only — the JSON
  // contract + verifier are untouched, so the concordance guarantee holds. Topical
  // queries resolve to no ranges and take the path unchanged.
  const ranges = queryText ? resolveIntent(queryText) : [];
  if (ranges.length > 0) {
    const injected = await fetchOnRange(sql, vecStr, ranges);
    const seen = new Set<string>();
    const merged: RetrievedChunk[] = [];
    for (const c of [...injected, ...candidates]) {
      if (!seen.has(c.sourceId)) { seen.add(c.sourceId); merged.push(c); }
    }
    candidates = merged;
  }

  if (candidates.length <= limit && ranges.length === 0) return candidates;

  // Rerank the full pool, then (for referenced queries) floor the top on-passage
  // voices into the lead slots before taking `limit`.
  try {
    const docs = candidates.map((c) => c.content.slice(0, 1200));
    const ranked = await rerank(queryText || 'commentary', docs);
    let ordered = ranked.map((r) => ({ ...candidates[r.index]!, score: r.relevance_score }));
    if (ranges.length > 0) ordered = floorOnRange(ordered, ranges);
    return ordered.slice(0, limit);
  } catch {
    // Reranker failure: fall back to the hybrid/vector ordering
    return candidates.slice(0, limit);
  }
}
