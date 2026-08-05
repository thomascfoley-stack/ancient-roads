-- ============================================================
-- 039: study plans, verse coverage, and the topical index register
-- ============================================================
-- Implements docs/STUDY_PLANS_DESIGN.md §6/§9 (owner-approved scope
-- 2026-08-02: §12 steps 1-4 + the topical-index corpus) and ADR-045.
--
-- Three pieces, one migration because they ship as one slice. The
-- 'topical_index' source_type widening is migration 040, SPLIT OUT after this
-- file's first application timed out on its lock: a concurrent corpus-copy
-- session held a multi-hour read transaction (ACCESS SHARE on sources +
-- embeddings), and the CHECK swap needs ACCESS EXCLUSIVE on both. Everything
-- in THIS file conflicts with nothing that session holds:
--   (1) plans + plan_days       — user data, RLS, the schedule store
--   (2) verse_coverage          — derived corpus rollup, no RLS
--   (3) topical_entries         — ordered topic→passage rows under sections
--       (its FK takes SHARE ROW EXCLUSIVE on sections, compatible with the
--       copier's ACCESS SHARE)

SET lock_timeout = '5s';

-- ------------------------------------------------------------
-- (1) plans + plan_days — STUDY_PLANS_DESIGN §9
-- ------------------------------------------------------------
-- No feed_salt: delivery is a third-party push service later (ADR-045);
-- the .ics bearer-URL design it belonged to was not approved.

CREATE TABLE plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  spec          JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_user ON plans(user_id, updated_at DESC);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_policy ON plans
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE TABLE plan_days (
  plan_id       UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index     INTEGER NOT NULL,
  day_date      DATE NOT NULL,
  verse_start   INTEGER NOT NULL,
  verse_end     INTEGER NOT NULL,
  completed_at  TIMESTAMPTZ,
  PRIMARY KEY (plan_id, day_index)
);
CREATE INDEX idx_plan_days_date ON plan_days(plan_id, day_date);

-- plan_days has no user_id; ownership flows through the parent row.
ALTER TABLE plan_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_days_policy ON plan_days
  USING (EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_id
                   AND p.user_id = current_setting('app.current_user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_id
                        AND p.user_id = current_setting('app.current_user_id', true)));

-- Migration 001's ALTER DEFAULT PRIVILEGES grants app_runtime full DML on
-- owner-created tables, so no new GRANT is needed (016:33-38 records this).

-- ------------------------------------------------------------
-- (2) verse_coverage — STUDY_PLANS_DESIGN §6
-- ------------------------------------------------------------
-- Derived rollup: distinct admitted authors + section count anchored over
-- each verse. Rebuilt by scripts/rebuild-verse-coverage.ts on every publish
-- flip; never hand-maintained. NOT user data — classified in
-- USER_TABLE_EXCLUDED (scripts/lib/user-data-invariant.mjs) in this change.

CREATE TABLE verse_coverage (
  verse_id       INTEGER PRIMARY KEY,
  author_count   SMALLINT NOT NULL,
  section_count  INTEGER  NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON verse_coverage TO app_runtime;
REVOKE INSERT, UPDATE, DELETE ON verse_coverage FROM app_runtime;

-- ------------------------------------------------------------
-- (3) topical_entries — the ordered topic→passage expansion
-- ------------------------------------------------------------
-- One row per verse reference in a topical-index section, in the order the
-- original author printed them, with the author's own subtopic label carried
-- verbatim. section_anchors cannot hold this: it is unordered and unlabeled,
-- and the plan builder needs "AARON → Lineage → Ex 6:16-20" as a sequence.
-- Corpus-side platform content (like sections), so: no RLS, SELECT-only for
-- app_runtime, and classified in USER_TABLE_EXCLUDED.

CREATE TABLE topical_entries (
  id             BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  section_id     BIGINT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  label          TEXT,
  verse_id_start INTEGER NOT NULL,
  verse_id_end   INTEGER NOT NULL,
  UNIQUE (section_id, ordinal)
);
CREATE INDEX idx_topical_entries_verse ON topical_entries(verse_id_start, verse_id_end);

GRANT SELECT ON topical_entries TO app_runtime;
REVOKE INSERT, UPDATE, DELETE ON topical_entries FROM app_runtime;
