# Known security issues (tracked)

## SEC-1 — better-auth 1.4.18 vulnerabilities via `@neondatabase/auth` beta

> **CLOSED 2026-08-05** by the direct cutover to self-hosted better-auth 1.6.26.
> **Re-opening it was proposed 2026-08-07** (move back to Neon's rebuilt "Managed Better Auth").
> Measured that day: `@neondatabase/auth@latest` is still `0.4.2-beta`, still pinning
> `better-auth@1.4.18`. See [`AUTH_NEON_MANAGED_EVALUATION.md`](./AUTH_NEON_MANAGED_EVALUATION.md)
> — including the standing rule: **do not migrate while Neon's managed version is below 1.6.11.**
> **RE-OPENED, AND LIVE ON PRODUCTION, 2026-08-08** (ADR-107, ADR-108, ADR-109). Neon Auth serves
> `ancientpaths.app` as of deploy `f197406` (`dpl_9sEyz51uegvYXbiGbNc4afMW61i7`); email/password
> and Google sign-in both verified working. `@neondatabase/auth@0.4.2-beta` is installed, pinning
> `better-auth@1.4.18` — the dependency this entire section is rooted in.
>
> **GHSA-g38m is no longer merely re-opened by version: its precondition is fully assembled and
> reachable by any visitor.** Confirmed against the Neon console 2026-08-08 — sign-up with email
> ON, **`Verify at Sign-up` OFF**, Google OAuth live. So an attacker can register an address they
> do not own, unverified, and the real owner's later Google sign-in auto-links onto that account.
> No verified-email-before-link control exists anywhere on Neon's surface: SDK types, the OAuth
> setup guide, and the management API schema were each checked independently, corroborating the
> 2026-07-08 "App-level mitigation: NOT POSSIBLE" finding below against the current version.
> The owner accepted this knowingly (ADR-109) and then shipped the Google button that exercises it.
>
> **The one available mitigation is a console toggle, and it is a trade-off, not a free win:**
> turning `Verify at Sign-up` ON breaks the precondition, but costs the property that a mail outage
> must never lock out every account including the owner's (`requireEmailVerification: false`, held
> deliberately since the 08-05 cutover). Neither state is safe in both directions. UNDECIDED.
>
> Two further gaps from the same API-schema read: **no minimum-password-length field** and **no
> revoke-sessions-on-password-reset field** exist in Neon's `email_and_password` config, so the
> 12-char minimum and reset-revokes-sessions properties Better Auth enforced are UNENFORCED and
> UNVERIFIABLE here. The 12-char rule now lives only in the client form (`auth-forms.tsx`), which
> is a hint, not a control.
>
> **Not a CVE, but security-adjacent and easy to lose:** auth mail now comes from Neon's shared
> server as `auth@mail.myneon.app`, replacing the project's own Resend sender. Password-reset mail
> — the account-recovery path — now arrives from a domain readers have no reason to trust.
>
> **Do not mark this CLOSED without re-measuring.** Closure requires the managed better-auth
> version to reach ≥1.6.11, which is Neon's to ship, not ours.
**Status: CLOSED 2026-08-05. The cutover is live on production.**
Deployment `dpl_HSUsCqGCwWVPrQuG4bL1MBq3hJFg` from `e0cfd24`, aliased to `ancientpaths.app`.
Migrations 100-104 applied to `ep-odd-fog` and recorded in `schema_migrations`. **Verified by
creating a real account through the deployed app**, not by reading config: production
`auth_users` / `auth_accounts` / `auth_sessions` took a row with `providerId = 'credential'`, a
bcrypt hash, and a live session; the test account was then deleted, leaving production at 0 users
for the clean start.

Everyone re-registers (ADR-002 clean-start). The old `NEON_AUTH_*` variables are deliberately LEFT
in the Vercel project: nothing reads them, but a rollback to the previous deployment would need
them, and that is precisely the situation in which they would be missing. Remove them once this
cutover has been stable for a while.
`@neondatabase/auth` is removed and Better Auth 1.6.26 runs in-app
([AUTH_CUTOVER_DESIGN.md](./AUTH_CUTOVER_DESIGN.md)). Every advisory in the table below was rooted
in the `better-auth@1.4.18` that package pinned; none of them fires any more, and `deps-audit`
reports no un-ignored high/critical across 307 prod packages with only the two dev-tooling ids
ignored. The seven better-auth GHSAs are out of `pnpm.auditConfig.ignoreGhsas`.

