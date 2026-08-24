# W-ANN RESULT — measured against the pre-registered bars

Measured 2026-08-23T18:17–18:22Z on live dev (ep-tiny-hat) by the resumed swarm run,
against PRE-REG.md (committed bfd3c0e, before any fix measurement). The pre-reg,
probe set, ef_search value, bars, and floors were never touched after commitment.

**SCOPE version:** all numbers reflect the NARROW scope shipped at base `9dce273`
(`src.source_type = 'historian'`). The `genre = 'history'` widening on branch
`swarm/w-eusebius-npnf201` is NOT on this base. Live-dev preconditions at
measurement time (`info` mode): `history_embeddings` total=46,242, served=44,575;
in-scope (served AND published AND historian) rows=4,112, works=1; pgvector 0.8.1 —
unchanged from the RED preconditions because schaff-npnf201/202/203 landed STAGED,
not published, and staged rows are outside the served scope. Whether the defect
also reproduces under the WIDENED scope once Eusebius is published is NOT measured
here; the probe set is text-only church-history content that a published Schaff
corpus would likely improve, but that is an argument, not a measurement.

## Verdict per bar

| Bar | Result | Verdict |
|---|---|---|
| R1 recovery: every probe ≥1 KNN row; the 6 RED-zero probes ≥25 rows | All 12 probes → **50 rows**, all three fix-mode runs | **PASS** |
| R2 no probe regresses | Every probe's row count rose or held (27→50, 35→50, 44→50, 0→50 ×6, 2→50, 17→50, 50→50) | **PASS** |
| N1 frozen-v1 bars hold | control 4/4 zero-match, entity 8/8 (bar ≥6/8), period 4/4 exact, combined 4/4 (bar ≥3/4) — `docs/evidence/history-eval/w-ann-postfix-2026-08-23T18-21-15-173Z.log` | **PASS (BARS HOLD)** |
| N2 floor honesty | controls 4/4 zero-match (in N1 run); end-to-end `searchHistory` on the 12 probes: all recover, every text-matched section recomputes to cosine ≥ 0.601 (floor 0.6) — `e2e-floor-check-2026-08-23T18-22.log` | **PASS** |
| N3 audit | see item file (run on the final, reverted branch state) | recorded there |
| N4 latency: fix p50 ≤ 2× shipped p50 AND fix max ≤ 5 s | p50 clause: shipped p50 1,035 ms; fix p50 1,024.5 / 206.5 / 167.5 ms (runs 1/2/3) — all ≤ 2× | p50 clause **PASS** |
| | max clause: fix run 1 (cold) max **11,590 ms** ("martyrdom … under Nero") > 5 s; runs 2–3 (warm) max 527 / 412 ms | max clause **FAIL** |

## Decision: bar NOT cleared → HELD-FOR-OWNER

N4's max clause failed on a legitimate measurement (the first, cold-cache fix-mode
run). The pre-registered withdrawal bar fires: the behavior change is REVERTED
(commit reverting `5a7f4c1`), all measurements stay merged, and the ADR proposal is
at `docs/pm/orders/2026-08-22-w-ann-adr-proposal.md`.

The owner-facing picture, stated plainly:

- The recall fix is real and total: 12/12 probes recover to the full LIMIT of 50
  in-scope rows, on three consecutive runs, with zero regression on the frozen
  eval and full floor honesty. The shipped lane starves 6/12 text-only probes to
  zero rows (RED re-measured on live dev, same 6 as the 2026-08-21 filing).
- The cost is a cold-start latency tail: one observed 11.59 s KNN (warm: p50
  ~170–210 ms, max ≤ 527 ms). The history route's ceiling is 30 s, so even the
  observed cold worst case fits — but the pre-reg set the max bar at 5 s precisely
  because ADR-018's iterative_scan latency lesson (12–14 s on the 13 GB shared
  index) made this class of cost a bar and not an assumption. The bar failed;
  the trade is the owner's to make, not the swarm's to rationalize.

## Logs

- `red-shipped-2026-08-23T03-14-40.log` — first-run RED (base 9dce273, same defect)
- `red-shipped-rerun-2026-08-23T18-17-25.log` — resume-run RED re-measurement on live dev
- `fix-probes-run1-2026-08-23T18-19.log` — fix mode, cold (N4 breach: 11,590 ms max)
- `fix-probes-run2-2026-08-23T18-20.log` — fix mode, warm (max 527 ms)
- `fix-probes-run3-2026-08-23T18-21.log` — fix mode, warm (max 412 ms)
- `e2e-floor-check-2026-08-23T18-22.log` — N2 end-to-end floor honesty
- `docs/evidence/history-eval/w-ann-postfix-2026-08-23T18-21-15-173Z.log` — N1 frozen-v1, BARS HOLD

## Provider spend (amendment A1)

bge-large query embeddings via the existing DeepInfra key: shipped run 12, fix
runs 36, frozen-v1 eval 20, e2e check 24 (12 searchHistory + 12 recompute) ≈ **92
embeddings** of ≤15 tokens each. At the repo's measured rate (21,930 sections ≈
$0.19, WORKLOG:5459; ~1,948 embeddings ≈ 1.7¢) this is **< $0.01**. No other
provider calls.
