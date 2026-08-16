# SEC-1 — decision brief for the site gate

**Filed 2026-08-16. This is a brief, not a build. Nothing here was changed; the gate is up.**

Answers `docs/pm/MASTER.md` owner decision 6 ("the gate decision IS the public-launch decision").
Every number below is measured on `work/02` @ `5618cf6` with the command shown. Where the answer
cannot be measured from this repo, it says so and names who can answer it.

---

## 0. The headline — the premise this decision has rested on since 2026-08-07 is stale

Six places in this repo state that `@neondatabase/auth@0.4.2-beta` is the newest version that
exists, and that it hard-pins `better-auth@1.4.18`:

- `docs/SECURITY.md:62-63` ("measured that day: `@neondatabase/auth@latest` is still `0.4.2-beta`")
- `docs/SECURITY.md:187-188` ("**newest** version and **hard-pins** `better-auth: "1.4.18"`")
- `docs/SECURITY.md:93-94` ("Closure requires the managed better-auth version to reach ≥1.6.11")
- `docs/AUTH_CUTOVER_V2_NEON.md:15-16` (measured 2026-08-07 and again 2026-08-08)
- `package.json` → `pnpm.auditConfig["//"]` ("0.4.2-beta is the latest release that exists")
- `scripts/audit.sh:56-57` (same sentence)

Each was true when written. Measured today:

```
$ npm view @neondatabase/auth version
0.5.0-beta

$ npm view @neondatabase/auth@0.5.0-beta dependencies
{ "better-auth": "1.6.23", "@neondatabase/auth-ui": "0.3.0-beta",
  "@better-fetch/fetch": "1.3.1", "jose": "6.2.5", "@supabase/auth-js": "2.79.0", "zod": "4.3.6" }
```

**`better-auth@1.6.23`.** The two advisories that are currently red are patched at **≥1.6.11**
(GHSA-g38m) and **≥1.6.22** (GHSA-qq9h). 1.6.23 clears both.

`docs/SECURITY.md:62-64` records the standing rule from `AUTH_NEON_MANAGED_EVALUATION.md`: *do not
migrate while Neon's managed version is below 1.6.11.* By the SDK's own pin, that condition is now
met — for the first time since the rule was written.

This does not by itself close SEC-1. §3 is why. But it is the fact that makes the decision live
rather than a re-reading of an eight-day-old position.

---

## 1. The advisory set — enumerated from the registry, not from the table

Measured against the version actually installed, rather than quoted from `docs/SECURITY.md`:

```
$ curl -s -X POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk \
    -H 'Content-Type: application/json' -d '{"better-auth":["1.4.18"]}'
→ 10 advisories
```

Reachability adjudicated against **this build**, by grep over `web/src` (0 hits for every plugin
name listed): `oidcProvider` · `mcpProvider` · `oauthProvider` · `organization` · `magicLink` ·
`emailOTP` · `passkey` · `accountLinking` · `socialProviders`.

| GHSA | Sev | Precondition | Reachable here? | Evidence |
|---|---|---|---|---|
| **GHSA-g38m-r43w-p2q7** | HIGH | email/password **and** a social provider, with an unverified local account to auto-link onto | **YES — fully assembled** | Google button live at `web/src/components/auth-forms.tsx:118`; email/password at the same form. Mitigated only by `Verify at Sign-up` (§4) |
| GHSA-qq9h-g4jm-xgf3 | HIGH | magic-link or email-OTP sign-in shipped | **no** — method not shipped | 0 hits for `magicLink`/`emailOTP` in `web/src`. Hosted method config unobservable → declared `--expect-red`, not ignored (ADR-038) |
| GHSA-pw9m-5jxm-xr6h | CRIT | app runs better-auth **as an OIDC provider** | no | 0 hits `oidcProvider`/`mcpProvider` |
| GHSA-9h47-pqcx-hjr4 | HIGH | `oidcProvider` enabled | no | same |
| GHSA-86j7-9j95-vpqj | HIGH | `oidcProvider`/`mcp` plugin enabled | no | same |
| GHSA-7w99-5wm4-3g79 | HIGH | `@better-auth/oauth-provider` enabled | no | 0 hits `oauthProvider` |
| GHSA-392p-2q2v-4372 | HIGH | better-auth issuing OAuth refresh tokens (provider role) | no | we are an OAuth *client*; Google's tokens are Google's |
| GHSA-fmh4-wcc4-5jm3 | HIGH | organization-invitation plugin | no | 0 hits `organization` |
| GHSA-wxw3-q3m9-c3jr | MOD | `state:"cookie"` **and** `pkce:false` | no | defaults in use; not configured anywhere |
| **GHSA-2vg6-77g8-24mp** | LOW | admin / anonymous plugins; stale sessions survive user deletion | no | **not in `docs/SECURITY.md`'s table at all** — see §2 |

