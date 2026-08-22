-- ============================================================
-- 125: study_blocks.ask_outcome_id — the clipping → ask link (the un-backfillable one)
-- ============================================================
-- WHY NOW, AND WHY IT CANNOT WAIT
-- `ask_outcomes` (116) records what an ask SURFACED. It records nothing about what the reader
-- did with it: there is no click, open, rating or dwell column, and no such table exists
-- anywhere in this schema. So the log is training signal for the Phase-D verifier/stance
-- classifiers (which is what 116's own header says it is) and is NOT a ranking signal — it has
-- no positives and no negatives, only "here is what we showed".
--
-- The nearest thing to a genuine positive already exists and is one column short of usable:
-- a `study_blocks` row with kind='clipping' and a `source_id` from the ask surface is a reader
-- KEEPING a voice. Joining that to the ask that produced it gives (query, surfaced set, the one
-- they kept) — a real relevance label, from behaviour, with no new UI and no new prompt.
--
-- Today that join can only be approximated by user + source_id + a time window, which is lossy
-- (the same voice surfaces on many asks) and gets worse as history grows. This column makes it
-- exact. It CANNOT BE BACKFILLED: nothing in the schema records which ask a past clipping came
-- from, so every day of traffic without it is signal permanently lost. That is the whole reason
-- this is a migration and not a backlog item.
--
-- IDEMPOTENT: ADD COLUMN / CREATE INDEX IF NOT EXISTS.
--   RUN (owner):  node db/apply-migration.mjs db/migrations/125_study_blocks_ask_outcome_link.sql
--   ROLLBACK:     ALTER TABLE study_blocks DROP COLUMN IF EXISTS ask_outcome_id;
--
-- ── NO FOREIGN KEY, AND THAT IS THE DESIGN, NOT AN OMISSION ───────────────────────────────────
-- 116 makes the ask_outcomes write FAIL OPEN on purpose: "a logging failure must never break an
-- ask… the training row is just lost" (after()/fire-and-forget, errors swallowed). A REFERENCES
-- constraint would convert that tolerated, silent telemetry loss into a HARD FAILURE on the
-- user's own study write — the reader's clipping refused because a logging insert lost a race
-- minutes earlier. The referent is genuinely allowed not to exist. So this is a plain UUID, and
-- the join is an outer one. A dangling id means "the ask row was lost", which is information.
--
-- ── NULLABLE, DELIBERATELY ───────────────────────────────────────────────────────────────────
-- Text blocks, reader clippings and topic clippings have no ask behind them. Pre-125 rows stay
-- NULL forever (see un-backfillable above). NULL means "not from an ask, or from an ask we
-- cannot name" — never "unlinked by mistake".
--
-- ── GRANTS: NONE ADDED, AND THAT IS CHECKED BELOW ────────────────────────────────────────────
-- A column inherits its table's privileges; RLS policies on study_blocks are row-level and are
-- untouched by an ADD COLUMN. The 032/039/106 lesson is about NEW tables, not new columns — but
-- the DO tail asserts the write verbs anyway rather than reasoning about it, because that is the
-- lesson generalised: state the precondition, do not cite it.
--
-- ── THE HONEST LIMIT ON OWNERSHIP ────────────────────────────────────────────────────────────
-- app_runtime holds INSERT on ask_outcomes and NO SELECT policy (116), so the clipping insert
-- CANNOT verify that the supplied ask_outcome_id belongs to the clipping user. It does not need
-- to for correctness: the id is a server-generated UUID returned only to the user who made that
-- ask, so it is unguessable rather than unforgeable. The residual is that a user could attach
-- one of their OWN ask ids to one of their OWN clippings — which pollutes nothing but their own
-- labels. Stated because an unstated assumption here would be exactly the kind this repo keeps
-- paying for.

BEGIN;

ALTER TABLE study_blocks ADD COLUMN IF NOT EXISTS ask_outcome_id UUID;

COMMENT ON COLUMN study_blocks.ask_outcome_id IS
  'ask_outcomes.id this clipping was kept from (no FK: 116 fails open, the referent may not exist). NULL = not from an ask.';

-- The Phase-D export joins ask_outcomes → the clippings kept from it. Partial: the column is
-- NULL on every text block, reader clipping and pre-125 row, so indexing those buys nothing.
CREATE INDEX IF NOT EXISTS idx_study_blocks_ask_outcome
  ON study_blocks (ask_outcome_id)
  WHERE ask_outcome_id IS NOT NULL;

-- ── Verification in the same file (106/110/116's self-verifying tail) ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'study_blocks' AND column_name = 'ask_outcome_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION '125: study_blocks.ask_outcome_id missing or not uuid';
  END IF;

  -- The verbs the clipping path needs. An ADD COLUMN should not disturb these; assert it rather
  -- than assume it (the 039 outage was a cited premise that had stopped being true).
  IF NOT has_table_privilege('app_runtime', 'study_blocks', 'INSERT')
     OR NOT has_table_privilege('app_runtime', 'study_blocks', 'SELECT') THEN
    RAISE EXCEPTION '125: app_runtime lost INSERT/SELECT on study_blocks';
  END IF;

  -- No FK, on purpose (see header). If someone adds one later, this fails and they read why.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name
     WHERE tc.table_name = 'study_blocks' AND tc.constraint_type = 'FOREIGN KEY'
       AND k.column_name = 'ask_outcome_id'
  ) THEN
    RAISE EXCEPTION '125: ask_outcome_id must NOT carry a foreign key — ask_outcomes fails open (116), so the referent is allowed not to exist; an FK would break a user study write on a lost telemetry row';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_study_blocks_ask_outcome') THEN
    RAISE EXCEPTION '125: idx_study_blocks_ask_outcome missing';
  END IF;
END $$;

COMMIT;
