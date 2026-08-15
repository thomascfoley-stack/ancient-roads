# 25-question production measurement, post-deploy (`e3b14cd`)

Owner go given 2026-08-15 for this specific production DB connection (bylaw 7). Real `teach()`
pipeline, prod database (`ep-odd-fog`), live DeepInfra, one warm local process — same caveat as
the dev-local run: this measures real prod data and real providers, but NOT true serverless
cold starts (25 separate Lambda invocations would each pay connection/init cost this run doesn't).

## Speed

| stage | p50 | p95 | share of total |
|---|---|---|---|
| embed | 183ms | — | 1.7% |
| retrieve | 2.7s | 3.7s | 23.8% |
| lanes (overlapped) | 0ms | — | 0.0% |
| compose | 7.5s | 16.8s | **74.4%** |
| verify | 1ms | — | 0.0% |
| **total** | **10.5s** | **20.6s** | max 25.9s |

**Retrieve got FASTER on prod than dev** (2.7s vs the dev-local run's 4.2s p50) — the larger
prod corpus is not the bottleneck; if anything prod's indexes look healthier.

## Pre-registered rules — Rule 1 now FIRES

- **Rule 1** (compose+verify ≥60% of total → stream sources + cap retries at 2): **74.5%
  measured. FIRES.** The dev-local run said 50.4%, untriggered — real prod compose latency is
  markedly worse. Half the fix is already shipped: `MAX_RETRIES = 2` (3 attempts total) is
  already the current code, not a gap. The unbuilt half is **streaming sources early** so the
  user sees the retrieved passages while compose runs — compose is genuinely the whole story
  here (74% of wall time), not something a retry cap alone fixes.
- **Rule 2** (retrieve p50 ≥15s → skip rerank for verse-ref): 2.7s. Does not fire.

**13/25 (52%) needed at least one retry.** That's the direct cause of the long tail — a single
compose call runs 4–11s, and over half of today's questions paid for more than one.

## Output correctness

**21/25 (84%) composed** — verifier passed, a synthesized attributed answer shipped.
**4/25 (16%) fell back** — the verifier rejected every attempt (up to 3), so the user would have
seen raw retrieved sources with no synthesized answer. This is the fail-closed guarantee working
exactly as designed (CLAUDE.md: "never emit unverified model text"), not a bug — but it is a real
UX cost worth naming:

| # | category | question | failed on |
|---|---|---|---|
| 7 | verse-ref | What is the meaning of Isaiah 53:5? | `diversity_voices` |
| 8 | topical | What is justification by faith? | `quote_verbatim` |
| 19 | proper-noun | Who was Josephus? | `quote_verbatim` |
| 22 | verse-ref-song | What does Song of Solomon 4:14 mean? | `schema` |

The proper-noun failure is consistent with the already-recorded accuracy gap (CLAUDE.md: frozen
v4 proper-noun HIT@1 60 < 70, open owner call) — not a new regression from tonight's deploy.

Every composed answer carried **≥2 distinct traditions** (min 2, most 4–5) against the DoD floor
of ≥2–3 grounded voices — that guarantee held on all 21 composed rows.

## What this does NOT establish

Still missing true serverless cold-start behavior (one warm process, not 25 Lambda cold starts).
No accuracy judgment is made here — this is a speed/output-correctness spot check, not the
held-out accuracy diagnostic, and should not be read as one.

## Raw

Per-question rows: [`prod-25-measurement-2026-08-15.json`](prod-25-measurement-2026-08-15.json).
