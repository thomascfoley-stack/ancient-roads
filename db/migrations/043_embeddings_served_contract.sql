-- ============================================================
-- 043 (CONTRACT): drop the pre-`served` partial HNSW indexes
-- ============================================================
-- The second half of 042's expand/contract pair. 042 built the served-predicated indexes under
-- new names and deliberately dropped nothing, so the old author-allowlist bundle and the new
-- served bundle could both plan onto a matching partial index across the deploy window.
--
-- ⚠ PRECONDITION, ENFORCED BY NOTHING MECHANICAL: the deployed web bundle must be one whose
-- routing.ts queries `served` (commit 4f14f17 or later), CONFIRMED LIVE — an /ask smoke test
-- returning voices, and EXPLAIN on the base pool showing idx_embeddings_served_legal. Applying
-- this while the OLD bundle is live removes the only indexes its predicates imply: the planner
-- falls back to the full-table HNSW at the shipped ef_search and the selective filter starves the
-- pool, silently (the migration-009 mechanism). The filed order sequences this as the LAST step
-- of the deploy session, and the step before it is exactly that confirmation.
--
-- ⚠ THIS CLOSES THE REDEPLOY WINDOW (audit, deploy-ops M2): after this migration, rolling back
-- to a pre-`served` deployment id restores a bundle whose predicates match NO partial index —
-- the same silent starvation. If an incident after this point requires redeploying an old
-- bundle, re-apply the old indexes FIRST: the contra-DDL is the four CREATE INDEX CONCURRENTLY
-- statements in 018_register_partial_indexes.sql (v5 predicates) and
-- 037_sermon_index_add_talks_to_farmers.sql (sermon v6). That is a real, rehearsable path — it
-- is written here so nobody has to derive it mid-incident.
--
-- NOT dropped, deliberately:
--   idx_embeddings_verseid_registers  (018)  register-scoped btree, no slug list, still implied
--                                            by lane on-range queries.
--   embeddings_commentary_verseid_idx (007)  commentary-scoped btree; the old injection path's
--                                            index. Harmless, and the FTS/static surfaces this
--                                            cutover does NOT move may still plan onto it.
--
-- CONCURRENTLY: run via db/apply-migration-concurrent.mjs. DROP INDEX CONCURRENTLY may not run
-- inside a transaction block; each statement is its own --SPLIT-- group. Run as neondb_owner.
-- ============================================================

SET lock_timeout = '5s';
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_legal;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_song_verse;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_sermon;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_theology;
