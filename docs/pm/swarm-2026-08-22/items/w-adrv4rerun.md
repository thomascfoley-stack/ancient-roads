# W-ADRV4RERUN — Full /ask accuracy re-run (Wave 1a, background measurement)

Status: IN PROGRESS (measurement running)
Branch: `swarm/w-adrv4rerun` · Worktree: `/tmp/swarm-adrv4`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)

## Transitions

- **CLAIMED** 2026-08-22 — measurement item, launch-blocking per ADR-028 (ADR-115 was a
  scoped departure, not a discharge). Read-only against dev (`ep-tiny-hat`); prod forbidden
  (order §1.1).
- **PRE-REGISTERED** 2026-08-22 — `docs/evidence/swarm-2026-08-22/w-adrv4rerun/PRE-REG.md`
  committed (55bd51b) BEFORE any measurement: categories, hard gates vs diagnostics per
  ADR-028/ADR-116/ADR-118, dataset identity (FROZEN_V4 hash-pinned; bait v1+v2 n=100),
  the proper-noun fallback rule, served-pool snapshot rule, withdrawal conditions.
- Env files silently checked before copying (`grep -qE 'odd-fog|CUTOVER_'`): root
  `.env.local` clean, `web/.env.local` clean. No values printed anywhere.

## Harness gaps found / fixed

- Retrieval harness (`eval-heldout.mts --v4`), frozen v4 set, hash pin, bait runner
  (`bait-run.mts` through real `teach()`), both bait YAMLs: all present in the repo. No gap.
- **ADR-024 v4 label anchor-check: genuinely absent** (STATE_OF_TRUTH §1 caveat 4).
  W-PN20 coordination: at rebuild time `swarm/w-pn20-proper-noun` had NO commits beyond
  base and no evidence dir, so nothing to prefer; rebuilt as
  `web/src/scripts/check-heldout-v4-anchors.mts` + red-proof
  `test/heldout-v4-anchor-check.test.ts` (commit 1294597). 124 anchors / 0 failures;
  watched-RED witness (phrase check disabled → green leg red → revert green).
  **Note for the orchestrator:** W-PN20 subsequently committed its OWN anchor-check
  (`web/src/scripts/heldout-anchor-check.mts`, commit 3e78c80). Both are green; both are
  measurement infrastructure; pick one at integration (mine carries a vitest red-proof
  and verifies quoted-phrase anchors verbatim).
- Added `scripts/served-pool-snapshot.mjs` (read-only, dev-endpoint-asserting) for the
  start/end served-pool counts.

## Measurement (running)

- Proper-noun stratum: W-PN20's FROZEN_PN20 exists in committed form (commit 3e78c80,
  hash-verified against their pin 0c753637…) BEFORE my retrieval run completed, so per the
  pre-registered rule it is the supplementary proper-noun stratum (files extracted
  uncommitted; NOT merged). v4's ten proper-noun cases also reported as the burned
  diagnostic.
- Served-pool snapshot START: `served-pool-start.json` (total 390,184; commentary 107,927).
- Runs: frozen v4 (120q) → FROZEN_PN20 (20q) → interpretation_bait n=100 live teach() loop.
