# Auth cutover v2 — Better Auth (self-hosted) → Neon Managed Better Auth

**Status: DESIGN. No code written.** Required by [ADR-107](./DECISIONS.md) condition 3 and
`CLAUDE.md` value 2 (design doc before code for anything touching auth). Reverses
[`AUTH_CUTOVER_DESIGN.md`](./AUTH_CUTOVER_DESIGN.md), which completed 2026-08-05.

Owner ruling 2026-08-07, reaffirmed twice: leaving Better Auth for Neon Auth. The cost is recorded
in ADR-107 and is not re-argued here. This document is *how*, and what the owner must do that the
agent cannot.

---

## 1. What we are actually moving to — measured, not assumed

`@neondatabase/auth@latest` (measured 2026-08-07 and again 2026-08-08) is **`0.4.2-beta`**, pinning
**`better-auth@1.4.18`**. The integration is:

```ts
import { createNeonAuth } from '@neondatabase/auth/next/server';   // server
import { createAuthClient } from '@neondatabase/auth/next';        // client
```

against `NEON_AUTH_BASE_URL`.

**That is the same package, the same version, and the same architecture the 2026-08-05 cutover
left** — a proxy to a better-auth server hosted by Neon. `AUTH_CUTOVER_DESIGN.md` §1 describes it
in exactly those terms. What genuinely changed on Neon's side is *where auth data lands*: a
`neon_auth` schema in our own database, RLS-compatible and branching with the DB, instead of an
external IdP with webhook sync. That is a real improvement and it is the reason to do this.

What did **not** change is who controls the better-auth version. It is Neon, and it is 1.4.18.

**Consequence, stated once:** SEC-1 re-opens (15 advisories), and GHSA-g38m stops being
structurally closed the moment a social provider is enabled. ADR-107 accepts both.

## 2. The three things only the owner can do

The agent cannot enable a product in the Neon console, mint a secret, or set a Vercel env var.
**None of the code below is worth writing until these exist**, because the app fails closed without
them:

1. **Neon Console → project → Auth → "Enable Auth."**
2. **Copy the Auth URL** from the Configuration tab. This becomes `NEON_AUTH_BASE_URL`.
3. **Generate `NEON_AUTH_COOKIE_SECRET`** — `openssl rand -base64 32` — and set both in **Vercel
   production** env.

> **A pleasing accident worth recording.** `deploy.sh:328-329` still requires `NEON_AUTH_BASE_URL`,
> `NEON_AUTH_COOKIE_SECRET` and `NEON_AUTH_JWKS_URL`, and the 2026-08-07 pre-deploy audit filed that
> as finding 15 — "stale in both directions, zero code references." It was stale for Better Auth and
> is about to be correct again. Do not delete that gate; **add `BETTER_AUTH_*` to it instead** while
> both exist, then remove the Better Auth pair at step 6.

## 3. The data question, and why it is smaller than it looks

`AUTH_CUTOVER_DESIGN.md:99-100` established, and this design relies on, a load-bearing fact:

> there is no foreign key to break: user ids are plain text columns everywhere. Clean-start orphans
> rows; it does not violate a constraint.

So a clean start does not error — it **silently orphans** every row in the **21 user-scoped tables**
(`highlights`, `notes`, `plans`, `bookmarks`, `library_items`, `reading_progress`, `tags`,
`annotation_tags`, `chats`, `channels`, `messages`, `chat_memories`, the four `user_*` corpus
tables, and the rest).

**The exposure is bounded by the 08-05 cutover**: it already clean-started, so only data created
since then is at risk. The site is behind `SITE_PASSWORD` with an invite list. **Measure it before
deciding** — this is one query, and it decides whether step 5 is "nothing to do" or a real
migration:

```sql
SELECT 'notes' t, count(*), count(DISTINCT user_id) FROM notes
UNION ALL SELECT 'highlights', count(*), count(DISTINCT user_id) FROM highlights
UNION ALL SELECT 'plans', count(*), count(DISTINCT user_id) FROM plans
UNION ALL SELECT 'bookmarks', count(*), count(DISTINCT user_id) FROM bookmarks
UNION ALL SELECT 'user_documents', count(*), count(DISTINCT user_id) FROM user_documents;
```

