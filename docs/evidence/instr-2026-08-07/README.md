# `INSTR` — both loops instrumented against production, 2026-08-07

Block `INSTR` of `docs/UX_REMEDIATION.md`. Live authenticated session on `ancientpaths.app`,
test account `audit.traveler.ux@gmail.com`. Owner authorised the session and the prod writes;
the gate and account passwords were typed by the owner, not by the agent.

**Build under test: `b4f2a96`**, per `docs/evidence/deploys/deploy-b4f2a96-2026-08-07T19-09-02Z.txt`.
**Not** measured from the running app — `/api/health` returns `"sha": null`, so the build does not
report its own commit. The staleness claim rests on the deploy receipt plus a file-level diff, and
is stated that way deliberately: one instrument's silence is not a fact about the world
(`docs/pm/MASTER.md`, watchlist instance six).

Relevant to which findings transfer to `HEAD` (`ef5f619`, 6 commits ahead):

| File | vs. deployed |
|---|---|
| `web/src/app/api/plans/[id]/route.ts` | identical |
| `web/src/lib/plan/store.ts` | identical |
| `web/src/components/plans-client.tsx` | identical |
| `web/src/app/api/ask/stream/route.ts` | identical |
| `web/src/components/ask-client.tsx` | **differs, +81 lines** — `RetryButton` occurs 0× in the deployed build, 3× at HEAD |

So **every plan finding below is exact against current code.** Every Ask finding is about
`b4f2a96` and must be re-run after the next deploy.

---

## 1. The sequencing question — ANSWERED

> `INSTR`'s exit test: 401/403 → auth-scoped, sequence the auth migration before `L2`.
> 400/422 → validation, `L2` independent. 5xx → server fault, `L2` independent.

**`500 INTERNAL`, 5/5 attempts. → `L2` is INDEPENDENT of the auth migration.**

The audit deck's auth-scope hypothesis is **killed**. So is the 404 hypothesis this repo's own `R0`
raised (`store.ts:300`, no matching `plan_days` row) — see the controls below.

```
POST /api/plans/40e1a8fb-4da5-4307-82d5-7c84f9111a03
  {"kind":"day","dayIndex":1,"completed":true}
→ 500  {"error":{"code":"INTERNAL","message":"Something went wrong on our end. Please try again."}}
```

| dayIndex | Status | Code |
|---|---|---|
| 1 | 500 | `INTERNAL` |
| 2 | 500 | `INTERNAL` |
| 3 | 500 | `INTERNAL` |
| 7 | 500 | `INTERNAL` |
| 15 | 500 | `INTERNAL` |

**Two controls, run to prove the arms are distinguishable rather than assuming it:**

| Control | Result | What it proves |
|---|---|---|
| `dayIndex: 999` (out of range) | **400** `INVALID_REQUEST`, `"dayIndex must be a whole number from 1 to 728"` | The validation layer works and 400 is reachable. The 500 is not a mislabelled validation failure. |
| Unknown plan UUID | **500**, not 404 | **The 404 arm at `store.ts:300` is never reached.** The query throws before it can return zero rows. Kills the "no matching `plan_days` row" hypothesis with a check that could have shown the opposite. |

The 401 envelope was pinned separately before sign-in, so it cannot be confused with the above:
`{"error":{"code":"UNAUTHENTICATED","message":"Please sign in to continue."}}`.

---

## 2. Root cause — a stale comment, cited forward

Vercel runtime logs, deployment `dpl_DQhv71sbxjs5XjoNZfNDdtq31doS`. The `console.error` at
`api/plans/[id]/route.ts:59` **already existed and was already firing** — `INSTR`'s "add four log
lines" step was unnecessary for this loop, and adding server logs would have required a gated
production deploy to become readable.

```
23:54:36 POST /api/plans/40e1a8fb-… 500 [error/serverless]
    plan day toggle error: permission denied for table plan_days

23:55:59 DELETE /api/plans/40e1a8fb-… 500 [error/edge-middleware]
    plan delete error: permission denied for table plans
```

**Not RLS. Not auth. A missing `GRANT`.**

- **`db/migrations/032_audit_2026_08_02_data_layer.sql:49`** (finding H15) narrowed the schema
  default: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON TABLES FROM
  app_runtime`. Its own comment says the point is that *"a table that genuinely needs them says so
  in its own migration."*
- **`db/migrations/039_plans_coverage_topical.sql:61-62`** created **both** `plans` (`:27`) and
  `plan_days` (`:42`), and declined to grant anything:

  > `-- Migration 001's ALTER DEFAULT PRIVILEGES grants app_runtime full DML on`
  > `-- owner-created tables, so no new GRANT is needed (016:33-38 records this).`

  039 > 032. **That comment was true when `016` wrote it and false by the time `039` relied on
  it.** Both tables were born with SELECT + INSERT and no UPDATE or DELETE.

