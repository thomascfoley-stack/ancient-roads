-- ============================================================
-- 009: Partial FTS index over LEGAL (servable) commentary rows
-- ============================================================
-- Problem (measured on prod, 2026-07-12): a common-word search
-- ("God") matches 143,575 rows via idx_commentary_fts, but only
-- ~28k are LEGAL. The bitmap heap scan then reads ALL 143k rows
-- to compute ts_rank_cd AND apply the legal filter (author IN … /
-- source_url ILIKE '%crosswire%'), removing ~80% — 1.2–1.7s.
--
-- Fix: a PARTIAL gin(tsv) index whose predicate IS the legal
-- filter (LEGAL_COMMENTARY_ENTRIES_PREDICATE in
-- web/src/lib/legal-corpus.ts). Since the search query always
-- ANDs the identical predicate, the planner uses this index and
-- the FTS match returns only legal rows (~28k for "God"), so the
-- heap scan + ranking touch ~5x fewer rows. The unindexable
-- ILIKE is evaluated ONCE at index-build time, not per query row.
--
-- The predicate below MUST stay byte-identical to
-- LEGAL_COMMENTARY_ENTRIES_PREDICATE. If that constant changes,
-- add a new migration that rebuilds this index to match, or the
-- planner will silently stop using it (correctness is unaffected;
-- only speed regresses).
--
-- CONCURRENTLY: commentary_entries is append-only (offline ingest,
-- read-only on the request path), but CONCURRENTLY keeps even the
-- ingest path unblocked. It MUST run OUTSIDE a transaction block.
--   Run as neondb_owner.
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal
  ON commentary_entries USING gin(tsv)
  WHERE (author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
     OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
     OR (author = 'Augustine of Hippo' AND book IN (19, 43))
     OR (author IN ('Albert Barnes', 'John Wesley', 'John Calvin') AND source_url ILIKE '%crosswire%'));
