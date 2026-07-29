-- ============================================================
-- 017: register expansion — hymn / poetry / art in sources.source_type
-- ============================================================
-- ADDITIVE + idempotent, DEV first (CONTENT_GO_LIVE.md decision 3; the operative
-- go-live queue carries source_type 'hymn' and 'poetry'; 'art' is added to the
-- CHECK now so the parked art pipeline needs no schema change later — SOURCE_
-- CATALOGUE §19 — while ingesting art remains explicitly out of scope).
--   DATABASE_URL=<dev-owner-url> node db/apply-migration.mjs db/migrations/017_source_type_registers.sql

DO $$
DECLARE
  conname TEXT;
BEGIN
  SELECT c.conname INTO conname
    FROM pg_constraint c
   WHERE c.conrelid = 'sources'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%source_type%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sources DROP CONSTRAINT %I', conname);
  END IF;
  ALTER TABLE sources ADD CONSTRAINT sources_source_type_check CHECK (source_type IN
    ('commentary','sermon','historian','theology','father','confession','lexicon','hymn','poetry','art'));
END $$;
