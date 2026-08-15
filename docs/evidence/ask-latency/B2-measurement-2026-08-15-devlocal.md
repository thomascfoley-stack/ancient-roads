# B2 — where the seconds go in `/ask` (n=10) — DEV-LOCAL, **not** production

Plan: [`docs/pm/orders/2026-08-13-cdn-and-ask-latency-plan.md`](../../pm/orders/2026-08-13-cdn-and-ask-latency-plan.md) §B2.
Run 2026-08-15 ~01:20 PT, on branch `feat/corpus-cdn` @ `f65d205`.

## What this is, and what it is NOT

**IS:** the real `teach()` pipeline — `embedQuery` → `retrieveCommentary` → register lanes →
`compose` → `verifyV1` → retry — driven ten times in one Node process against the **dev**
database (`ep-tiny-hat`) and the **live** DeepInfra providers, reading the B1 stage timers.

**IS NOT:** a production measurement. This ran on a laptop, in one long-lived process, against a
smaller database. Production is serverless (fresh instances, cold connections) over a corpus of
448,926 served rows. **The one production datapoint this repo carries — the C2 instrumentation of
2026-08-07 — measured ~104s and ~58s**, an order of magnitude above the 9.1s p50 below. Nothing
here explains that gap; it only bounds where the time is *not* going in a warm local process.

The production run needs the B1 timers deployed, which is blocked (see the WORKLOG entry for
2026-08-15). **No fix is applied off this run.**

## Result

| stage | p50 | share of total |
|---|---|---|
| embed | 176 ms | 1.8% |
| retrieve | 4,247 ms | 47.8% |
| lanes (extra wait after retrieve) | 0 ms | 0.0% |
| compose | 5,095 ms | 50.3% |
| verify | 1 ms | 0.0% |
| **total** | **9.1 s** (max 23.7 s) | |

10/10 `composed` — every answer passed the verifier; the faithfulness loop is intact.

## Pre-registered decision rules — BOTH UNTRIGGERED

Bars were registered in the plan **before** this run, and neither fires:

- **Rule 1** — compose+verify ≥ 60% of total → stream sources early + cap retries at 2.
  **Measured 50.4%. Does not fire.**
- **Rule 2** — retrieve (incl. rerank) p50 ≥ 15s → skip rerank for verse-ref intents.
  **Measured 4.2s. Does not fire.** (This one would have been a RETRIEVAL change, so it would
  have required the held-out accuracy diagnostic re-run before shipping regardless.)

Per the plan's closed menu, **nothing is built from this run.**

## The two things worth carrying forward

1. **Cold start is the tail, and it is inside `retrieve`.** Ask 1 spent **18.2s** in retrieve
   against a 4.2s p50 for the other nine — ~14s of first-touch cost (connection setup, HNSW
   first read). Every cold serverless instance in production pays some version of this. That is
   the leading *hypothesis* for the ~104s production observation; it is not a finding, and the
   production run is what tests it.
2. **Retries cost ~4.5s each and are invisible in an average.** Ask 2 (Romans 8:28) took three
   compose attempts — `compose=[4425,4311,4963]`, total 18.6s. This is exactly why B1 logs
   compose/verify as per-attempt ARRAYS rather than a mean.

`verify` is free (≤5ms). `lanes` measured 0ms on every ask: the register lanes are fired before
commentary retrieval and awaited after, so they are fully overlapped — they cost nothing on the
critical path.

## Raw

Per-ask rows (JSON) in [`B2-measurement-2026-08-15-devlocal.json`](B2-measurement-2026-08-15-devlocal.json).
