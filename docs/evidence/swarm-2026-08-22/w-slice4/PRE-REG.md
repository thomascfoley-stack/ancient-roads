# PRE-REGISTRATION — W-SLICE4 /ask user-corpus integration, no-regression run

Committed BEFORE any measurement (order §2.4). SKELETON — bars and dataset identity are
frozen here; numbers are filled in at measurement time, never edited after.

## Claim

Adding the user-voice lane to `teach()` (user voices additive-only, per
`docs/pm/swarm-2026-08-22/w-slice4/DESIGN.md`) causes NO regression on the /ask accuracy
surface.

## Method

- Harness: the committed live harness through the SHIPPED path —
  `web/src/scripts/bait-run.mts` (real `teach()`, no harness-owned pipeline decisions), with
  the design-declared harness-only change: optional `BAIT_USER_ID` env passes a userId into
  `teach()`; unset → `teach(prompt)` exactly as today. The frozen v4 query set lives at
  `web/src/scripts/heldout-v4-queries.mts`.
- Datasets (identity frozen at this commit):
  1. Control stratum: frozen v4 `v4-ctl-01..10` (`heldout-v4-queries.mts:150-159`), executed
     through the SAME teach-level harness (BAIT_JSON of the ten control prompts). A control
     query's expected result is `[]`; at teach level a **hijack = a `composed` result** for a
     control query (an `empty`/`fallback` outcome is honest). The retrieval-level
     `eval-heldout.mts --v4 --cats control` run is reported as a diagnostic alongside.
  2. `interpretation_bait` v1 + v2, n=100 (`evals/cases/interpretation_bait.yaml`,
     `interpretation_bait_v2.yaml`).
- Two runs on dev (`ep-tiny-hat` only; prod forbidden):
  - BASELINE: base sha `9dce273ef09dffb03bc547cead0431f48fb71ffe` (pre-change; confirmed =
    origin/main), lane absent.
  - AFTER: the W-SLICE4 branch head, run twice — (a) lane inert (no `BAIT_USER_ID`, the
    harness's existing shape, proving shared-path no-regression), (b) lane ACTIVE
    (`BAIT_USER_ID` = a seeded dev user with uploaded, indexed documents, proving the
    additive lane itself does not regress).
- Served-pool snapshot at start and end of each run (`scripts/served-pool-snapshot.mjs`,
  ported from `swarm/w-adrv4rerun` @ 0abbd5b and committed with this pre-reg amendment),
  recorded; drift reported, not hidden.

## Pass/fail bars (hard)

- Control hijacks: 0 in every run. Any hijack = FAIL.
- Bait faithfulness: ≥ 99% composed-answer faithfulness (standing ADR-116 bar) in every run.
  Below = FAIL.
- AFTER(b) vs BASELINE per-set composed/fallback/empty distribution: reported with 95% CIs
  where n allows; a drop whose CI clears the baseline's is a FAIL (diagnostic otherwise).

## Withdrawal bar

Any FAIL above → revert the behavior change, keep the measurements, write the ADR proposal
at `docs/pm/orders/2026-08-22-w-slice4-adr-proposal.md`, mark the item HELD-FOR-OWNER.

## Anti-tuning rule

Queries, floors, labels, and these bars are frozen at this commit. No swapping eval queries,
floors, or labels after this file lands (§2.4 rule 4).

## Results (filled at measurement time, 2026-08-23; bars above untouched)

Full detail: `RESULT.md` beside this file.

- BASELINE: control 7 composed / 2 fallback / 1 empty (18 attempts); bait 57/18/25, 0
  prod-screen leaks, 0 wide-net flags (134 attempts). Retrieval-level control: clean 10/10,
  hijacks=0.
- AFTER (a) lane inert: control 7/2/1 (18); bait 60/15/25, 0 leaks, 0 flags (122).
  Retrieval-level control: clean 10/10, hijacks=0.
- AFTER (b) lane active (`BAIT_USER_ID=slice4-eval-seed`): control 7/1/2 (14); bait 53/22/25,
  0 leaks, 0 flags (143).
- Served-pool drift: zero (390,184 at all six snapshots).
- Verdict vs bars: bar 2 (faithfulness ≥99%) CLEARED in all runs (100% each); bar 3
  (distribution) diagnostic, no FAIL (inside CI + inside the pipeline's own 9% churn); bar 1
  (teach-level hijacks = 0) FAILED BY EVERY RUN INCLUDING THE PRE-CHANGE BASELINE — the pin
  is defective (counts shipped behavior; the frozen ADR-028 floor-based hijack count is 0
  everywhere). Disposition per the withdrawal bar: ADR proposal written
  (`docs/pm/orders/2026-08-22-w-slice4-adr-proposal.md`), behavior change reverted on
  branch, item HELD-FOR-OWNER.
