# Neon "Managed Better Auth" — evaluation, and the questions that decide it

**Status: EVALUATION ONLY. No code, no decision. Owner asked 2026-08-07 to move auth from
self-hosted Better Auth to Neon Auth; this records what was found and what Neon must answer first.**

Reverses, if adopted, [`AUTH_CUTOVER_DESIGN.md`](./AUTH_CUTOVER_DESIGN.md) — which completed
**2026-08-05, two days before this request** — and re-opens [`SECURITY.md`](./SECURITY.md) SEC-1.
Per CLAUDE.md value 2, anything touching auth needs a design doc before implementation; per
AGENTS.md this is production-affecting and changes every user id, so it needs the owner's go.

---

## 1. What genuinely changed on Neon's side, and it is not nothing

The owner is right that Neon rebuilt this. The previous Neon Auth was an **external identity
provider with webhook sync** (Stack Auth based), which did not fit Neon's branching model. The
current product is **"Managed Better Auth"**, and per Neon's docs:

- Authentication data lives in **your own Neon database**, in a `neon_auth` schema.
- It is **queryable with SQL and compatible with RLS policies**.
- It **branches with the database** — auth state forks when you branch.

That last property is a real fit for this repo: Lane B builds on `lane-b-uploader`, and the current
self-hosted setup means auth does not branch with the data. It would also close audit finding
**A1-2** outright (better-auth's in-memory rate limiter, useless on serverless) by making the
limiter Neon's problem.

**This section is here so the next reader does not dismiss the idea.** The blocker below is about a
version number, not about the architecture, and version numbers change.

## 2. The blocker — verified from the registry, not from docs prose

Neon's docs for Managed Better Auth direct you to install `@neondatabase/auth@latest`. Measured
2026-08-07:

```
$ npm view @neondatabase/auth version
0.4.2-beta

$ npm view @neondatabase/auth dependencies
{ "better-auth": "1.4.18", "@better-fetch/fetch": "1.1.21",
  "@supabase/auth-js": "2.79.0", "jose": "6.1.2", "zod": "4.3.6",
  "@neondatabase/auth-ui": "0.2.1-beta" }
```

**`@latest` is `0.4.2-beta` — byte-identical to the version this repo removed** — and it still
hard-pins **`better-auth: 1.4.18`**.

That is the exact dependency SEC-1 is about. `SECURITY.md` records 15 advisories rooted in it, and
patched is **≥ 1.6.11**. The app currently runs **1.6.26**, self-hosted.

Neon's overview page separately states the managed service "currently supports Better Auth version
1.4.18" and that Neon manages the version. Two independent sources, one of them the package
registry.

**So adopting Neon Auth today means reinstalling the same package version, pinning the same
vulnerable better-auth, and returning to a server whose version we cannot set** — which is verbatim
the situation `AUTH_CUTOVER_DESIGN.md` §1 exists to escape:

> The only remediation is to stop being a client of Neon's auth server: run Better Auth ourselves,
> where the version and the config lever are both ours.

Status is **beta**, "targeting general availability this quarter". The roadmap lists MFA, admin
plugin customisation and standalone architectures; it names **no version-upgrade plan** and **no
bring-your-own-version option**.

## 3. The two consequences that are not about advisories

- **GHSA-g38m stops being structurally closed.** The cutover chose email/password-only precisely so
  the account-takeover exploit has no mechanism to run — a property that "cannot regress when
  someone later enables a provider without reading this document". Neon Auth makes social login a
  configuration toggle, so that property degrades from *structural* to *a setting nobody must
  change*, with no lever of ours to fix it if they do.
- **Every user id changes again.** The 2026-08-05 cutover already did this once. Neon's own
  migration guide does not state whether ids are preserved (see Q4).

## 4. Questions for Neon — the answers decide this

Ask these in Neon's Discord or via support. **Q1 alone is dispositive.**

1. **What better-auth version does Managed Better Auth run in production today, and what is the
   upgrade cadence?** Your docs say 1.4.18. Patched for the 2025 advisory set is ≥1.6.11. Is 1.6.x
   available now, scheduled, or unplanned?
2. **`@neondatabase/auth@latest` resolves to `0.4.2-beta`, pinning `better-auth@1.4.18`.** Is that
   still the correct client for Managed Better Auth, or is there a different package or a
   republish pending? If the managed service has moved on, the SDK on npm has not.
3. **How are advisories in the managed better-auth handled?** If a CVE lands against the version you
   run, what is the customer-visible remediation path and its SLA — and is there any way for a
   customer to pin forward?
4. **Does migrating from self-hosted Better Auth preserve user ids**, or is it a clean start? Our
   `auth_users.id` is the foreign key for every user-scoped row in the database.
5. **Is email/password-only enforceable at the project level**, such that social login cannot be
   enabled by a later config change without an explicit, auditable action?
6. **GA timeline**, given "this quarter" — and whether the beta carries any data-durability or
   breaking-change caveats we should price in.

## 5. Decision rule, written before the answer

Recorded now so the outcome is not rationalised afterwards.

| Neon's answer to Q1 | Disposition |
|---|---|
| Managed version is **≥ 1.6.11** today | **The blocker is gone.** Proceed to a design doc; the branchable-identity and A1-2 wins are worth the migration. |
| **Scheduled** with a date, and Q3 gives a real advisory path | Wait for it, then proceed. Re-enter at that date. |
| **1.4.18 with no upgrade plan**, or Q3 has no answer | **Do not migrate.** Stay self-hosted. Revisit only if Neon changes its version policy. |

Whatever the answer, **do not migrate while the managed version is below 1.6.11** — that trades a
patched dependency we control for a vulnerable one we do not, while SEC-1 gates public launch
(`CLAUDE.md`).

## 6. What happens meanwhile

The concrete problem Neon Auth would have solved is audit finding **A1-2** — better-auth's rate
limiter is an in-memory `Map`, so on serverless it bounds one lambda instance rather than one
attacker, leaving signup, signin and password-reset effectively unthrottled. That does not wait for
this decision: this repo already has a DB-backed limiter (`api_rate_limit`, used by `/api/gate` and
`/api/ask`), and pointing better-auth at it is the fix either way.

## Sources

- [Managed Better Auth — overview](https://neon.com/docs/auth/overview)
- [Managed Better Auth — roadmap](https://neon.com/docs/auth/roadmap)
- [Migrate to Managed Better Auth](https://neon.com/docs/auth/migrate/from-legacy-auth)
- [Neon blog — branchable identity in your database](https://neon.com/blog/neon-auth-branchable-identity-in-your-database)
- `npm view @neondatabase/auth` (registry, measured 2026-08-07)
