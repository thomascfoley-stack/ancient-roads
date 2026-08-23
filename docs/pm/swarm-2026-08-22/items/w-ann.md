# W-ANN — ANN post-filter recall collapse in history search

**Branch:** `swarm/w-ann-history-recall` · **Base:** `origin/main` = `9dce273` ·
**Worktree:** `/tmp/swarm-ann` · **Resume run** (first-run branch `swarm/W-ANN-history-ann-recall`
left a RED + PRE-REG at the same base; both cherry-picked, authorship preserved).

## Status: HELD-FOR-OWNER (ADR proposal written; fix reverted; all measurements merged)

Transitions: CLAIMED → RED-PROVEN → FIXED → (bar not cleared) → REVERTED → HELD-FOR-OWNER.

## What happened, in order

1. **Evidence found.** WORKLOG 2026-08-21 (line ~1370): `idx_history_embeddings_served`
   partial HNSW, 44,575 served rows, 4,112 (9.2%) survive the published+historian join;
   semantic leg returns 0 rows for most queries; knobs measured: `ef_search=1000 → 5`,
   `iterative_scan=relaxed_order → 50`. Proven dev, inferred prod.
2. **RED (re-measured on live dev, per the resume instruction).** 2026-08-23T18:17Z,
   ep-tiny-hat: served=44,575, in-scope=4,112 rows / 1 work — preconditions unchanged
   (Eusebius npnf201/202/203 are STAGED, not published). The SAME 6/12 text-only probes
   return 0 KNN rows; the exact in-scope top-50 exists for all 12 (max cosine 0.645–0.795,
   all above the 0.6 floor). Transcript:
   `docs/evidence/swarm-2026-08-22/w-ann/red-shipped-rerun-2026-08-23T18-17-25.log`.
   **SCOPE version: NARROW (base `9dce273`, `source_type='historian'`). The
   `genre='history'` widening on `swarm/w-eusebius-npnf201` is NOT on this base and NOT
   measured. The defect reproduces under the narrow scope; whether it also reproduces
   under the widened scope is unmeasured — the orchestrator sequences that.**
3. **PRE-REG.** `docs/evidence/swarm-2026-08-22/w-ann/PRE-REG.md` (commit `bfd3c0e`),
   committed before any fix measurement; never amended afterward.
4. **Fix (minimal, at the filter site the evidence names).** One line in the KNN
   transaction in `web/src/lib/history-search-db.ts`:
   `set_config('hnsw.iterative_scan', 'relaxed_order', true)` beside the existing
   `ef_search=120`. Commit `5a7f4c1`.
5. **Measured vs the pre-reg** (full record: `docs/evidence/swarm-2026-08-22/w-ann/RESULT.md`):
   - R1 recovery: **PASS** — 12/12 probes → 50 rows, three runs.
   - R2 no regression on probes: **PASS**.
   - N1 frozen-v1: **PASS** — BARS HOLD (control 4/4 zero-match, entity 8/8, period 4/4,
     combined 4/4). Log: `docs/evidence/history-eval/w-ann-postfix-2026-08-23T18-21-15-173Z.log`.
   - N2 floor honesty: **PASS** — controls stay empty; every text-matched section
     recomputes to cosine ≥ 0.601. Log: `e2e-floor-check-2026-08-23T18-22.log`.
   - N4 latency: **FAIL** — p50 clause passes (fix p50 168–1,025 ms ≤ 2× shipped p50
     1,035 ms) but the max clause breaches: cold fix-mode run 1 measured **11,590 ms**
     on one probe (bar ≤ 5 s); warm runs 2–3 max ≤ 527 ms.
6. **Withdrawal bar fired.** Fix REVERTED (`121a13e`), measurements kept, ADR proposal at
   `docs/pm/orders/2026-08-22-w-ann-adr-proposal.md`. The owner decision: accept a
   cold-cache worst case in the 5–12 s band (observed once; route ceiling is 30 s) in
   exchange for eliminating a 6/12 starve-to-zero rate on text-only history queries.

## Audit

`npm run audit` in the worktree on the final (reverted) state: vitest leg red on the
KNOWN baseline red — `test/publish-flip-toolchain.test.ts` (thayers gate, owned by
`swarm/w-basefix-thayers-guard`); noted, not fixed, per the resume instruction and the
PRE-REG's N3 carve-out. All other legs green. (Detail: this file's audit line was
written from the full vitest re-run output; see RESULT.md N3 row.)

## Provider spend (amendment A1)

~92 bge-large query embeddings (12 shipped + 36 fix probes + 20 frozen-v1 + 24 e2e)
via the existing DeepInfra key ≈ **< $0.01** (repo-measured rate: 1,948 embeddings ≈ 1.7¢).
No other provider calls. Well under the $25 ceiling.

## Commits (all explicit-pathspec, `Model: kimi-code/k3` trailer)

- `ce93714` — cherry-pick: first-run RED + probe harness (`089dfab`)
- `bfd3c0e` — cherry-pick: first-run PRE-REG (`c15c52a`)
- `d9d64aa` — RED re-measured on live dev (same 6/12 starved; SCOPE version recorded)
- `5a7f4c1` — fix: `iterative_scan=relaxed_order` in the history KNN transaction
- `121a13e` — revert (N4 max-latency bar not cleared)
- `fb146f9` — RESULT + measurement logs + ADR proposal + e2e instrument

## Note for the verifier (Wave 7)

Re-execution is cheap and read-only: `history-ann-probe.mts <info|shipped|fix>` and
`history-ann-e2e-check.mts` (run commands in the file headers). Reverting the revert
(`121a13e`) restores the fix for re-measurement; do NOT merge it without the owner's
ruling on the ADR proposal.