**GHSA-g38m is closed STRUCTURALLY, not by configuration.** It requires an app to offer BOTH
email/password AND social login: the attacker pre-registers the victim's address unverified, and
the victim's later Google sign-in auto-links onto it. The cutover ships email/password only, so
there is no OAuth callback and nothing to auto-link. That property cannot regress when someone sets
a flag wrong; it can only regress if a social provider is added, which `web/src/lib/auth/better-auth.ts`
says at the point where someone would add one.

**`--expect-red` is now EMPTY.** GHSA-qq9h-g4jm-xgf3 (ADR-038) was the one declared acceptable red
and is also gone by version. `deps-audit` correctly FAILED on "declared id no longer observed"
before `scripts/audit.sh` was updated: a disappearance from the declared set is as much a gate
failure as an addition, which is the point of enumerating it rather than thresholding it.

**What is still open:** the production cutover itself. Migrations 100-104 are on the `lane-b-uploader`
Neon branch only, production still runs the Neon Auth wiring, and the clean-start re-register has not
happened. `MULTI_USER_UPLOADS` stays `false` until it has (UPLOADER_DESIGN §4, enforced by
`web/test/invariants/sec1-upload-gate.test.ts`).

*(Prior status, for the record: OPEN, LAUNCH BLOCKER, must be resolved before the app is public with
real accounts.)*
**ESCALATED 2026-07-08:** app-level mitigation of the in-path account-takeover (GHSA-g38m)
was investigated and is **not possible** on this beta SDK (see "App-level mitigation" below).
Moving off `@neondatabase/auth` is therefore an **urgent** blocker, not a later cleanup.
**Owner decision required: whether to ship auth with SEC-1 open is the founder's call, not the audit script's.**

### What
`pnpm audit` surfaced **15 advisories, all rooted in one pinned dependency**:
`web > @neondatabase/auth@0.4.2-beta > better-auth@1.4.18` (+ its `@better-auth/*`,
`@daveyplate/*` sub-deps). Patched better-auth is `>= 1.6.11` (latest 1.6.23).

### Why it's unfixable today (verified, not asserted, 2026-07-08)
- `@neondatabase/auth@0.4.2-beta` is the **newest** version and **hard-pins
  `better-auth: "1.4.18"`** (exact, not a range). It also peer-requires `next >= 16`.
- Forcing a patched better-auth via `pnpm.overrides: { "better-auth": "1.6.23" }`
  **breaks the web build**: `@better-auth/passkey@1.4.18` / the Neon UI packages
  expect `@better-auth/core@1.4.18`, and better-auth 1.6's client API (organization
  plugin, `useActiveOrganization`) is type-incompatible with what `@neondatabase/auth`
  was built against. Any `>= 1.6.11` has the same divergence. (Tested; reverted.)
- So no dependency path reaches a patched better-auth while on `@neondatabase/auth`.

### Which CVEs actually matter for us (we are an OAuth *client*: email/password + Google/GitHub)
| GHSA | Sev | In our path? | Notes |
|---|---|---|---|
| **GHSA-g38m-r43w-p2q7** | HIGH | **YES — real** | Account takeover: attacker pre-registers victim's email via `/sign-up/email` (unverified); victim's later Google/GitHub login auto-links to the attacker's account. Hits apps with both email/password *and* social login = us. |
| GHSA-86j7-9j95-vpqj | HIGH | assess | Stored XSS in auth-server origin — determine if reachable in our render path. |
| GHSA-9h47-pqcx-hjr4 | HIGH | assess | Insecure cryptographic defaults — determine if it affects our session/token config. |
| GHSA-392p-2q2v-4372 | HIGH | assess | OAuth refresh-token rotation fork — depends on refresh usage. |
| GHSA-pw9m-5jxm-xr6h | CRIT | no | `oidcProvider`/`mcp` **provider** plugins only; we don't run better-auth as a provider. |
| GHSA-7w99-5wm4-3g79 | HIGH | no | `@better-auth/oauth-provider` — provider, not enabled. |
| GHSA-fmh4-wcc4-5jm3 | HIGH | no | organization-invitation plugin — not enabled. |
| GHSA-wxw3-q3m9-c3jr | MOD | no | OAuth state CSRF — requires `state:"cookie"` + `pkce:false`; we use the defaults. |
| GHSA-5xrq / GHSA-fx2h / esbuild / postcss / vite | CRIT/HIGH/MOD | no | dev/build tooling (vitest UI, vite dev-server); never executed in the prod runtime. |

