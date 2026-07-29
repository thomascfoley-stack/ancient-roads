-- ============================================================
-- 011: rebuild the partial legal FTS index — 009's predicate DRIFTED
-- ============================================================
-- §6 THE ROT (2026-07-13). Migration 009 built idx_commentary_fts_legal with a
-- predicate copied from the EMBEDDINGS-table convention:
--     ... OR (author IN ('Albert Barnes','John Wesley','John Calvin')
--             AND source_url ILIKE '%crosswire%')
-- Then §1b (queue #4) rebuilt LEGAL_COMMENTARY_ENTRIES_PREDICATE (the predicate the
-- SEARCH query actually ANDs) from PUBLISHED_WHOLE_BIBLE_AUTHORS — dropping the
-- crosswire condition and adding "Barnes' Notes" (the biblehub author name). The two
-- no longer match: the query can now return "Barnes' Notes" rows the OLD index does
-- not cover, so a partial index is UNUSABLE for it (P_query does not imply P_index).
-- The planner silently fell back to the full idx_commentary_fts — reopening the
-- 1.2–1.7s common-word scan that 009 fixed. Correctness was never affected; only speed.
--
-- Fix: rebuild the partial index with a predicate byte-identical to the CURRENT
-- LEGAL_COMMENTARY_ENTRIES_PREDICATE (web/src/lib/legal-corpus.ts). Create the new
-- index first, then drop the old, so a usable index exists throughout (append-only
-- table; double gin write cost during the overlap is negligible).
--
-- CONCURRENTLY ⇒ each statement MUST run OUTSIDE a transaction block.
--   Run as neondb_owner.
-- The WHERE below MUST stay in sync with LEGAL_COMMENTARY_ENTRIES_PREDICATE;
-- test/invariants/fts-legal-index-sync.test.ts enforces this.
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v2
  ON commentary_entries USING gin(tsv)
  WHERE (author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
     OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
     OR (author = 'Augustine of Hippo' AND book IN (19, 43)));

DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;

ALTER INDEX idx_commentary_fts_legal_v2 RENAME TO idx_commentary_fts_legal;
