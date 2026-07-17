-- ============================================================
-- 018: register-aware partial indexes — rebuild the legal HNSW + add the
--      song/verse twin + the prose verseId range index
-- ============================================================
-- CONTENT_GO_LIVE.md decision 2: LEGAL_CORPUS_FILTER in routing.ts grew a
-- served-work slug list and the pool SQL now spans the prose registers
-- (commentary, sermon, father, theology, confession, lexicon). The partial
-- HNSW predicate MUST match or the planner falls back to the full-graph walk
-- and the ef=40 starvation returns (how migration 009 died) —
-- test/invariants/legal-hnsw-index-sync enforces the lockstep.
--
-- CONCURRENTLY: additive, non-locking. MUST run outside a txn (apply each
-- statement via psql/apply — the apply-migration runner sends the whole file as
-- one simple-protocol batch which Postgres treats as implicit txn; so this file
-- is applied with db/apply-migration-concurrent.mjs which splits on the marker).
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
    OR metadata->>'work' IN ('keil-delitzsch','catena-aurea','isbe','eastons-dictionary','smiths-dictionary','naves-topical','bdb-lexicon','spurgeon-sermons','spurgeon-treasury','maclaren-expositions','chrysostom-homilies','augustine-homilies','owen-works','watson-works','flavel-works','edwards-works','wesley-sermons','ryle-expository','vincent-word-studies','hodge-systematic','calvin-institutes','schaff-creeds','whitefield-works')
  ));
--SPLIT--
-- The SONG/VERSE register twin (SONG_VERSE_CORPUS_FILTER in routing.ts).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_song_verse
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND source_type IN ('hymn','poetry') AND (
    metadata->>'work' IN ('olney-hymns','scottish-psalter-1650','neale-eastern-hymns','bramley-carols','watts-hymns','watts-psalms','herbert-temple','montgomery-sacred-poems','keble-christian-year','donne-divine-poems','herrick-noble-numbers','traherne-poems','milton-poetical-works','rossetti-verses','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems')
  ));
--SPLIT--
-- Range-scan support for injection/backfill/on-range across the prose set +
-- the song/verse on-range lookup (the 007 pattern widened to the registers).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_verseid_registers
  ON embeddings (((metadata->>'verseId')::int))
  WHERE (user_id IS NULL AND source_type IN ('commentary','sermon','father','theology','confession','lexicon','hymn','poetry'));
