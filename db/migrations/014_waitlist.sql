-- ============================================================
-- 014: waitlist — public "request early access" capture (marketing landing)
-- ============================================================
-- Backs POST /api/waitlist (web/src/app/api/waitlist/route.ts), the CTA on the public
-- marketing page (/). ADDITIVE, no RLS: this is a public signup list, not per-user data.
--
-- GRANTS: app_runtime gets its DML from migration 001's ALTER DEFAULT PRIVILEGES, applied
-- ATOMICALLY when this table is created by neondb_owner. We deliberately do NOT then
-- REVOKE-down to INSERT-only: a post-creation REVOKE/GRANT is not reliably picked up by
-- Neon's connection POOLER (cached backends keep a stale relcache ACL for the new table →
-- "permission denied for table waitlist" via the pooled app_runtime even though
-- has_table_privilege() reads true). Relying on the create-time default grant (a fresh
-- relation OID → pooler backends load a fresh relcache) is what makes the insert work. The
-- cost is app_runtime holding full DML on this ONE public, non-sensitive signup table —
-- acceptable; the app never exposes reads of it.
--
-- Idempotent. Run as neondb_owner:
--   DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/014_waitlist.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS waitlist (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email      TEXT NOT NULL,
  source     TEXT,                               -- where the signup came from ('landing')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)                                 -- dedupe repeat signups (ON CONFLICT DO NOTHING)
);
