-- ============================================================
-- 027: library_items (MIG-C) — the personal bookshelf over the CORPUS
-- ============================================================
-- docs/LIBRARY_READER_DESIGN.md §4. A user's shelf placement for a corpus work
-- (sources): reading | saved (Save-For-Later) | archived. UNIQUE(user_id,
-- source_id) — a work sits on exactly ONE shelf per user, so "move shelf" is an
-- UPDATE (or an upsert on the unique key), never a duplicate row.
--
-- DELIBERATELY NOT `user_library` (owner-flagged): that table is UPLOADED FILES
-- (storage_key / mime_type / size_bytes / is_purchased) — a different domain.
-- Overloading it would conflate "files I uploaded" with "corpus works I shelved".
-- Verified on dev 2026-07-19 before writing this migration.
--
-- RLS: identical block to highlights/notes (001). NO new GRANT (001 ALTER DEFAULT
-- PRIVILEGES). IDEMPOTENT. RUN: node db/apply-migration.mjs db/migrations/027_library_items.sql
-- ROLLBACK: DROP TABLE IF EXISTS library_items;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS library_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  source_id  bigint NOT NULL REFERENCES sources(id),
  shelf      text NOT NULL DEFAULT 'saved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_items_shelf_chk CHECK (shelf IN ('reading', 'saved', 'archived')),
  CONSTRAINT library_items_user_source_uniq UNIQUE (user_id, source_id)
);

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS library_items_policy ON library_items;
CREATE POLICY library_items_policy ON library_items
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE INDEX IF NOT EXISTS idx_library_items_user_shelf
  ON library_items (user_id, shelf, updated_at DESC);

COMMIT;
