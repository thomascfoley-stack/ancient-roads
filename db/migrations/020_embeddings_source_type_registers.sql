-- ============================================================
-- 020: register expansion on the SERVED flat table — embeddings.source_type
-- ============================================================
-- Phase 1 (017) widened sources.source_type; the flat embeddings table has its
-- own CHECK (found live when the register seed hit embeddings_source_type_check)
-- — the served store must accept the register types it now serves. Additive,
-- idempotent, dev-first.

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
    ('commentary','bible','sermon','father','theology','confession','lexicon','hymn','poetry','note','document'));
END $$;
