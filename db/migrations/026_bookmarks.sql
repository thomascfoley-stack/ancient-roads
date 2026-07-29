-- ============================================================
-- 026: bookmarks (MIG-B) — polymorphic saved spot, verse OR section
-- ============================================================
-- docs/LIBRARY_READER_DESIGN.md §4. An EXPLICIT saved spot (the user taps
-- "Bookmark"), distinct from auto reading-progress (028). Same polymorphic spine
-- and XOR invariant as the highlights/notes rework (025): exactly one anchor.
-- One ACTIVE bookmark per target per user (toggle semantics) via partial unique
-- indexes. Soft-delete (deleted_at) matches notes/highlights.
--
-- RLS: identical block to highlights/notes (001) — ENABLE + a cmd=ALL policy
-- filtering user_id = current_setting('app.current_user_id', true). NO new GRANT:
-- 001's ALTER DEFAULT PRIVILEGES grants app_runtime DML on owner-created tables.
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS; DROP POLICY IF EXISTS before CREATE.
-- RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/026_bookmarks.sql
-- ROLLBACK: DROP TABLE IF EXISTS bookmarks;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS bookmarks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text NOT NULL,
  target_kind         text NOT NULL DEFAULT 'verse',
  verse_id            integer,
  section_id          bigint REFERENCES sections(id),
  source_content_hash text,
  label               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT bookmarks_anchor_xor CHECK (
    (target_kind = 'verse'   AND verse_id   IS NOT NULL AND section_id IS NULL) OR
    (target_kind = 'section' AND section_id IS NOT NULL AND verse_id   IS NULL)
  )
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookmarks_policy ON bookmarks;
CREATE POLICY bookmarks_policy ON bookmarks
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- one ACTIVE bookmark per target (toggle); many soft-deleted allowed
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_user_verse
  ON bookmarks (user_id, verse_id)   WHERE deleted_at IS NULL AND target_kind = 'verse';
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_user_section
  ON bookmarks (user_id, section_id) WHERE deleted_at IS NULL AND target_kind = 'section';
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON bookmarks (user_id, created_at DESC) WHERE deleted_at IS NULL;

COMMIT;
