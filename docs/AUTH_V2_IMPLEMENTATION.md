# Neon Auth cutover — implementation runbook

**Audience: a fresh Claude Code session with no prior context.** Everything you need is here or
linked. Read [`AUTH_CUTOVER_V2_NEON.md`](./AUTH_CUTOVER_V2_NEON.md) (the design) and
[ADR-107](./DECISIONS.md) (the ruling) first — this file is the *how*, they are the *why* and the
*whether*, and both are already decided. **Do not re-litigate the decision.**

Written 2026-08-08 by the session that produced the design. Everything below was measured against
the tree at `398a71c`, which is what production is serving.

---

## 0. STOP — three owner actions gate everything

**Do not write a line of code until these exist.** The app fails closed without them, so you would
be building against something that cannot run, and you would not find out until deploy.

| # | Action | Where |
|---|---|---|
| 1 | **Enable Auth** on the Neon project | Neon Console → project → Auth → "Enable Auth" |
| 2 | Copy the **Auth URL** → becomes `NEON_AUTH_BASE_URL` | Neon Console → Auth → Configuration tab |
| 3 | Mint `NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`) and set **both** vars in Vercel **production** | Vercel dashboard |

Ask the owner to confirm all three before starting. If they are not done, **say so and stop** —
that is the correct outcome, not a blocker to work around.

---

## 1. The blast radius — measured, so you do not go hunting

18 files call `requireUser`/`currentUser`, but **only two server files import `better-auth`**, plus
one client module. That is the whole surface:

| File | What it does now | What it becomes |
|---|---|---|
| `web/src/lib/auth/better-auth.ts` | `betterAuth({...})`, lazy via `getAuth()` | replaced by `neon-auth.ts` (§3) |
| `web/src/lib/session.ts` | `getAuth().api.getSession({ headers })` | `auth.getSession()` (§4) |
| `web/src/app/api/auth/[...path]/route.ts` | `toNextJsHandler(getAuth())` | Neon's handler (§5) |
| `web/src/lib/auth/client.ts` | better-auth `createAuthClient` | `@neondatabase/auth/next` (§6) |

`web/src/lib/user-corpus/access.ts` mentions better-auth **in a comment only** — no import. Leave it;
update the comment at the end.

**`requireUser` and `currentUser` keep their exact signatures.** `session.ts`'s own header explains
why, and it still applies: 18 callers, and mixing an auth migration into a refactor of all of them is
how this goes wrong.

---

## 2. Before you touch code: measure the data

A clean start does **not** error — user ids are plain `text` with no foreign keys
(`AUTH_CUTOVER_DESIGN.md:99-100`), so it **silently orphans** every row in 21 user-scoped tables.

Run this against production (owner-gated, read-only) and **write the answer into the WORKLOG**:

```sql
SELECT 'notes' t, count(*) rows, count(DISTINCT user_id) users FROM notes
UNION ALL SELECT 'highlights', count(*), count(DISTINCT user_id) FROM highlights
UNION ALL SELECT 'plans',      count(*), count(DISTINCT user_id) FROM plans
UNION ALL SELECT 'bookmarks',  count(*), count(DISTINCT user_id) FROM bookmarks
UNION ALL SELECT 'user_documents', count(*), count(DISTINCT user_id) FROM user_documents;
```

- **Zero, or only the test account** → clean start. Record the decision and move on.
- **Real rows** → **STOP and report.** An id-remap (old `auth_users.id` → new Neon id, joined on
  email, applied across all 21 tables in one transaction) is a separate design, not a step in this
  runbook.

"Probably nobody has data" is not an answer. Run the query.

---

## 3. Install and the server instance

```bash
cd web && npm i @neondatabase/auth@latest
```

**Then regenerate BOTH lockfiles.** The two-lockfile split is what blocked the last deploy for a
full day: CI installs from the root `pnpm-lock.yaml`; production installs `web/package-lock.json`
with `npm ci`, and they are compared **only** on the Vercel builder, after the upload.

```bash
# root
corepack pnpm install --lockfile-only
# web/package-lock.json — from a copy in a dir with NO ancestor node_modules, or npm records
# ../node_modules/.pnpm/... paths that do not exist in the upload
GEN=$(mktemp -d /tmp/lockgen.XXXX) && cp web/package.json web/.npmrc "$GEN"/ \
  && (cd "$GEN" && npm install --package-lock-only --legacy-peer-deps) \
  && cp "$GEN/package-lock.json" web/package-lock.json && rm -rf "$GEN"
npx vitest run test/invariants/upload-root-lockfile.test.ts   # must be green
```

Create `web/src/lib/auth/neon-auth.ts`:

```ts
import { createNeonAuth } from '@neondatabase/auth/next/server';

// LAZY, for the reason better-auth.ts was lazy: `next build` collects page data for the auth route
// with no auth env in scope, and constructing at module load is exactly how the previous wiring
// broke the build. Do not "simplify" this to a top-level const.
let _auth: ReturnType<typeof createNeonAuth> | null = null;
export function getAuth() {
  _auth ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookieSecret: process.env.NEON_AUTH_COOKIE_SECRET,
  });
  return _auth;
}
```

**Verify the option names against the installed package** — `node -e "console.log(Object.keys(require('@neondatabase/auth/next/server')))"` and read its types. The docs and the SDK have disagreed before.

**Both env vars must fail closed.** `better-auth.ts` got this right and Neon's SDK may not: if
`baseUrl` is undefined it may infer one from the request `Host` header, which is a password-reset
poisoning vector (pre-deploy audit A1-6). Add an explicit throw if either var is missing.

---

## 4. `session.ts`

Swap the import and the one call. Nothing else in the file changes:

