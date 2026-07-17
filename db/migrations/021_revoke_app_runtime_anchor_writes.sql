-- ============================================================
-- 021: REVOKE app_runtime write grants on the 006 satellite tables (landmine 1)
-- ============================================================
-- GO_LIVE_EXECUTION Part B1. Migration 010 revoked corpus writes on
-- commentary_entries/sources/sections, but section_anchors / section_embeddings
-- were born writable by app_runtime (001's ALTER DEFAULT PRIVILEGES grants full
-- DML on every owner-created table) and 010 missed them. The deep-audit found the
-- same leak; 016 already REVOKEd them on DEV, but this standalone migration is the
-- record that must be APPLIED TO PROD in Part C (016 is dev-only this run).
--
-- Idempotent (REVOKE of an absent grant is a no-op). Additive/reversible: re-grant
-- with `GRANT INSERT,UPDATE,DELETE ... TO app_runtime` if ever needed (it won't —
-- the app reads the served corpus, never writes it).
-- Verify: SELECT privilege_type FROM information_schema.role_table_grants
--   WHERE grantee='app_runtime' AND table_name IN
--   ('section_anchors','section_embeddings','section_history_anchors'); → SELECT only.
--   Run as neondb_owner.  Ingest/migrations run as the OWNER role, so the REVOKE
--   does not break the ingest path (which never connects as app_runtime).
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON section_anchors           FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON section_embeddings        FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON section_history_anchors   FROM app_runtime;
