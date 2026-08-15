-- ============================================================
-- 110: studies / study_blocks / study_block_revisions — Study Docs P1
-- ============================================================
-- docs/STUDY_DOCS_DESIGN.md §6.1 (APPROVED 2026-08-12); build contract
-- docs/STUDY_DOCS_BUILD.md task 1.1. The design names this file 108_studies.sql —
-- 108 and 109 were taken by the FTS serve/unserve pair before this was built, so it
-- is 110 ("confirm next free number at build time" is why that instruction existed).
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS; DROP POLICY IF EXISTS before CREATE.
--   RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/110_studies.sql
--   ROLLBACK: DROP TABLE IF EXISTS study_block_revisions, study_blocks, studies;
--
-- ── BLOCKS AS ROWS, NEVER A BLOB (design F1) ────────────────────────────────────────────────────
-- A study doc is ordered rows, not a JSONB document: autosave rewrites one block, not the doc;
-- clippings stay visible to servability re-checks and search; revisions attach per block.
-- The old `study_guides` table is the blob-shaped counterexample — left in place (E2), not reused.
--
-- ── PROVENANCE IS STRUCTURAL (design F3) ────────────────────────────────────────────────────────
-- `quote` and `attribution` on a clipping row are written ONLY by the server-side INSERT…SELECT
-- (web/src/lib/studies.ts): the licensing gate runs inside the same statement that snapshots the
-- text. No route accepts client-supplied quote text (S-1). The CHECKs below make the malformed
-- states unrepresentable at the table, not just rejected at the route.
--
-- ── TOMBSTONE IS A DATA STATE (design §6.5, review S-K) ─────────────────────────────────────────
-- A live clipping has `quote`; a purged one has `quote IS NULL` + `cleared_at` + attribution. The
-- render rule everywhere is `attribution IS NOT NULL AND quote IS NULL` → attribution + notice,
-- no text, no link. Keys (source_id/section_id) survive the purge so a re-licensed work can be
-- re-snapshotted (Flow D.4) — quarantine is not a one-way door.
--
-- ── GRANTS ARE STATED, NOT ASSUMED — the 032/039/106 lesson ─────────────────────────────────────
-- Migration 032 narrowed ALTER DEFAULT PRIVILEGES to SELECT + INSERT; 039 then created two tables
-- citing a comment 032 had invalidated, and shipped two features that never worked until 106
-- repaired them. Every verb the studies data layer issues is granted HERE, each absence is
-- deliberate, and the DO block at the end raises if the state on disk disagrees. That block CAN
-- fail: revoke one of these grants and it raises (red-proof procedure in
-- docs/evidence/study-docs-p1/).

BEGIN;

-- idx_blocks_user_tsv is a composite (user_id, tsv) GIN — user scope INSIDE the index (review
-- S-J) — and a btree type in a GIN index needs this extension.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ── studies — one row per study doc ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  pinned_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_studies_user
  ON studies (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ── study_blocks — the ordered content rows ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id     UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,                  -- denormalized: H1 belt without a join
  position     TEXT NOT NULL,                  -- fractional base-62 key (lib/studies.ts positionBetween)
  kind         TEXT NOT NULL CHECK (kind IN ('text', 'clipping')),

  body         TEXT,                           -- kind='text': the user's writing (markdown)

  source_id    TEXT,                           -- embeddings key (ask-surface clippings)
  section_id   BIGINT,                         -- sections.id (reader/topic clippings; enrichment otherwise)
  work_slug    TEXT,
  ordinal      INT,
  quote        TEXT,                           -- server snapshot; NULL + attribution = tombstone (data state)
  attribution  JSONB,                          -- {author, work_title, reference} — server-written
  cleared_at   TIMESTAMPTZ,                    -- when quote was purged (Flow D); keys survive for re-hydration

  tsv          TSVECTOR GENERATED ALWAYS AS (
                 to_tsvector('english',
                   coalesce(body,'') || ' ' || coalesce(quote,'') || ' ' ||
                   coalesce(attribution->>'work_title','') || ' ' ||
                   coalesce(attribution->>'author',''))) STORED,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  -- A block is exactly its kind (review S-G): the table, not the route, is the structural guard.
  CHECK ( (kind = 'text')     = (body IS NOT NULL) ),
  CHECK ( (kind = 'clipping') = (quote IS NOT NULL OR cleared_at IS NOT NULL) ),
  CHECK ( kind = 'clipping' OR (source_id IS NULL AND section_id IS NULL AND quote IS NULL
                                AND attribution IS NULL AND work_slug IS NULL AND ordinal IS NULL) ),
  CHECK ( kind <> 'clipping' OR (source_id IS NOT NULL OR section_id IS NOT NULL) ),
  CHECK ( kind <> 'clipping' OR attribution IS NOT NULL )
);

-- Order is total and collision-free among live blocks; soft-deleted rows release their position.
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_order
  ON study_blocks (study_id, position)
  WHERE deleted_at IS NULL;
-- The doc read: ORDER BY position, id (id is the tiebreaker belt; the unique index forbids ties).
CREATE INDEX IF NOT EXISTS idx_blocks_study
  ON study_blocks (study_id, position, id)
  WHERE deleted_at IS NULL;
-- The Flow D purge and the servability re-check address clippings by their corpus keys.
CREATE INDEX IF NOT EXISTS idx_blocks_source
  ON study_blocks (source_id)
  WHERE kind = 'clipping' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blocks_section
  ON study_blocks (section_id)
  WHERE kind = 'clipping' AND deleted_at IS NULL;
