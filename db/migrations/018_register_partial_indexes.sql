-- ============================================================
-- 018 v3 (reconcile-A 2026-07-18): register-aware partial indexes, ZERO-WINDOW rebuild
-- ============================================================
-- Predicates must stay in lockstep with LEGAL_CORPUS_FILTER /
-- SONG_VERSE_CORPUS_FILTER in routing.ts (test/invariants/legal-hnsw-index-sync).
-- The served lists were pruned to ingested+clean works only (quarantined and
-- never-ingested slugs removed); the indexes rebuild here to match.
--
-- v3 change: this migration used to DROP each live serving index and then rebuild it
-- under the SAME name. On prod that opens the exact window migration 009 died in — while
-- the HNSW graph rebuilds there is no partial index, the planner falls back to the full
-- idx_embeddings_vector at hnsw.ef_search=40, and the selective register filter post-guts
-- the 40 neighbours to ~5 (base pool starves, no error). Now every rebuild is zero-window
-- (the migration-011 pattern): build the replacement under a NEW name <idx>_v5 with the
-- SAME predicate/opclass, let it go VALID, DROP the old serving index, then RENAME the new
-- one into the serving name. A usable index exists at every instant.
--
-- CONCURRENTLY: run via db/apply-migration-concurrent.mjs (splits on --SPLIT--). Each
-- statement below is sent separately and runs in its OWN implicit transaction — neither
-- CREATE INDEX CONCURRENTLY nor DROP INDEX CONCURRENTLY may run inside a txn block.
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS <name>;   Run as neondb_owner.
-- ============================================================

-- idx_embeddings_vector_legal (legal prose HNSW) --------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_legal_v5
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND source_type IN ('commentary','sermon','father','theology','confession','lexicon') AND (
       metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
    OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
    OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
    OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')
    OR metadata->>'work' IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies')
  ));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_legal;
--SPLIT--
ALTER INDEX idx_embeddings_vector_legal_v5 RENAME TO idx_embeddings_vector_legal;
--SPLIT--
-- idx_embeddings_vector_song_verse (hymn/poetry HNSW) --------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_song_verse_v5
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND source_type IN ('hymn','poetry') AND (
    metadata->>'work' IN ('olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems')
  ));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_song_verse;
--SPLIT--
ALTER INDEX idx_embeddings_vector_song_verse_v5 RENAME TO idx_embeddings_vector_song_verse;
--SPLIT--
-- idx_embeddings_vector_sermon (sermon lane HNSW) -----------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_sermon_v5
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND metadata->>'work' IN ('spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_sermon;
--SPLIT--
ALTER INDEX idx_embeddings_vector_sermon_v5 RENAME TO idx_embeddings_vector_sermon;
--SPLIT--
-- idx_embeddings_vector_theology (theology lane HNSW) -------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_theology_v5
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND metadata->>'work' IN ('owen-works','hodge-systematic','calvin-institutes','schaff-creeds'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_theology;
--SPLIT--
ALTER INDEX idx_embeddings_vector_theology_v5 RENAME TO idx_embeddings_vector_theology;
--SPLIT--
-- idx_embeddings_verseid_registers (register-scoped verseId btree) ------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_verseid_registers_v5
  ON embeddings (((metadata->>'verseId')::int))
  WHERE (user_id IS NULL AND source_type IN ('commentary','sermon','father','theology','confession','lexicon','hymn','poetry'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_verseid_registers;
--SPLIT--
ALTER INDEX idx_embeddings_verseid_registers_v5 RENAME TO idx_embeddings_verseid_registers;
