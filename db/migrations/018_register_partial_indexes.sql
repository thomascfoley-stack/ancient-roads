-- ============================================================
-- 018 v2 (A6 2026-07-17): register-aware partial indexes, PRUNED work lists
-- ============================================================
-- Predicates must stay in lockstep with LEGAL_CORPUS_FILTER /
-- SONG_VERSE_CORPUS_FILTER in routing.ts (test/invariants/legal-hnsw-index-sync).
-- The served lists were pruned to ingested+clean works only (quarantined and
-- never-ingested slugs removed); the indexes rebuild here to match.
-- CONCURRENTLY: run via db/apply-migration-concurrent.mjs (splits on --SPLIT--).
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS <name>;   Run as neondb_owner.
-- ============================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_legal;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_legal
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND source_type IN ('commentary','sermon','father','theology','confession','lexicon') AND (
       metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
    OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
    OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
    OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')
    OR metadata->>'work' IN ('keil-delitzsch','catena-aurea','spurgeon-sermons','maclaren-expositions','chrysostom-homilies','augustine-homilies','owen-works','watson-works','flavel-works','edwards-works','wesley-sermons','hodge-systematic','calvin-institutes','schaff-creeds')
  ));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_song_verse;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_song_verse
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND source_type IN ('hymn','poetry') AND (
    metadata->>'work' IN ('olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems')
  ));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_verseid_registers;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_verseid_registers
  ON embeddings (((metadata->>'verseId')::int))
  WHERE (user_id IS NULL AND source_type IN ('commentary','sermon','father','theology','confession','lexicon','hymn','poetry'));
