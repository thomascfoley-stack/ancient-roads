-- ============================================================
-- 005: Add entry_index to commentary_entries unique key
-- ============================================================
-- The original key (book, chapter, verse_start, verse_end, author, source_title)
-- was too coarse — authors have multiple distinct notes per verse range
-- (sub-verse commentary chunks). 190k of 371k entries were silently dropped
-- by ON CONFLICT. Adding entry_index (ordinal position in the source chapter
-- file) restores the full corpus.
-- ============================================================

-- Add the column (default 0 for existing rows)
ALTER TABLE commentary_entries
  ADD COLUMN IF NOT EXISTS entry_index SMALLINT NOT NULL DEFAULT 0;

-- Drop the old unique index
DROP INDEX IF EXISTS idx_commentary_natural_key;

-- Create the new unique index with entry_index
CREATE UNIQUE INDEX idx_commentary_natural_key
  ON commentary_entries (book, chapter, verse_start, verse_end, author, source_title, entry_index);

-- Re-apply grants defensively
GRANT SELECT ON commentary_entries TO app_runtime;
GRANT USAGE, SELECT ON SEQUENCE commentary_entries_id_seq TO app_runtime;
