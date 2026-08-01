-- 035: the partial legal FTS index regains a provenance condition — deep audit H4 + H5.
--
-- WHY. LEGAL_COMMENTARY_ENTRIES_PREDICATE now excludes forbidden-aggregator provenance, and this
-- index's WHERE must stay byte-identical to it or the planner silently stops using the partial
-- index and the slow common-word scan returns (the §6 rot of 2026-07-13, enforced by
-- web/test/invariants/fts-legal-index-sync.test.ts).
--
-- WHAT IT CHANGES, MEASURED ON PRODUCTION 2026-08-01
-- (docs/evidence/serving-provenance-census-2026-08-01.log): the predicate admitted 114,834 of
-- 371,406 rows, and 50,618 of those came from a forbidden aggregator —
--   21,036  Barnes' Notes        biblehub.com
--   18,181  John Wesley          biblehub.com
--    6,163  John Calvin          biblehub.com
--    2,947  John Chrysostom      historicalchristian.faith
--    2,291  Augustine of Hippo   historicalchristian.faith
-- After this migration the index covers ~64,216 rows instead of ~114,834. The rows are NOT
-- deleted — ADR-039's retirement is explicit ("Delete no Barnes rows", "Barnes prod rows unchanged
-- until a separate owner slice") — they simply stop being served, which is the boundary A3 and A4
-- already drew for the sections path and this table never honoured.
--
-- NOT A DELETE, AND REVERSIBLE. Reverting is the inverse of this file with the old predicate.
--
-- WHY ILIKE AND NOT THE HOST-PARSING FORM. A partial-index predicate may not contain a subquery,
-- so `NOT EXISTS (SELECT 1 FROM unnest(...))` — the shape search-sections.ts uses at query time —
-- cannot be written here. The naive substring over-matches (`notbiblehub.com` would also be
-- excluded), which refuses a row rather than admitting one, so the error direction is closed.
--
-- ZERO-WINDOW, the 011/019 pattern: build the replacement under a NEW name with the SAME
-- predicate, let it go VALID, drop the old serving index, then rename. A usable FTS index exists
-- at every instant. CONCURRENTLY ⇒ each statement runs outside a txn block; apply with
--   DATABASE_URL=<owner-url> node db/apply-migration-concurrent.mjs db/migrations/035_fts_legal_forbidden_provenance.sql
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v6;   Run as neondb_owner.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v6
  ON commentary_entries USING GIN (tsv)
  WHERE ((author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems','spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','owen-works','hodge-systematic','calvin-institutes','schaff-creeds'))
  AND (source_url IS NULL OR (source_url NOT ILIKE '%biblehub.com%' AND source_url NOT ILIKE '%studylight.org%' AND source_url NOT ILIKE '%historicalchristian.faith%')));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v5;
--SPLIT--
ALTER INDEX idx_commentary_fts_legal_v6 RENAME TO idx_commentary_fts_legal;
