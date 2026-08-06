-- ============================================================
-- 105: suggested readings — what a document searched, and what it found
-- ============================================================
-- docs/SUGGESTED_READINGS_DESIGN.md, owner-approved 2026-08-06.
--
-- WHY THE RESULTS ARE STORED RATHER THAN COMPUTED PER REQUEST.
-- The search is exact, index-free, one category at a time, because the HNSW path STARVES: measured
-- against production, `LIMIT 60` at the default ef_search=40 returned 21 rows, and with a category
-- filter it returned ZERO. Exact scans return the true top-k and cost ~49s for all five categories
-- (sermons 162k rows, commentaries 133k, theology 35k, hymns 6.9k, poetry 4.1k). The owner ruled
-- accuracy over speed and accepted ~90s.
--
-- 49-90 seconds is not a request, and the count has to render on a card in a list. So the job runs
-- on the queue this slice already built and writes its answer here; the card reads a count.
--
-- READINGS STATUS IS SEPARATE FROM `status` ON PURPOSE. `status` is the INDEXING lifecycle. If a
-- re-run reused it, re-searching a document would make a perfectly indexed sermon report itself as
-- unindexed, and the status wall would lie about the thing it exists to tell the truth about.

ALTER TABLE user_documents
  -- The sidebar categories this document searches. NULL = never chosen; the app applies its
  -- default. An empty array is a real answer meaning "search nothing", and is not the same as NULL.
  ADD COLUMN IF NOT EXISTS search_categories TEXT[],
  ADD COLUMN IF NOT EXISTS readings_status TEXT
    CHECK (readings_status IN ('pending', 'running', 'ready', 'failed')),
  -- 0-100, weighted by the ROW COUNT of each category rather than by how many categories are done,
  -- so the bar does not lurch when commentaries (133k rows) finishes next to poetry (4k).
  ADD COLUMN IF NOT EXISTS readings_progress SMALLINT NOT NULL DEFAULT 0,
  -- The category currently being searched, so the UI can name it instead of spinning anonymously.
  ADD COLUMN IF NOT EXISTS readings_step TEXT,
  ADD COLUMN IF NOT EXISTS readings_error TEXT,
  -- STALENESS IS AT LEAST VISIBLE. Nothing re-runs these when the corpus grows, so a reader can be
  -- told when the answer was computed rather than being left to assume it is current.
  ADD COLUMN IF NOT EXISTS readings_done_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_document_readings (
  document_id TEXT NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,          -- denormalized, so every RLS policy is a direct match
  category    TEXT NOT NULL,          -- the sidebar category it was found under
  author      TEXT NOT NULL,
  work        TEXT NOT NULL,          -- the corpus slug; never shown to a reader
  work_title  TEXT,                   -- resolved at write time, so no slug can reach a reader
  tradition   TEXT,
  similarity  REAL NOT NULL,
  PRIMARY KEY (document_id, category, author, work)
);

-- The card's count and the reading view's list are both this lookup.
CREATE INDEX IF NOT EXISTS idx_user_document_readings_doc
  ON user_document_readings (user_id, document_id, category, similarity DESC);

ALTER TABLE user_document_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_document_readings_policy ON user_document_readings;
CREATE POLICY user_document_readings_policy ON user_document_readings
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON user_document_readings TO app_runtime;
