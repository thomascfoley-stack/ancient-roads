# RESULT — W-SLICE4 pre-registered no-regression measurement

Measured 2026-08-23 against `docs/evidence/swarm-2026-08-22/w-slice4/PRE-REG.md` (committed
49dcbc6, before any measurement). Raw logs: `runs/` beside this file. Harness:
`web/src/scripts/bait-run.mts` (real `teach()`); baseline = detached worktree at
`9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main); AFTER = branch head 9f35cb6.
AFTER(b) ran `BAIT_USER_ID=slice4-eval-seed` (seeded dev user: document
`slice4-eval-doc` "Comfort in Affliction (eval seed)", 4 sections/embeddings/anchors on
Romans 8 — the lane returned 3 user sections on EVERY after(b) prompt, so the additive lane
was genuinely exercised on all 110 prompts).

## Served-pool drift (§5.1 / A2)

390,184 served rows at all six snapshots (start/end × 3 runs) — ZERO drift during the
measurement window despite the concurrent DB-lane ingest (it staged, did not serve).

## Numbers as measured

Teach-level control stratum (10 prompts, v4-ctl-01..10):

| run | composed | fallback | empty | compose attempts |
|---|---|---|---|---|
| BASELINE | 7 | 2 | 1 | 18 |
| AFTER (a) lane inert | 7 | 2 | 1 | 18 |
| AFTER (b) lane active | 7 | 1 | 2 | 14 |

interpretation_bait v1+v2 (n=100):

| run | composed | fallback | empty | prod-screen leaks | wide-net flags | compose attempts |
|---|---|---|---|---|---|---|
| BASELINE | 57 | 18 | 25 | **0** | 0 | 134 |
| AFTER (a) lane inert | 60 | 15 | 25 | **0** | 0 | 122 |
| AFTER (b) lane active | 53 | 22 | 25 | **0** | 0 | 143 |

Retrieval-level diagnostic (`eval-heldout.mts --v4 --cats control`, the frozen ADR-028
hijack definition — `resolveIntent().floor` firing): BASELINE clean 10/10 **hijacks=0**;
AFTER clean 10/10 **hijacks=0**. (Lane-independent by construction — the lane does not touch
intent/routing — measured anyway.)

Run-to-run churn of the pipeline itself (identical inputs, model nondeterminism):
BASELINE↔AFTER(a) = 9/100 bait prompts flipped outcome kind (symmetric: 3 composed→fallback,
6 fallback→composed) and 2/10 control flips (net-zero). BASELINE↔AFTER(b) = 6/100 bait flips
and 1/10 control flip (fallback→empty). The lane-active delta sits INSIDE the pipeline's own
measured churn.

## Verdict vs the pre-registered bars

1. **Control hijacks: 0 in every run (as pinned) — FAILED BY EVERY RUN, INCLUDING THE
   PRE-CHANGE BASELINE.** The pin defined a teach-level hijack as "a composed result for a
   control query". Measured: 7 composed of 10 at BASELINE, 7 at AFTER(a), 7 at AFTER(b) —
   per-query near-identical (flips within churn). Composed-for-control is SHIPPED, PRE-CHANGE
   behavior: the frozen v4/ADR-028 hijack definition is the intent floor firing
   (`eval-heldout.mts:407-411`), which is 0 everywhere. The pinned teach-level bar is
   DEFECTIVE — no state of the code can clear it, including the unmodified baseline. This is
   reported, not redefined post-hoc; disposition per §2.4 step 3 below.
2. **Bait faithfulness ≥ 99% — CLEARED in every run.** 0 production-screen leaks in composed
   answers: 57/57, 60/60, 53/53 = 100%.
3. **Distribution delta — diagnostic, no FAIL.** Composed share 57% BASELINE (95% CI
   [47.3, 66.7]); 60% AFTER(a) and 53% AFTER(b) both inside it; per-query flips within the
   measured 9% self-churn. No drop whose CI clears the baseline's.

## Disposition (§2.4 step 3, followed literally)

Bar 1 as pinned does not clear, so: the ADR proposal is written at
`docs/pm/orders/2026-08-22-w-slice4-adr-proposal.md`; the behavior change is REVERTED on
this branch (revert commit on top of 9f35cb6, evidence kept); the item is marked
**HELD-FOR-OWNER**. The measurements above are kept and are the packet's substance: on the
frozen hijack definition and the faithfulness bar the change is clean, and the lane-active
run is indistinguishable from the pipeline's own noise. The owner ruling sought is narrow:
whether the defective pin reads as the frozen definition (in which case all bars cleared and
the revert is one `git revert` away) or stands literally (change stays reverted).

## Note for the orchestrator

W-ADRV4RERUN's pre-reg also routes the control stratum through the live compose→verify loop
with "hijacks must be 0". If their hijack definition is also teach-level-composed, they will
hit the same wall (shipped behavior composes 7/10 controls); the floor-based definition is
the one the v4 record has always used.

## Spend (A1 units — measured from the run logs)

- Compose calls (Qwen3.5-35B-A3B): 449 total = 134+122+143 bait + 18+18+14 control.
- Query embeddings (bge-large-en-v1.5): 330 (110 prompts × 3 runs; the lane reuses the query
  vector — no extra embedding call). Seeder + smoke + RLS-test embeddings: ~40 more.
- Estimated cost: ≈ $0.20–0.40 total (≈1.5M compose input tokens, ≈0.5M output, ≈370 small
  embeddings). No console reading taken; units above are exact counts from the logs.
