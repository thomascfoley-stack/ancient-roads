-- ============================================================
-- 034: waitlist RLS — H14. COUPLED TO AN APP CHANGE. DO NOT APPLY BEFORE IT DEPLOYS.
-- ============================================================
-- Idempotent. Run as neondb_owner:
--   DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/034_waitlist_rls.sql
--
-- ⚠ PRECONDITION, and it is not advisory: the deployed bundle must contain the plain-INSERT
--   version of web/src/app/api/waitlist/route.ts. Applying this against the bundle live on
--   2026-08-02 (`24677ba`, which runs `INSERT ... ON CONFLICT (email) DO NOTHING`) BREAKS THE
--   PUBLIC SIGNUP FORM — and breaks it SILENTLY, because that route's fail-soft catch returns
--   "You're on the list" to the visitor while the row is discarded.
--
--   Verify before applying:
--     curl -s https://ancientpaths.app/api/health | jq .sha     # must be a sha with the fix
--   or simply: apply this in the same change window as the deploy, never before it.
--
-- WHY THE COUPLING EXISTS. `ON CONFLICT` is incompatible with an INSERT-only policy: Postgres
-- requires the proposed row to be SELECT-visible under RLS to run the conflict arbiter, so it
-- fails with "new row violates row-level security policy" EVEN FOR A BRAND-NEW EMAIL with no
-- conflict at all. Measured on a throwaway, not inferred. Neither `FOR SELECT USING (false)` nor
-- `FOR ALL USING (false) WITH CHECK (true)` helps, and `RETURNING` fails the same way. The only
-- way to keep ON CONFLICT is to grant app_runtime read access to the entire email list, which is
-- precisely what this policy exists to remove. So the route catches SQLSTATE 23505 instead.
--
-- (For contrast, migration 032's api_rate_limit policy uses USING (true), which is why the
-- limiter's own ON CONFLICT ... DO UPDATE ... RETURNING keeps working there.)
-- WHAT 033 ALREADY DID, so this file is only the remaining half: 033 revoked UPDATE and DELETE
-- from app_runtime, which works under BOTH bundles and removes the destructive powers. This file
-- adds the property a REVOKE cannot give — that app_runtime cannot ENUMERATE the list at all —
-- and that is the part which needs the plain-INSERT route.
-- ============================================================

-- `waitlist` holds live email addresses on production. Migration 014 documented why the
-- create-time DML grant must stay — a post-creation REVOKE is not reliably picked up by Neon's
-- pooler — but stated the cost as "full DML on this ONE public, non-sensitive signup table". It
-- is neither non-sensitive nor DML-shaped: the grant includes UPDATE and DELETE where the design
-- needs only INSERT, and scripts/lib/user-data-invariant.mjs:73-80 classifies it as a user table.
--
-- RLS is the fix that does NOT depend on the pooler: policies are evaluated per query against the
-- current role, not cached in the relcache alongside table ACLs. The grant stays exactly as 014
-- needs it; the POLICY does the narrowing.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_insert_only ON waitlist;
CREATE POLICY waitlist_insert_only ON waitlist
  FOR INSERT TO app_runtime
  WITH CHECK (true);
-- No SELECT, UPDATE or DELETE policy, deliberately. With RLS enabled and no policy for a command,
-- that command affects zero rows for app_runtime. Proven on a throwaway: SELECT returns 0 while
-- the owner sees the real rows, DELETE reports "DELETE 0", UPDATE reports "UPDATE 0", and a plain
-- INSERT still succeeds. A compromised runtime credential can add a signup and can neither
-- enumerate, alter nor destroy the list.

INSERT INTO schema_migrations (filename, applied_by)
VALUES ('034_waitlist_rls.sql', current_user)
ON CONFLICT (filename) DO NOTHING;
