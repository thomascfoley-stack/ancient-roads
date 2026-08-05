# Auth cutover design - Neon Auth → Better Auth (direct), clean-start

**Status: DRAFT, awaiting owner decision on §2. No code written.**
Closes SEC-1. Prerequisite: [`AUTH_MIGRATION_SPIKE.md`](./AUTH_MIGRATION_SPIKE.md) (all four proofs
GO, 2026-07-08, Better Auth 1.6.23) and [`SECURITY.md`](./SECURITY.md) SEC-1.

This is Lane A's surface. It is production-affecting and it changes every user id, so it needs the
owner's go before implementation, per CLAUDE.md value 2 and AGENTS.md.

---

## 1. Why the cheap option is not an option

`fix/sec1-better-auth-1-6-25` (2026-07-29, unmerged) forces the whole better-auth subtree to 1.6.25
via `pnpm.overrides` and clears `ignoreGhsas` to empty. **It cannot close GHSA-g38m**, and merging it
would be actively worse than leaving SEC-1 open.

`createNeonAuth` returns a **proxy client** - `Pick<VanillaBetterAuthClient, ServerAuthMethods>` - to
a better-auth server **hosted by Neon** at `NEON_AUTH_BASE_URL` (`SECURITY.md:44-49`). The
OAuth-callback auto-link logic that g38m describes runs on Neon's infrastructure at a version we
cannot see or set. The `better-auth` in our `node_modules` is the client SDK; upgrading it upgrades
the wrong copy.

So the override would take the advisory gate from red to green while the account-takeover risk is
untouched, and would delete the ignore-list entry that is currently the repo's only mechanical
record that SEC-1 is open. Its own commit message concedes it was "verified lockfile-only" - never
built, never signed in. **Recommendation: close that branch unmerged**, and record why in
SECURITY.md so the next reader does not rediscover the idea and think it is new.

The only remediation is to stop being a client of Neon's auth server: run Better Auth ourselves,
where the version and the config lever are both ours. That is what the spike proved.

---

## 2. THE DECISION: do we keep social login at launch?

**GHSA-g38m requires both email/password AND social login in the same application.** SECURITY.md's
own row says so: "Hits apps with both email/password *and* social login = us." The exploit is
attacker pre-registers `victim@example.com` unverified, victim later signs in with Google, the OAuth
identity auto-links to the attacker's account. Remove either leg and there is no mechanism.

That gives two genuinely different cutovers, and the difference is large.

### Option A - email/password only at launch *(recommended)*

Self-host Better Auth with `emailAndPassword` and no social providers.

- g38m is closed **structurally**, not by configuration. There is no OAuth callback, so there is
  nothing to auto-link. This is a stronger property than "we set the flag correctly": it cannot
  regress when someone later enables a provider without reading this document.
- No Google Cloud / GitHub OAuth app registration (both are owner actions outside the code).
- No `account.accountLinking` config to get right, and no dependence on `emailVerified` being
  correct - which matters, because **nothing in this repo can send email** (see §4).
- Cost, and it is real: no "Continue with Google" at signup. For a pre-launch invite list behind the
  `SITE_PASSWORD` wall, that cost is close to zero today and grows as the list does.
- Adding Google later is a additive change, gated on doing §3's `accountLinking` work properly then.

### Option B - full parity (email/password + Google + GitHub)

Everything in Option A, plus OAuth apps, provider config, `accountLinking.allowDifferentEmails =
false`, link-only-when-`emailVerified`, **and a working mailer**, because verified-email linking is
the entire fix and it is meaningless without the ability to verify an email.

Larger, and it reintroduces the exact class we are migrating to escape - closed by configuration
rather than by absence.

**My recommendation is Option A**, on the reasoning that the cheapest way to be immune to a
vulnerability class is not to run the code path. It also gets the uploader multi-user soonest, which
is the actual objective.

---

## 3. What changes (both options)

| File | Today | After |
|---|---|---|
| `web/src/lib/auth/server.ts` | `createNeonAuth({baseUrl, cookies})` | `betterAuth({database, emailAndPassword, ...})` |
| `web/src/lib/auth/client.ts` | `createAuthClient` from `@neondatabase/auth/next` | `createAuthClient` from `better-auth/react` |
| `web/src/app/api/auth/[...path]/route.ts` | proxies to Neon's handler | mounts the local Better Auth handler |
| `web/src/lib/session.ts` | `getAuth().getSession()` | `auth.api.getSession({ headers })` |
| `web/src/lib/auth/use-signed-in.ts` | Neon client hook | Better Auth client hook |
| `web/src/app/auth/[path]/page.tsx` | `<AuthView>` prefab | **our own** sign-in / sign-up forms |
| `web/src/app/account/[path]/page.tsx` | `<AccountView>` prefab | **our own** account page (see §5) |
| `web/src/app/layout.tsx` | `<NeonAuthUIProvider>` | removed |
| `web/src/app/globals.css` | `@import '@neondatabase/auth/ui/tailwind'` | removed - **see the theming hazard below** |
| `package.json` | `@neondatabase/auth@0.4.2-beta` | `better-auth@^1.6.23`; `ignoreGhsas` loses the better-auth ids |
| `web/src/lib/user-corpus/access.ts` | `MULTI_USER_UPLOADS = false` | `true` - A7 permits it once the ids are gone |
| DB | `neon_auth.users_sync` (managed) | `user` / `account` / `session` / `verification` in our schema |

