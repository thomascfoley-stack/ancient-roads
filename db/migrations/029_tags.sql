-- ============================================================
-- 029: tags + annotation_tags (MIG-E) — user tags over any annotation
-- ============================================================
-- docs/LIBRARY_READER_DESIGN.md §4. A per-user tag vocabulary (`tags`) plus a
-- POLYMORPHIC join (`annotation_tags`) that can tag a highlight, note, bookmark,
-- or library_item. All four carry uuid primary keys, so one `target_id uuid` +
-- `target_type` discriminator covers them.
--
-- NOTE (docs-vs-reality): design §4 says "notes.tags TEXT[] already exists" — it
-- does NOT on dev (verified 2026-07-19, notes has no tags column). So tagging is
-- delivered ENTIRELY by this join, not by an array column on notes/highlights.
-- Recorded rather than silently working around it.
--
-- POLYMORPHIC = NO FK on target_id (it points at four different tables), so a
-- deleted annotation leaves an orphan link. Deliberate and bounded: the delete
-- paths clean their links, and reads join back to the target table (an orphan row
-- simply matches nothing). Logged as a follow-up rather than pretending an FK can
-- express this.
--
-- RLS: identical block on BOTH tables (001). NO new GRANT. IDEMPOTENT.
-- RUN: node db/apply-migration.mjs db/migrations/029_tags.sql
-- ROLLBACK: DROP TABLE IF EXISTS annotation_tags; DROP TABLE IF EXISTS tags;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_user_name_uniq UNIQUE (user_id, name),
  CONSTRAINT tags_name_nonempty CHECK (length(btrim(name)) > 0)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tags_policy ON tags;
CREATE POLICY tags_policy ON tags
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE TABLE IF NOT EXISTS annotation_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annotation_tags_target_type_chk
    CHECK (target_type IN ('highlight', 'note', 'bookmark', 'library_item')),
  CONSTRAINT annotation_tags_uniq UNIQUE (tag_id, target_type, target_id)
);

ALTER TABLE annotation_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS annotation_tags_policy ON annotation_tags;
CREATE POLICY annotation_tags_policy ON annotation_tags
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE INDEX IF NOT EXISTS idx_annotation_tags_user_target
  ON annotation_tags (user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_annotation_tags_tag ON annotation_tags (tag_id);

COMMIT;
