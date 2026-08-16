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
  markedly worse. `MAX_RETRIES = 2` (3 attempts total) is already the current code, not a gap.
  **CORRECTED 2026-08-15: the sentence here previously called streaming sources early "the unbuilt
  half". That was false when written — it is shipped, end to end, in production**: `teach.ts:78`
  types a `retrieved` event, `:181` emits it the moment retrieval finishes, and
  `ask-client.tsx:466-477` renders those sources mid-wait under "Reading these while I compose".
  **Rule 1's prescribed fix was therefore already fully shipped before this run measured it, so
  the rule firing prescribes nothing.** Compose is genuinely the whole story here (74% of wall
  time), but neither half of the prescription is the remedy. See
  [the verdict](../../pm/orders/2026-08-15-verdict-ask-compose-latency-design.md).
- **Rule 2** (retrieve p50 ≥15s → skip rerank for verse-ref): 2.7s. Does not fire.

**13/25 (52%) needed at least one retry.** That's the direct cause of the long tail — a single
compose call runs 4–11s, and over half of today's questions paid for more than one.

### Why the first attempt was rejected — counts, added 2026-08-15

Recomputed from the `firstCheck` field on the 13 retried rows of the JSON. **Read the denominator
carefully: this is one code per retried QUESTION, from its first rejected attempt only** —
`teach.ts:218` writes `if (!firstCheck)`, so later attempts' codes are never recorded. There were
**23 rejected attempts** in this run; 13 carry a code and 10 do not.

| first failing check | count | share of 13 | recovered | fell back |
|---|---|---|---|---|
| `quote_verbatim` | 5 | 38% | 3 | 2 |
| `passages_grounded` | 4 | 31% | 4 | 0 |
| `schema` | 3 | 23% | 2 | 1 |
| `diversity_voices` | 1 | 8% | 0 | 1 |

**Do not steer a fix by the ordering.** 5 against 4 on n=13 is inside noise, and the two leaders
behave differently: every `passages_grounded` rejection recovered, while `quote_verbatim` accounts
for half the fallbacks. Nothing here is a distribution; it is a reason to capture more.

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
