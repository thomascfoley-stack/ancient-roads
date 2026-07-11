# Work Order — Phase B (Beta Readiness)

**Fill this in as you go. This is the review artifact — the owner and PM inspect this, not the commit log.** Be honest: a buried bug or an unreported fork is worse than a failed task. If something did not get done, say so and say why.

*Filled by the autonomous session 2026-07-11. Two files (`API_ERRORS.md`, this workorder) appeared in the tree without my authoring them; content matched the plan exactly, so I treated them as owner artifacts — flagged in §5.*

---

## 1. Summary

**Phase B is COMPLETE** (owner's definition: wall 2 merged + deploy verified live + work order updated).
All three walls shipped; wall 2 (Option 1) merged; **deployed to production and verified live** (the
fail-OPEN gate bug is now closed in prod); v3 run once. Headline gates PASS out-of-sample — faithfulness
35/35, fail-closed gate + per-user rate-limit LIVE, prod now serves **only** the legal corpus (eval↔prod
divergence eliminated), v3 verse-ref 95% / pericope 87% / proper-noun 70% / controls 0 / no-content ≤2.5%.
**Topical/epistle HIT@2 = 70% / 64%** (v3) — the documented GA target. **Stopped at the beta door** (opening
beta is the owner's call). Two authed live-checks couldn't be driven (no user session) and are DB/code-
verified instead (§3). New findings to review: the `historicalchristian.faith` patristic provenance
(elevated to pre-beta debt), and an **unauthored `docs/WORKORDER_PHASE_A.md`** that conflicts with the beta
framing (§6/§10). All committed + pushed; tree clean.

---

## 2. Tasks

| # | Task | Status | Commit | Verified how |
|---|------|--------|--------|--------------|
| 1 | Fail-closed gate + rate-limit + API error contract | **Done + DEPLOYED** | `cbd09b1` | Live prod: `GET /`→307/gate, unauth POST /api/ask→401; prod build unset→503; rate-limit real-DB; 15 tests |
| 2 | Migrate + publish legal corpus (Option 1) | **Done + DEPLOYED** | `e5677a0` | Single-sourced legal filter; both-direction DB check; v2/v3 hold; real retrieveCommentary legal-only |
| 3 | Observability | **Done** (provider parked) | `e72ca08` | 4 events wired; logger unit-tested; secret-scan clean |
| 4 | Mint fresh v3 held-out (frozen + hashed) | **Done** | `2cb3429` | 120 q, disjoint (0 overlap), all refs parse, `sha256=f7a771a5…` committed pre-number |
| 5 | Run v3 once (read-only) | **Done** | `5f23bfb` | Single run on unified legal path; hash intact; no tuning; 95/87/70/70/64 |
| 6 | Full verification sweep | **Done** | (prior) | Audit green, 186 tests pass, no secrets logged, tree clean + pushed |
| 7 | *(Stretch)* Ingestion harness Phase 1 → staged | **Done** | `<harness>` | Matthew Henry → 4210 sections STAGED; digest in §7; published nothing |
| — | Spot-audit v3 doctrinal labels | **Parked** | — | Authority unreachable (6 sources tried); NOT audited from memory (§6) |

Status = Done / Partial / Blocked / Not started. **Partial and Blocked need a "why" in §6.**
Wall 1 = `cbd09b1`; wall 2 = `e5677a0`; wall 3 = `e72ca08`; v3 = `2cb3429`/`5f23bfb`; skill rail = `149ad88`.

---

## 3. Verification evidence (seeded failures, not green checks)

- Prod build + `SITE_PASSWORD` unset → `/` and `/api/ask` returned: **HTTP 503** (body "This site is temporarily unavailable"; loud server log `[gate] SITE_PASSWORD is not set in production — failing CLOSED`).
- Dev + unset → still works? **Yes** (dev serves normally; `gateDecision` unit test covers the `isProd=false → allow` branch).
- limit+1 as one user → **11th call blocked (429, cap 10)**; 2nd user unaffected? **Yes** (independent window, real-DB run; app_runtime grant confirmed).
- Forced limiter DB error → request succeeded? **Yes** (fail-open); logged loudly? **Yes** (`rate_limit_fail_open` event) — unit-tested with a throwing `sql`.
- Error contract: each code returns correct status + `Retry-After` + no internals leaked? **Yes** — `apiError` unit test asserts statuses + that `GATE_LOCKED`/`INTERNAL` messages never match `password|config|gate|stack|db`.
- Prod retrieval now serves **only** the legal corpus? **YES (wall 2 merged + deployed).** Real
  `retrieveCommentary` returns only the 9 legal authors over 8 diverse queries; both-direction DB check =
  0 biblehub/studylight inside the filter, no clean author dropped. (Verified on the exact deployed code
  locally; not drivable live — see below.)
- **DEPLOY (committed ≠ live):** `./deploy.sh` → `web-6q6f9uwe6…` (READY), aliased `web-psi-eight-83.vercel.app`.
  **Live prod checks that need no session:** `GET /` → **307 → /gate** ✓ · unauth `POST /api/ask` → **401** ✓
  · `GET /gate` → 200 (so `SITE_PASSWORD` is set, gate not misconfigured) ✓. **The fail-open gate bug is
  closed in prod.** Rollback target: prev prod `web-lhl80yirz…`.
- **⚠️ Live gap (disclosed):** the rate-limit **429** and **legal-only retrieval** checks require an
  authenticated user session I cannot create (account/password prohibited). They are verified via the **real
  DB** (11th call blocked) and the **real `retrieveCommentary` code path** — but NOT prod-live. **Owner: run
  these two with your session** (ask 11×/min → 429+Retry-After; confirm an answer cites only legal authors).
- `npm run audit`: **GREEN**. `/security`: wall 1 reviewed (no HIGH/MED); wall 2 is a retrieval-filter change
  (no new attack surface; parameterized, integers inlined); wall 3 logging-only (secret-scan clean). Full
  test suite: **186 passed / 1 skipped**.

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
- Frozen v2 through the now-UNIFIED shipped path (post wall-2 merge) — regression vs 65/72? **NO — identical
  65/72** (verse-ref 100, pericope 73, proper-noun 80). v3 also identical (95/87/70/70/64, hash intact). Held
  by construction; no tuning. The eval↔prod divergence is eliminated (both call `legalBasePoolSql`).
- Production fallback rate observed (if any traffic): **not yet** — the `ask_outcome` event now emits `kind` per request, so it will be visible once the gated beta gets traffic (measured at ~14% in the faithfulness run).

---

## 5. Bugs found

| Bug | Where | Severity | Fixed? | Commit / why not |
|-----|-------|----------|--------|------------------|
| Gate failed OPEN on unset `SITE_PASSWORD` | `web/src/middleware.ts:16` | High | **Fixed** | `cbd09b1` — now 503 in prod |
| `/api/ask` + `/ask/stream` unthrottled (wallet-DoS) | both routes | High | **Fixed** | `cbd09b1` — per-user rate limit |
| Unauthored files in tree (`API_ERRORS.md`, `WORKORDER_PHASE_B.md`, now `WORKORDER_PHASE_A.md`) | tree | Info | **Incorporated/flagged** | Matched the plan; treated as owner artifacts. `PHASE_A.md` **conflicts** with beta framing — reconcile (§6/§10) |
| eval "shipped path" diverged from prod (pure-vector-legal vs hybrid-full) | retrieval | Medium | **FIXED** | `e5677a0` — single-sourced `legalBasePoolSql`; both call it |
| Legal set includes `historicalchristian.faith` provenance (Aug/Chrys, ~4174 rows) | corpus/licensing | Medium | **Reported** | Text PD-verified vs New Advent; provenance repair pending → **pre-beta debt** (§6) |
| 1 verse-ref `no-content` in v3 (legal-corpus coverage hole on one chapter) | corpus | Low | **Reported** | 1/40; identify + backfill at GA |
| v3 doctrinal labels authored unattended (not machine-fetched) | v3 eval | Low | **Flagged; audit PARKED** | 6 authority sources unreachable/unparseable; NOT audited from memory (new rail) |

---

## 6. Forks parked / blocked items

**WALL 2 — RESOLVED (Option 1, merged `e5677a0` + deployed).** Prod now serves only the legal corpus via the
single-sourced `LEGAL_CORPUS_FILTER` (both prod + eval call `legalBasePoolSql`). No longer a fork.

**NEW — `historicalchristian.faith` provenance (pre-beta debt, needs a call).** The legal allowlist includes
Augustine (Ps/John) + Chrysostom (Matt/John/Acts) rows whose **provenance record is `historicalchristian.faith`**
(a source ROADMAP flags), ~4,174 rows. The **text is PD-verified** vs New Advent NPNF/ANF (per ROADMAP), so
the *license* is valid; the provenance repair to New Advent ($0 text-match) is pending. The deploy still
*improves* prod (removes all biblehub/studylight the full table was serving). **Recommendation:** provenance-
repair these before OPENING beta (I'd elevate from GA to pre-beta). **Need:** owner ack to schedule the repair.

**Allowlist = beta debt (recorded).** The hard-coded `LEGAL_CORPUS_FILTER` is interim; the permanent fix is
the sources/sections `status='published'` column at GA (Matthew Henry + Barnes are already staged — §7).

**Authed live-checks (rate-limit 429, legal-only retrieval) — could not drive live.** They need a user
session I can't create; verified via real DB + real code path instead (§3). **Need:** owner runs them once.

**Observability external provider (PARKED).** Sentry/PostHog needs an owner account/DSN. Events already emit.

**v3 doctrinal-label spot-audit (PARKED, per the new authority rail).** 6 WSC/HC sources tried; none reachable
in a parseable form (HTML lacks proofs; PDF undecodable — no pdftotext/poppler). Did NOT audit from memory.
Recommendation: audit locally when the owner has a proof-text edition, before the 64/70 number is treated as
final. (Low urgency — v3 70/64 ≈ v2 authority-labeled 70/68, so this is confirmation.)

---

## 7. Staged awaiting owner approval

**Ingestion harness Phase 1 staged ONE work — DIGEST for your approval (nothing published):**

```
INGESTION DIGEST — Matthew Henry's Complete Commentary        [final state: staged]
  discovered → acquired (4210 embeddings) → matched (license+provenance clean) → staged
  work + source:  Matthew Henry — Matthew Henry's Complete Commentary
  license:        Public Domain (allowed)
  provenance:     https://bible.helloao.org/api/c/matthew-henry (clean, not a forbidden aggregator)
  match result:   prior verification vs helloao PD reference (recorded in provenance)
  accuracy delta: none — already inside the measured legal corpus (v2 65/72, v3 70/64)
  staged units:   4210 sections = section_embeddings (1:1, coverage 0)
  RECOMMENDED:    PUBLISH-ELIGIBLE — awaiting your digest approval (NOT auto-published)
```

`sources` now holds 2 staged works (Barnes 1300, Matthew Henry 4210); **prod retrieval is unaffected** (it
reads the legal allowlist on `embeddings`, never `sources`). To publish Matthew Henry, flip its `status` to
`'published'` — but that's meaningful only once GA cuts retrieval over to the sources/sections model.

---

## 8. Known limitations carried into beta

The owner-accepted ones (ROADMAP 2026-07-11), all confirmed this session:
- **Retrieval topical/epistle HIT@2 = ~64–70%** (v3, out-of-sample) — 85% is the **GA target**, not a beta blocker; per-passage-cap correction stashed (`git stash@{0}`) for GA.
- **~14% fallback rate** (≈1 in 7 queries shows sources, not a composed answer) — stochastic, fail-closed-safe; the `ask_outcome` event now makes it observable in prod.
- **n=35 bait** — a de-risk, not a statistical guarantee; grow the suite + add production faithfulness monitoring for GA.
- **V2 classifier deferred** to post-beta defense-in-depth, with a **hard re-gate trigger** the moment the app-voice surface expands (voice.summary / richer summaries / debate-topics/attributed-stance).
- **NEW this session:** the `historicalchristian.faith` patristic provenance (§6, pre-beta debt); the
  allowlist itself as beta debt (GA fix = sources/sections publish status); 1 verse-ref no-content hole in v3.

---

## 9. Exact next step

Phase B is complete and deployed; **opening beta is your call (I stopped at the door).** Before you open,
in priority order: **(1) reconcile `docs/WORKORDER_PHASE_A.md`** — it says "no beta, production-grade-only,
85% hard bar," which contradicts the beta plan; if it now governs, the per-passage-cap + reranker-drift
retrieval work becomes required (not GA-deferred). **(2) Run the two authed live-checks** with your session
(11×/min → 429; an answer cites only legal authors). **(3) Decide the `historicalchristian.faith` provenance
repair** (I recommend pre-beta). Then, when convenient: provision a Sentry DSN (wall-3 alerting), and audit
the v3 doctrinal labels against a proof-text edition.

---

## 10. Risks I'd flag

- **`docs/WORKORDER_PHASE_A.md` (unauthored) contradicts the beta plan.** It declares "There is no beta.
  Production grade only. The bar does not move — 85%." This turn's chat said the opposite (deploy for gated
  dogfood, stop at the beta door). I followed the **chat** (authoritative per the instruction boundary) and
  did **not** pivot strategy on a dropped file — but if Phase A now governs, the whole retrieval-perfection
  track (per-passage cap, reranker drift) moves from GA-deferred to **required**. **This is the biggest open
  question — reconcile it first.**
- **Two authed behaviours are DEPLOYED but not prod-live-verified** (rate-limit 429, legal-only retrieval) —
  no user session available to me. Verified via real DB + real code path. Please confirm live with your session.
- **`historicalchristian.faith` provenance in the legal set** (§6) — text PD-verified, provenance repair
  pending; I'd fix before opening beta.
- **v3 topical/epistle (64/70) rests on unattended-authored doctrinal labels** (spot-audit parked). Reproduces
  v2 closely; treat as provisional until audited. The passing gates are objective + safe.
- **Now DEPLOYED to prod** (`web-6q6f9uwe6…`, gated). Rollback target `web-lhl80yirz…`. Two staged works in
  `sources` (unpublished, prod ignores them).