This is the repo's own recurring class in a new costume. 032 existed *because* "a human
remembering a per-table REVOKE has already failed twice" — and the very next table-creating
migration failed in the mirror image, by **citing a documented fact forward instead of re-reading
the current state**. Nothing checks that a migration's cited premise still holds.

**Blast radius** — `plan_day_readings` (migration 042) is also post-032 and should be assumed
affected until measured:

| Operation | SQL | Status |
|---|---|---|
| Create a plan | `INSERT plans`, `INSERT plan_days` | **works** — INSERT was never revoked (201 observed) |
| Read a plan | `SELECT` | **works** |
| `Mark as read` | `UPDATE plan_days` | **denied** |
| `Delete plan` | `DELETE plans` | **denied** — found here; **neither audit tried it** |
| Plan rename (`L2c` backlog) | `UPDATE plans` | denied — unbuilt, would have failed on arrival |

---

## 3. Production is left with one artifact, and it cannot be removed

The cleanup promised when the writes were authorised **cannot be honoured**: `Delete plan` is one
of the two broken operations.

```
plan id : 40e1a8fb-4da5-4307-82d5-7c84f9111a03
title   : rom in 3 weeks
account : audit.traveler.ux@gmail.com
state   : 15 days, 0 completed
```

No code path in the application can delete it. It becomes deletable the moment the grant is
fixed, and deleting it should be the first check that the fix works.

---

## 4. Ask — the deck's failure did NOT reproduce

**2/2 attempts succeeded**, against `b4f2a96`. Recorder armed **before** submit — `window.onerror`,
`unhandledrejection`, a wrapped `console.error`, and a `MutationObserver` watching for the turn
list emptying. A capture started after the event cannot see the event (`THE_LOOP.md` §6; the same
mistake retracted A7's X1).

| # | Question | Elapsed | Terminal state | Question lost? | Unmount? | Console errors |
|---|---|---|---|---|---|---|
| 1 | "What does it mean that the Word became flesh in John 1:14?" | **~104s** | Composed answer, 3 attributed voices (Barnes/Presbyterian, Augustine/Patristic, +1) | no | no | none |
| 2 | "How have the fathers understood 'let us make man in our image'?" | **~58s** | Composed answer with attribution | no | no | none |

Attempt 1 visibly ran the retry loop — `Refining the answer (attempt 2)…` at ~71s.

**What this does and does not settle:**

- The deck's "3 of 3 failed, silent reset, question gone" **did not reproduce in 2 attempts.** Not
  a refutation — different day, different account, different questions, n=2 against their n=3.
- **The silent-reset mechanism remains unexplained and unobserved.** `turns` has no reset path in
  either build, so a reset requires an unmount; the observer armed for exactly that never fired.
- **What did show up is latency**: 104s and 58s, against the walkthrough's 18s and 45s. `L1b`'s
  premise ("~18s success, ~45s failure") understates it, and its remedy — one line after 15s —
  is aimed at a wait less than a fifth of what was measured here.
- Production has **no retry control at all** (`RetryButton` absent from `b4f2a96`), so `L1`'s
  step 4 is already written at HEAD and merely undeployed.

---

## 5. Findings outside `INSTR`'s scope, captured in passing

- **`L2b` confirmed live.** The builder opens at `rom` / 8 weeks / 5 days = 40 reading days with
  **`Create plan` disabled before the user touches anything**. Setting weeks to 3 enables it and
  previews `15 readings · about 1 chapter a day`.
- **`L2c` title confirmed live.** `POST /api/plans` returned `"title":"rom in 3 weeks"`.
- **`L2c` dates behaved correctly** for an `en-US` browser (`Fri, Aug 7`), consistent with v1.1's
  corrected client-locale root cause. The `zh-CN` leg was not run.
- **NEW, in neither audit: production CSP blocks the webfonts.** Every page load repeats
  `Loading the stylesheet 'https://fonts.googleapis.com/css2?family=EB+Garamond…' violates the
  following Content Security Policy directive: "style-src 'self' 'unsafe-inline'"`. EB Garamond,
  Literata and Source Sans 3 never load in production; the app renders in fallback faces. Filed
  to the Backlog — it is not a `UX_REMEDIATION` finding and belongs to whoever owns the CSP.

---

## 6. Reproduction steps for a second person

1. Sign in at `ancientpaths.app` (gate password, then the test account).
2. `/plans` → `Build my first plan`. Observe `Create plan` disabled at the defaults (`L2b`).
3. Set weeks to 3 → `Create plan`. Observe the title `rom in 3 weeks` (`L2c`).
4. Open the plan → `Mark as read`. Observe the toast and `0 of 15 days` unchanged.
5. Network panel: `POST /api/plans/<id>` → **500 `INTERNAL`**.
6. Vercel runtime logs, filter `plan day toggle error` → `permission denied for table plan_days`.
7. `Delete plan` → **500**; logs show `permission denied for table plans`.