Un-ignored high/critical, measured:

```
$ node scripts/deps-audit.mjs
✗ 2 un-ignored high/critical: GHSA-g38m-r43w-p2q7, GHSA-qq9h-g4jm-xgf3
```

Both are the declared `--expect-red` set (`scripts/audit.sh:58`), so the gate is green by
declaration. That is working as designed: a disappearance from that set fails the build, which is
what turns "Neon patched the server" into an event instead of silence.

### 1a. Would the bump actually be clean? Measured, in scratch, not in the tree

```
$ npm install --package-lock-only --legacy-peer-deps   # web/package.json with ^0.5.0-beta
→ better-auth resolves to a single hoisted copy at 1.6.23
→ remaining advisories: vitest (5xrq, CRIT) · vite (fx2h, HIGH) · esbuild · vite-node — all
  dev/build tooling, already in ignoreGhsas, never executed in the prod runtime
```

`better-auth@1.6.23`, `@better-fetch/fetch@1.3.1`, `jose@6.2.5` and `@supabase/auth-js@2.79.0` all
return **zero advisories** from the bulk endpoint. Peer requirements (`next >= 16`, `react >= 18`)
are already satisfied — `web` is on `next@^16.2.12`, `react@19.2.8`. The Next-16 pin that
`docs/SECURITY.md:188` names as a blocker for Path A was cleared by an unrelated upgrade.

**Blast radius of the bump is two files plus lockfiles** — the only importers of the SDK:

- `web/src/lib/auth/neon-auth.ts:18` — `createNeonAuth` from `@neondatabase/auth/next/server`
- `web/src/lib/auth/client.ts:3` — `createAuthClient` from `@neondatabase/auth/next`

**UNVERIFIED:** whether 0.5.0-beta keeps those two export names and the `getSession()` return shape.
A lockfile resolve does not exercise an API. Settled by installing it and running
`node -e "console.log(Object.keys(require('@neondatabase/auth/next/server')))"` plus the sign-in
path — which is a build, and is out of scope for this brief.

---

## 2. Two defects in the current record

**(a) `docs/SECURITY.md:182` says "15 advisories."** The live count against `better-auth@1.4.18` is
**10**. The figure was measured on 2026-07-08 and folded in the dev-tooling advisories (vitest,
vite, esbuild, postcss), which have a different root. Not load-bearing, but it is a number in a
security doc that no longer matches the registry.

**(b) GHSA-2vg6-77g8-24mp is in the live advisory set and in no table here.** It is `low`, and
`deps-audit.mjs` filters to high+, so it has never appeared in the gate and never will. Its
precondition (admin/anonymous plugins) is not met, so it is not in path — but that adjudication has
never actually been made, and the table's implicit claim to enumerate the set is therefore wrong by
one row.

---

## 3. The leg this repo cannot observe — and the trap already written down

`docs/SECURITY.md:359-373` records why the `fix/sec1-better-auth-1-6-25` branch was closed unmerged:

> **The override upgrades the wrong copy of better-auth.** … the vulnerable OAuth-callback auto-link
> logic runs [on Neon's hosted server], at a version we cannot see or set. … Overriding it moves
> `pnpm audit` from red to green while the account-takeover path is untouched.

**That warning applies to the 0.5.0-beta bump and must not be waved away.** The SDK in
`node_modules` is a proxy client; g38m's auto-link executes on Neon's server.

It is not the *same* act, and the difference is worth stating precisely rather than assuming either
way. The override branch forced a version pairing the vendor never shipped. 0.5.0-beta is the
vendor's own release, and a client SDK must be protocol-compatible with the server it proxies — so a
vendor release pinning 1.6.23 is **evidence about the platform's version** in a way a local override
is not. It is evidence, not proof, and this repo has a rule for exactly that distinction
(THE_LOOP rule 7: state conclusions no wider than the evidence).

**The question that settles it is already written and still unsent** —
`docs/AUTH_CUTOVER_V2_NEON.md:131-135` and `docs/SECURITY.md:286-295`: *what better-auth version
does Managed Auth run server-side, and does it verify the local `emailVerified` flag before
auto-linking an OAuth identity?* Neon's answer is recorded as **pending** since 2026-07-08.

---

## 4. `Verify at Sign-up` — the mitigation is 8 days old and this repo cannot see it

`docs/SECURITY.md:136-154`: the owner attested the toggle ON on **2026-08-08**, and the same section
says, in its own words, **"Re-attest it, do not carry it forward."** It names re-reading that
sentence as the migration-039 defect (citing a documented fact forward instead of re-reading state).

Nothing in this repo observed the toggle then and nothing can now. If it is off, every check here
stays green while g38m's precondition reassembles. **This brief therefore does not assert the toggle
is on** — it records that the last observation was 2026-08-08 and that dropping the gate on that
observation would be committing the defect the document warns about.

---

## 5. Finding: the SEC-1 → multi-user-upload coupling is dormant

`web/src/lib/user-corpus/access.ts:19-21` states the intended coupling:

> `MULTI_USER_UPLOADS = true` goes RED in CI while any advisory that `docs/SECURITY.md` adjudicates
> as in-path is still in `pnpm.auditConfig.ignoreGhsas`.

`MULTI_USER_UPLOADS` is **`true`** today (`access.ts:43`). Measured:

```
inPath derived from SECURITY.md's "In our path?" table : ["GHSA-g38m-r43w-p2q7"]
ignoreGhsas                                            : [5xrq, fx2h, 9h47, 86j7, 7w99, 392p, fmh4, pw9m]
stillIgnored                                           : []
=> the MULTI_USER_UPLOADS assertion at sec1-upload-gate.test.ts:77-82 does not execute
```

The assertion sits inside `if (stillIgnored.length > 0)`. On 2026-08-11 g38m was **relocated** from
`ignoreGhsas` to `--expect-red` — for a good reason (a disappearance becomes a build event) — and
that relocation emptied the condition. The advisory is still tracked; the *upload coupling* is not.
The test reports 7 passed, having never evaluated its load-bearing claim.

**Red-proof** (seeded, watched red, reverted — tree clean afterwards):

```
baseline                                   → 7 passed
seed: push GHSA-g38m back into ignoreGhsas → 1 failed | 6 passed
   ✗ sec1-upload-gate.test.ts:82  expected true to be false
revert (git checkout -- package.json)      → 7 passed
```

So the guard is correct and still fires when its condition holds. The condition no longer holds.
This is the watchlist shape (`MASTER.md`, "a guard whose expected set is typed by the same hand…"),
one layer over: **a guard whose trigger was moved out from under it by a change made for an
unrelated and legitimate reason.**

**Not fixed here.** Arming it against the `--expect-red` set as well as `ignoreGhsas` would turn CI
red immediately, because `MULTI_USER_UPLOADS = true` and g38m is declared. Whether that flag stands
is the owner's call, and it belongs with this decision rather than ahead of it.

---

## 6. What would have to be true to drop the site gate

`web/src/middleware.ts:5-10` binds them: *"SEC-1 in docs/SECURITY.md is open, so the public URL must
not accept anonymous visitors… Remove the gate when SEC-1 closes."*

| # | Condition | State today | Who can settle it |
|---|---|---|---|
| 1 | Prod dependency closure carries no un-ignored high/critical | 2 declared red (g38m, qq9h) | **Agent** — the 0.5.0-beta bump clears both; measured clean in §1a |
| 2 | Neon's **hosted** better-auth ≥1.6.11 confirmed | **UNKNOWN.** Question drafted 2026-07-08, answer pending | **Neon only.** Nothing in this repo can observe it |
| 3 | g38m's mitigation is either unnecessary (via 1+2) or freshly re-attested | Last attested 2026-08-08 | **Owner**, at the Neon console |
| 4 | 12-char password minimum + reset-revokes-sessions | **UNENFORCEABLE** on Neon — no such fields exist (`SECURITY.md:83-87`); the 12-char rule lives only in the client form, a hint not a control | **Owner** — accept explicitly, or block |
| 5 | Account-recovery mail from a domain readers trust | Neon's shared `auth@mail.myneon.app`, replacing the branded Resend sender | **Owner** — Neon console email provider |
| 6 | Rate limit on `/api/ask` | **PRESENT** — `checkAskRateLimit`, `web/src/app/api/ask/stream/route.ts:3,50-59`, denies on limiter failure | done |
| 7 | `createPgStore` `rejectUnauthorized` guard (CLAUDE.md pre-signup item 3) | **STILL OPEN** — `src/retrieval/store.ts:15` sets `rejectUnauthorized: false`. **Scope is smaller than the gate line implies**: no `web/src` file imports it; callers are `src/ingest/*` and `src/teacher/run.ts`, i.e. offline tooling, not the request path | Agent, cheaply |
| 8 | `interpretation_bait` at its stated bar | 100/100 = **~97% lower bound** (n=100). The gate names ≥99%, which needs ~300 clean cases of new vectors | Agent, but it is a real body of work |
| 9 | Observability | **zero** — no error tracking, no alerting (`ENGINEERING.md:84-86`, "you cannot run a multi-user product blind") | Owner call on scope |
| 10 | RLS binds under Neon's id format | Two-account legs now EXECUTED for `plans` (`plan-tenancy.test.ts`) and `ask_outcomes` (`9a36ab8`) as the real `app_runtime` role. **Not a blanket proof across all 21 user-scoped tables** | partially closed |

**Second-order effect, already recorded in `MASTER.md` decision 6 and worth restating because it
cuts the other way:** the gate matches everything except `gate|api/gate|_next/|favicon|manifest|
icons` plus a 10-entry exact-match marketing allowlist (`web/src/lib/gate.ts:13-31`). So **no
anonymous request reaches `/api/ask` at all** — `ask_outcomes` accumulates only from owner asks, and
Phase-D's ~1–2k training examples are blocked *by this decision*, not merely unstarted. Holding the
gate has a running cost, and it is not zero.

---

## 7. Recommendation

**Do not drop the gate on this brief.** Conditions 2, 4, 5 and 9 are all owner-or-vendor calls, and
2 is unanswerable from here.

**Do take the cheap, reversible half now, as a separate act from the launch decision:**

1. **Bump `@neondatabase/auth` to `^0.5.0-beta`** and regenerate both lockfiles. Measured clean; two
   files import it; rollback is `git revert` + redeploy. This is worth doing *on its own merits*
   whatever the launch decision is — it moves the client off a version with 10 known advisories.
   It is a build, and it is not in this phase's scope; it needs an owner go and a deploy.
2. **Send Neon the question** (§3). It has been pending five weeks and it is the only thing that can
   close condition 2. If the answer is ≥1.6.11 server-side, SEC-1 closes by version and this
   document's headline cost disappears — `AUTH_CUTOVER_V2_NEON.md:135`'s own words.
3. **Re-open the Neon console and re-attest `Verify at Sign-up`** (§4). One look, and the document
   asks for it explicitly.
4. **Decide the `MULTI_USER_UPLOADS` question** (§5) — either the flag comes back to `false`, or the
   gate is re-armed against the declared set and the flag's `true` is recorded as a deliberate
   acceptance rather than an artefact of a relocation nobody noticed.

**Stated no wider than the evidence:** what is proven here is that a vendor release exists which
pins a patched better-auth, that it resolves cleanly against this tree, and that the upload coupling
is dormant. What is *not* proven is that Neon's hosted server runs patched code — and that, not the
dependency graph, is where GHSA-g38m actually executes.