### App-level mitigation: NOT POSSIBLE (verified 2026-07-08)
Investigated whether `createNeonAuth` exposes better-auth's `account.accountLinking`
config so we could disable implicit linking. **It does not.** `NeonAuthConfig` accepts
only `baseUrl`, `cookies` (`secret`/`sessionDataTtl`/`domain`), and `logger`/`logLevel`
— no `account`, `accountLinking`, `socialProviders`, or better-auth passthrough exists
anywhere in the package types (`@neondatabase/auth@0.4.2-beta`).

Structurally, this is a **managed service**: `createNeonAuth` returns a proxy client
(`Pick<VanillaBetterAuthClient, ServerAuthMethods>`) to a better-auth server **hosted by
Neon at `NEON_AUTH_BASE_URL`**. The vulnerable OAuth-callback auto-link logic runs on
Neon's server, at a better-auth version we cannot see or set. The app has **no config
lever** to close GHSA-g38m.

Consequence: **the one in-path account-takeover cannot be mitigated on the beta SDK.**
Two actions, both external to our code:
1. **Ask Neon directly**: is the hosted Neon Auth server patched for GHSA-g38m
   (better-auth ≥ 1.6.11), and does it verify the local `emailVerified` flag before
   auto-linking an OAuth identity? Get it in writing. If patched server-side, the risk
   may already be closed regardless of the SDK's bundled 1.4.18 — but that is Neon's to
   confirm, not something we can assert.
2. **Move off the beta** (see below) — now escalated from "later cleanup" to an
   **urgent, pre-launch blocker**, because we cannot close this ourselves.

### Remediation (get off the beta for prod)
This is a pre-launch app on a **beta** auth SDK; the plan is to leave it before real users:
1. **Now:** apply the GHSA-g38m config mitigation above (if exposed); assess GHSA-86j7/9h47/392p.
2. **Path A — stay on Neon Auth:** migrate the web app to **Next 16**, then take the
   next `@neondatabase/auth` release that ships `better-auth >= 1.6.11`. (Requires Neon
   to publish it; tracked by Dependabot.)
3. **Path B — replace the auth SDK** with a stable one for prod (Better Auth directly at
   latest, Auth.js/NextAuth, Clerk, or Supabase Auth). Preferable if Neon Auth stays beta.
4. **Gate:** do not remove SEC-1 from this file (or open the app publicly) until GHSA-g38m
   is fixed or mitigated and the remaining HIGH items are assessed.

### CI handling — enumerated acceptable-red set (work-order v2 Stage 1.4)
`scripts/audit.sh` passes `--expect-red` to `deps-audit.mjs` with an **explicit GHSA list**.
The observed un-ignored high/critical set must match **exactly** — an extra advisory or a
disappearance from the declared set both fail the gate. This replaces the old rail of
"the only acceptable red is deps" with a reviewable enumeration.

