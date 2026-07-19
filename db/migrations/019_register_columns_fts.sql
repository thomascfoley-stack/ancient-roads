-- 019 v3 (reconcile-A 2026-07-18): register columns + partial legal FTS index, ZERO-WINDOW.
-- The v4 index keys the STORED tsv column (the earlier v3 keyed to_tsvector('english', body),
-- which the planner could never use since serving queries match the tsv column). The served
-- work list is the PRUNED one (quarantined / never-ingested works removed).
--
-- v3 change: the previous version DROPPED the live serving index idx_commentary_fts_legal
-- (built by migration 011) BEFORE building its replacement — the same window migration 009
-- died in (no partial FTS index while the GIN rebuilds → planner falls back to the full
-- idx_commentary_fts common-word scan). Now zero-window (the migration-011 pattern): build
-- the replacement under a NEW name idx_commentary_fts_legal_v5 with the SAME predicate, let
-- it go VALID, DROP the old serving index (and the stale _v2/_v3/_v4 names), then RENAME the
-- new one into the serving name. A usable FTS index exists at every instant.
--
-- CONCURRENTLY ⇒ each statement below runs OUTSIDE a txn block (its own implicit
-- transaction via db/apply-migration-concurrent.mjs, which splits on --SPLIT--).
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v5;   Run as neondb_owner.
-- The WHERE below MUST stay in sync with LEGAL_COMMENTARY_ENTRIES_PREDICATE;
-- test/invariants/fts-legal-index-sync.test.ts enforces this.
ALTER TABLE commentary_entries ADD COLUMN IF NOT EXISTS work TEXT;
ALTER TABLE commentary_entries ADD COLUMN IF NOT EXISTS register TEXT;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v5
  ON commentary_entries USING GIN (tsv)
  WHERE (author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems','spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','owen-works','hodge-systematic','calvin-institutes','schaff-creeds'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v2;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v3;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v4;
--SPLIT--
ALTER INDEX idx_commentary_fts_legal_v5 RENAME TO idx_commentary_fts_legal;
