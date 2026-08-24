# ADR PROPOSAL — history vector lane: accept `hnsw.iterative_scan = relaxed_order` despite a cold-start latency tail

**Status:** PROPOSED — owner decision required. The swarm measured, reverted, and held per
order `2026-08-22-autonomous-swarm-closeout.md` §2.4 step 3 (pre-registered bar not cleared).
**Item:** W-ANN. **Branch:** `swarm/w-ann-history-recall` (fix commit `5a7f4c1`, reverted in
`121a13e`; re-apply = revert of the revert, one line + comment).
**Evidence:** `docs/evidence/swarm-2026-08-22/w-ann/` (PRE-REG, RED ×2, RESULT, fix logs ×3,
e2e log); frozen-v1 log `docs/evidence/history-eval/w-ann-postfix-2026-08-23T18-21-15-173Z.log`.

## Context

`idx_history_embeddings_served` is a partial HNSW over the 44,575 served
`history_embeddings` rows. Only 4,112 (9.2%) survive the query-time scope filter
(`he.served AND src.status='published' AND src.source_type='historian'`) — the
published/historian conjuncts are JOIN filters and cannot live in the index
predicate. A strict HNSW scan stops after ~`ef_search` (120) graph candidates and
the post-filter keeps ~9% of them: **0 rows for 6 of 12 pre-registered text-only
probes**, with the exact in-scope top-50 existing for all 12 (max cosine
0.645–0.795, all above the 0.6 text floor). Reproduced on dev 2026-08-21 (filed),
re-reproduced on live dev 2026-08-23T18:17Z with identical preconditions. The user
symptom: history-mode text-only queries fall to the honest empty state ("no
results") while above-floor matches exist; which queries starve is plan luck.

## Proposed decision

Ship `set_config('hnsw.iterative_scan', 'relaxed_order', true)` in the transaction
that already sets `hnsw.ef_search=120` in `searchHistory`
(`web/src/lib/history-search-db.ts`). One line. The scan then continues past the
first 120 candidates until the LIMIT of 50 in-scope rows is found.

## Measured consequences (pre-registered bars, full record in RESULT.md)

- Recall: 12/12 probes → 50 rows, three consecutive runs. No probe regresses.
- Frozen-v1 eval: BARS HOLD (control 4/4 zero-match, entity 8/8, period 4/4,
  combined 4/4). Nonsense still returns nothing; the floor still judges every
  text candidate (min text-matched cosine 0.601 ≥ 0.6).
- Latency: warm p50 168–207 ms vs shipped p50 1,035 ms; warm max ≤ 527 ms.
  **Cold first run: one probe at 11,590 ms** — this breached the pre-registered
  N4 max bar (≤ 5 s), which is why this is a proposal and not a merge. The
  history route's overall ceiling is 30 s, so the observed cold worst case fits
  it, but the bar was set at 5 s deliberately (ADR-018's iterative_scan lesson:
  12–14 s on the 13 GB shared index at ef=200).

## The decision the owner is actually making

Accept a cold-cache worst case in the 5–12 s band on the history vector lane
(observed once, first touch after cache cold; warm behavior is strictly faster
than today's shipped lane even on non-starved probes) in exchange for eliminating
a 50% starve-to-zero rate on text-only history queries.

## Alternatives considered (from the pre-reg, still valid)

- `ef_search=1000` alone: filed evidence says → 5 rows. Insufficient, and pays
  full candidate cost on every query.
- Rescope the index predicate: impossible — the scope involves a join.
- Flip `served=false` on the 40,463 staged-work rows: a data/sync-semantics
  change to the serve pipeline, outside this item's envelope; touches
  publish-flip machinery owned elsewhere.
- Do nothing: the defect stays; 6/12 text-only probes return zero rows.

## Scope note for the owner

All measurements reflect the NARROW scope at base `9dce273`. The
`genre='history'` widening (`swarm/w-eusebius-npnf201`) plus publishing the staged
Schaff volumes will raise the in-scope share above 9.2%, which reduces BOTH the
starvation rate (shipped) and the relaxed-scan cost (fix). The fix remains
correct under the widened scope; its latency profile should improve. If the owner
sequences Eusebius first, re-running `history-ann-probe.mts` (info/shipped/fix)
costs < $0.01 and re-measures both legs in minutes.