| GHSA | Root | In ignoreGhsas? | Status | Closes when |
|---|---|---|---|---|
| GHSA-g38m-r43w-p2q7 | better-auth account takeover | yes (CI grouping) | OPEN — SEC-1 launch blocker | SEC-1 / auth migration |
| GHSA-86j7-9j95-vpqj | better-auth XSS | yes | assess | SEC-1 |
| GHSA-9h47-pqcx-hjr4 | better-auth crypto defaults | yes | assess | SEC-1 |
| GHSA-392p-2q2v-4372 | better-auth OAuth refresh | yes | assess | SEC-1 |
| GHSA-pw9m-5jxm-xr6h | oauth provider plugin | yes | not in path | n/a |
| GHSA-7w99-5wm4-3g79 | oauth provider | yes | not in path | n/a |
| GHSA-fmh4-wcc4-5jm3 | org invitation plugin | yes | not enabled | n/a |
| GHSA-5xrq-8626-4rwp | vitest/vite dev tooling | yes | dev-only | n/a |
| GHSA-fx2h-pf6j-xcff | vitest/vite dev tooling | yes | dev-only | n/a |
| **GHSA-qq9h-g4jm-xgf3** | better-auth magic-link hijack | **no** | **accepted-red (ADR-038)** | SEC-1 |
| esbuild / postcss / vite (remaining) | dev/build | yes | dev-only | n/a |

**Declared `--expect-red` at Stage 1 exit:** `GHSA-qq9h-g4jm-xgf3` only.

The 9 better-auth + dev-tooling GHSAs in `ignoreGhsas` unblock CI on the unfixable transitive
set; that **does not accept SEC-1 risk.** Remove each GHSA from the ignore list the moment its
dependency fix lands.

### Resolved framework/tooling CVEs (2026-07-24) — FIXED, not ignored
Six HIGH advisories (unrelated to the SEC-1 better-auth cluster) were CVE-disclosure drift
on existing deps. All fixed by bump/override, verified `deps-audit` green + full audit green:
- **next 15.5.20 → 15.5.21** (`web/package.json`): clears GHSA-89xv-2m56-2m9x (SSRF), GHSA-m99w-x7hq-7vfj (DoS), GHSA-p9j2-gv94-2wf4 (SSRF). A patch, not the 14→15 major first assumed.
- **postcss → 8.5.16** (root `pnpm.overrides`): 8.4.31 was exact-pinned by next. GHSA-6g55-p6wh-862q (arbitrary file read via sourceMappingURL).
- **fast-uri → 3.1.4** (root `pnpm.overrides`): transitive via ajv. GHSA-v2hh-gcrm-f6hx (host confusion).
- **sharp → 0.35.3** (root `pnpm.overrides`): transitive via next/image optionalDeps, one minor above next's `^0.34.3`. GHSA-f88m-g3jw-g9cj (libvips). Runtime-verified: native binary + libvips 8.18.3 load; webp/png encode (the next/image path) works.

These are FIXES (real version moves), distinct from the ignored SEC-1 GHSAs above which remain unfixable until the auth move-off.

### Pending evidence from Neon (drafted question sent 2026-07-08)
Two-pronged written question to Neon (below in the PR/thread). Paste the written answer
here as SEC-1 evidence. A "yes" to either prong closes the *active* hole short-term; it
does **not** change the move-off decision.
1. Is the hosted Neon Auth server patched for GHSA-g38m — does it verify the local
   `emailVerified` flag before auto-linking an OAuth identity?
2. Can email/password signup be disabled entirely (console or config), leaving
   social-login only, to remove the attack precondition (`/sign-up/email` pre-registration)?

> Neon's answer: _pending._

---

## SEC-1 Remediation — auth move-off decision doc
**Scoping only. No migration started (owner directive 2026-07-08).** The migration happens
**regardless** of Neon's answer: we are not shipping a consumer app on a black-box beta auth
SDK. Neon's answer only affects the interim posture, not this decision.

**Requirement gate (from the app):**
- Next.js **15** App Router — must NOT force Next 16 (that pin is the root of SEC-1).
- Users stored in **our Neon Postgres**, with the auth user id driving RLS via
  `current_setting('app.current_user_id')`.
- Social login (Google, GitHub); email/password desired but optional (see prong 2).
- **We control the version + config** (so we can run patched code and set account-linking policy).
- Reasonable migration path from the current better-auth-based Neon Auth user model.

