-- ============================================================
-- SEC-2: least-privilege runtime role + RLS on annotation tables
-- ============================================================
-- See docs/SECURITY.md (SEC-2). Two findings this addresses:
--   (A) the app connected as `neondb_owner`, which has BYPASSRLS -> RLS never bound.
--   (B) `highlights` and `notes` shipped without RLS enabled.
--
-- Fix: the app connects at runtime as `app_runtime` (LOGIN, NOBYPASSRLS) so RLS binds;
-- `neondb_owner` is used only for migrations/DDL. Every runtime query runs inside a
-- transaction that does `set_config('app.current_user_id', <uid>, true)` (see
-- web/src/lib/db.ts runAsUser), so the per-user policies filter each request. If the
-- session var is unset, RLS returns zero rows -- the fail-safe backstop.
--
-- This file is idempotent and contains NO secrets. It assumes the `app_runtime` role
-- already exists. Create it out-of-band FIRST (password is generated, never committed):
--
--   CREATE ROLE app_runtime LOGIN NOBYPASSRLS PASSWORD '<generated>';
--
-- then run this file as `neondb_owner`. Build APP_DATABASE_URL from the pooled endpoint
-- with app_runtime's credentials and set it in the app env (Vercel + web/.env.local).
-- ============================================================

-- --- RLS on the annotation tables (mirrors the other user tables; matches schema.sql) ---
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS highlights_policy ON highlights;
CREATE POLICY highlights_policy ON highlights
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS notes_policy ON notes;
CREATE POLICY notes_policy ON notes
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- --- Least-privilege grants for the runtime role ---
-- DML only. No DDL, no ownership, no BYPASSRLS. Sequences needed for gen_random_uuid()?
-- No -- uuid pks default from gen_random_uuid(); serial/identity sequences (if any) need
-- USAGE, so grant it for safety.
GRANT CONNECT ON DATABASE neondb TO app_runtime;
GRANT USAGE  ON SCHEMA public TO app_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT                  ON ALL SEQUENCES  IN SCHEMA public TO app_runtime;
GRANT EXECUTE                        ON ALL FUNCTIONS  IN SCHEMA public TO app_runtime;

-- Cover tables/sequences/functions created by future migrations too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_runtime;
