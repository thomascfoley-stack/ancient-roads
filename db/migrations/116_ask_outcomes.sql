-- ============================================================
-- 116: ask_outcomes — the /ask outcome log (Phase-D enabler, owner directive 2026-08-15)
-- ============================================================
-- docs/ARCHITECTURE.md Phase-D (verifier-V2 + stance classifiers via LoRA fine-tuning) is gated
-- on ~1-2k logged /ask examples, and nothing persisted them: T0 recon (2026-08-12) measured zero
-- assistant messages with stored surfaced lists, and logAskOutcome's only sink was a stdout
-- console line. One row per COMPLETED ask lands here from now on, written off the request path
-- (after()/fire-and-forget in web/src/lib/ask-outcomes.ts — a logging failure must never break
-- an ask, so the writer fails open with a caught log line).
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS; DROP POLICY IF EXISTS before CREATE.
--   RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/116_ask_outcomes.sql
--   ROLLBACK: DROP TABLE IF EXISTS ask_outcomes;
--
-- ── WHAT A ROW IS ─────────────────────────────────────────────────────────────────────────────
-- query text + which works/sections were surfaced + how the compose/verify loop went. Retrieved
-- rows are stored as REFERENCES (source id, work slug, verse window, lane) — never corpus text:
-- this table is a training-signal index, not a corpus copy, and the licensing posture stays
-- "text lives in exactly one place". `failures` carries the rejected attempts' violation sets
-- (already bounded at the source: ≤12 violations/attempt, ≤300 chars/field, teach.ts) or, for an
-- `empty` verdict, the no-sources/no-coverage reason.
--
-- ── GRANTS ARE STATED, NOT ASSUMED — the 032/039/106 lesson ─────────────────────────────────────
-- The ONLY runtime verb is INSERT (one append per ask). 032's narrowed default privileges mean
-- the table is also born with SELECT for app_runtime; like waitlist (033/034), the GRANT stays
-- and the POLICY does the narrowing — there is deliberately no SELECT policy, so app_runtime
-- reads zero rows even though the grant exists. The Phase-D export reads as the OWNER role from
-- scripts, never through the runtime. UPDATE/DELETE are absent by default privilege and nothing
-- here grants them: the log is append-only BY GRANT, not by habit. The DO tail RAISES on any
-- disagreement (red-proof: revoke the INSERT grant and apply fails — same procedure as 110's,
-- docs/evidence/study-docs-p1/).
--
-- ── user_id IS NULLABLE — anonymous asks happen ────────────────────────────────────────────────
-- Both /ask routes are authed today, but the column must not force a fake id the day a public
-- or logged-out ask path exists. The INSERT policy admits a NULL user_id outright and otherwise
-- binds to the request's app.current_user_id (the write goes through runAsUser, db.ts, so the
-- GUC is set LOCAL in the insert's transaction). Note the honest limit, same as every
-- user-scoped policy here: app_runtime can SET the GUC itself, so the check is a coding-error
-- tripwire, not a barrier against a compromised credential — the barrier is that INSERT is the
-- only verb it holds.

BEGIN;

CREATE TABLE IF NOT EXISTS ask_outcomes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT,                            -- NULL: anonymous asks happen
  query       TEXT NOT NULL,                   -- the question as asked (route-bounded, ≤500 chars)
  lanes       JSONB NOT NULL DEFAULT '{}',     -- requested lane toggles (songVerse/sermons/theology/historians)
  retrieved   JSONB NOT NULL DEFAULT '[]',     -- [{source, work, verse, verse_end, lane}] — ids only, never text
  attempts    INT NOT NULL CHECK (attempts >= 0),  -- compose attempts; 0 for an empty verdict
  verdict     TEXT NOT NULL CHECK (verdict IN ('composed', 'fallback', 'empty')),
  failures    JSONB NOT NULL DEFAULT '[]',     -- rejected attempts' violation sets, or the empty-reason
  latency_ms  INT NOT NULL CHECK (latency_ms >= 0),
  stage_ms    JSONB,                           -- per-stage timings (embed/retrieve/lanes/compose[]/verify[]/total)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The Phase-D export scans by time; per-user history (if it is ever surfaced) by user + time.
CREATE INDEX IF NOT EXISTS idx_ask_outcomes_created ON ask_outcomes (created_at);
CREATE INDEX IF NOT EXISTS idx_ask_outcomes_user_created ON ask_outcomes (user_id, created_at);

-- ── RLS at creation — INSERT-only, the waitlist shape (034) ────────────────────────────────────
-- No SELECT/UPDATE/DELETE policy, deliberately: with RLS enabled and no policy for a command,
-- that command affects zero rows for app_runtime (proven on a throwaway for waitlist, 034).
ALTER TABLE ask_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ask_outcomes_insert ON ask_outcomes;
CREATE POLICY ask_outcomes_insert ON ask_outcomes
  FOR INSERT TO app_runtime
  WITH CHECK (user_id IS NULL OR user_id = current_setting('app.current_user_id', true));

-- Stated, even though 032's default privileges already convey it: the row write is the ONE verb
-- this table exists for, and a default-privilege change must fail this file's DO tail, not a
-- production ask (which fails OPEN — the ask still answers; the training row is just lost).
GRANT INSERT ON ask_outcomes TO app_runtime;

-- ── Verification, in the same file — 106/110's self-verifying tail ─────────────────────────────
DO $$
BEGIN
  -- The verb the writer needs. Absence = the 039 outage shape, caught at apply time.
  IF NOT has_table_privilege('app_runtime', 'ask_outcomes', 'INSERT') THEN
    RAISE EXCEPTION '116 FAILED: app_runtime lacks INSERT on ask_outcomes — every outcome write would fail (silently, by design)';
  END IF;

  -- The verbs that must remain absent. Presence = the least-privilege posture drifted.
  IF has_table_privilege('app_runtime', 'ask_outcomes', 'UPDATE') THEN
    RAISE EXCEPTION '116 FAILED: app_runtime has UPDATE on ask_outcomes; the log is append-only';
  END IF;
  IF has_table_privilege('app_runtime', 'ask_outcomes', 'DELETE') THEN
    RAISE EXCEPTION '116 FAILED: app_runtime has DELETE on ask_outcomes; the log is append-only';
  END IF;

  -- RLS on, with EXACTLY the INSERT policy: no policy for a command = zero rows for app_runtime,
  -- so a second policy appearing here means someone widened runtime access without review.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ask_outcomes' AND relrowsecurity) THEN
    RAISE EXCEPTION '116 FAILED: RLS not enabled on ask_outcomes';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'ask_outcomes') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = 'ask_outcomes'
                      AND policyname = 'ask_outcomes_insert'
                      AND cmd = 'INSERT') THEN
    RAISE EXCEPTION '116 FAILED: ask_outcomes must carry exactly one policy (ask_outcomes_insert, FOR INSERT)';
  END IF;

  RAISE NOTICE '116 OK: ask_outcomes created; RLS on; app_runtime holds INSERT and nothing else';
END $$;

COMMIT;
