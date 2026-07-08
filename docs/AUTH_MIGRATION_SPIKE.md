# Auth migration spike — Neon Auth → Better Auth (direct), clean-start

**Goal:** de-risk moving off `@neondatabase/auth` (beta, black-box) to **Better Auth run
directly** (own the version + config), keeping **email/password + Google/GitHub**, and
prove **GHSA-g38m is closed**. Decision context: [SECURITY.md → SEC-1](./SECURITY.md).

**Approach: CLEAN-START (committed 2026-07-08).** Pre-launch, there are ~0 real end-user
accounts (only the founder's test logins). We do **not** migrate existing users: Better Auth
provisions a fresh schema, everyone (re-)registers. This removes the two hardest risks
(exporting password hashes / preserving ids from a managed black box) entirely. Pre-existing
test annotations keyed on old Neon Auth ids are simply abandoned — acceptable pre-launch. The
id-preserving migration path is retained as **Appendix A (not needed now)** for the future.

**This is a spike, not the cutover.** Hygiene:
- Runs in a throwaway branch against a **Neon branch** (never prod), time-boxed ~1 day.
- No production change. Output is evidence + GO/NO-GO per proof.

**Setup (harness for all proofs):** stand up Better Auth ≥ 1.6.11 (pin 1.6.23) in the spike
branch, Postgres adapter → a Neon branch, with `emailAndPassword` + Google/GitHub enabled and
`account.accountLinking` configured to link **only when the local account's email is verified**
(the 1.6.11 fix). Run Better Auth's own schema migration to create `user`/`account`/`session`/
`verification`.

Ordered riskiest-first. Each proof has a GO/NO-GO gate; the spike **ends on Proof 4**.

---

## Proof 1 — Fresh schema provisions, registration works  *(trivial under clean-start)*
**Hypothesis:** Better Auth creates its schema in Neon and new users can register both ways.

**Method:** run the Better Auth migration against the Neon branch; then register one user via
email/password and one via Google (and GitHub). No user migration, no lockout question — there
are no prior accounts to carry.

**Evidence / GO:** the four tables exist; an email/password signup and a Google/GitHub signup each
create a `user` + `account` row and a working session. **NO-GO** only if the adapter can't migrate
against Neon (config problem, fixable in the spike).

---

## Proof 2 — RLS enforces on the new Better Auth ids  *(silent data-leak risk)*
**Hypothesis:** per-user isolation holds when `app.current_user_id` is sourced from a Better Auth
session id.

**Method:** the app's DB bridge sets `app.current_user_id` from the new session's user id (same
bridge, new source). With user A signed in:
1. A creates a highlight/note, then reads → sees **only A's** rows.
2. Attempt a cross-user read (filter for user B while authed as A) → **RLS denies** it (policy, not app code).
3. Unauthenticated / no session → sees nothing.

(No id-continuity concern: clean-start means all user-scoped rows are created *fresh* against
Better Auth ids; old test rows keyed on defunct Neon Auth ids are unreachable and abandoned.)

**Evidence / GO:** (1) returns A's rows; (2) and (3) return zero, denied by policy. **NO-GO** if the
new user id doesn't flow into `app.current_user_id`, or a cross-user read succeeds.

---

## Proof 3 — Old Neon Auth sessions invalidate cleanly  *(auth-confusion risk)*
**Hypothesis:** at cutover, old Neon Auth session cookies are **rejected** (logged-out), never
mis-mapped to a user; everyone simply re-registers / logs in fresh on Better Auth.

**Method:**
1. Present a valid **old Neon Auth** session cookie to the Better-Auth app → must resolve to
   **logged-out**, *never* to any user. (The dangerous failure is a stale cookie authenticating as
   the wrong identity — explicitly test for it.)
2. Fresh email/password + fresh Google login → valid new session.
3. Protected route (`/account`, an annotations write) unauthenticated → blocked; authenticated → allowed.

**Evidence / GO:** old cookie → logged-out; new login → works; middleware enforces. Cutover forces a
one-time re-register/login (communicate it). **NO-GO** if any old cookie maps to a session/user.

---

## Proof 4 — GHSA-g38m is closed  *(the payoff — ends the spike)*
**Hypothesis:** on Better Auth ≥ 1.6.11 with account-linking requiring a **verified local email**,
the pre-register → social-login auto-link exploit does **not** link.

**Config under test:** `account.accountLinking.enabled = true`, `allowDifferentEmails = false`, and
linking permitted **only when the local account is `emailVerified`** (1.6.11 behavior).

**Reproduce the exploit (the whole point):**
1. **Attacker:** `POST /sign-up/email` for `victim@example.com` → an **unverified** local account. Do
   not verify it.
2. **Victim:** sign in with **Google** as `victim@example.com` (provider asserts `email_verified: true`).
3. **Observe the `account` table + resulting session:**
   - **Vulnerable (old 1.4.18):** the Google identity auto-links to the attacker's unverified account →
     one account with attacker password + victim OAuth = **takeover**.
   - **Fixed (≥1.6.11 + config):** **no auto-link** — a separate account is created for the OAuth
     identity (or the flow refuses to link to an unverified local account). Attacker gains nothing.

**Evidence / EXIT:** show the DB state proving **two distinct accounts / no link**, and that the victim's
Google session is **not** attached to the attacker's password account. Record the config + this result in
SEC-1 as the closing evidence. **Spike ends here.**

---

## Spike exit
- **All four GO** → clean-start migration is proven and g38m closed. Schedule the cutover: point the app
  at Better Auth, run its schema migration on prod, drop the Neon Auth wiring, post a "please re-register"
  notice.
- **Any NO-GO** → record the blocker in SEC-1; do not cut over.
- SEC-1 stays open until the **production** cutover lands and the g38m entries are removed from
  `pnpm.auditConfig`.

---

## Appendix A — Migrate-existing / id-preserving path (NOT needed pre-launch)
Retained only for a future where real accounts exist and a clean-start (forced re-register) is
unacceptable. Not part of this spike; do not build now.

- **Source of truth:** `neon_auth.users_sync` gives `id`/`email`/`name`/verification; **password
  hashes, OAuth links, and sessions are on Neon's managed server** and likely not extractable.
- **Id preservation:** set Better Auth `user.id` = the old `users_sync.id` so existing user-scoped
  rows (highlights/notes) keep resolving under RLS; otherwise remap every user-scoped table.
- **Cohort fallbacks (no hard lockout):** email-with-exportable-hash → seamless; email-without-hash
  → forced email password reset on first login; OAuth → re-link on next social login (gated by the
  Proof 4 verified-email rule).
- If this ever becomes necessary, it reinstates the original Proof 1 (schema map w/ no lockout) and
  Proof 2 (id-continuity) as full proofs ahead of Proof 3/4.