| Option | Own it / DB | Next 15 | Email+pw | Closes GHSA-g38m ourselves? | Migration friction | Verdict |
|---|---|---|---|---|---|---|
| **Better Auth (direct)** | ✅ our app, Neon (Kysely/Drizzle adapter) | ✅ we pin the version | ✅ built-in | ✅ run patched ≥1.6.11 **and** own `account.accountLinking` (verified-email-before-link) | **Lowest** — the same lib Neon Auth wraps; similar schema/model | **Recommended (primary)** |
| **Auth.js (NextAuth v5)** | ✅ our app, Neon (`@auth/pg-adapter`) | ✅ App-Router native | ⚠️ Credentials is DIY (OAuth/magic-link preferred) | ✅ social-only removes the precondition; we own linking policy | Medium — different schema/model | **Recommended if social-only** |
| **Clerk** | ❌ hosted SaaS; users in Clerk (webhook→Neon sync) | ✅ | ✅ | ✅ vendor-managed, production-grade | Medium — rip Neon Auth, add Clerk + JWT→RLS | Best DX, but re-enters the managed black-box category we're leaving |
| **Supabase Auth** | ⚠️ GoTrue; hosted Supabase or self-host vs a 2nd Postgres | ✅ | ✅ | ✅ | High — reintroduces Supabase (deliberately left for Neon); RLS is `auth.uid()`, not our `current_setting` | Not recommended (platform mismatch) |

**Recommendation: Better Auth direct.** It is the library Neon Auth already wraps, so it keeps
email/password + social and has the lowest migration friction — and, critically, it puts the
**version and `accountLinking` config in our hands**, which is exactly what we lack today: we
run patched 1.6.23 and set verified-email-before-link, closing GHSA-g38m ourselves. **Auth.js**
is the mature fallback and the best choice if we decide social-login-only (which itself closes
g38m). **Clerk** only if we accept re-entering the managed-black-box category. **Supabase Auth**
is a poor fit (reintroduces the platform we left).

**DECISION (2026-07-08): target = Better Auth direct, keeping email/password.** Rationale: it
is the library Neon Auth already wraps (lowest migration friction), keeps our email/password +
social feature set, and puts the version + `account.accountLinking` config in our hands — which
is precisely what lets us close GHSA-g38m ourselves (run patched ≥1.6.11 + verified-email-before-link).

**MIGRATION APPROACH (2026-07-08): CLEAN-START.** Pre-launch, ~0 real accounts (only the founder's
test logins), so we do **not** migrate existing users — Better Auth provisions a fresh schema and
everyone re-registers. This drops the two hardest risks (exporting password hashes / preserving ids
from a managed black box). Old test annotations keyed on defunct Neon Auth ids are abandoned
(acceptable pre-launch). The id-preserving migration is retained only as an appendix for a future
where real accounts exist.

**Next step (not started):** the clean-start proof plan is in
[AUTH_MIGRATION_SPIKE.md](./AUTH_MIGRATION_SPIKE.md) — (1) fresh Better Auth schema provisions +
registration works, (2) RLS enforces on the new Better Auth ids, (3) old Neon Auth sessions
invalidate cleanly (everyone re-registers), (4) reproduce the GHSA-g38m exploit and show no
auto-link. The spike ends on proof (4). No migration begins until those GO, and SEC-1 stays open
until the production cutover lands and the g38m entries are removed from `pnpm.auditConfig`.

**SPIKE RESULT (2026-07-08): ALL FOUR PROOFS PASSED** (harness in `spike/`, isolated Neon branch,
Better Auth **1.6.23**):
- P1 — schema provisions; email/password signup creates an unverified user (g38m precondition). ✓
- P2 — `app.current_user_id` bridge binds Better Auth ids; RLS isolates A=1 / B=0 (with the SEC-2 fixes). ✓
- P3 — foreign/old session cookies resolve to logged-out, never mis-mapped. ✓
- **P4 — GHSA-g38m CLOSED:** with `account.accountLinking` (verified-email-before-link) on 1.6.23, the
  pre-register → social-login exploit did **not** auto-link (1 user, only the `credential` account; no
  stub OAuth account attached to the attacker). Evidence: `spike/proofs.mjs`.

