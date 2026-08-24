-- ============================================================
-- 130: first-party growth data — activity, attribution, suppression (owner directive 2026-08-24)
-- ============================================================
-- The owner's requirement, verbatim: "i don't want to be tool dependent… should be ancient paths
-- dependent", "i want to move off of posthog next week", "All user data should be referenceable,
-- its mine and belongs to ME". This migration is the schema half of that, and it is deliberately
-- SMALL. The reviewed design (WORKLOG 2026-08-24) is:
--
--   OWN the nouns and the money-moments  →  this file
--   RENT the mouse movements (pageviews) →  PostHog, and its history is DISPOSABLE by decision
--
-- WHY NOT A GENERIC `events` TABLE, since that is the obvious "own everything" move: this database
-- also serves the corpus. The same Neon compute holds the HNSW vector index over ~295k sections and
-- answers /ask at p50 10.5s (Lane D4). A pageview-rate append stream evicts that working set —
-- trading measured product latency, which is under a quality gate, for dashboards the analytics
-- doc explicitly calls non-load-bearing. It also pins the compute out of autosuspend from ~10 users
-- (≈720 wall-hours/month), on a PUBLIC endpoint whose limiter fails OPEN by design. Rejected on
-- those grounds, not on taste. Revisit only when ALL of: sustained >5k DAU, a named question this
-- split provably cannot answer, and analytics living in its OWN Neon project.
--
-- IDEMPOTENT: IF NOT EXISTS / IF EXISTS throughout; DROP POLICY IF EXISTS before CREATE.
--   RUN (owner, dev-guarded): node db/apply-migration.mjs db/migrations/130_first_party_growth.sql
--   ROLLBACK:
--     DROP TABLE IF EXISTS user_active_day; DROP TABLE IF EXISTS email_suppression;
--     ALTER TABLE waitlist DROP COLUMN IF EXISTS attribution, DROP COLUMN IF EXISTS consent_text;
--     -- the UNIQUE(email) drop is NOT auto-reversible once duplicate emails exist; see §2.

BEGIN;

