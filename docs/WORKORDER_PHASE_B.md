# Work Order — Phase B (Beta Readiness)

**Fill this in as you go. This is the review artifact — the owner and PM inspect this, not the commit log.** Be honest: a buried bug or an unreported fork is worse than a failed task. If something did not get done, say so and say why.

*Filled by the autonomous session 2026-07-11. Two files (`API_ERRORS.md`, this workorder) appeared in the tree without my authoring them; content matched the plan exactly, so I treated them as owner artifacts — flagged in §5.*

---

## 1. Summary

Walls **1 and 3 shipped and verified**; **wall 2 is parked on a genuine fork** (not guessed); the **fresh v3 held-out was minted, frozen, hashed, and run once**. Headline: the beta's **core gates PASS out-of-sample** — faithfulness 35/35, security (fail-closed gate + per-user rate-limit) live and seed-verified, v3 verse-ref 95% / pericope 87% / proper-noun 70% / controls 0 hijacks / no-content ≤2.5%. **Topical/epistle HIT@2 = 70% / 64%** (v3), reproducing the v2 gap — the documented GA target, not a beta blocker. **Phase B is NOT complete:** the one remaining beta blocker is **wall 2** (prod still serves quarantined content; it needs the owner's retrieval-mechanism pick — see §6). Everything is committed + pushed; tree clean; prod untouched (all changes are gated/reversible and nothing was deployed).

---

## 2. Tasks

| # | Task | Status | Commit | Verified how |
|---|------|--------|--------|--------------|
| 1 | Fail-closed gate + rate-limit + API error contract | **Done** | `cbd09b1` | Prod build + unset `SITE_PASSWORD` → 503 (live); rate-limit real-DB (11th blocked); 15 unit tests; `/security` clean; audit green |
| 2 | Migrate + publish legal corpus | **Parked (fork)** | — | Read-only DB state check; see §6 |
| 3 | Observability | **Done** (provider parked) | `e72ca08` | 4 events wired; logger unit-tested; secret-scan clean |
| 4 | Mint fresh v3 held-out (frozen + hashed) | **Done** | `2cb3429` | 120 q, disjoint (0 overlap), all refs parse, `sha256=f7a771a5…` committed pre-number |
| 5 | Run v3 once (read-only) | **Done** | `5f23bfb` | Single run on shipped legal path; hash verified intact; no tuning |
| 6 | Full verification sweep | **Done** | (this) | Audit green, 186 tests pass, no secrets logged, tree clean + pushed |
| 7 | *(Stretch)* Ingestion harness Phase 1 → staged | **Not started** | — | Gated on "1–6 green"; wall 2 is parked, so the gate isn't met (§6) |

Status = Done / Partial / Blocked / Not started. **Partial and Blocked need a "why" in §6.**
Wall 1 = `cbd09b1`; wall 3 = `e72ca08`; v3 mint = `2cb3429`; v3 run = `5f23bfb`.

---

## 3. Verification evidence (seeded failures, not green checks)

- Prod build + `SITE_PASSWORD` unset → `/` and `/api/ask` returned: **HTTP 503** (body "This site is temporarily unavailable"; loud server log `[gate] SITE_PASSWORD is not set in production — failing CLOSED`).
- Dev + unset → still works? **Yes** (dev serves normally; `gateDecision` unit test covers the `isProd=false → allow` branch).
- limit+1 as one user → **11th call blocked (429, cap 10)**; 2nd user unaffected? **Yes** (independent window, real-DB run; app_runtime grant confirmed).
- Forced limiter DB error → request succeeded? **Yes** (fail-open); logged loudly? **Yes** (`rate_limit_fail_open` event) — unit-tested with a throwing `sql`.
- Error contract: each code returns correct status + `Retry-After` + no internals leaked? **Yes** — `apiError` unit test asserts statuses + that `GATE_LOCKED`/`INTERNAL` messages never match `password|config|gate|stack|db`.
- Prod retrieval now serves **only published** sources? **NO — parked (wall 2, §6).** Prod still reads the whole `embeddings` table. It is **gated** (fail-closed SITE_PASSWORD), so the quarantined content is not public — this blocks *opening beta*, not owner dogfood.
- `npm run audit`: **GREEN**. `/security` on the diff: **wall 1 reviewed, no HIGH/MED findings**; wall 3 is logging-only (secret-scan clean, no injection surface); v3 is eval data. Full test suite: **186 passed / 1 skipped (pre-existing integration test)**.

