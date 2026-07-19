-- ============================================================
-- 025: polymorphic highlights + notes — verse OR section anchoring (MIG-A)
-- ============================================================
-- docs/LIBRARY_READER_DESIGN.md §4. The annotation engine (Phase 1) anchors to a
-- Bible `verse_id`; the Book Reader (Phase 2) anchors to a `sections.id` + offset
-- into `sections.body`. This migration makes `highlights` and `notes` POLYMORPHIC
-- so one table serves both, with a DB-enforced invariant that a row carries
-- EXACTLY ONE anchor (verse XOR section) consistent with `target_kind`.
--
-- The spine (applied to both tables):
--   target_kind TEXT NOT NULL DEFAULT 'verse'  -- 'verse' | 'section'
--   section_id  BIGINT REFERENCES sections(id) -- work anchor; NULL for verses
--   source_content_hash TEXT                   -- section-only: re-ingest drift (ADR-027)
--   verse_id  -- NOT NULL dropped (NULL for sections)
--   CHECK: (verse XOR section), tied to target_kind — the data-shape-risk invariant.
--
-- DEFAULT 'verse' is deliberate backward-compat: the existing insert paths
-- (createHighlight, upsertNote) do not name target_kind, so they keep writing
-- verse rows unchanged. A section insert that forgets target_kind defaults to
-- 'verse' but sets section_id → the CHECK REJECTS it (fail-closed), never a
-- silently mis-typed row.
--
-- notes unique-index rework (the "without breaking upsertNote" clause): the active
-- one-note-per-target index idx_notes_user_verse (user_id, verse_id) WHERE
-- deleted_at IS NULL becomes verse-ONLY (… AND target_kind='verse'), so SECTION
-- notes are many-per-section (a work gets many marginal notes) while verse notes
-- keep their single-active-note upsert. upsertNote's ON CONFLICT predicate is
-- updated in the same slice (web/src/lib/annotations.ts) to match this partial
-- index — a partial index is only an arbiter when the ON CONFLICT predicate
-- implies its predicate.
--
-- ADR-027 (drift): source_content_hash pins the section text a section annotation
-- was drawn over; on a later re-ingest mismatch the reader degrades to a
-- section-level indicator (never a corrupt span, never a silent drop). This
-- migration stores the column; the degrade logic lives in the reader/render path.
--
-- SCOPE / SAFETY: notes (2 rows) + highlights (48 rows) on dev — trivial. ADD
-- COLUMN without a stored default is catalog-only (no rewrite); the CHECK/FK
-- validations scan a handful of rows. Runs atomically (single implicit txn via
-- db/apply-migration.mjs). RLS is unchanged: highlights_policy / notes_policy
-- (001) filter by user_id and cover the new section rows identically — NO new
-- GRANT (001 ALTER DEFAULT PRIVILEGES already covers these existing tables).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; backfill only NULL target_kind; DROP
-- CONSTRAINT IF EXISTS before ADD; DROP INDEX IF EXISTS before CREATE.
--
-- RUN (owner, dev-guarded):  node db/apply-migration.mjs db/migrations/025_annotations_polymorphic.sql
--
-- ROLLBACK (safe — reader code reads these columns only after this lands):
--   ALTER TABLE notes      DROP CONSTRAINT IF EXISTS notes_anchor_xor;
--   ALTER TABLE highlights DROP CONSTRAINT IF EXISTS highlights_anchor_xor;
--   DROP INDEX IF EXISTS idx_notes_user_section;
--   DROP INDEX IF EXISTS idx_highlights_user_section;
--   DROP INDEX IF EXISTS idx_notes_user_verse;
--   CREATE UNIQUE INDEX idx_notes_user_verse ON notes (user_id, verse_id) WHERE deleted_at IS NULL;
--   ALTER TABLE notes      DROP COLUMN IF EXISTS target_kind, DROP COLUMN IF EXISTS section_id, DROP COLUMN IF EXISTS source_content_hash;
--   ALTER TABLE highlights DROP COLUMN IF EXISTS target_kind, DROP COLUMN IF EXISTS section_id, DROP COLUMN IF EXISTS source_content_hash;
--   (verse_id NOT NULL is not restored — pre-025 rows are all verse rows anyway.)
-- ============================================================

BEGIN;

-- ---------- notes ----------
ALTER TABLE notes ADD COLUMN IF NOT EXISTS target_kind TEXT;
UPDATE notes SET target_kind = 'verse' WHERE target_kind IS NULL;
ALTER TABLE notes ALTER COLUMN target_kind SET DEFAULT 'verse';
ALTER TABLE notes ALTER COLUMN target_kind SET NOT NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES sections(id);
ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_content_hash TEXT;
ALTER TABLE notes ALTER COLUMN verse_id DROP NOT NULL;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_anchor_xor;
ALTER TABLE notes ADD CONSTRAINT notes_anchor_xor CHECK (
  (target_kind = 'verse'   AND verse_id   IS NOT NULL AND section_id IS NULL) OR
  (target_kind = 'section' AND section_id IS NOT NULL AND verse_id   IS NULL)
);

-- Active one-note-per-verse: now verse-only so section notes go many-per-section.
DROP INDEX IF EXISTS idx_notes_user_verse;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_user_verse
  ON notes (user_id, verse_id) WHERE deleted_at IS NULL AND target_kind = 'verse';
-- Section-note lookups (list a work's notes).
CREATE INDEX IF NOT EXISTS idx_notes_user_section
  ON notes (user_id, section_id) WHERE deleted_at IS NULL AND target_kind = 'section';

-- ---------- highlights ----------
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS target_kind TEXT;
UPDATE highlights SET target_kind = 'verse' WHERE target_kind IS NULL;
ALTER TABLE highlights ALTER COLUMN target_kind SET DEFAULT 'verse';
ALTER TABLE highlights ALTER COLUMN target_kind SET NOT NULL;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES sections(id);
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS source_content_hash TEXT;
ALTER TABLE highlights ALTER COLUMN verse_id DROP NOT NULL;

ALTER TABLE highlights DROP CONSTRAINT IF EXISTS highlights_anchor_xor;
ALTER TABLE highlights ADD CONSTRAINT highlights_anchor_xor CHECK (
  (target_kind = 'verse'   AND verse_id   IS NOT NULL AND section_id IS NULL) OR
  (target_kind = 'section' AND section_id IS NOT NULL AND verse_id   IS NULL)
);

-- Section-highlight lookups (paint a work's highlights).
CREATE INDEX IF NOT EXISTS idx_highlights_user_section
  ON highlights (user_id, section_id) WHERE deleted_at IS NULL AND target_kind = 'section';

COMMIT;
