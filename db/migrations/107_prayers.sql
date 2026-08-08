-- ============================================================
-- 107: prayers — the prayer journal's own entity (PR1a)
-- ============================================================
-- docs/UX_REMEDIATION.md block `PR1a`. IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS; DROP POLICY
-- IF EXISTS before CREATE.
--   RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/107_prayers.sql
--   ROLLBACK: DROP TABLE IF EXISTS prayers;
--
-- ── A DISTINCT ENTITY, NEVER notes-with-a-flag ──────────────────────────────────────────────────
-- The block's data-model rule, binding from the first line of code. Notes and prayer are different
-- acts — one says "I am studying", the other "I am responding" — and forcing the second into the
-- first's container trains readers to treat the app as a research tool. It is also the privacy
-- boundary: retrofitting privacy onto a shared container does not work, and a `notes.is_prayer`
-- column would put prayer text inside every query that already reads notes.
--
-- ── STANDS ALONE, WITH AN OPTIONAL VERSE REFERENCE (owner ruling 2026-08-08) ────────────────────
-- `verse_id` is NULLABLE. A prayer prompted by John 1:14 keeps that reference; a prayer written
-- from the journal has none, and both are first-class. The reference is a POINTER, NOT OWNERSHIP:
-- there is deliberately NO foreign key to a passage and nothing cascades from one. Re-versioning or
-- removing a passage must never delete what someone prayed.
--
-- ── GRANTS ARE STATED, NOT ASSUMED — the 2026-08-07 lesson ──────────────────────────────────────
-- Migration 032 narrowed `ALTER DEFAULT PRIVILEGES` to SELECT + INSERT, so a table created after it
-- is born UNABLE TO UPDATE OR DELETE ITSELF. Migration 039 assumed otherwise, citing a comment that
-- 032 had already invalidated, and shipped two features that never worked for any user until
-- migration 106 repaired them. A prayer must be editable and deletable, so this file says so.

BEGIN;

CREATE TABLE IF NOT EXISTS prayers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  body       text NOT NULL,
  -- Optional, and no FK by design: see the header. A verse the prayer was prompted by, if any.
  verse_id   integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Tombstone, matching notes/highlights/bookmarks, so a delete is recoverable for the same window
  -- everything else in this database is.
  deleted_at timestamptz
);

-- The journal reads "mine, newest first, not deleted". One index serves it.
CREATE INDEX IF NOT EXISTS idx_prayers_user_created
  ON prayers (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE prayers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prayers_policy ON prayers;
CREATE POLICY prayers_policy ON prayers
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Explicit, because the default since 032 is SELECT + INSERT only. A prayer that cannot be edited
-- or deleted is not a prayer journal, it is an append-only log.
GRANT SELECT, INSERT, UPDATE, DELETE ON prayers TO app_runtime;

-- Verification in the same file, so a typo fails the migration instead of being reported applied.
-- This CAN fail: run it against a database without the grant and it raises.
DO $$
BEGIN
  IF NOT has_table_privilege('app_runtime', 'prayers', 'UPDATE') THEN
    RAISE EXCEPTION '107 FAILED: app_runtime cannot UPDATE prayers — a prayer would not be editable';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'prayers', 'DELETE') THEN
    RAISE EXCEPTION '107 FAILED: app_runtime cannot DELETE prayers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prayers') THEN
    RAISE EXCEPTION '107 FAILED: prayers has no RLS policy — it would be readable across accounts';
  END IF;
  RAISE NOTICE '107 OK: prayers created, RLS on, app_runtime holds SELECT/INSERT/UPDATE/DELETE';
END $$;

COMMIT;
