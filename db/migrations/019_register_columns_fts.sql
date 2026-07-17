-- ============================================================
-- 019: register columns on commentary_entries + FTS legal partial rebuild
-- ============================================================
-- CONTENT_GO_LIVE decision 2/3: the static corpus (and its FTS mirror) now
-- carries hymn/poetry/sermon/etc entries keyed by their WORK slug. Additive:
-- two nullable columns; existing rows untouched. The FTS legal partial index is
-- rebuilt so its predicate matches LEGAL_COMMENTARY_ENTRIES_PREDICATE in
-- web/src/lib/legal-corpus.ts (fts-legal-index-sync enforces the lockstep).
-- Applied with db/apply-migration-concurrent.mjs (CONCURRENTLY parts).
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v3;
--           ALTER TABLE commentary_entries DROP COLUMN work, DROP COLUMN register;

ALTER TABLE commentary_entries ADD COLUMN IF NOT EXISTS work TEXT;
ALTER TABLE commentary_entries ADD COLUMN IF NOT EXISTS register TEXT;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v2;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v3
  ON commentary_entries USING GIN (to_tsvector('english', body))
  WHERE (author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','isbe','eastons-dictionary','smiths-dictionary','naves-topical','bdb-lexicon','spurgeon-sermons','spurgeon-treasury','maclaren-expositions','chrysostom-homilies','augustine-homilies','owen-works','watson-works','flavel-works','edwards-works','wesley-sermons','ryle-expository','vincent-word-studies','hodge-systematic','calvin-institutes','schaff-creeds','whitefield-works','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','bramley-carols','watts-hymns','watts-psalms','herbert-temple','montgomery-sacred-poems','keble-christian-year','donne-divine-poems','herrick-noble-numbers','traherne-poems','milton-poetical-works','rossetti-verses','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems'));