-- ── §1 user_active_day — DAU, WAU/MAU, churn, retention, resurrection. Vendor-free. ─────────────
-- ONE ROW PER USER PER DAY. That bound is the entire point: it scales with PEOPLE, not with page
-- loads. At 10k DAU ≈ 3.65M rows/year ≈ 2 GB — about 13× cheaper than storing pageviews, and it
-- answers every retention question the owner asked for without PostHog being involved at all.
--
-- Written ONLY from the authenticated path (lib/active-day.ts, called from lib/session.ts) — never
-- from a public endpoint, so there is no unauthenticated write surface to abuse.
--
-- WHY `day DATE` AND NOT a timestamp: the question is "was this person here that day", and a date
-- makes the primary key do the deduplication for free. Stored in UTC; a cohort boundary that is a
-- few hours off for one reader does not change a retention curve.
CREATE TABLE IF NOT EXISTS user_active_day (
  user_id TEXT NOT NULL,
  day     DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Cohort queries scan by day; per-user history reads the PK directly.
CREATE INDEX IF NOT EXISTS idx_user_active_day_day ON user_active_day (day);

ALTER TABLE user_active_day ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_active_day_insert ON user_active_day;
CREATE POLICY user_active_day_insert ON user_active_day
  FOR INSERT TO app_runtime
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT INSERT ON user_active_day TO app_runtime;

-- ── §2 waitlist — append-only signup log, with attribution captured at the signup ────────────────
-- DROPPING UNIQUE(email) IS THE POINT, and it is a repair rather than a relaxation.
--
-- The route catches 23505 and answers "You're on the list" (route.ts). That is friendly, and it
-- also means a SECOND signup is discarded whole — including its campaign. Someone who arrives from
-- the newsletter, signs up, then two weeks later clicks a Twitter ad and signs up again records
-- ZERO conversions for Twitter, silently. And it is unfixable in place: 033 revoked UPDATE and 034
-- grants no UPDATE policy, so app_runtime physically cannot amend the row it just refused.
--
-- One row per SUBMISSION dissolves all of it: every touch is recorded, first- and last-touch are
-- both derivable, and the 23505 dance disappears. Deduplication moves to the owner-side export
-- (DISTINCT ON (email) ORDER BY email, created_at), which is where it belongs — app_runtime cannot
-- read this table at all, by design, and that stays true.
--
-- Free to do NOW because the constraint has not yet had to reject anything real; expensive later,
-- when dropping it means deciding what the existing duplicates meant.
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_email_key;

-- Non-unique, because the export deduplicates and the owner filters by address.
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist (email);
-- "signups since X" is the query the weekly script runs; 116/129 both index created_at for it.
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist (created_at);

-- JSONB, not five scalar columns, and this is the house style rather than a preference:
-- 116 stores `lanes`/`retrieved`, 129 stores `params`, both as route-validated JSONB bags. The
-- campaign vocabulary is NOT fixed at five — utm_content, utm_term, gclid, fbclid, mc_cid are all
-- already read by the client — so scalar columns would mean an ALTER every time an ad network
-- invents a parameter. Keys are ALLOWLISTED and values length-capped at the route (validate at the
-- edge, CLAUDE.md): this arrives from a public unauthenticated endpoint whose rows nobody can
-- later read or clean.
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS attribution JSONB NOT NULL DEFAULT '{}';

-- The exact sentence the person agreed to, stored per row. NOT a compliance apparatus — the owner
-- ruled GDPR/CCPA work out of scope. It is here because the landing page currently promises "your
-- email is used for the invitation alone" (app/page.tsx), and a promise made to readers of a study
-- product is worth being able to honour precisely. Unreconstructable after the fact, which is the
-- only reason it is in THIS migration rather than a later one.
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS consent_text TEXT;

-- ── §3 email_suppression — the one thing an ESP swap must never lose ────────────────────────────
-- "Resend is a rebuildable mirror of the database" was FALSE and this table is the correction:
-- unsubscribes, bounces and complaints originate AT the provider and exist nowhere in Postgres, so
-- a rebuild-from-DB would re-mail people who opted out.
--
-- KEYED BY HASH, deliberately: sha256(lower(email)) means a person can be deleted from `waitlist`
-- entirely and STILL never be mailed again. A suppression flag on a row you deleted is gone.
--
-- Append-only, like every other log here. A resubscribe is a new row in a future opt-in table, not
-- a DELETE — un-suppressing must never be something the runtime can do.
CREATE TABLE IF NOT EXISTS email_suppression (
  email_hash TEXT PRIMARY KEY,
  reason     TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'complaint', 'hard_bounce', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_suppression ENABLE ROW LEVEL SECURITY;

-- INSERT-only for the runtime: the unsubscribe route and the provider webhook both only ever ADD.
-- No SELECT policy — the send path is an owner script reading as owner, so the runtime never needs
-- to read the suppression list, and therefore cannot enumerate it.
DROP POLICY IF EXISTS email_suppression_insert ON email_suppression;
CREATE POLICY email_suppression_insert ON email_suppression
  FOR INSERT TO app_runtime
  WITH CHECK (true);

GRANT INSERT ON email_suppression TO app_runtime;

-- ── Verification, in the same file — the 106/110/116/129 self-verifying tail ─────────────────────
DO $$
BEGIN
  -- The verbs the writers need.
  IF NOT has_table_privilege('app_runtime', 'user_active_day', 'INSERT') THEN
    RAISE EXCEPTION '130 FAILED: app_runtime lacks INSERT on user_active_day — every activity write would fail';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'email_suppression', 'INSERT') THEN
    RAISE EXCEPTION '130 FAILED: app_runtime lacks INSERT on email_suppression — unsubscribes would be lost';
  END IF;

  -- The verbs that must remain absent. Both logs are append-only BY GRANT, not by habit.
  IF has_table_privilege('app_runtime', 'user_active_day', 'UPDATE')
     OR has_table_privilege('app_runtime', 'user_active_day', 'DELETE') THEN
    RAISE EXCEPTION '130 FAILED: app_runtime holds UPDATE/DELETE on user_active_day; the log is append-only';
  END IF;
  IF has_table_privilege('app_runtime', 'email_suppression', 'UPDATE')
     OR has_table_privilege('app_runtime', 'email_suppression', 'DELETE') THEN
    RAISE EXCEPTION '130 FAILED: app_runtime holds UPDATE/DELETE on email_suppression — un-suppressing must not be a runtime capability';
  END IF;

  -- waitlist's posture is UNCHANGED by this migration and must stay that way: 033 revoked
  -- UPDATE/DELETE, 034 left exactly one INSERT policy. Adding columns must not have widened it.
  IF has_table_privilege('app_runtime', 'waitlist', 'UPDATE')
     OR has_table_privilege('app_runtime', 'waitlist', 'DELETE') THEN
    RAISE EXCEPTION '130 FAILED: waitlist gained UPDATE/DELETE; 033 revoked them deliberately';
  END IF;

  -- RLS on for both new tables, with exactly one policy each.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_active_day' AND relrowsecurity) THEN
    RAISE EXCEPTION '130 FAILED: RLS not enabled on user_active_day';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'email_suppression' AND relrowsecurity) THEN
    RAISE EXCEPTION '130 FAILED: RLS not enabled on email_suppression';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'user_active_day') <> 1 THEN
    RAISE EXCEPTION '130 FAILED: user_active_day must carry exactly one policy';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'email_suppression') <> 1 THEN
    RAISE EXCEPTION '130 FAILED: email_suppression must carry exactly one policy';
  END IF;

  -- The append-only waitlist: the UNIQUE constraint must be GONE, or a second signup from a new
  -- campaign is still discarded and this migration achieved nothing.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'waitlist'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE '%(email)%'
  ) THEN
    RAISE EXCEPTION '130 FAILED: waitlist still carries a UNIQUE(email) constraint; the signup log cannot record a second touch';
  END IF;

  -- The columns the writers bind to.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'waitlist' AND column_name = 'attribution') THEN
    RAISE EXCEPTION '130 FAILED: waitlist.attribution missing';
  END IF;

  RAISE NOTICE '130 OK: user_active_day + email_suppression created (RLS, INSERT-only); waitlist is append-only with attribution';
END $$;

COMMIT;
