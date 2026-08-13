-- ============================================================
-- 108: idx_commentary_fts_legal rebuild — drop 'spurgeon-talks-to-farmers' from the predicate
-- ============================================================
-- WHY. The work was WITHDRAWN 2026-08-11 by owner ruling ("kill it — we will upload it
-- later": published 2026-08-02 with 298 sections, embeddings never generated, so it was
-- shelf-readable and retrieval-invisible). It left SERVED_SERMON_WORKS the same day, which
-- removed the slug from LEGAL_COMMENTARY_ENTRIES_PREDICATE — and this index's predicate
-- must stay byte-identical to that constant (018_register_partial_indexes.sql:4-6, guarded
-- by web/test/invariants/fts-legal-index-sync.test.ts, which caught the drift).
--
-- FUNCTIONAL DELTA: none. The work carries ZERO commentary_entries rows (measured on dev
-- 2026-08-11), so the old predicate indexed exactly nothing extra. This is a lockstep fix,
-- not a content fix — the guard cannot tell "matches zero rows" from "silently starving",
-- and byte-sync is the cheaper discipline than direction analysis (037's header, 009's scar).
--
-- ZERO-WINDOW, the 037/018-v3 pattern: build the replacement under a NEW name with the SAME
-- opclass and the new predicate, let it go VALID, drop the old serving index, then rename.
-- A usable index exists at every instant.
--
-- CONCURRENTLY: run via `db/apply-migration-concurrent.mjs` (splits on --SPLIT--). Each
-- statement runs in its OWN implicit transaction — neither CREATE INDEX CONCURRENTLY nor
-- DROP INDEX CONCURRENTLY may run inside a txn block. Run as neondb_owner.
--
-- Rollback: reversible by the same pattern in the other direction (rebuild with the 037
--   predicate). The destructive step is the DROP, and it only ever runs after the
--   replacement is VALID.
--   Emergency: DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v8;
-- ============================================================
-- Byte-identical to LEGAL_COMMENTARY_ENTRIES_PREDICATE as of 2026-08-11 (the 037 predicate
-- minus 'spurgeon-talks-to-farmers'; author legs and the provenance condition carried
-- forward verbatim). 037 built _v7; this builds _v8 and renames it into the serving name.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v8
  ON commentary_entries USING GIN (tsv)
  WHERE ((author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems','spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','owen-works','hodge-systematic','calvin-institutes','schaff-creeds'))
  AND (source_url IS NULL OR (source_url NOT ILIKE '%biblehub.com%' AND source_url NOT ILIKE '%studylight.org%' AND source_url NOT ILIKE '%historicalchristian.faith%')));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;
--SPLIT--
ALTER INDEX idx_commentary_fts_legal_v8 RENAME TO idx_commentary_fts_legal;
