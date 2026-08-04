-- ============================================================
-- 042: plan_day_readings — a topical day's several labeled passages
-- ============================================================
-- ADR-048 addendum (topic→plan wiring, owner-approved 2026-08-02 late). A
-- book/range/collection day IS one contiguous span, which plan_days'
-- verse_start/verse_end holds exactly. A TOPICAL day is different in kind:
-- it carries several non-contiguous passages, each with the index author's
-- own subtopic label ("Daily, in the morning → Ps 5:3"). One range per day
-- cannot say that; an envelope would span unrelated Scripture and lie.
--
-- One row per reading, ordered within the day. For non-topical plans the
-- table simply has no rows — plan_days remains the whole story there, and
-- plan_days.verse_start/verse_end on a topical day carries the day's FIRST
-- reading (the lead), so every existing consumer keeps working unchanged.
--
-- Ownership flows plan_day_readings → plans via plan_id (same shape as
-- plan_days): RLS policy is an EXISTS against the parent plan, and the
-- classification in scripts/lib/user-data-invariant.mjs (this change) uses
-- ownerParent {plans, plan_id} so the residue gate sweeps it through the
-- join rather than skipping it.

SET lock_timeout = '5s';

CREATE TABLE plan_day_readings (
  plan_id     UUID NOT NULL,
  day_index   INTEGER NOT NULL,
  ordinal     INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end   INTEGER NOT NULL,
  label       TEXT,
  PRIMARY KEY (plan_id, day_index, ordinal),
  FOREIGN KEY (plan_id, day_index) REFERENCES plan_days(plan_id, day_index) ON DELETE CASCADE
);

ALTER TABLE plan_day_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_day_readings_policy ON plan_day_readings
  USING (EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_id
                   AND p.user_id = current_setting('app.current_user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_id
                        AND p.user_id = current_setting('app.current_user_id', true)));

-- Migration 001's ALTER DEFAULT PRIVILEGES grants app_runtime DML; RLS is the
-- isolation boundary, as for plans/plan_days (039).

COMMENT ON TABLE plan_day_readings IS
  'Ordered labeled passages within one plan day. Rows exist ONLY for topic-scoped plans (042); book/range/collection days are fully described by plan_days.';