**Nothing in `db/`, `web/src/lib/` or `scripts/` references `neon_auth` or `users_sync`** (measured
2026-08-05, zero hits). So there is no foreign key to break: user ids are plain text columns
everywhere. Clean-start orphans rows; it does not violate a constraint.

**The theming hazard, and it is a known live defect.** `globals.css:6` records that the dark-mode
class ownership is entangled with the Neon UI import: "IT USED TO BE `.dark`, AND WE DO NOT OWN THAT
CLASS". The A7b walk (2026-08-02) separately found the reading-theme control mis-stating itself and
"Light" not surviving a reload, because two theme systems own that class. Removing the Neon import
either fixes that defect or breaks theming outright. **Either way it must be exercised in a browser
at 390px and desktop, not typechecked** - CLAUDE.md's DoD, and this is exactly the surface it was
written for.

---

## 4. The dependency the spike glosses: there is no mailer

Measured 2026-08-05: no `resend` / `sendgrid` / `nodemailer` / `postmark` / `mailgun` / `ses`
dependency, and no `sendMail`/`sendEmail` call site anywhere in `web/src`. Today Neon sends whatever
verification and reset mail exists.

Consequences:
- Option B's `emailVerified`-gated linking **cannot be implemented honestly** without first wiring a
  mail provider. Configuring the flag while nothing can ever set `emailVerified` would produce a
  gate that never opens or never closes, and either way was never tested.
- **Password reset needs email under both options.** Ancient Paths would ship with no self-serve
  reset until a mailer lands. For an invite list behind `SITE_PASSWORD` that is survivable for a
  short window and must be a deliberate, dated acceptance, not a discovery.

**This is new scope that neither the spike nor SEC-1 costed.** It is the main reason the cutover is
bigger than "swap the library."

---

## 5. Scope boundary for the account page

Neon's `<AccountView>` ships change-password, change-email, session list and delete-account for
free. Self-hosting means building them. Proposed Slice 1 of the cutover: **sign-up, sign-in,
sign-out, and change-password only.** Session list and delete-account are deferred, named here so
the deferral is a decision rather than an omission. Delete-account in particular interacts with 21
user-scoped tables and deserves its own slice.

---

## 6. Order of work, and where it stops for a gate

1. Wire Better Auth server + client + handler route behind the existing env, **on the Lane B Neon
   branch**, not prod. Re-run the spike's four proofs against the real app rather than the harness.
2. Replace the two prefab pages with our own forms. Browser DoD at 390px and desktop, including the
   theming hazard in §3.
3. **STOP - owner gate.** Run Better Auth's schema migration on production (⚑ bylaw 7).
4. Cut prod env over; deploy; verify a real sign-up and sign-in against production.
5. Remove `@neondatabase/auth`; drop the better-auth ids from `ignoreGhsas`; run the full
   `npm run audit` with the gate re-armed.
6. Flip `MULTI_USER_UPLOADS = true`. A7 goes green **by measurement** - that constant cannot be
   flipped while an in-path id remains ignored, which is now enforced in CI.
7. Independent `deep-audit` pass by agents that wrote none of it (bylaw 4).

Steps 1-2 need no owner go and no production access. Step 3 onward each do.

---

## 7. What this does not do

- It does not migrate existing accounts. Clean-start, per the spike's 2026-07-08 commitment: every
  account re-registers, and annotations keyed to old Neon ids are abandoned. **This is cheapest
  right now and gets more expensive every day** - the uploader's tables are empty today, so doing
  the cutover before the uploader ships costs nothing and doing it after orphans real uploaded work.
- It does not address the other three better-auth advisories marked "assess" in SECURITY.md
  (86j7 / 9h47 / 392p). Running our own 1.6.23 moots them by version, but that should be confirmed
  against the re-armed audit in step 5 rather than assumed here.
- It does not remove the `SITE_PASSWORD` wall. That is a separate call, and `middleware.ts` says the
  wall comes down "when SEC-1 closes" - which will be true at step 5, and is still the owner's.
