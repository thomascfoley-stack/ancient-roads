-- ============================================================
-- 010: the runtime role must not be able to MUTATE the licensed corpus
-- ============================================================
-- §0 safety (queue "corrected build"). Migration 001 granted app_runtime
-- INSERT/UPDATE/DELETE on ALL tables. `embeddings` is protected by RLS (app_runtime is
-- NOBYPASSRLS; it has only read + user-row INSERT policies, so corpus rows and any
-- UPDATE/DELETE are denied). But commentary_entries / sources / sections have **no RLS** —
-- so the web runtime role can DELETE the entire licensed FTS corpus. Verified: the runtime
-- writes only user tables (chats, messages, notes, highlights, chat_memories, channels,
-- api_rate_limit); it NEVER writes these. Ingest runs as the owner role, unaffected.
--
-- Run as neondb_owner.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON commentary_entries FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON sources            FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON sections           FROM app_runtime;

-- Keep future corpus tables from silently re-acquiring writes via migration 001's
-- ALTER DEFAULT PRIVILEGES: new corpus tables must GRANT SELECT explicitly (documented in
-- docs/SECURITY.md). We do NOT change the default here (user tables still need writes);
-- this is a per-table narrowing for the known corpus tables.
