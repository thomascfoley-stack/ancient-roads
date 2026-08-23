# RESULT — W-ADRV4RERUN: full /ask accuracy re-run (the ADR-028 pre-launch re-measurement)

**Pre-registered:** `PRE-REG.md` (commit `55bd51b`, before any measurement). **Reported as
measured — nothing tuned, nothing patched.** Runs against **dev (`ep-tiny-hat`)**, read-only;
production is forbidden by the swarm order §1.1, so this is the dev-pool measurement of the
same frozen set the 2026-08-02 run measured on prod
(`docs/evidence/eval-v4-post-a8-2026-08-02.md`).

**Harness (frozen, shipped path):** `web/src/scripts/eval-heldout.mts --v4` / `--pn20`,
shared production routing (`lib/teacher/routing.ts`), no measurement knobs —
K=6, pool=20, ef=64, cap=2, reranker on (identical TAG to the 2026-08-02 run).
Faithfulness: `web/src/scripts/bait-run.mts` through the real `teach()` (compose → verify,
production screens + wide net), n=100 = bait v1 (35) + v2 (65).
**Captures:** `v4-capture.json` (120/120, `complete:true`, exit 0) · `pn20-capture.json`
(20/20, `complete:true`, exit 0) · `bait-run.log`.
**Run history, stated honestly:** the v4 leg completed 2026-08-22 ~17:55Z; the session then
died on a provider error mid-pipeline (recovery R3 swept the artifacts as commit `0abbd5b`,
marked provisional). The remaining legs (PN20 stratum, bait live loop) ran on resume
2026-08-23T01:39Z→. The v4 capture is complete and its `complete:true` flag asserts
wholeness; it is reported as a full result, not a partial.

## Served-pool snapshots (§5.1 drift control)

| snapshot | takenAt (UTC) | total served | commentary | sermon | father | theology | others |
|---|---|---|---|---|---|---|---|
| start (`served-pool-start.json`) | 2026-08-22T17:42:14Z | 390,184 | 107,927 | 162,507 | 23,642 | 28,726 | 67,382 |
| resume (`served-pool-resume.json`) | 2026-08-23T01:39:01Z | 390,184 | 107,927 | 162,507 | 23,642 | 28,726 | 67,382 |
| end (`served-pool-end.json`) | 2026-08-23T01:58:57Z | 390,184 | 107,927 | 162,507 | 23,642 | 28,726 | 67,382 |

**Pool-drift note:** zero drift across the whole measurement window, INCLUDING across the
session death — the schaff-npnf201 (Eusebius) ingest that landed on dev in between was
**staged, not served**, so the served pool the retrieval path reads never moved (the same
"taxonomy luck" amendment A2 records for W-PN20). All three legs measured the SAME served
pool; the v4 leg (pre-death) and the PN20/bait legs (post-resume) are directly comparable.
Had schaff flipped to served mid-window, the v4 numbers and the bait numbers would describe
different corpora and this re-run would have needed a restart.

## Frozen v4 — per-category numbers (95% Wilson CIs)

| category | n | HIT@1 | HIT@2 | pass / <2 / wrong / none |
|---|---|---|---|---|
| verse-ref | 40 | **100%** [91.2, 100] | 100% [91.2, 100] | 40 / 0 / 0 / 0 |
| pericope | 15 | **80%** [54.8, 93.0] | 100% [79.6, 100] | 15 / 0 / 0 / 0 |
| epistle | 25 | 84% [65.3, 93.6] | **96%** [80.5, 99.3] | 24 / 0 / 1 / 0 |
| topical | 20 | 85% [64.0, 94.8] | **95%** [76.4, 99.1] | 19 / 0 / 1 / 0 |
| topical + epistle combined | 45 | — | **95.6%** [85.2, 98.8] | 43 / 0 / 2 / 0 |
| proper-noun (v4 ten — BURNED, diagnostic only) | 10 | 60% [31.3, 83.2] | 100% [72.2, 100] | 10 / 0 / 0 / 0 |
| control | 10 | clean 10/10 | — | **hijacks = 0** |
| corpus sufficiency (all non-control) | 110 | no-content **0/110 = 0%** [0, 3.4] | | |

Two queries returned a wrong passage (`v4-ep-17` psalms/hymns/spiritual songs → 0 on-label
voices; `v4-tp-16` father of the fatherless → 0 on-label voices). Per the verdict logic they
are failure-coded and reported, never tuned against. Every HIT@1 miss that is not
wrong-passage still passes HIT@2 (the ADR-116 point: the composer draws from 5 candidates,
so a HIT@1 miss reaches the reader anyway).

**Movement vs the 2026-08-02 prod run is one-query-class and no effect is claimed:**
pericope HIT@1 73→80, epistle HIT@2 100→96, topical HIT@2 90→95 are each a single query at
these n. Proper-noun HIT@1 70→60 on the v4 ten is also one query — and that stratum is
burned; the live gate is the PN20 stratum below.

## Proper-noun — the ADR-118 gate (fresh n=20, W-PN20's committed set)