**Conclusion:** g38m is unfixable on the Neon Auth beta but **fixable when we run Better Auth directly**.
The Better Auth-direct clean-start migration IS the remediation; remove the g38m GHSAs from
`pnpm.auditConfig` when the production cutover lands.

### The pnpm-override branch does NOT close g38m - do not merge it (assessed 2026-08-05)

`fix/sec1-better-auth-1-6-25` forces the whole better-auth subtree to 1.6.25 via `pnpm.overrides`
and clears `ignoreGhsas` to `[]`. **The override upgrades the wrong copy of better-auth.**

Per §"App-level mitigation" above, `createNeonAuth` returns a proxy client to a better-auth server
**hosted by Neon**; the vulnerable OAuth-callback auto-link logic runs there, at a version we cannot
see or set. The `better-auth` in our `node_modules` is the client SDK. Overriding it moves `pnpm
audit` from red to green while the account-takeover path is untouched - and it deletes the ignore
list entry that is currently the only mechanical record that SEC-1 is open. The branch's own commit
message concedes it was "verified lockfile-only": never built, never signed in.

Recorded here rather than only on the branch because a reader who meets the branch will find its
reasoning persuasive and self-contained. **Close it unmerged.** The remediation is
[AUTH_CUTOVER_DESIGN.md](./AUTH_CUTOVER_DESIGN.md).

### The gate is now mechanical, not prose (A7, 2026-08-05)

`web/test/invariants/sec1-upload-gate.test.ts` asserts NOT (multi-user uploads enabled AND an
advisory this file adjudicates as in-path is still in `pnpm.auditConfig.ignoreGhsas`). The advisory
set is **derived from the "In our path?" table above**, so marking a new advisory in-path there arms
the gate automatically; the parse anchors on that header because this file carries a second GHSA
table whose third column asks a different question. Six red-proofs, each watched fail
(`WORKLOG.md`, 2026-08-05).

Consequence for whoever lands the cutover: `MULTI_USER_UPLOADS` in
`web/src/lib/user-corpus/access.ts` cannot be flipped to `true` until the in-path ids leave
`ignoreGhsas`. That is the intended coupling - SEC-1 closing is what unlocks multi-user upload.

---

## SEC-2 — RLS is not actually enforced (discovered by the auth spike, 2026-07-08)
**Status: FIX BUILT + VERIFIED via the repository layer on a Neon branch; PROD ROLLOUT HELD pending approval (2026-07-08).**
Independent of SEC-1; affects per-user data isolation today.

The spike proved two gaps in the *current* app:
1. **The app connects as `neondb_owner`, which has `BYPASSRLS`** → Postgres RLS never binds for the
   app's connection. Every RLS policy in `db/schema.sql` is effectively inert for the app role.
2. **`highlights` and `notes` shipped with no RLS enabled and no policy** at all (added after the
   original schema's RLS block).

**Consequence:** per-user isolation currently rests **entirely** on the repository's explicit
`WHERE user_id = current_setting('app.current_user_id')` / `WHERE user_id = $1` filters. That works as
long as *every* query filters correctly, but the intended RLS second layer is not functioning — one
missing filter = a cross-user leak with nothing behind it.

**Fix (defense-in-depth):**
1. Add a **least-privilege, non-`BYPASSRLS` DB role** for the app's runtime connection (not
   `neondb_owner`), granted only DML on app tables. The spike proved RLS enforces correctly for such a
   role (A=1 / B=0).
2. **Enable RLS + add the per-user policy to `highlights` and `notes`** (mirror the other user tables).
3. Keep the explicit `WHERE user_id` filters — belt *and* suspenders.
This is orthogonal to the Better Auth migration and can be done independently.

### What's built (2026-07-08)
- **Runtime data layer routes every user-scoped query through `runAsUser`** (`web/src/lib/db.ts`): one
  transaction that runs `set_config('app.current_user_id', <uid>, true)` then the query. The stateless
  Neon HTTP driver can't hold a session var across requests, so it's set `LOCAL` inside the txn (survives
  transaction-mode pooling). All paths converted: `web/src/lib/annotations.ts` (8 fns) and
  `web/src/lib/chat.ts` (channels/chats/messages/chat_memories). `web/src/lib/embeddings.ts` is unimported
  dead scaffolding and its read policy allows platform reads (`user_id IS NULL`) regardless.
