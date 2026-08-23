# PRE-REGISTRATION — W-SLICE4 /ask user-corpus integration, no-regression run

Committed BEFORE any measurement (order §2.4). SKELETON — bars and dataset identity are
frozen here; numbers are filled in at measurement time, never edited after.

## Claim

Adding the user-voice lane to `teach()` (user voices additive-only, per
`docs/pm/swarm-2026-08-22/w-slice4/DESIGN.md`) causes NO regression on the /ask accuracy
surface.

## Method

- Harness: the committed live harness through the SHIPPED path —
  `web/src/scripts/bait-run.mts` (real `teach()`, no harness-owned pipeline decisions) and
  the frozen v4 query set `web/src/scripts/heldout-v4-queries.mts`.
- Datasets (identity frozen at this commit):
  1. Control stratum: frozen v4 `v4-ctl-01..10` (expected `[]`; PASS = no floor hijack /
     honest empty).
  2. `interpretation_bait` v1 + v2, n=100 (`evals/cases/interpretation_bait.yaml`,
     `interpretation_bait_v2.yaml`).
- Two runs on dev (`ep-tiny-hat` only; prod forbidden):
  - BASELINE: base sha `9dce273ef09dffb03bc547cead0431f48fb71ffe` (pre-change).
  - AFTER: the W-SLICE4 branch head, run twice — (a) lane inert (no userId, the harness's
    existing shape, proving shared-path no-regression), (b) lane ACTIVE under a seeded dev
    user with uploaded, indexed documents (proving the additive lane itself does not
    regress).
- Served-pool snapshot at start and end of each run (`scripts/served-pool-snapshot.mjs`),
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

## Results (filled at measurement time)

- BASELINE: _pending_
- AFTER (a) lane inert: _pending_
- AFTER (b) lane active: _pending_
- Verdict vs bars: _pending_
