-- ============================================================
-- 028: reading_progress (MIG-D) — one resume cursor per (user, work)
-- ============================================================
-- docs/LIBRARY_READER_DESIGN.md §4. The server-side form of the Book Reader's
-- resume record ({slug, ordinal, scrollPct} → localStorage today): the LAST
-- position in a work, upserted on UNIQUE(user_id, source_id). One row per work,
-- overwritten as you read — not a history log.
--
-- DELIBERATELY NOT `reading_history` (owner-flagged): that table is Bible-CHAPTER
-- grained and APPEND-ONLY (book_slug, chapter, translation, time_spent_ms,
-- read_at, unique on …read_at) — an event log of chapters read. This is a single
-- mutable cursor per corpus work. Verified on dev 2026-07-19 before writing this.
--
-- percent is a 0..1 fraction (matches the reader's scrollPct), CHECK-bounded so a
-- bad client can never store 340%. RLS: identical block (001). NO new GRANT.
-- IDEMPOTENT. RUN: node db/apply-migration.mjs db/migrations/028_reading_progress.sql
-- ROLLBACK: DROP TABLE IF EXISTS reading_progress;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reading_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  source_id    bigint NOT NULL REFERENCES sources(id),
  last_ordinal integer NOT NULL,
  char_offset  integer,
  percent      real,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_progress_user_source_uniq UNIQUE (user_id, source_id),
  CONSTRAINT reading_progress_percent_chk CHECK (percent IS NULL OR (percent >= 0 AND percent <= 1)),
  CONSTRAINT reading_progress_ordinal_chk CHECK (last_ordinal >= 1)
);

ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reading_progress_policy ON reading_progress;
CREATE POLICY reading_progress_policy ON reading_progress
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE INDEX IF NOT EXISTS idx_reading_progress_user_updated
  ON reading_progress (user_id, updated_at DESC);

COMMIT;
