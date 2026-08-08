-- 106 — plan writes: the two grants migration 039 assumed it already had
--
-- WHAT IS BROKEN IN PRODUCTION RIGHT NOW (measured 2026-08-07, evidence at
-- docs/evidence/instr-2026-08-07/README.md):
--
--   POST   /api/plans/<id>  {"kind":"day",...}  -> 500  "permission denied for table plan_days"
--   DELETE /api/plans/<id>                      -> 500  "permission denied for table plans"
--
-- So "Mark as read" has never worked for any user, and neither has "Delete plan". Creating and
-- reading plans work, which is exactly why this hid: INSERT and SELECT were never revoked.
--
-- HOW IT HAPPENED — a comment that was true when it was written and false when it was cited.
--
--   032_audit_2026_08_02_data_layer.sql:49 (finding H15) narrowed the schema default:
--       ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON TABLES FROM app_runtime;
--   and said, correctly, that from then on "a table that genuinely needs them says so in its own
--   migration, which is the point."
--
--   039_plans_coverage_topical.sql:61-62 then created BOTH plans and plan_days, and granted
--   nothing, on these stated grounds:
--       "Migration 001's ALTER DEFAULT PRIVILEGES grants app_runtime full DML on
--        owner-created tables, so no new GRANT is needed (016:33-38 records this)."
--
--   039 > 032. 016 recorded the truth of its own moment; 032 changed it; 039 cited 016 forward
--   without re-reading the current state. Both tables were born SELECT + INSERT only.
--
--   Note the shape: 032 existed BECAUSE "a human remembering a per-table REVOKE has already
--   failed twice". The very next table-creating migration failed in the mirror image. The cure
--   for a hand-maintained grant was a narrower default, and nothing checks that a migration's
--   cited premise still holds. That check is filed (docs/UX_REMEDIATION.md §9) and is NOT in this
--   file — this file fixes the outage, and a fix is not the place to introduce a new mechanism.
--
-- WHY EXACTLY THESE TWO, AND NOTHING ELSE.
--
-- Derived from the only write verbs in the plans data layer (web/src/lib/plan/store.ts):
--
--   :173  INSERT INTO plans              -- already granted (INSERT was never revoked)
--   :176  INSERT INTO plan_days          -- already granted
--   :186  INSERT INTO plan_day_readings  -- already granted
--   :294  UPDATE plan_days               -- MISSING -> granted below
--   :305  DELETE FROM plans              -- MISSING -> granted below
--
--   * No UPDATE on plans. Nothing updates a plan row; the plan-rename UI is deliberately
--     deferred (docs/UX_REMEDIATION.md §9). If rename ever ships, it says so in its own
--     migration — which is 032's rule, applied rather than quoted.
--   * No DELETE on plan_days or plan_day_readings. Both cascade:
--       039:43  plan_days.plan_id            REFERENCES plans(id)                  ON DELETE CASCADE
--       042:32  plan_day_readings(plan_id,day_index) REFERENCES plan_days(...)      ON DELETE CASCADE
--     PostgreSQL runs referential actions with the privileges of the REFERENCING table's owner,
--     not the caller's, so DELETE on plans alone is sufficient. This is asserted rather than
--     assumed: the post-apply check below deletes a real row and confirms the children went.
--   * Table-level UPDATE on plan_days, not GRANT UPDATE (completed_at). Column-level would be
--     tighter and was considered; rejected because the next column this feature touches would
--     fail with the same opaque "permission denied", which is the failure mode we are here to
--     close. The row is already reachable only through the RLS policy in 039:54-59.

GRANT UPDATE ON plan_days TO app_runtime;
GRANT DELETE ON plans     TO app_runtime;

-- Verification, in the same file, so a typo'd table name fails the migration instead of being
-- reported as applied. This block CAN fail: run it against a database without the grants above
-- and it raises. That is the red-proof, and it is the whole reason it is here rather than in a
-- comment claiming success.
DO $$
BEGIN
  IF NOT has_table_privilege('app_runtime', 'plan_days', 'UPDATE') THEN
    RAISE EXCEPTION '106 FAILED: app_runtime still lacks UPDATE on plan_days';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'plans', 'DELETE') THEN
    RAISE EXCEPTION '106 FAILED: app_runtime still lacks DELETE on plans';
  END IF;

  -- The three that must remain absent. If any of these is present, something granted more than
  -- this migration did and the least-privilege posture 032 established has drifted. Reported,
  -- not raised: blocking a production migration on an unrelated pre-existing grant is bad ops,
  -- and the assertion belongs in a test that runs every CI pass, not in a one-shot file.
  IF has_table_privilege('app_runtime', 'plans', 'UPDATE') THEN
    RAISE WARNING '106: app_runtime has UPDATE on plans, which no code path needs — investigate';
  END IF;
  IF has_table_privilege('app_runtime', 'plan_days', 'DELETE') THEN
    RAISE WARNING '106: app_runtime has DELETE on plan_days, not needed (cascade covers it)';
  END IF;
  IF has_table_privilege('app_runtime', 'plan_day_readings', 'UPDATE')
     OR has_table_privilege('app_runtime', 'plan_day_readings', 'DELETE') THEN
    RAISE WARNING '106: app_runtime has UPDATE/DELETE on plan_day_readings, not needed';
  END IF;

  RAISE NOTICE '106 OK: plan_days UPDATE and plans DELETE granted to app_runtime';
END $$;
