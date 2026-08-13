-- ============================================================
-- 114: idx_embeddings_served_historian — the historian lane's partial HNSW index
-- ============================================================
-- WHY. The historian lane was ruled 2026-08-13 (corpus-backlog decision #6, "build it") and
-- HISTORIAN_CORPUS_FILTER shipped as `(served AND source_type = 'historian')` — but 044
-- predates the ruling, so no partial index byte-matches the lane's predicate. Without one the
-- lane pool query post-filters the full-table HNSW graph: correct results, silently starved
-- neighbour list (the migration-009 mechanism, blunted by the lane's small LIMIT but real).
-- The routing.ts comment at HISTORIAN_CORPUS_FILTER recorded this as the known pre-flip gap;
-- this migration closes it before the josephus serve-flip.
--
-- SHAPE: exactly the 044 pattern (044_embeddings_served_expand.sql:142-145) — same opclass,
-- same conjunct shape, NEW final name, no drop/rename (nothing serves under this name today,
-- so there is no window to cover). Lockstep entry added to
-- web/test/invariants/legal-hnsw-index-sync.test.ts in the same commit — the guard and the
-- index ship together or not at all.
--
-- SCALE: dev holds 6,492 historian rows (josephus-whiston, all served=false at apply time —
-- a partial index over zero served historian rows builds effectively instantly). Prod holds
-- zero historian rows until the corpus-copy lands. The serve-flip afterward is an UPDATE,
-- not an index build.
--
-- CONCURRENTLY: run via `db/apply-migration-concurrent.mjs` (splits on --SPLIT--). Neither
-- CREATE INDEX CONCURRENTLY nor DROP INDEX CONCURRENTLY may run inside a txn block.
-- Run as neondb_owner. Prod apply needs MIGRATE_ALLOW_PROD=1 (owner go, per occasion).
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_served_historian;
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_served_historian
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type = 'historian');
