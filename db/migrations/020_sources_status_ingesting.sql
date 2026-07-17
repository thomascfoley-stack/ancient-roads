-- 020: allow sources.status='ingesting' — the in-flight marker register-writer
-- stamps until a work's write SUCCEEDS (publish/staged only on success, so a
-- crash mid-write can never leave a published shell — the K&D 3-row lesson,
-- A6 2026-07-17). Idempotent: drop+re-add the CHECK.
-- Rollback: re-add the old 3-value CHECK (after UPDATEing any 'ingesting' rows).

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_status_check;
ALTER TABLE sources ADD CONSTRAINT sources_status_check
  CHECK (status = ANY (ARRAY['staged'::text, 'published'::text, 'quarantined'::text, 'ingesting'::text]));
