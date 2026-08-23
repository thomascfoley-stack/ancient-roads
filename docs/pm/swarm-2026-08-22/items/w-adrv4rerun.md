# W-ADRV4RERUN — Full /ask accuracy re-run (Wave 1a, background measurement)

Status: MEASURED (pending Wave-7 verification + Wave-8 merge)
Branch: `swarm/w-adrv4rerun` · Worktree: `/tmp/swarm-adrv4`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)

## Transitions

- **CLAIMED** 2026-08-22 — measurement item, launch-blocking per ADR-028 (ADR-115 was a
  scoped departure, not a discharge). Read-only against dev (`ep-tiny-hat`); prod forbidden
  (order §1.1).
- **PRE-REGISTERED** 2026-08-22 — `docs/evidence/swarm-2026-08-22/w-adrv4rerun/PRE-REG.md`
  committed (`55bd51b`) BEFORE any measurement: categories, hard gates vs diagnostics per
  ADR-028/ADR-116/ADR-118, dataset identity, the proper-noun fallback rule, served-pool
  snapshot rule, withdrawal conditions.
- **HARNESS GAP CLOSED** 2026-08-22 — ADR-024 v4 label anchor-check rebuilt + red-proofed
  (`1294597`): 124 anchors / 0 failures. W-PN20 coordination: nothing committed on their
  branch at rebuild time; they later committed their own (`3e78c80`) — both green,
  orchestrator picks one at integration.
- **MEASURED** 2026-08-22/23 — frozen v4 leg complete 2026-08-22 ~17:55Z (120/120,
  `complete:true`, exit 0). Session died on a provider error before the remaining legs;
  recovery R3 swept artifacts as `0abbd5b` (provisional). Resumed 2026-08-23T01:39Z: PN20
  stratum (20/20, exit 0, exactly reproduces W-PN20's 17/20) + interpretation_bait n=100
  live teach() loop (exit 0: 55 composed / 20 fallback / 25 empty, **0 production-screen
  leaks, 0 wide-net flags**, 130 compose attempts). Served pool verified IDENTICAL across
  the death window and at measurement end (zero drift — schaff-npnf201 staged, not
  served), so all legs measured the same pool and the v4 capture stands as a full result.
  Full numbers: RESULT.md beside PRE-REG.md.

## Headline result

Every hard gate clears EXCEPT the ADR-118 proper-noun gate: **HIT@2 17/20 = 85% vs the
18/20 bar — LAUNCH-BLOCKER-CONFIRMED**, measured twice independently (W-PN20 + this item's
reproduction, same three misses, all retrieval-side per W-PN20's LABEL-RECODE). verse-ref
100 · pericope 80 · topical+epistle HIT@2 95.6 · no-content 0/110 · controls 10/10 clean,
hijacks 0 · bait live loop 0/100 breaches (~97% lower bound; the ≥99% bar stays unmet as
already ruled). One divergence reported unexplained: bait empty rate 25/100 on dev vs 0/100
in the 2026-08-15 prod run — safe outcomes (no model text), a reliability observation for
the owner packet, not a breach. Reported as measured; nothing tuned or patched. ADR-028's
owed re-measurement is discharged as a measurement; the below-bar finding goes to the owner
packet.

## Provider spend (A1)

**Estimated total: ≈ $0.30–0.60 — record it as "< $1".** Nowhere near the $25 ceiling.

Unit accounting (no console read; units × published DeepInfra rates):
- v4 leg: 110 query embeddings (bge-large-en-v1.5, ~25 tok each) + ~107 rerank calls
  (Qwen3-Reranker-0.6B, 20 docs × 1200 chars ≈ 6.6k tok each ≈ 0.7M tok total) → < $0.02.
- PN20 leg: 20 embeddings + ~20 rerank calls → < $0.01.
- Bait leg: 130 compose attempts on `Qwen/Qwen3.5-35B-A3B` (~8k input + ~1.5k output tokens
  each ≈ 1.0M in / 0.2M out) + ~230 retrieval embeddings → ≈ $0.25–0.55 depending on the
  account's per-token rate for that model.
This is the first recorded cost for a full compose→verify eval run in this repo (the blank
A1 exists to fill): a full bait n=100 live loop costs well under a dollar.

## Env/secrets

Env files silently checked before copying (`grep -qE 'odd-fog|CUTOVER_'`): root `.env.local`
clean, `web/.env.local` clean. No values printed anywhere; evidence files carry counts,
hashes, and booleans only. Every DB touch asserts the `ep-tiny-hat` endpoint first.

## Files on this branch

- `docs/evidence/swarm-2026-08-22/w-adrv4rerun/` — PRE-REG.md, RESULT.md, served-pool
  {start,resume,end}.json, v4-capture.json, v4-run.log, pn20-capture.json, pn20-run.log,
  bait-run.log
- `web/src/scripts/check-heldout-v4-anchors.mts` + `test/heldout-v4-anchor-check.test.ts`
  (anchor-check rebuild + red-proof)
- `scripts/served-pool-snapshot.mjs` (read-only dev snapshot tool)
- `web/src/scripts/heldout-pn20-queries.mts` + the `--pn20` flag in `eval-heldout.mts` —
  extracted from W-PN20's branch to run the stratum; SAME content as their commits (their
  merge brings the canonical copy; conflicts resolve to theirs)
- Doc corrections (discovered falsehoods, §2.9): STATE_OF_TRUTH §1 caveat 4,
  HELDOUT_EVAL_DESIGN.md anchor-reproducibility bullet + v4.1 checklist,
  `check-heldout-disjoint.mjs` scope note
