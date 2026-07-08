# WORKLOG — Autonomous session 2026-07-08

## Status summary

Working through prioritized task list. Tree is clean on `main`.

## Task 1: Diagnose logout/account-page bug (staging only)

**Status:** Complete — pre-existing, not flip-caused. Logged as auth-completion item.

### Diagnosis: PRE-EXISTING (not caused by SEC-2 flip)

**Evidence chain:**

1. **Auth is 100% HTTP-based, zero database involvement.** The middleware (`web/src/middleware.ts`)
   calls `getAuth().middleware()` which validates sessions by HTTP `fetch` to `NEON_AUTH_BASE_URL`
   (Neon's hosted auth service). It checks for `__Secure-neon-auth.session_token` cookie → fetches
   `/get-session` from the auth service → allows or redirects. Neither `DATABASE_URL` nor
   `APP_DATABASE_URL` is used anywhere in this flow.

2. **`app_runtime` has full DML on ALL tables** (`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES
   IN SCHEMA public`). Even if auth somehow queried the app database (it doesn't), no table would
   be denied.

3. **Zero `signOut`/`logout` code in the app.** `grep -rn 'signOut\|logout' web/src/` returns
   nothing. The `SignOut` component exists in `@neondatabase/auth/react` but is only rendered inside
   `<AccountView>` — so if the account page itself can't load (middleware redirect), there's no way
   to sign out.

4. **The account page renders `<AccountView>` from `@neondatabase/auth/react` (beta).** The
   redirect-to-login means the middleware's session validation is failing, likely because:
   - Session cookie domain/path mismatch (Vercel Deployment Protection may interfere)
   - `NEON_AUTH_BASE_URL` returning errors on `get-session`
   - `@neondatabase/auth` beta bugs (this library pins better-auth 1.4.18 with 2 critical + 7 high CVEs — SEC-1)

5. **Cannot reproduce on staging via CLI.** This is a browser cookie/session issue — requires a real
   browser behind the SSO wall. The code analysis is conclusive: no database path is involved.

### Action taken

- Logged in ROADMAP.md under "Auth (login / account)" as a pre-existing issue tied to SEC-1/auth-completion
- No migration or grant fix needed — this is a Neon Auth configuration or beta-library issue
- Will be resolved when SEC-1 auth migration to Better Auth-direct happens

## Task 2: V1 verifier reject-path tests

**Status:** Complete — v1.ts at 100% statement coverage, ROADMAP row upgraded to Done.

### Changes

- `test/verifier.test.ts`: Added 8 new tests (20 → 28 total):
  - `attribution_tradition`: wrong tradition in voice block
  - `anchor_valid`: structurally invalid anchor verse IDs on voice block
  - `anchor_order`: reversed anchor range on voice block
  - `reading_resolves`: reading block with unresolvable source_id
  - `reading_attribution`: reading block with mismatched author
  - `passage_exists`: verse not found in translation
  - I5 screen true-positive: doctrinal verdict in voice summary
  - Valid reading block acceptance (green-path)
- `test/fixtures.ts`: Added `missingVerses` to corpus fixture for `passage_exists` test
- Coverage: `v1.ts` 77.6% → **100%** statements; `screens.ts`, `normalize.ts`, `memory-corpus.ts` all 100%
- `/audit` passes green (28 verifier tests, 77 total, 0 errors)

## Task 3: Retrieval vertical slice (spine only)

**Status:** Not started

## Task 4: Extend /audit to web/

**Status:** Not started

## Task 5: Fix drifted web ref-parse.ts

**Status:** Not started

## Task 6: Note panel close on save

**Status:** Not started

## Design proposals (no implementation)

- Text/highlight color separation: Not started
- Red highlighter investigation: Not started

## Needs Thomas

(Nothing yet)
