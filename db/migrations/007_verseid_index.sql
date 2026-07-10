-- ============================================================
-- 007: verseId expression index for reference-routing range injection
-- ============================================================
-- ADDITIVE, non-breaking. Reference/pericope intent routing injects the top
-- vector matches WITHIN a named passage's verse range into the reranker pool
-- (docs/REFERENCE_ROUTING_DESIGN.md §5). The injection filters
-- (metadata->>'verseId')::int BETWEEN lo AND hi — this partial expression index
-- makes that range filter selective + fast (a MATERIALIZED CTE range-scan, not
-- an HNSW post-filter), keeping the injection off the request-path hot loop.
-- Run as neondb_owner: DATABASE_URL=<owner> node db/apply-migration.mjs db/migrations/007_verseid_index.sql
-- ============================================================

CREATE INDEX IF NOT EXISTS embeddings_commentary_verseid_idx
  ON embeddings (((metadata->>'verseId')::int))
  WHERE user_id IS NULL AND source_type = 'commentary';