```ts
import { getAuth } from './auth/neon-auth';

async function session() {
  const { data } = await getAuth().getSession();   // NOT api.getSession({ headers })
  return data;
}
```

**Verify the return shape before trusting it.** Neon's docs say `getSession()` returns
`{ data: session }`; better-auth returned the session directly. If `data.user.id` is not where you
expect, everything downstream silently becomes "signed out" — which looks like a working app with
nobody logged in.

---

## 5. The route handler

`web/src/app/api/auth/[...path]/route.ts` currently wraps `toNextJsHandler(getAuth())`. Replace with
Neon's equivalent (check the package for the export name — likely `toNextJsHandler` or a
`handlers` object). Keep `export const runtime = 'nodejs'` and keep building the handler **per
request**, not at module load, for the same build reason as §3.

---

## 6. The client

`web/src/components/auth-forms.tsx` calls, via `@/lib/auth/client`:

`authClient.signIn.email` · `signUp.email` · `requestPasswordReset` · `resetPassword`

Re-point `web/src/lib/auth/client.ts` at `createAuthClient` from `@neondatabase/auth/next`. **Verify
all four method names survive** — if `requestPasswordReset` is named differently, password reset
breaks silently and only on the reset path, which nobody exercises by accident.

---

## 7. What must not regress — check each, do not assume

| Property | Why it matters | How to check |
|---|---|---|
| **No social providers** | The *structural* closure of GHSA-g38m (account takeover). Under Neon this is a console toggle, not code | Confirm in the Neon console; add an invariant test asserting the app configures none |
| 12-char minimum password | Only credential in the system, no second factor | Try an 11-char signup; expect refusal |
| Sign-in without email verification | A mail outage must not lock out everyone including the owner | Sign up, do not verify, sign in |
| Reset revokes sessions | `revokeSessionsOnPasswordReset: true` today | Sign in twice, reset, confirm the first session dies |
| **RLS still binds** | `runAsUser` sets `app.current_user_id` from the session user id. **If Neon's id format differs, every policy matches nothing** — reads as an outage, or worse, doesn't | Two accounts, confirm A cannot read B's notes |
| **Rate limiting** | A1-2 was fixed 2026-08-07 by putting better-auth's limiter on `api_rate_limit`. **That fix does NOT transfer** — the managed service owns its limiter | Confirm Neon's limits; if absent, A1-2 re-opens and must be re-filed |

The RLS row is the most likely to bite and the hardest to notice.

---

## 8. Tests

These exist and are **expected to fail** once Better Auth is gone. **Do not delete them until step
10** — ADR-107 condition 1 is binding: Better Auth is what runs in production until Neon Auth is
serving, and deleting its coverage before the swap is verified is the window in which an auth
regression ships unseen.

```
web/test/invariants/better-auth-live.test.ts
web/test/invariants/better-auth-schema.test.ts
web/test/invariants/better-auth-wiring.test.ts
web/test/invariants/auth-rate-limit-storage.test.ts   ← A1-2; see §7
web/test/invariants/settings-and-auth-routes.test.tsx ← should still pass; it tests routing
```

Write the Neon equivalents **first**, watch them fail, then swap. `npm run audit` needs a dev
`DATABASE_URL`; without one, DB-backed legs report NOT RUN — say so rather than calling it green.

---

## 9. Deploy

```bash
read -rs "PREDEPLOY_DB_URL?Paste the prod read URL (hidden): " && echo && PREDEPLOY_DB_URL="$PREDEPLOY_DB_URL" ./deploy.sh; unset PREDEPLOY_DB_URL
```

**`deploy.sh:328-329` already requires `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and
`NEON_AUTH_JWKS_URL`** — filed as stale in pre-deploy audit finding 15, and about to be correct
again. **Extend that list to include `BETTER_AUTH_*` while both exist**, then drop the Better Auth
pair at step 10. If `NEON_AUTH_JWKS_URL` is no longer a thing, remove that one entry and say why.

Deploy is ⚑ owner-gated, every time (`AGENTS.md`).

---

## 10. Only after Neon Auth is verified serving

1. Retire migration 104's four `auth_*` tables (new migration; do not edit 104).
2. Delete the Better Auth tests from §8.
3. `npm rm better-auth` in `web/`; regenerate both lockfiles again.
4. **Re-open SEC-1 in `docs/SECURITY.md`** citing ADR-107 — the launch gate must reflect reality.
5. Update the comment in `web/src/lib/user-corpus/access.ts`.
6. Update `docs/STATE_OF_TRUTH.md` and `docs/pm/MASTER.md` Lane C.

**Step 10 is the irreversible one.** Before it, rollback is `git revert` + redeploy. After it, the
`auth_*` rows are gone. Treat it as its own owner-gated occasion, not the tail of step 9.

---

## Known traps, learned the hard way on 2026-08-07/08

- **Two lockfiles.** Covered in §3. It blocked a deploy for a day.
- **`web/test` has a stricter tsconfig than `web/`.** `tsc -p web/tsconfig.json` is **not** enough —
  it missed a TS1501 that broke CI.
- **CI is red for reasons unrelated to auth.** The `db-invariants` job needs migrations 044/045
  applied out of band (their `CREATE INDEX CONCURRENTLY` exceeds any sane CI timeout) and a corpus
  reseed. The `audit` job — including `next build` — is green and is the gate that matters for
  deploy. Do not treat the red as yours.
- **`CREATE INDEX CONCURRENTLY` cannot run in a transaction.** If you apply migrations, use
  `db/apply-migration-concurrent.mjs`. `db/apply-pending.mjs` now handles it, but read a migration's
  header before executing it — 044 said so in its second line and it cost an hour.
- **Read `docs/pm/MASTER.md` before assuming which migrations are on which branch.** B1 states which
  are Lane-B-only. Guessing cost two CI runs.
