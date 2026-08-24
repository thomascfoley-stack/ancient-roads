# ADR PROPOSAL — W-SLICE4 /ask user-corpus integration: defective control bar, clean measurement

Status: PROPOSAL — owner ruling required. Written per order §2.4 step 3 after the
pre-registered bar failed. The behavior change is reverted on
`swarm/w-slice4-ask-integration`; this proposal argues the failure is definitional, not a
regression, and requests a narrow ruling.

## Context

W-SLICE4 adds the asker's own uploads to /ask as an ADDITIVE voice set (design:
`docs/pm/swarm-2026-08-22/w-slice4/DESIGN.md`, verdict APPROVE-WITH-CONDITIONS, all six
conditions folded in). Because the item touches the retrieval surface, §2.4 required a
pre-registered no-regression run (`docs/evidence/swarm-2026-08-22/w-slice4/PRE-REG.md`,
committed before measurement). Results: `docs/evidence/swarm-2026-08-22/w-slice4/RESULT.md`.

## What the measurement showed

- interpretation_bait n=100 through the real `teach()`: **0 production-screen leaks in every
  run** (baseline 57 composed, lane-inert 60, lane-active 53) — 100% faithfulness, the
  standing ADR-116 bar cleared three times.
- Frozen ADR-028 control definition (intent floor firing, `eval-heldout.mts --v4 --cats
  control`): **hijacks = 0 at baseline and at the branch**, 10/10 clean.
- Lane-active vs baseline distribution: inside the baseline's 95% CI and inside the
  pipeline's OWN measured run-to-run churn (9/100 prompts flip between two runs of the
  byte-identical lane-inert pipeline; lane-active flipped 6).
- Served-pool drift during the window: zero.

## The defective pin

My pre-reg defined a teach-level control hijack as "a composed result for a control query".
Measured: the PRE-CHANGE BASELINE composes 7 of 10 control queries — shipped, intended
behavior (the teacher answers idiomatic queries like "garden of eden landscaping supplies"
topically; the v4 control bar has only ever policed the intent floor firing, never
composition). The pinned bar therefore fails for EVERY state of the code, including no
change at all. It is defective, and §2.4 rule 4 correctly forbids me from quietly redefining
it after measurement. Hence this proposal instead of a silent pass.

## Decision sought (one ruling)

Read the control bar as the frozen ADR-028 definition (floor-based; the one the v4 record
has always used) — in which case **all pre-registered bars cleared** and the revert on the
branch can itself be reverted to restore the feature — or rule that the literal pin stands,
in which case the change stays reverted and the design survives for a future attempt with a
correctly-specified pre-reg.

## If approved: what lands

Exactly the amended design's file list (lane, teach wiring, lookup namespace, two routes,
client cards, harness hook, tests), with red-proofs and measurement already on the branch.
No new surface, no migrations, no config, no deps. Nothing about the accuracy gates changes;
H4's origin-blind-verifier fix is load-bearing and untouched.

## Cost of the ruling going the other way

B5's moat stays demoless: users can search their uploads but the teacher never cites them.
