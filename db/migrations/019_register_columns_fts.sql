-- 019 v2 (A6 2026-07-17): the v3 index keyed to_tsvector('english', body) while every
-- serving query matches against the STORED tsv column — the planner could never use it.
-- v4 keys the tsv column itself and carries the PRUNED served-work list (quarantined /
-- never-ingested works removed). Old names dropped defensively.
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v4;
ALTER TABLE commentary_entries ADD COLUMN IF NOT EXISTS work TEXT;
ALTER TABLE commentary_entries ADD COLUMN IF NOT EXISTS register TEXT;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v2;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v3;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v4
  ON commentary_entries USING GIN (tsv)
  WHERE (author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','spurgeon-sermons','maclaren-expositions','chrysostom-homilies','augustine-homilies','owen-works','watson-works','flavel-works','edwards-works','wesley-sermons','hodge-systematic','calvin-institutes','schaff-creeds','whitefield-works','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems'));
