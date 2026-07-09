-- ============================================================
-- 004: Fix hybrid_search BM25 component
-- ============================================================
-- The v1 hybrid_search used websearch_to_tsquery (AND semantics), which
-- returned 0 BM25 hits for almost every query because short embedding
-- chunks rarely contain ALL query terms. Switching to plainto_tsquery
-- (OR semantics) so BM25 actually contributes to retrieval.
--
-- Also: filter to commentary only (source_type = 'commentary') and
-- widen the candidate pool (match_count * 5 for BM25, * 3 for vector)
-- so the FULL OUTER JOIN has more to fuse.
-- ============================================================

CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding vector(1024),
  match_count INT DEFAULT 10,
  bm25_weight REAL DEFAULT 0.4,
  vector_weight REAL DEFAULT 0.6,
  filter_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id TEXT,
  content TEXT,
  metadata JSONB,
  bm25_score REAL,
  vector_score REAL,
  combined_score REAL
)
LANGUAGE sql STABLE AS $$
  WITH bm25 AS (
    SELECT e.id, ts_rank_cd(e.tsv, plainto_tsquery('english', query_text)) AS score
    FROM embeddings e
    WHERE e.tsv @@ plainto_tsquery('english', query_text)
      AND e.source_type = 'commentary'
      AND (filter_user_id IS NULL OR e.user_id IS NULL OR e.user_id = filter_user_id)
    ORDER BY score DESC
    LIMIT match_count * 5
  ),
  vec AS (
    SELECT e.id, 1 - (e.embedding <=> query_embedding) AS score
    FROM embeddings e
    WHERE e.source_type = 'commentary'
      AND (filter_user_id IS NULL OR e.user_id IS NULL OR e.user_id = filter_user_id)
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      COALESCE(b.id, v.id) AS id,
      COALESCE(b.score, 0)::REAL AS bm25_score,
      COALESCE(v.score, 0)::REAL AS vector_score,
      (COALESCE(b.score, 0) * bm25_weight + COALESCE(v.score, 0) * vector_weight)::REAL AS combined_score
    FROM bm25 b FULL OUTER JOIN vec v ON b.id = v.id
  )
  SELECT
    e.id, e.source_type, e.source_id, e.content, e.metadata,
    c.bm25_score, c.vector_score, c.combined_score
  FROM combined c
  JOIN embeddings e ON e.id = c.id
  ORDER BY c.combined_score DESC
  LIMIT match_count;
$$;