---

## 4. Numbers (record, don't tune)

- **Fresh v3 held-out** (hash `f7a771a5d06b2d1315e1bb40cea357b6063228438154f6bc89d49fac2688f295`):

  | category | metric | v3 | bar | verdict |
  |---|---|---|---|---|
  | verse-ref | HIT@1 (HIT@2) | 95% (93%) | ≥85% | ✅ |
  | pericope | HIT@1 (HIT@2) | 87% (93%) | ≥70% | ✅ |
  | proper-noun | HIT@1 (HIT@2) | 70% (90%) | ≥70% | ✅ (at bar) |
  | epistle | HIT@2 | 64% | ≥85% | ❌ GA target |
  | topical | HIT@2 | 70% | ≥85% | ❌ GA target |
  | controls | hijacks | 0/10 | 0 | ✅ |
  | all | no-content | ≤2.5% (verse-ref 1/40) | ≤8% | ✅ |

  Failure codes: verse-ref 37/2/0/1 (pass/`<2`/wrong/none) · pericope 14/1/0/0 · epistle 16/5/4/0 · topical 14/3/3/0 · proper-noun 9/1/0/0.
- Frozen v2 through the shipped path post-migration — regression vs 65/72? **N/A — migration/switch parked (§6); v2 pipeline unchanged, still 65/72.** v3 reproduces it out-of-sample (topical 70, epistle 64).
- Production fallback rate observed (if any traffic): **not yet** — the `ask_outcome` event now emits `kind` per request, so it will be visible once the gated beta gets traffic (measured at ~14% in the faithfulness run).

---

## 5. Bugs found

| Bug | Where | Severity | Fixed? | Commit / why not |
|-----|-------|----------|--------|------------------|
| Gate failed OPEN on unset `SITE_PASSWORD` | `web/src/middleware.ts:16` | High | **Fixed** | `cbd09b1` — now 503 in prod |
| `/api/ask` + `/ask/stream` unthrottled (wallet-DoS) | both routes | High | **Fixed** | `cbd09b1` — per-user rate limit |
| Two untracked files not authored by me (`docs/API_ERRORS.md`, this workorder) | tree | Info | **Incorporated + flagged** | Content matched the plan; treated as owner artifacts. Please confirm they're yours. |
| eval "shipped path" (pure-vector-legal) already diverges from prod (hybrid-full) | retrieval | Medium | **Reported, not fixed** | The core of the wall-2 fork (§6) — needs your mechanism pick |
| 1 verse-ref `no-content` in v3 (legal-corpus coverage hole on one chapter) | corpus | Low | **Reported** | 1/40; identify + backfill at GA |
| v3 doctrinal labels authored unattended (not machine-fetched) | v3 eval | Low | **Flagged** | Proof-text page 404'd; recommend spot-audit before the 64/70 number is final |

---

## 6. Forks parked / blocked items

