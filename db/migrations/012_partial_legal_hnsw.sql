-- ============================================================
-- 012: partial HNSW index over the LEGAL embeddings — kills post-filter starvation
-- ============================================================
-- The defect, measured on prod 2026-07-14 (scripts/diagnose-prod.mjs §6):
--   legalBasePoolSql(50) returned **5**.
-- The full-table HNSW index (idx_embeddings_vector) walks the whole 190k graph at
-- hnsw.ef_search=40, collects 40 nearest neighbours, and THEN the selective
-- LEGAL_CORPUS_FILTER (~44% of the table) guts them — so asking for 50 legal rows
-- yields ~5. CANDIDATE_POOL=20 has been a fiction; the teacher chose from ~5 passages.
--
-- Fix: an HNSW index built ONLY over the legal rows. Every neighbour it returns is
-- already legal, so a modest ef_search fills the pool directly — no iterative_scan,
-- no re-walk of the full graph (which is where Phase A's 12–14s latency came from).
--
-- ★ The WHERE predicate MUST stay byte-identical to LEGAL_CORPUS_FILTER in
-- web/src/lib/teacher/routing.ts, or the planner will not use a partial index (that is
-- exactly how migration 009 died). test/invariants/legal-hnsw-index-sync enforces it.
--
-- CONCURRENTLY: additive, non-locking, touches no data rows. MUST run outside a txn.
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_legal;
--   Run as neondb_owner.
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_legal
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND source_type = 'commentary' AND (
       metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
    OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
    OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
    OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')
  ));