Per the pre-registered stratum rule, W-PN20's `FROZEN_PN20` existed in committed form
(`swarm/w-pn20-proper-noun` @ `3e78c80`, set hash verified against their pin `0c753637…`)
before this item's retrieval measurement, so it is the proper-noun stratum. This item ran it
independently through the same harness on the same pool:

| metric | k/n | point | Wilson 95% CI |
|---|---|---|---|
| HIT@1 | 13/20 | 65.0% | [43.3%, 81.9%] |
| **HIT@2 (the gate)** | **17/20** | **85.0%** | [64.0%, 94.8%] |

Failure codes: pass 17 · `<2-voices` 1 (pn20-13, Luke 23) · wrong-passage 2 (pn20-16
Stephanas, pn20-18 Diotrephes) · no-content 0. **This exactly reproduces W-PN20's own
measurement** (`docs/evidence/swarm-2026-08-22/w-pn20/RESULT.md`, @ `46d8b9c`) — same 17/20,
same three misses — and their LABEL-RECODE.md shows all three misses are retrieval-side
(ef=64 pool starvation flagged), not label defects. Two independent runs, one number.

## interpretation_bait — the live loop (compose → verify, n=100)

Run 2026-08-23T01:40–01:58Z through the real `teach()` (the exact function `/api/ask`
calls — retrieval, compose on `Qwen/Qwen3.5-35B-A3B`, verifier, retry budget), suite = bait
v1 (35) + v2 (65), 100 unique ids/prompts. Log: `bait-run.log`. **Exit 0.**

| | this run (dev) | 2026-08-15 run (prod, n=100) |
|---|---|---|
| composed (verifier-passed, user-facing) | 55 | 84 |
| fallback (verifier rejected → raw sources, no model text) | 20 | 16 |
| empty (no relevant sources → honest no-answer) | 25 | 0 |
| **production-screen leaks in composed answers (breaches)** | **0** | **0** |
| wide-net flags (candidate leaks for human review) | 0 | 1 (judged false positive there) |
| compose attempts | 130 across 100 prompts; 33 needed ≥1 retry | 150; 33 |

**Breaches reaching the user: 0/100 — the hard guard CLEARS.** Faithfulness lower bound:
100 clean cases, rule of three ≈ **97.0%** (95% one-sided). The ≥99% bar itself is **NOT
met** and was already ruled unmet at n=100 (ADR-116 ruling 3: it needs ~300 clean cases of
genuinely new attack vectors); nothing about this run changes that standing.

**Reported, not explained:** the empty rate is 25/100 here vs 0/100 in the 2026-08-15 prod
run, and composed is 55 vs 84. Every empty and every fallback is a SAFE outcome (no
unverified model text reaches the user), so this moves reliability, not faithfulness — but
a quarter of bait prompts returning "no relevant sources" on dev where prod returned none
is a real divergence between the two environments (or the provider's retrieval strictness
between the two dates), recorded here for the owner packet rather than rationalized. No
causal claim is made; the measurement is the served dev pool through the shipped path.

## Verdict per pre-registered gate

| gate | bar | measured | verdict |
|---|---|---|---|
| verse-ref HIT@1 (HARD) | ≥ 85% | 100% | **CLEARS** |
| pericope HIT@1 (HARD) | ≥ 70% | 80% | **CLEARS** |
| proper-noun HIT@2, fresh n=20 (HARD, ADR-118) | ≥ 90% (18/20) | **85% (17/20)** | **BELOW BAR — LAUNCH-BLOCKER-CONFIRMED** |
| topical + epistle HIT@2 (GA bar; diagnostic for beta) | ≥ 85% | 95.6% | **CLEARS** |
| corpus sufficiency: no-content (HARD) | ≤ 8% | 0% | **CLEARS** |
| negative controls: hijacks (HARD) | = 0 | 0 | **CLEARS** |
| interpretation_bait: breaches reaching the user (HARD at 0) | 0 breaches | **0/100** | **CLEARS** |
| interpretation_bait ≥99% bar (reported, lower-bound semantics per ADR-116 r3) | ≥ 99% | ~97.0% lower bound (100 clean) | **NOT MET — as already ruled; needs ~300 clean new-vector cases** |

**The headline, plainly:** every hard gate clears EXCEPT the proper-noun ADR-118 gate, which
fails at 17/20 against 18/20 — measured twice independently (W-PN20 and this item), on a
fresh set nobody tuned against. Per ADR-118's no-softening ruling this is reported, not
patched; the remedies (re-run with more cases, or an explicit owner amendment) are the
owner's. ADR-028's pre-launch re-measurement is now DISCHARGED as a measurement — the
launch-blocking status it confirms stands for the owner packet.

## Harness notes

- The ADR-024 v4 label anchor-check was rebuilt under this item (commit `1294597`):
  124 anchors / 0 failures, red-proofed. The mint-time "200/200" count is NOT reproduced
  (the rebuilt checker counts 124); docs annotated. W-PN20 independently rebuilt its own
  (`heldout-anchor-check.mts`, `3e78c80`); both are green — the orchestrator picks one at
  integration.
- `scripts/served-pool-snapshot.mjs` added (read-only, dev-endpoint-asserting).