**WALL 2 — migrate + publish legal corpus + switch prod retrieval (PARKED).** DB state: `sources` has only Barnes (`staged`); the legal set was never migrated; prod `retrieveCommentary` reads the whole `embeddings` table (190,635 rows) via `hybrid_search`. **The blocking finding:** the eval that produced 65/72 uses a *pure-vector-on-legal-filter* base pool, while prod uses *hybrid_search over the full corpus* — they already diverge, so "switch prod + verify no regression vs 65/72" implies **changing prod's retrieval method**, not just adding a filter. Three mechanisms, materially different risk:
  1. **Align prod base-pool to the eval (pure-vector-legal), single-sourced in `routing.ts`** — prod == the measured 65/72 by construction; serves only legal; reversible. Cost: drops hybrid BM25 from prod (unmeasured value). **← my recommendation for beta.**
  2. **Author-allowlist post-filter on the hybrid path** — ~2 lines, correctness-safe (never returns non-legal), but yields an *unmeasured* number and can hurt recall.
  3. **Full sources/sections retrieval cutover** (`MIGRATION_DESIGN.md` end-state) — biggest/riskiest; rewrite the whole retrieval stack onto `section_embeddings`, prove parity, cut over. **The GA architecture, not a safe unattended one-shot.**
  Parked (not guessed) because all three change prod retrieval behavior and a wrong cutover risks leaving prod broken — which you forbade. **Need:** your pick of mechanism (I recommend #1). ~1–2 hrs once chosen; fully reversible; I'll verify frozen v2 = 65/72 AND drive the real `retrieveCommentary` (temp-endpoint) to confirm legal-only.

**Observability external provider (PARKED).** Error-tracking + alerting (Sentry/PostHog/Vercel log-drain alerts) needs an account/DSN I don't have. Structured events are already emitted (the substrate any provider ingests); wiring the vendor is additive. **Need:** you provision a vendor + DSN. Recommendation: Sentry + a log-drain alert on `evt:"gate_locked"` and `kind:"fallback"` spikes.

**Stretch (ingestion harness) — NOT started,** correctly: its gate is "only if 1–6 green," and wall 2 is parked.

---

## 7. Staged awaiting owner approval

Nothing published; nothing staged for ingestion (the harness stretch task didn't run — see §6). No new works were ingested or published. The v3 held-out is committed + frozen but its **doctrinal labels want a spot-audit** (§5) before the 64/70 topical/epistle number is treated as final.

---

## 8. Known limitations carried into beta

The owner-accepted ones (ROADMAP 2026-07-11), all confirmed this session:
- **Retrieval topical/epistle HIT@2 = ~64–70%** (v3, out-of-sample) — 85% is the **GA target**, not a beta blocker; per-passage-cap correction stashed (`git stash@{0}`) for GA.
- **~14% fallback rate** (≈1 in 7 queries shows sources, not a composed answer) — stochastic, fail-closed-safe; the `ask_outcome` event now makes it observable in prod.
- **n=35 bait** — a de-risk, not a statistical guarantee; grow the suite + add production faithfulness monitoring for GA.
- **V2 classifier deferred** to post-beta defense-in-depth, with a **hard re-gate trigger** the moment the app-voice surface expands (voice.summary / richer summaries / debate-topics/attributed-stance).
- **NEW this session:** prod still serves the full (quarantined-inclusive) corpus behind the gate (wall 2 parked); 1 verse-ref no-content coverage hole in v3.

---

## 9. Exact next step

**Reply with your wall-2 mechanism pick (I recommend #1: align prod's base pool to the eval's pure-vector-legal path).** That's the last beta blocker. On your ✅ I'll: single-source `PUBLISHABLE` into `routing.ts`, switch prod retrieval, verify frozen v2 = 65/72 through the shipped path + drive the real `retrieveCommentary` to confirm legal-only, then the beta gate is met. (Second, when convenient: provision a Sentry DSN for wall-3 alerting, and spot-audit the v3 doctrinal labels.)

---

## 10. Risks I'd flag

- **The eval/prod retrieval divergence (§6) is the real story of wall 2.** Until it's reconciled, "65/72" describes the *eval*, not what a beta user gets from prod. Don't open beta until prod actually runs the measured path.
- **v3's topical/epistle number (64/70) rests on unattended-authored doctrinal labels.** It reproduces v2 closely (reassuring), but treat it as provisional until spot-audited. The passing gates (verse-ref/pericope/proper-noun/control) are objective and safe.
- **Two files appeared in the repo that I didn't create.** I incorporated them because they matched your plan, but if they weren't yours, that's worth knowing.
- **Nothing was deployed.** All changes are on `main` (pushed) but not on prod; migration 008 *was* applied to the Neon DB (additive, reversible). A deploy is still your call.
