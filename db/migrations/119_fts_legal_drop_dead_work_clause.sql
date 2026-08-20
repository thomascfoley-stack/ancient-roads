-- 119: rebuild idx_commentary_fts_legal without the dead work-slug disjunct.
--
-- WHY THIS MIGRATION EXISTS AT ALL. LEGAL_COMMENTARY_ENTRIES_PREDICATE lost its
-- `OR work IN (...)` leg on 2026-08-20: it named 37 slugs while `work IS NOT NULL` is 0 of
-- 371,521 rows, so it could never match, and behaviour neutrality was proven against production
-- (64,331 admitted with or without it). But this partial GIN index carries that predicate in its
-- WHERE clause, and the planner only uses a partial index when the query predicate IMPLIES the
-- index predicate. Leaving the index on the old text would not break correctness — it would make
-- passage search silently SEQ SCAN 371,521 rows. That is the D2 failure mode, and
-- fts-legal-index-sync.test.ts is what caught it: the constant changed and the index did not.
--
-- The new predicate is DERIVED from 118's own text by removing the same disjunct, not retyped —
-- a hand-transcribed 40-line predicate is how these two drift apart in the first place.
--
-- CONCURRENTLY, so no statement here may run inside a transaction block. Apply with
-- db/apply-migration-concurrent.mjs, which pre-cleans INVALID leftovers and asserts validity
-- before writing the ledger row.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v13
  ON commentary_entries USING GIN (tsv)
  WHERE ((author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43)))
  AND (source_url IS NULL OR (source_url NOT ILIKE '%biblehub.com%' AND source_url NOT ILIKE '%studylight.org%' AND source_url NOT ILIKE '%historicalchristian.faith%'))
  AND NOT (
     author IN ('Tyndale Study Notes','Tyndale Open Study Notes','Theophylact','Bonaventure','Oecumenius','Origen','Origen of Alexandria','Aquinas-Larcher','CS Lewis','GK Chesterton','Douglas Wilson','JRR Tolkien','Pseudo-Origen')
     OR split_part(author, ' of ', 1) IN ('Tyndale Study Notes','Tyndale Open Study Notes','Theophylact','Bonaventure','Oecumenius','Origen','Origen of Alexandria','Aquinas-Larcher','CS Lewis','GK Chesterton','Douglas Wilson','JRR Tolkien','Pseudo-Origen')
     OR split_part(author, ' the ', 1) IN ('Tyndale Study Notes','Tyndale Open Study Notes','Theophylact','Bonaventure','Oecumenius','Origen','Origen of Alexandria','Aquinas-Larcher','CS Lewis','GK Chesterton','Douglas Wilson','JRR Tolkien','Pseudo-Origen')
     OR author LIKE 'Tyndale Study Notes %'
     OR author LIKE 'Tyndale Open Study Notes %'
     OR author LIKE 'Theophylact %'
     OR author LIKE 'Bonaventure %'
     OR author LIKE 'Oecumenius %'
     OR author LIKE 'Origen %'
     OR author LIKE 'Origen of Alexandria %'
     OR author LIKE 'Aquinas-Larcher %'
     OR author LIKE 'CS Lewis %'
     OR author LIKE 'GK Chesterton %'
     OR author LIKE 'Douglas Wilson %'
     OR author LIKE 'JRR Tolkien %'
     OR author LIKE 'Pseudo-Origen %'
     OR author LIKE 'Jerome''s%'
   ));

--SPLIT--

DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;

--SPLIT--

ALTER INDEX idx_commentary_fts_legal_v13 RENAME TO idx_commentary_fts_legal;