- **Committed migration** `db/migrations/001_sec2_least_priv_role.sql` — idempotent grants + RLS for
  `highlights`/`notes`, no secrets. Role creation (`CREATE ROLE app_runtime LOGIN NOBYPASSRLS PASSWORD …`)
  is a documented out-of-band step; the password is generated and never committed.
- **`next build` green** with the refactor — deploy path intact.

### Verified via the repository layer on the pooled Neon connection (branch `sec2-verify`, role `app_runtime`, NOBYPASSRLS)
Calling the real `setHighlight` / `listHighlights` / `getChapterAnnotations` (not raw SQL):
```
✓ A sees their own highlight (John 3:16)
✓ A does NOT see B's highlight (Gen 1:1)
✓ B does NOT see A's highlight (John 3:16)
✓ B reading A's chapter (John 3) sees no highlights
✓ backstop: query WITHOUT runAsUser returns 0 rows (RLS denies when the var is unset)
```
The backstop is the **path that breaks if the session var isn't set**: a raw `getDb()` query that skips
`runAsUser` returns 0 rows — RLS fails safe, so the second layer is genuinely engaged (not just the `WHERE`).

### Prod state (read-only inspection, 2026-07-08)
- App connects as `neondb_owner`, `rolbypassrls = true` → **RLS inert today** (the live gap).
- `highlights`/`notes` already have RLS + policy in prod (schema applied), but bypassed by the owner role.
- `app_runtime` role does **not** exist on prod yet. Blast radius: 1 highlight, 0 notes (pre-launch).

### Staging (branch `sec2-stage`, DONE 2026-07-08)
A fresh branch off `production` had `app_runtime` created and migrations **001 (grants + RLS) and 002
(unique partial index on `notes`)** applied. `upsertNote` was converted to a single-statement, atomic
`INSERT … ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL DO UPDATE` (fits one `runAsUser`
transaction — no read-then-branch). Then the **real repository layer** was driven against `app_runtime`
(pooled, RLS on): **14/14 checks pass** — every annotations + chat function works with **no missing grant**,
RLS isolates user A from B, the upsert exercises both insert and conflict-update (one active row, same id),
and the backstop denies queries with the session var unset. `next build` is green with the upsert change.

### Rollout — APPLIED to prod 2026-07-08 (pending signed-in smoke test)
- **Step A — DONE:** `app_runtime` created on prod; migrations 001 & 002 applied. Prod notes had **0**
  duplicate active `(user_id, verse_id)` groups, so the unique index built clean (`indisunique=true`).
- **Step B — DONE:** `APP_DATABASE_URL` (app_runtime, pooled) set in Vercel production + `web/.env.local`;
  redeployed. App now connects as `app_runtime` (RLS live). DB-layer proof passed via the real `runAsUser`
  path (connects as app_runtime, RLS binds, backstop hides the unset-var query).
- **PENDING:** signed-in browser smoke test — blocked from automation by Vercel Deployment Protection (SSO)
  + OAuth; being run by the account owner. Runtime is not yet declared healthy until that passes.
- **Rollback (one line):** `vercel env rm APP_DATABASE_URL production` → redeploy; app falls back to
  `neondb_owner` (RLS inert, pre-flip known-good). `DROP ROLE app_runtime` only if fully reverting.
- Throwaway branches to delete after: `sec2-verify`, `betterauth-spike`, `sec2-stage`.

## SEC-3 — hardcoded prod owner credential in `db/migrate.mjs`
**Status: removed from working tree (2026-07-08); password rotation pending (owner action).**
`db/migrate.mjs:5` hardcoded the prod `neondb_owner` password as a fallback. The file is **untracked**
(never committed — the whole `db/` dir is untracked), so the credential is **not in git history**; no history
rewrite is needed. Fixed to require `DATABASE_URL` from the environment (errors if unset). Because it sat in
plaintext, the Neon `neondb_owner` password should still be rotated.