-- User scope INSIDE the index (review S-J): a global GIN would walk half the corpus of everyone's
-- blocks to return one user's three rows. fastupdate OFF is deliberate (build file §5): this
-- index, unlike sections.tsv (written once at ingest), updates on every debounced autosave — the
-- pending-list batching that helps bulk ingest just adds unpredictable flush latency and bloat at
-- this table's write volume. Set explicitly so the choice is recorded and measurable, not a
-- default nobody chose.
CREATE INDEX IF NOT EXISTS idx_blocks_user_tsv
  ON study_blocks USING gin (user_id, tsv)
  WITH (fastupdate = off)
  WHERE deleted_at IS NULL;

-- ── study_block_revisions — append-only undo substrate (review S-E; text blocks only) ───────────
-- The user's own writing is the one non-regenerable asset in the system. update_text appends the
-- OUTGOING body here in the same transaction as the UPDATE (design §6.2). No versioning UI ships
-- with this; the substrate exists so an overwrite is support-recoverable, not silent loss.
CREATE TABLE IF NOT EXISTS study_block_revisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     UUID NOT NULL REFERENCES study_blocks(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  body         TEXT NOT NULL,
  replaced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revisions_block
  ON study_block_revisions (block_id, replaced_at DESC);

-- ── RLS — same policy shape as notes/highlights/prayers ─────────────────────────────────────────
-- The backstop, not the belt: C5 records that RLS under Neon's user-id format is UNPROVEN, so
-- every query in web/src/lib/studies.ts also carries the explicit user_id filters (H1) and
-- ownership-checked writes (H2). Both layers ship.
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_block_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studies_policy ON studies;
CREATE POLICY studies_policy ON studies
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS study_blocks_policy ON study_blocks;
CREATE POLICY study_blocks_policy ON study_blocks
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS study_block_revisions_policy ON study_block_revisions;
CREATE POLICY study_block_revisions_policy ON study_block_revisions
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- ── GRANTS — derived from the verbs the data layer issues, per table ────────────────────────────
-- studies:       SELECT (list/read) · INSERT (create) · UPDATE (rename, pin, updated_at bump,
--                soft-delete). No DELETE — delete is a tombstone (E4: retention forever).
-- study_blocks:  SELECT · INSERT · UPDATE (text edit, move, soft-delete cascade, Flow D purge).
--                No DELETE — same rule.
-- revisions:     SELECT (recovery reads) · INSERT (the append). No UPDATE, no DELETE — append-only
--                BY GRANT, not by habit: there is no verb to misuse later.
GRANT SELECT, INSERT, UPDATE ON studies TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON study_blocks TO app_runtime;
GRANT SELECT, INSERT ON study_block_revisions TO app_runtime;

-- ── Verification, in the same file — 106's self-verifying tail ──────────────────────────────────
-- A typo'd table name or a forgotten GRANT fails the migration instead of being reported applied.
-- Every check RAISES: unlike 106 (repairing live tables, where an unrelated pre-existing grant
-- should not block the fix), this file CREATES its tables, so any disagreement between intent and
-- state is this file's own defect and there is nothing legitimate to warn past.
DO $$
BEGIN
  -- The verbs the data layer needs. Absence = the 039 outage, caught at apply time.
  IF NOT has_table_privilege('app_runtime', 'studies', 'SELECT') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks SELECT on studies';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'studies', 'INSERT') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks INSERT on studies';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'studies', 'UPDATE') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks UPDATE on studies — rename/pin/soft-delete would 500';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'study_blocks', 'SELECT') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks SELECT on study_blocks';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'study_blocks', 'INSERT') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks INSERT on study_blocks';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'study_blocks', 'UPDATE') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks UPDATE on study_blocks — every block op would 500';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'study_block_revisions', 'SELECT') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks SELECT on study_block_revisions';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'study_block_revisions', 'INSERT') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime lacks INSERT on study_block_revisions — the undo substrate would 500';
  END IF;

  -- The verbs that must remain absent. Presence = the least-privilege posture drifted.
  IF has_table_privilege('app_runtime', 'studies', 'DELETE') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime has DELETE on studies; delete is a tombstone, never a row removal';
  END IF;
  IF has_table_privilege('app_runtime', 'study_blocks', 'DELETE') THEN
    RAISE EXCEPTION '110 FAILED: app_runtime has DELETE on study_blocks; soft-delete only';
  END IF;
  IF has_table_privilege('app_runtime', 'study_block_revisions', 'UPDATE') THEN
    RAISE EXCEPTION '110 FAILED: revisions must be append-only (UPDATE present)';
  END IF;
  IF has_table_privilege('app_runtime', 'study_block_revisions', 'DELETE') THEN
    RAISE EXCEPTION '110 FAILED: revisions must be append-only (DELETE present)';
  END IF;

  -- RLS on, with a policy, on all three — a table without either is readable across accounts the
  -- day APP_DATABASE_URL points at a role RLS binds for.
  IF EXISTS (SELECT 1 FROM pg_class
             WHERE relname IN ('studies', 'study_blocks', 'study_block_revisions')
               AND NOT relrowsecurity) THEN
    RAISE EXCEPTION '110 FAILED: RLS not enabled on all three studies tables';
  END IF;
  IF (SELECT count(DISTINCT tablename) FROM pg_policies
      WHERE tablename IN ('studies', 'study_blocks', 'study_block_revisions')) <> 3 THEN
    RAISE EXCEPTION '110 FAILED: missing RLS policy on a studies table';
  END IF;

  RAISE NOTICE '110 OK: studies/study_blocks/study_block_revisions created; RLS on; grants exactly as derived';
END $$;

COMMIT;