- **All zero / only the test account** → clean start, no migration. Record the decision.
- **Real rows** → an id-remap table (old `auth_users.id` → new Neon id, joined on email) applied
  across all 21 tables in one transaction, written and red-proofed before any cutover.

**Do not skip this query.** "Probably nobody has data" is exactly the assumption that makes an
irreversible orphaning feel safe.

## 4. Sequence

> **The step-by-step runbook is [`AUTH_V2_IMPLEMENTATION.md`](./AUTH_V2_IMPLEMENTATION.md)** —
> self-contained, written for a fresh session with no context. This section is the shape; that file
> is the execution.

Each step is independently revertible until step 6.

| # | Step | Who |
|---|---|---|
| 0 | Owner actions in §2; run the §3 query and record the answer | ⚑ owner |
| 1 | `npm i @neondatabase/auth@latest` in `web/`; regenerate **both** lockfiles (root pnpm + `web/package-lock.json` — the two-lockfile split is what blocked the last deploy) | agent |
| 2 | `web/src/lib/auth/neon-auth.ts` — `createNeonAuth`, lazy-constructed for the same reason the current file is (`next build` collects page data without a DB) | agent |
| 3 | Re-point `requireUser` / `currentUser` in `web/src/lib/session.ts` to `auth.getSession()`. **This is the whole blast radius** — every route already goes through those two functions, which is why this is a swap and not a rewrite | agent |
| 4 | Client: `createAuthClient` in the sign-in/sign-up forms | agent |
| 5 | Apply the §3 decision (clean start, or the remap migration) | ⚑ owner |
| 6 | Deploy. Then, and only then, retire migration 104's four `auth_*` tables and the Better Auth tests | ⚑ owner |

**ADR-107 condition 1 is binding on step 6:** Better Auth is what runs in production until Neon Auth
is serving. Deleting its tests before the swap is verified is the window in which an auth regression
ships unseen.

## 5. What must not regress, and what test holds each

| Property | Held by |
|---|---|
| 12-char minimum password | `authOptions.emailAndPassword.minPasswordLength` today — **verify Neon Auth can enforce it**; if not, that is a finding, not a detail |
| Sign-in works without email verification | `requireEmailVerification: false`. A mail outage must not lock everyone out, including the owner |
| Password reset revokes existing sessions | `revokeSessionsOnPasswordReset: true` — confirm the managed service does this |
| **No social providers** | The structural closure of GHSA-g38m. `web/test/invariants/` should gain a test asserting no provider is configured, because under Neon Auth this becomes a console toggle rather than code |
| Rate limiting survives | **A1-2 was fixed on 2026-08-07** by moving Better Auth's limiter onto `api_rate_limit`. That fix does not transfer — the managed service owns its own limiter. **Confirm Neon's limits, or the finding re-opens** |
| RLS still keyed correctly | `runAsUser` sets `app.current_user_id` from the session's user id. If Neon's id format differs, every policy silently matches nothing |

That last row is the one most likely to bite: an id-format change turns RLS from "denies others" into
"denies everyone", which looks like an outage, or worse, into "matches nothing" on a permissive
policy.

## 6. Rollback

Until step 6, rollback is: revert the commit, redeploy. Migration 104's tables are untouched and
Better Auth still runs.

After step 6, rollback means restoring the `auth_*` tables **and** their rows — which a clean start
has already discarded. **Step 6 is the irreversible one.** Treat it as its own owner-gated occasion,
not as the tail of step 5.

## 7. Open question to put to Neon

Still worth asking even though it no longer gates the decision (ADR-107 §4): **what better-auth
version does Managed Auth run, and what is the upgrade cadence?** If it is or becomes ≥1.6.11,
SEC-1 closes by version and this document's headline cost disappears.
