-- ============================================================
-- 033: waitlist — remove UPDATE and DELETE from app_runtime. H14, the half that is safe today.
-- ============================================================
-- Idempotent. Run as neondb_owner:
--   DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/033_waitlist_revoke_dml.sql
--
-- SAFE AGAINST BOTH BUNDLES, which is the whole reason this is separate from 034. Measured on a
-- throwaway before applying:
--     old bundle  INSERT ... ON CONFLICT (email) DO NOTHING, new email  -> INSERT 0 1
--     old bundle  ... same statement, duplicate email                   -> INSERT 0 0
--     new bundle  plain INSERT                                          -> INSERT 0 1
--     app_runtime DELETE FROM waitlist                                  -> permission denied
--     app_runtime UPDATE waitlist SET ...                               -> permission denied
--
-- `waitlist` holds live email addresses on production. Migration 014 granted app_runtime full DML
-- via 001's ALTER DEFAULT PRIVILEGES and declined to narrow it, on the grounds that a
-- post-creation REVOKE is not reliably picked up by Neon's pooler for a NEWLY CREATED table. That
-- concern is about propagation delay on a fresh relation OID; this table has existed for weeks, so
-- the failure mode here is "the revoke takes effect late", not "the insert breaks". A REVOKE
-- cannot break INSERT, which is what makes it the safe half.
--
-- WHAT THIS DOES NOT DO: app_runtime keeps SELECT, so a compromised runtime credential can still
-- read the email list. Removing that needs RLS, RLS needs an INSERT-only policy, and an
-- INSERT-only policy is incompatible with the ON CONFLICT the currently deployed bundle runs —
-- see 034, which carries the full explanation and the precondition.
-- ============================================================

REVOKE UPDATE, DELETE ON waitlist FROM app_runtime;

INSERT INTO schema_migrations (filename, applied_by)
VALUES ('033_waitlist_revoke_dml.sql', current_user)
ON CONFLICT (filename) DO NOTHING;
