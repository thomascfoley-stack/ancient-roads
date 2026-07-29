-- ============================================================
-- 015: sub-verse highlight anchoring + two color axes + multi-span per verse
-- ============================================================
-- Reader annotation toolbelt (§2). ADDITIVE + IDEMPOTENT. Run as neondb_owner.
--
-- app_runtime already holds SELECT/INSERT/UPDATE/DELETE on `highlights` (migration 001); in
-- Postgres a table-level grant covers columns added later, so NO new GRANT is required. Corpus
-- write-revocation (migration 010) did not touch highlights, so the runtime still writes it.
--
-- Columns (all nullable = a legacy whole-verse highlight, the pre-existing behavior, preserved):
--   span_start / span_end : character offsets INTO the verse text, half-open [start, end).
--                           NULL/NULL = whole verse. (`end` is a SQL reserved word, hence span_*.)
--                           See web/src/lib/highlight-range.ts for how they are derived + rendered.
--   translation           : the translation id the span was anchored in (offsets are
--                           translation-relative; a span renders exactly only in its own
--                           translation and degrades to a verse-level indicator elsewhere).
--   background_color       : the highlight (background) tool's color. The legacy NOT-NULL `color`
--                           column is kept and set to the same value on write, so a reader on
--                           either schema renders the same background (safe during the deploy gap).
--   text_color            : the text-color tool (NULL = default text color).

ALTER TABLE highlights ADD COLUMN IF NOT EXISTS span_start       integer;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS span_end         integer;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS translation      text;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS background_color text;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS text_color       text;

-- Multi-span per verse: the old app model soft-deleted any active highlight on a verse before
-- inserting ("one active highlight per verse"). That was app logic only — idx_highlights_user_verse
-- is a PLAIN lookup index, not UNIQUE, so the DB already permits multiple active rows per verse.
-- The app change (createHighlight inserts a span; removeHighlightById deletes one span) is what
-- turns it on. The lookup index is kept for the chapter query.

-- Keyset pagination support (CLAUDE.md: never return an unbounded result set). A stable
-- (user_id, created_at DESC, id) key lets listHighlights page deterministically; notes already
-- have idx_notes_user_updated — extend it with id as a unique tiebreak for keyset paging.
CREATE INDEX IF NOT EXISTS idx_highlights_user_created
  ON highlights (user_id, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_user_updated_id
  ON notes (user_id, updated_at DESC, id) WHERE deleted_at IS NULL;
