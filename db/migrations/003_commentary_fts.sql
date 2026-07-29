-- ============================================================
-- 003: Full-text search over the commentary corpus
-- ============================================================
-- 371k entries from 401 sources, ingested from the static JSON
-- files in web/public/commentaries/. Public data — no RLS.
--
-- Follows the same tsvector/GIN pattern as embeddings.tsv +
-- idx_embeddings_fts (schema.sql). The tsvector covers body text
-- only; author and tradition are filtered via WHERE clauses to
-- keep relevance ranking clean.
--
-- Run as neondb_owner, then populate via:
--   pnpm ingest:commentary-fts
-- ============================================================

CREATE TABLE IF NOT EXISTS commentary_entries (
  id            SERIAL PRIMARY KEY,
  book          SMALLINT NOT NULL,
  chapter       SMALLINT NOT NULL,
  verse_start   SMALLINT NOT NULL,
  verse_end     SMALLINT NOT NULL,
  author        TEXT NOT NULL,
  year          SMALLINT,
  tradition     TEXT,
  source_title  TEXT NOT NULL,
  source_url    TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,

  tsv           tsvector GENERATED ALWAYS AS (
                  to_tsvector('english', body)
                ) STORED
);

CREATE INDEX IF NOT EXISTS idx_commentary_fts
  ON commentary_entries USING gin(tsv);

CREATE INDEX IF NOT EXISTS idx_commentary_passage
  ON commentary_entries (book, chapter, verse_start);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commentary_natural_key
  ON commentary_entries (book, chapter, verse_start, verse_end, author, source_title);

-- Explicit grant for the runtime role. ALTER DEFAULT PRIVILEGES (migration 001)
-- should cover this automatically, but an explicit grant is defensive — if the
-- executing role differs or Neon's setup changes, the search API would 500 with
-- permission-denied. Idempotent if the default already applied.
GRANT SELECT ON commentary_entries TO app_runtime;
GRANT USAGE, SELECT ON SEQUENCE commentary_entries_id_seq TO app_runtime;
