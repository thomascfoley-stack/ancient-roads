# Feedback counterfactual — verdict 2026-08-15 §4

**Result: UNDERPOWERED. The design doc's claim is NOT supported, and the parallel race is NOT
ruled out — it is undetermined.**

Ordered by [the verdict](../../pm/orders/2026-08-15-verdict-ask-compose-latency-design.md) §4 to
convert an argument into a measurement. Run 2026-08-15 against the **dev** database
(`ep-tiny-hat`) and live DeepInfra. Harness: `web/src/scripts/feedback-counterfactual.mts` —
imports every real primitive (`buildSystemPrompt`, `buildUserPrompt`, `compose`,
`normalizeContract`, `verifyV1`, `buildCorpusLookup`, `retrieveCommentary`) and varies only the
attempt loop, because the loop is the independent variable.

## What was asked

`docs/ASK_COMPOSE_LATENCY_DESIGN.md` rejected a blind parallel race on the grounds that informed
retries recover 9/13, calling the violation-feedback loop "doing real, measurable work". The
verdict correctly observed that 9 is arithmetic (13 retried − 4 fell back), shows only that
retries succeed, and says nothing about whether the *feedback* caused it.

## Result

Same 13 questions that needed a retry in the production run. Both arms share attempt 0, so they
start from the identical rejection; arm A appends the `--- PREVIOUS ATTEMPT REJECTED ---` block
(what production does), arm B re-rolls the original prompt unchanged.

| | recovered |
|---|---|
| informed retry (feedback appended) | **2 / 6** |
| uninformed re-roll (no feedback) | **1 / 6** |

**2 versus 1 on n=6 establishes nothing.** This is the same caution the verdict applied to the
5-vs-4 failure-code table, and it applies with more force here at a smaller n.

## The finding that was not asked for, and matters more

**Only 6 of the 13 questions were rejected on attempt 0 at all. Seven passed outright** — the same
13 questions that had *every one* needed a retry in the production run hours earlier.

So retry incidence is **strongly stochastic**, not a stable property of a question. That has three
consequences the doc and the verdict both assumed away:

1. **The 52% retry rate (13/25) is a noisy point estimate**, not a fixed characteristic of the
   pipeline. A re-run could plausibly produce a materially different rate on the same questions.
2. **Per-question failure codes are not stable labels.** Question 10 (Song of Solomon 4:14) was
   rejected for `anchor_offbase` here and `schema` in production; question 1 (Romans 8:28) drew
   `schema` here. Any diagnostic that failure-codes a question once and treats that as *the*
   reason will be coding noise.
3. **The comparison set shrank from 13 to 6 by chance alone**, which is why this run cannot answer
   the question it was built for.

Dev-vs-prod corpus differences may contribute, but cannot be the whole story: the same
stochasticity shows up *within* this run (compose temperature is 0.3, not 0).

## What this changes

- **The design doc's rejection of a blind parallel race is withdrawn as unsupported.** Not
  reversed — undetermined. The race may still be a bad idea for the reasons the doc gives about
  discarding feedback, but "informed retries succeed 9/13" is not evidence for that and must stop
  being cited as if it were.
- **Deciding it properly needs many more trials than anyone has budgeted.** At an effect size this
  small, distinguishing the two arms would take on the order of hundreds of paired attempts, not
  13. That is a real cost and should be weighed against just shipping the step-1 capture and
  reading real traffic, which is free.
- **Step 2's counts must aggregate over repeated asks of the same question**, not one code per
  question, or they will inherit exactly the instability shown above.

## Raw

Per-question rows in [`feedback-counterfactual-2026-08-15.json`](feedback-counterfactual-2026-08-15.json).
