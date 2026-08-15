-- ============================================================
-- 109: idx_commentary_fts_legal rebuild — add 'gill-song' to the predicate
-- ============================================================
-- WHY. Owner ruling 2026-08-12 ("Song of Solomon, fix it"): gill-song (Gill's Exposition
-- of the Book of Solomon's Song, CCEL gill/song, PD 1776) entered SERVED_PROSE_WORKS the
-- same day, which added the slug to LEGAL_COMMENTARY_ENTRIES_PREDICATE — and this index's
-- predicate must stay byte-identical to that constant (018_register_partial_indexes.sql:4-6,
-- guarded by web/test/invariants/fts-legal-index-sync.test.ts, watched RED between the
-- routing.ts edit and this rebuild).
--
-- FUNCTIONAL DELTA: none. gill-song carries ZERO commentary_entries rows (measured on dev
-- 2026-08-12 — register works write sections + flat embeddings, never commentary_entries),
-- so the new predicate indexes exactly nothing extra. Lockstep fix, not a content fix —
-- same reasoning as 108.
--
-- ZERO-WINDOW, the 037/018-v3 pattern carried by 108: build the replacement under a NEW
-- name, let it go VALID, drop the old serving index, rename.
--
-- CONCURRENTLY: run via `db/apply-migration-concurrent.mjs` (splits on --SPLIT--). Each
-- statement runs in its OWN implicit transaction. Run as neondb_owner.
--
-- Rollback: reversible by the same pattern in the other direction (rebuild with the 108
--   predicate). The destructive step is the DROP, and it only ever runs after the
--   replacement is VALID.
--   Emergency: DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal_v9;
-- ============================================================
-- Byte-identical to LEGAL_COMMENTARY_ENTRIES_PREDICATE as of 2026-08-12 (the 108 predicate
-- plus 'gill-song' at the SERVED_PROSE_WORKS position). 108 built _v8; this builds _v9 and
-- renames it into the serving name.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v9
  ON commentary_entries USING GIN (tsv)
  WHERE ((author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies','gill-song','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems','spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','owen-works','hodge-systematic','calvin-institutes','schaff-creeds'))
  AND (source_url IS NULL OR (source_url NOT ILIKE '%biblehub.com%' AND source_url NOT ILIKE '%studylight.org%' AND source_url NOT ILIKE '%historicalchristian.faith%')));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;
--SPLIT--
ALTER INDEX idx_commentary_fts_legal_v9 RENAME TO idx_commentary_fts_legal;
