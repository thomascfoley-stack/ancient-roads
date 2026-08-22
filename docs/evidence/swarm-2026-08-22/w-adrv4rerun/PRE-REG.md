# PRE-REGISTRATION — W-ADRV4RERUN: full /ask accuracy re-run

Committed BEFORE any measurement runs, per order §2.4 (`docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md`).
This is a MEASUREMENT item. Results are reported as measured, never patched. No retrieval,
routing, gazetteer, floor, or verifier change is in scope; a below-bar number is a finding,
not a trigger to tune.

## 1. The claim under test

ADR-028 ruling 1 (as amended by ADR-116/ADR-118) and ADR-115 term 2: the full `/ask`
accuracy re-run attaches to ADR-028's pre-launch re-measurement and remains BLOCKING for
public launch. The last full measurement is the frozen-v4 post-A8 run of 2026-08-02
(`docs/evidence/eval-v4-post-a8-2026-08-02.md`), taken against **production**. This item
re-executes the same frozen measurement against **dev** (`ep-tiny-hat`) — the only target
this order permits (§1.1 forbids any prod connection) — through the shipped path, and
reports the numbers against the pre-registered bars.

## 2. Dataset identity (frozen, hash-pinned)

- Retrieval accuracy set: `FROZEN_V4` in `web/src/scripts/heldout-v4-queries.mts`
  (120 queries: verse-ref 40 · pericope 15 · epistle 25 · topical 20 · proper-noun 10 ·
  control 10). Content hash pinned by `test/heldout-frozen-hash.test.ts`
  (`PINNED_SHA256_V4 = 90de5dc3…`). The pin test is re-run before the measurement; a hash
  mismatch aborts the run (the set would not be the frozen set).
- Faithfulness set: `evals/cases/interpretation_bait.yaml` (35 cases) +
  `evals/cases/interpretation_bait_v2.yaml` (65 cases) = n=100, the same union the
  2026-08-15 n=100 run measured (`docs/evidence/ask-latency/bait-100-run-2026-08-15.md`).
- Proper-noun stratum rule (coordination with W-PN20): W-PN20 is minting the ADR-118 fresh
  20-case proper-noun set in parallel. **If that set exists in committed form (file under
  `evals/cases/` plus its committed PRE-REG, on branch `swarm/w-pn20-proper-noun`) at the
  time my retrieval run starts, I run it as a supplementary proper-noun stratum and cite
  W-PN20's commit.** Otherwise the fallback — declared here, before measuring — is v4's
  ten proper-noun cases. Those ten are BURNED for bar-setting (ADR-118 §3: measured
  repeatedly, they can report a number but cannot set one), so the fallback stratum is a
  DIAGNOSTIC and the gated ADR-118 number is W-PN20's to report, not this item's.

## 3. Harness (frozen; gaps rebuilt and committed before measuring)

- Retrieval: `web/src/scripts/eval-heldout.mts --v4`, run with NO measurement-knob
  overrides, so the config is the shipped one imported from `web/src/lib/teacher/routing.ts`
  (K=6, pool=CANDIDATE_POOL=20, ef=HNSW_EF_SEARCH=64, cap=PASSAGE_CAP=2, reranker on —
  identical to the 2026-08-02 run's TAG `pool=20 ef=64 cap=2`). Read-only SQL only.
  Invocation: `cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts --v4
  --out <evidence.json>`.
- Live loop (compose → verify, interpretation_bait guard): `web/src/scripts/bait-run.mts`,
  which drives the real `teach()` — the same function `/api/ask` calls — including the
  verifier, and scans composed assistant-voice text with the production screens
  (`runScreens`; a hit = a breach that reached the user) plus a wider review net.
  Invocation: `NODE_OPTIONS=--conditions=react-server BAIT_JSON=<merged-100.json> npx tsx
  --env-file=.env.local src/scripts/bait-run.mts`. The merged JSON is the YAML of both
  bait files parsed verbatim; no case edited, dropped, or relabeled.
- Known gap, rebuilt under this item (W-PN20 coordination per order §6): the ADR-024
  label anchor-check script was never committed (STATE_OF_TRUTH §1 caveat 4). At
  pre-registration time `docs/evidence/swarm-2026-08-22/w-pn20/` does not exist and branch
  `swarm/w-pn20-proper-noun` carries no commits beyond the base, so no W-PN20 anchor-check
  exists to prefer; this item rebuilds it as
  `web/src/scripts/check-heldout-v4-anchors.mts` + a vitest red-proof. If W-PN20 later
  commits its own version, the orchestrator picks one at integration; both are measurement
  infrastructure and merge regardless of outcome.
- Served-pool snapshots: `SELECT source_type, COUNT(*) FROM embeddings
  WHERE user_id IS NULL AND served GROUP BY 1` plus the total, taken at measurement start
  and end (the DB-writer lane mutates dev concurrently, §5.1). Endpoint asserted to be
  `ep-tiny-hat` before every DB touch; any `odd-fog` match aborts.

## 4. Bars (hard gates vs diagnostics, per ADR-028 / ADR-116 / ADR-118 and HELDOUT_EVAL_DESIGN §v4)

| stratum | metric | bar | status |
|---|---|---|---|
| verse-ref (n=40) | HIT@1 | ≥ 85% | HARD (beta core gate) |
| pericope (n=15) | HIT@1 | ≥ 70% | HARD (beta core gate) |
| proper-noun | HIT@2 | ≥ 90% on n=20 FRESH (ADR-118) | HARD — but gated on W-PN20's set; this item's v4-10 fallback is DIAGNOSTIC (burned) |
| topical + epistle (n=45) | HIT@2 (≥2 distinct-author voices) | ≥ 85% | GA bar; DIAGNOSTIC for beta (documented beta limitation if missed, not auto-no-ship) |
| corpus sufficiency (all non-control) | no-content where content should exist | ≤ 8% | HARD (beta core gate) |
| negative controls (n=10) | hijacks (false floor) | = 0 | HARD — any hijack is a bug |
| interpretation_bait (n=100) | production-screen leaks in composed answers | = 0 breaches; ≥99% certifiable only at ~300 clean | HARD at 0 breaches; the ≥99% bar itself reported as measured (n=100 supports a ~97% lower bound, per ADR-116 ruling 3 lower-bound semantics) |

HIT@1 = top result on-target. HIT@2 = ≥2 on-target voices from ≥2 distinct authors.
Failure codes: pass / <2-voices / wrong-passage / no-content (harness-native).

## 5. Reporting rules

- Per-category numbers with 95% Wilson confidence intervals where n allows; point estimate
  vs bar per the table; CIs reported but, per ADR-118, the proper-noun gate compares the
  point estimate only (and only on the fresh n=20, per §2).
- Served-pool snapshots at start AND end, both recorded in RESULT.md.
- An incomplete capture (the harness's own `complete:false`) is NOT a result — the run is
  repeated or reported NOT RUN; partial numbers are never reported as the measurement.
- No tuning to the demo: queries, labels, floors, and bars in this file are final once
  committed. A below-bar result goes to RESULT.md, the status file, and the owner packet —
  never to a patch under this item.
- Withdrawal conditions: missing credentials/provider key → NOT RUN; frozen-hash mismatch →
  abort; harness defect found mid-run → fix is committed as harness infrastructure with its
  red-proof and the run restarts from zero (only complete runs reported).
