-- ============================================================
-- 129: search_outcomes — the query log for every search surface (owner directive 2026-08-23)
-- ============================================================
-- ask_outcomes (116) made /ask queries durable and owner-readable; every OTHER query surface
-- still evaporated at the route boundary — /api/search/works, /api/search/commentaries,
-- /api/studies/library-search, /api/user-corpus/search and /api/history/search logged nothing
-- durable (history persists a per-user thread, which is product UX, not an owner-readable log).
-- The owner's directive: "when users run queries searches etc we need to see all of that."
-- One row per completed search lands here, written off the request path
-- (after()/fire-and-forget in web/src/lib/search-outcomes.ts — a logging failure must never
-- break a search, so the writer fails open with a caught log line), same shape as 116.
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS; DROP POLICY IF EXISTS before CREATE.
--   RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/129_search_outcomes.sql
--   ROLLBACK: DROP TABLE IF EXISTS search_outcomes;
--
-- ── WHAT A ROW IS ─────────────────────────────────────────────────────────────────────────────
-- query text + which surface + the filter parameters + how many results came back. Stored as
-- the user's own INPUT and counts only — never corpus text, never result snippets: the
-- licensing posture stays "text lives in exactly one place". `params` carries the validated
-- filter set the route already parsed (catalogs/traditions/book/group/mode/…), never raw URL.
--
-- ── WHO IS ATTRIBUTED ─────────────────────────────────────────────────────────────────────────
-- user_id is NULLABLE and NULL is the norm on the two PUBLIC surfaces (works, commentaries):
-- those routes are unauthenticated by design and deliberately do not resolve a session just to
-- attribute a log row — a session lookup on the hottest public read path buys attribution at
-- the price of latency (D4: the /ask budget lesson). The authed surfaces (library, my_works,
-- history) attribute through runAsUser exactly as ask_outcomes does.
--
-- ── GRANTS ARE STATED, NOT ASSUMED — the 032/039/106 lesson (verbatim from 116) ───────────────
-- The ONLY runtime verb is INSERT (one append per search). 032's narrowed default privileges
-- mean the table is also born with SELECT for app_runtime; like waitlist (033/034), the GRANT
-- stays and the POLICY does the narrowing — there is deliberately no SELECT policy, so
-- app_runtime reads zero rows even though the grant exists. The owner reads as the OWNER role
-- from scripts (scripts/query-log.mts), never through the runtime. UPDATE/DELETE are absent by
-- default privilege and nothing here grants them: the log is append-only BY GRANT, not by habit.
-- The DO tail RAISES on any disagreement.

BEGIN;

CREATE TABLE IF NOT EXISTS search_outcomes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT,                            -- NULL: the public surfaces do not resolve a session
  surface      TEXT NOT NULL CHECK (surface IN ('works', 'commentaries', 'library', 'my_works', 'history')),
  query        TEXT NOT NULL,                   -- the search as typed (route-bounded; ≤500 chars here too)
  params       JSONB NOT NULL DEFAULT '{}',     -- validated filters (catalogs/traditions/sub/work/book/author/group/mode/documentId/offset)
  result_count INT NOT NULL CHECK (result_count >= 0),  -- rows returned on this page
  total        INT,                             -- corpus-wide match count where the surface reports one; NULL where it does not
  latency_ms   INT NOT NULL CHECK (latency_ms >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The owner review scans by time; per-user behaviour (if it is ever surfaced) by user + time.
CREATE INDEX IF NOT EXISTS idx_search_outcomes_created ON search_outcomes (created_at);
CREATE INDEX IF NOT EXISTS idx_search_outcomes_user_created ON search_outcomes (user_id, created_at);

-- ── RLS at creation — INSERT-only, the waitlist shape (034), verbatim from 116 ─────────────────
-- No SELECT/UPDATE/DELETE policy, deliberately: with RLS enabled and no policy for a command,
-- that command affects zero rows for app_runtime (proven on a throwaway for waitlist, 034).
ALTER TABLE search_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_outcomes_insert ON search_outcomes;
CREATE POLICY search_outcomes_insert ON search_outcomes
  FOR INSERT TO app_runtime
  WITH CHECK (user_id IS NULL OR user_id = current_setting('app.current_user_id', true));

-- Stated, even though 032's default privileges already convey it: the row write is the ONE verb
-- this table exists for, and a default-privilege change must fail this file's DO tail, not a
-- production search (which fails OPEN — the search still answers; the log row is just lost).
GRANT INSERT ON search_outcomes TO app_runtime;

-- ── Verification, in the same file — 106/110's self-verifying tail ─────────────────────────────
DO $$
BEGIN
  -- The verb the writer needs. Absence = the 039 outage shape, caught at apply time.
  IF NOT has_table_privilege('app_runtime', 'search_outcomes', 'INSERT') THEN
    RAISE EXCEPTION '129 FAILED: app_runtime lacks INSERT on search_outcomes — every outcome write would fail (silently, by design)';
  END IF;

  -- The verbs that must remain absent. Presence = the least-privilege posture drifted.
  IF has_table_privilege('app_runtime', 'search_outcomes', 'UPDATE') THEN
    RAISE EXCEPTION '129 FAILED: app_runtime has UPDATE on search_outcomes; the log is append-only';
  END IF;
  IF has_table_privilege('app_runtime', 'search_outcomes', 'DELETE') THEN
    RAISE EXCEPTION '129 FAILED: app_runtime has DELETE on search_outcomes; the log is append-only';
  END IF;

  -- RLS on, with EXACTLY the INSERT policy: no policy for a command = zero rows for app_runtime,
  -- so a second policy appearing here means someone widened runtime access without review.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'search_outcomes' AND relrowsecurity) THEN
    RAISE EXCEPTION '129 FAILED: RLS not enabled on search_outcomes';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'search_outcomes') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = 'search_outcomes'
                      AND policyname = 'search_outcomes_insert'
                      AND cmd = 'INSERT') THEN
    RAISE EXCEPTION '129 FAILED: search_outcomes must carry exactly one policy (search_outcomes_insert, FOR INSERT)';
  END IF;

  RAISE NOTICE '129 OK: search_outcomes created; RLS on; app_runtime holds INSERT and nothing else';
END $$;

COMMIT;
