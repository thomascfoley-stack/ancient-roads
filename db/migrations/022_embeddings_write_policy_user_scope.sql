-- 022 (Part B, landmine 3 — A6 line-by-line 2026-07-17): the app_runtime role
-- can INSERT into the SERVED corpus. embeddings_write_policy's WITH CHECK admits
-- `user_id IS NULL` (platform content), and app_runtime holds INSERT on embeddings
-- for user content — so a compromised/buggy app path could write platform-visible
-- rows into the teacher's corpus. Platform ingest runs as the OWNER, which BYPASSES
-- RLS, so tightening the policy to user-scoped writes does not affect ingestion.
--
-- Recreate the write policy to allow ONLY the caller's own user rows. Owner ingest
-- is unaffected (RLS bypass). Idempotent (DROP IF EXISTS then CREATE).
-- Rollback: recreate the policy with the `user_id IS NULL OR` branch restored.
--   Run as neondb_owner. DEV-PROVEN; part of the deliberate Part C sequence.

-- The RLS policy is the correct lever: it still lets app_runtime write the
-- caller's OWN user rows (user_id = the app user), just not platform rows
-- (user_id IS NULL). A blanket table REVOKE would break legitimate user-content
-- writes, so we do NOT revoke — we scope the policy.
DROP POLICY IF EXISTS embeddings_write_policy ON embeddings;
CREATE POLICY embeddings_write_policy ON embeddings FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
  );
