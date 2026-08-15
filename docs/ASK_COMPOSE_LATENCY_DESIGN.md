# `/ask` compose latency — design doc

Status: **DESIGN ONLY — nothing built.** Per Engineering Value #2 ("design before code... get
approval before implementing"). Written 2026-08-15, from the 25-question production measurement
at `docs/evidence/ask-latency/prod-25-measurement-2026-08-15.md`.

## Correction, stated up front

The recommendation in the prior chat turn — "build the streaming fix" — was wrong, and this doc
does not propose it. **The plan's prescribed Rule-1 fix (`docs/pm/orders/2026-08-13-cdn-and-ask-latency-plan.md`
§B3: "stream sources + cap retries at 2") is already shipped:**

- Sources stream today. `web/src/app/api/ask/stream/route.ts` emits a `retrieved` NDJSON event
  carrying the retrieved passages the moment retrieval finishes (~2.7s in, per the measurement).
- The client already renders them mid-wait. `web/src/components/ask-client.tsx:466-477` — a
  "Reading these while I compose" section shows the first 3 sources, pulsing, while compose runs.
  A live stage indicator (`Progress`, lines 407-479) shows Searching → Found N voices across M
  traditions → Composing → Verifying, with a slow-answer notice past 90s.
- The retry cap is already 2. `web/src/lib/teacher/teach-budget.ts:7` — `MAX_RETRIES = 2` (3
  attempts total), not a gap to close.

That recommendation was made without reading the client code first — a mistake, corrected here
before anyone builds against it.

## The problem, as actually measured

25 real questions against production (`ep-odd-fog`), live DeepInfra, real verifier:

| | value |
|---|---|
| total, p50 / p95 | 10.5s / 20.6s |
| compose, p50 / p95 (share of total) | 7.5s / 16.8s (**74%**) |
| retrieve, p50 | 2.7s (23.8% — not the bottleneck) |
| **questions needing ≥1 retry** | **13/25 (52%)** |
| questions falling back (verifier rejected every attempt) | 4/25 (16%) |

The user already sees progress within ~3s (sources + stage indicator, both shipped). What they
are actually waiting on for the remaining 5-20+ seconds is **compose+verify round trips** — and
over half of all questions pay for more than one.

**Breaking down the 13 retried questions** (full detail in the evidence JSON) shows the retry
cost is not one-off provider slowness on a single call. It is mostly **structural**: 2-3
sequential compose calls of ordinary individual duration (4-6s each), because the first attempt's
JSON failed one of `verifyV1`'s checks —

| check that rejected an attempt | count across all 25 asks' rejected attempts |
|---|---|
| `quote_verbatim` (quote doesn't match the source word-for-word) | most common |
| `schema` (malformed JSON) | present |
| `passages_grounded` / `diversity_voices` | present |

— and **9 of those 13 retried questions eventually composed successfully**, meaning the
violation-feedback loop already in `teach.ts` (`\n\n--- PREVIOUS ATTEMPT REJECTED ---\nViolations
found:\n...`, fed into the next prompt) is doing real, measurable work: informed retries mostly
succeed. A design that discards that feedback would need to prove it doesn't make the success
rate worse before it could be trusted to make latency better.

## What this rules out

**A blind parallel race** (fire N independent compose calls at once, take whichever verifies
first, discard the rest) has no way to share the violation feedback between the parallel
attempts, since none of them has failed yet when they all start. Given informed retries already
succeed 9/13 of the time, an uninformed race could plausibly need MORE total attempts on average
to reach the same success rate — trading latency for either spend or correctness, in an unproven
direction. Not recommended without first measuring whether independent attempts succeed at a
comparable rate to informed ones.

**Hedging only the first attempt** (race a second compose call if attempt 0 runs unusually long)
targets a different failure mode than the one measured. It would help the few cases where one
call is abnormally slow (e.g. question 19's first attempt took 11s) but would do nothing for the
dominant pattern — 2-3 typically-timed calls needed in sequence because the draft was wrong, not
slow. Narrower and lower-risk than a full race, but addresses only part of the tail.

## The recommended fix: reduce why retries happen, not how fast they run

**The problem is a compose-quality problem wearing a latency costume.** The single highest-
leverage move against BOTH numbers this doc names — the 52% retry rate driving the p95 tail, and
the 16% fallback rate (questions that never got a synthesized answer at all) — is the same fix:
make the first compose attempt more likely to pass `verifyV1` the first time.

### How it works today

`teach()` (`web/src/lib/teacher/teach.ts:209-259`) composes once against `buildSystemPrompt()` +
`buildUserPrompt()`. If `verifyV1` rejects it, the SAME prompt is re-sent with the violations
appended as corrective feedback, up to `MAX_RETRIES` (2) additional times. Every attempt is a full
sequential round trip: compose (4-11s) → parse → verify (~0ms) → maybe retry. Nothing runs
concurrently within one question's attempt loop.

### How it would work

A **diagnostic pass first** (per this repo's standing `quality-slice` methodology — diagnose
before fix, no tuning to a test set): pull a larger sample of rejected first attempts (the 25-run
already shows the failure-code distribution above; a proper diagnostic needs more like 100-200)
and read what `quote_verbatim` and `schema` rejections actually look like — is the model
paraphrasing instead of quoting verbatim in a specific, nameable way? Truncating quotes at a
punctuation boundary the parser doesn't expect? Producing malformed JSON in a specific shape? This
determines whether the fix is a **prompt clarification** (cheapest, likely first move — e.g. a
sharper instruction or a worked example targeting the most common failure), a **retrieval-context
change** (if the retrieved passage itself is hard to quote cleanly — a bigger change, would need
the held-out accuracy diagnostic re-run per CLAUDE.md), or something structural in the contract
itself.

**Nothing here is built or chosen yet.** This section names the SHAPE of the next step, not the
step itself — the diagnostic has to run before any specific fix can be designed, per the same
discipline this repo already applies to retrieval-accuracy work.

## Gates this touches, regardless of which fix option is chosen

Any change to the compose prompt or the retry loop touches the compose→verify guarantee directly.
Per CLAUDE.md's Definition of Done: **`interpretation_bait` must run clean through the live loop
before shipping** (currently 35/35, a ~92% lower bound) — this is not optional for a "just a
latency tweak." If the fix also touches retrieval context, the held-out accuracy diagnostic
(frozen vN) re-runs too, pre-registered, no tuning to the test.

## Out of scope for this doc

- Choosing a specific prompt fix (needs the diagnostic first).
- A compose model swap (a bigger, separate decision — cost, latency, and faithfulness all move
  together; needs its own comparison, not bundled here).
- Anything touching retrieval, corpus, or the verifier's rule set (each has its own gate above).
- The already-shipped streaming UI (nothing to redesign; corrected at the top of this doc).

## What this doc is asking the PM to decide

Whether to spend the diagnostic pass (read ~100-200 rejected-attempt samples, failure-code them,
propose a specific fix) as its own scoped slice — likely the highest-leverage next step for both
the latency tail and the fallback rate, but real work, not a quick patch. The narrower
hedge-attempt-0 option above remains available as a smaller, independent, lower-impact
alternative if the PM wants something scoped tighter than a diagnostic pass.
