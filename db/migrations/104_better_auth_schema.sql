-- ============================================================
-- 104: Better Auth's own schema, for the SEC-1 cutover off @neondatabase/auth
-- ============================================================
-- docs/AUTH_CUTOVER_DESIGN.md. Until now auth lived entirely on Neon's managed service and this
-- database held no auth tables at all: `createNeonAuth` proxied to a better-auth server hosted by
-- Neon, which is precisely why GHSA-g38m could not be closed from here. Running Better Auth
-- ourselves means owning its four tables.
--
-- THE COLUMN NAMES ARE camelCase AND QUOTED, AND THAT IS NOT A STYLE CHOICE. Better Auth addresses
-- its own columns as "userId" / "emailVerified" / "createdAt". Postgres folds unquoted identifiers
-- to lower case, so an unquoted `userId` becomes `userid` and every Better Auth query fails to find
-- it. The rest of this schema is snake_case; these four tables are the library's, not ours.
--
-- THE TABLE NAMES ARE PREFIXED, AND ONE OF THEM HAD TO BE. Better Auth's defaults are
-- `user` / `session` / `account` / `verification`. **`user` is a reserved word in Postgres**: an
-- unquoted `SELECT ... FROM user` does not error, it silently resolves to `current_user` and
-- returns the role name. The `auth_` prefix removes that trap and makes these legible as auth
-- infrastructure beside the 21 user-scoped content tables. The names are set in
-- `web/src/lib/auth/better-auth.ts` via `modelName`; the two must agree, and
-- `web/test/invariants/better-auth-schema-matches-config.test.ts` is what makes them agree.
--
-- ── RLS IS DELIBERATELY *NOT* ENABLED ON THESE FOUR TABLES ──────────────────────────────────────
-- Every other user-scoped table in this database is default-deny with a policy keyed on
-- `app.current_user_id`. These four cannot be, and the reason is structural rather than a
-- convenience: **authentication runs before there is a current user to key on.**
--   * sign-in looks up a row in auth_users BY EMAIL, when no session exists and
--     `app.current_user_id` is unset. Under RLS that lookup returns zero rows and nobody can ever
--     sign in.
--   * a verification or password-reset token is looked up in auth_verifications by `identifier`
--     with no session at all, by definition -- the user is proving who they are.
-- An RLS policy that admitted those cases would have to admit unauthenticated reads of the whole
-- table, which is the same exposure with more moving parts and a false sense of protection.
--
-- WHAT ACTUALLY PROTECTS THEM, STATED HONESTLY. `auth_accounts.password` holds the bcrypt hashes.
-- The protection is that no application query path reads these tables: only Better Auth's own code
-- touches them, through the pool in `web/src/lib/auth/better-auth.ts`. That is weaker than a
-- database-enforced policy, and it is a real reduction in defence-in-depth compared with the rest
-- of this schema. It is accepted because the alternative does not exist -- no RLS predicate can
-- express "during sign-in, before identity is established". `web/test/invariants/` asserts no
-- module outside the auth layer references these tables, so the property is checked rather than
-- merely intended.
--
-- CLEAN-START. No data is migrated from `neon_auth.users_sync`; everyone re-registers (spike
-- commitment 2026-07-08, ADR-002). Nothing in db/, web/src/lib/ or scripts/ references neon_auth or
-- users_sync, so no foreign key breaks -- user ids are plain TEXT columns everywhere. Rows in the
-- 21 user-scoped tables keyed to old Neon Auth ids become unreachable and are abandoned; the
-- uploader's tables are empty today, which is why this is the cheapest moment for the cutover.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_users (
  id              TEXT PRIMARY KEY,
  name            TEXT        NOT NULL,
  email           TEXT        NOT NULL UNIQUE,
  "emailVerified" BOOLEAN     NOT NULL DEFAULT false,
  image           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           TEXT PRIMARY KEY,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  token        TEXT        NOT NULL UNIQUE,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  -- CASCADE: deleting an account must not leave live sessions that authenticate as a user who no
  -- longer exists.
  "userId"     TEXT        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id                      TEXT PRIMARY KEY,
  "accountId"             TEXT        NOT NULL,
  "providerId"            TEXT        NOT NULL,
  "userId"                TEXT        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope                   TEXT,
  -- The credential hash. There is exactly one row per user with providerId = 'credential' while
  -- the app ships email/password only (AUTH_CUTOVER_DESIGN §2). A row with any other providerId
  -- means a social provider was added, which re-opens GHSA-g38m unless accountLinking was
  -- configured to require a verified local email first.
  password                TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_verifications (
  id           TEXT PRIMARY KEY,
  identifier   TEXT        NOT NULL,
  value        TEXT        NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every lookup Better Auth performs on the hot path. Without these, sign-in sequentially scans
-- auth_sessions on every authenticated request (CLAUDE.md: every filtered query path has its index).
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx      ON auth_sessions ("userId");
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx      ON auth_accounts ("userId");
CREATE INDEX IF NOT EXISTS auth_accounts_provider_idx  ON auth_accounts ("providerId", "accountId");
CREATE INDEX IF NOT EXISTS auth_verifications_ident_idx ON auth_verifications (identifier);

-- The runtime connects as app_runtime (NOBYPASSRLS) for auth exactly as it does for everything
-- else; `runtimeUrl()` in web/src/lib/db.ts is the single source of that URL. The owner role is
-- migration tooling only and must never appear on a request path.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_users, auth_sessions, auth_accounts, auth_verifications
  TO app_runtime;

COMMIT;
