-- 123: partial index for the /word reference shelf's heading-key lookup.
--
-- WHY. GET /api/word/[strongs]/articles matches lexicon sections whose HEADING carries the
-- Strong's key as its first token ("H430 אֱלֹהִים …", "G3306 μένω") via
-- `heading = $key OR heading LIKE $key || ' %'`. Without an index the residual filter
-- heap-scans every published lexicon work's rows — measured on dev 2026-08-21 at 2,497 ms cold
-- (15 lexicon sources × ~3.5K rows each, 13,507 buffers read; EXPLAIN in
-- docs/evidence/lexqa-2026-08-21/). The design (WORD_REFERENCE_PANE_DESIGN.md §index) named
-- exactly this contingency and this remedy.
--
-- PARTIAL, on the Strong's-shaped headings only (~15K rows: BDB + Thayer's today), so the
-- index costs nothing on the 1M+ other sections. `text_pattern_ops` serves both the equality
-- and the LIKE-prefix form regardless of collation. The query's `heading LIKE 'H430 %'`
-- implies the predicate `heading ~ '^[GH][0-9]'`, so the planner can use it — same
-- predicate-implication rule 119 documents.
--
-- CONCURRENTLY, so no statement here may run inside a transaction block. Apply with
-- db/apply-migration-concurrent.mjs (pre-cleans INVALID leftovers, asserts validity before the
-- ledger row).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sections_strongs_heading
  ON sections (heading text_pattern_ops)
  WHERE heading ~ '^[GH][0-9]';
