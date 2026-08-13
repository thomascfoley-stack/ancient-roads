-- ============================================================
-- 111: study_blocks trim offsets — "trim, not edit" (owner sign-off 2026-08-13)
-- ============================================================
-- The owner's editor-v2 annotation asked to CUT verbose clipping text. Free-editing a quote
-- would make `quote` client-supplied (the S-1/F3 violation) and attribute edited words to the
-- quoted author — the one line this product never crosses. The ruled design: the user selects
-- the part to KEEP; the rest collapses behind an ellipsis. Underneath, only OFFSETS into the
-- server-snapshotted quote are stored — the author's bytes stay authoritative, the trim is a
-- view. Owner approval 2026-08-13: "ok ok trim not edit select part and collapse behind."
-- (The highlighter rides the same substrate later, in its own migration, when ruled.)
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; constraints dropped-if-exists before add.
--   RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/111_study_block_trim.sql
--   ROLLBACK: ALTER TABLE study_blocks DROP COLUMN IF EXISTS trim_start, DROP COLUMN IF EXISTS trim_end;
--
-- NO NEW GRANTS: the trim op is an UPDATE on study_blocks, which 110 granted (and the tail
-- below re-verifies the 110 posture is UNCHANGED — the 032/039 lesson is that a migration's
-- assumption about grants must be checked, not cited).
--
-- OFFSET VALIDITY has two layers: these CHECKs pin the SHAPE (a pair, ordered, clippings
-- only); the data layer validates offsets against length(quote) inside the UPDATE itself —
-- a bound the table cannot express, because the purge (Flow D) nulls `quote` while offsets
-- may legitimately survive for re-hydration. Render clamps or ignores out-of-range offsets
-- (fail-SAFE to the full quote; never a crash, never a hidden attribution).

BEGIN;

ALTER TABLE study_blocks ADD COLUMN IF NOT EXISTS trim_start INT;
ALTER TABLE study_blocks ADD COLUMN IF NOT EXISTS trim_end INT;

ALTER TABLE study_blocks DROP CONSTRAINT IF EXISTS study_blocks_trim_pair;
ALTER TABLE study_blocks ADD CONSTRAINT study_blocks_trim_pair
  CHECK ( (trim_start IS NULL) = (trim_end IS NULL) );

ALTER TABLE study_blocks DROP CONSTRAINT IF EXISTS study_blocks_trim_order;
ALTER TABLE study_blocks ADD CONSTRAINT study_blocks_trim_order
  CHECK ( trim_start IS NULL OR (trim_start >= 0 AND trim_end > trim_start) );

ALTER TABLE study_blocks DROP CONSTRAINT IF EXISTS study_blocks_trim_clipping_only;
ALTER TABLE study_blocks ADD CONSTRAINT study_blocks_trim_clipping_only
  CHECK ( kind = 'clipping' OR (trim_start IS NULL AND trim_end IS NULL) );

-- Verification, in the same file — the 106/110 pattern. Every check RAISES: this file owns
-- its columns and constraints, so any disagreement is this file's own defect.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'study_blocks' AND column_name = 'trim_start') THEN
    RAISE EXCEPTION '111 FAILED: trim_start column missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'study_blocks' AND column_name = 'trim_end') THEN
    RAISE EXCEPTION '111 FAILED: trim_end column missing';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'study_blocks'::regclass
        AND conname IN ('study_blocks_trim_pair', 'study_blocks_trim_order', 'study_blocks_trim_clipping_only')) <> 3 THEN
    RAISE EXCEPTION '111 FAILED: a trim CHECK constraint is missing';
  END IF;

  -- The 110 grant posture must be UNCHANGED by this file: verified, not assumed.
  IF NOT has_table_privilege('app_runtime', 'study_blocks', 'UPDATE') THEN
    RAISE EXCEPTION '111 FAILED: app_runtime lost UPDATE on study_blocks — the trim op would 500';
  END IF;
  IF has_table_privilege('app_runtime', 'study_blocks', 'DELETE') THEN
    RAISE EXCEPTION '111 FAILED: app_runtime gained DELETE on study_blocks; soft-delete only';
  END IF;
  IF has_table_privilege('app_runtime', 'study_block_revisions', 'UPDATE')
     OR has_table_privilege('app_runtime', 'study_block_revisions', 'DELETE') THEN
    RAISE EXCEPTION '111 FAILED: revisions are no longer append-only';
  END IF;

  RAISE NOTICE '111 OK: trim offsets on study_blocks; three CHECKs present; 110 grant posture unchanged';
END $$;

COMMIT;
