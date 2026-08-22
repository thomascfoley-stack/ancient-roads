-- ============================================================
-- 020: register expansion on the SERVED flat table — embeddings.source_type
-- ============================================================
-- Phase 1 (017) widened sources.source_type; the flat embeddings table has its
-- own CHECK (found live when the register seed hit embeddings_source_type_check)
-- — the served store must accept the register types it now serves. Additive,
-- idempotent, dev-first.
--
-- NOT VALID (added 2026-08-21, the 011 replay lesson one class over): this file's
-- eleven-type list is July's truth, and migration 112 is the one that widens it to
-- today's (devotional, topical_index, historian) with the NOT VALID + VALIDATE
-- idiom. A fresh REPLAY of the whole set — a new Neon branch, DR, CI's ephemeral
-- branch — applies this file over data that already contains 112-era rows, and a
-- plain ADD CONSTRAINT validates them against the July list and dies (proven: CI
-- run 32510118724, the first db-invariants run to get this far, stopped exactly
-- here). NOT VALID keeps the July semantics for every NEW write from this point in
-- the sequence while deferring historic-row validation to 112's VALIDATE, so the
-- replayed end state is byte-identical to the environments that applied the
-- original. Environments already carrying this file in their ledger never re-run
-- it; the edit exists only for replays.

DO $$
DECLARE
  conname TEXT;
BEGIN
  SELECT c.conname INTO conname
    FROM pg_constraint c
   WHERE c.conrelid = 'embeddings'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%source_type%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE embeddings DROP CONSTRAINT %I', conname);
  END IF;
  ALTER TABLE embeddings ADD CONSTRAINT embeddings_source_type_check CHECK (source_type IN
    ('commentary','bible','sermon','father','theology','confession','lexicon','hymn','poetry','note','document')) NOT VALID;
END $$;
