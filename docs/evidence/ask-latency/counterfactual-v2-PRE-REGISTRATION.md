# Counterfactual v2 — PRE-REGISTRATION

**Written and committed BEFORE the run.** Per the repo's standing methodology (pre-registered
bars, no tuning to the result). Supersedes the underpowered v1
(`feedback-counterfactual-2026-08-15.md`, n=6, which established nothing).

## Question

Does appending the violation feedback (`--- PREVIOUS ATTEMPT REJECTED --- …`) to a retry make
that retry more likely to pass `verifyV1` than simply re-rolling the original prompt?

This decides whether the design doc's rejection of a blind parallel race stands. It is currently
**undetermined**, not settled either way.

## Design — PAIRED, which is why this is affordable

For each question × repetition:
1. Run **attempt 0** on the original prompt. If it passes, the repetition contributes nothing and
   is recorded as `attempt0-passed`.
2. If it is rejected, run **both arms from that same rejection**: arm A appends the real feedback
   block (what production does), arm B re-rolls the identical original prompt.

Both arms share the same attempt-0 rejection, so this is a matched pair, analysed with **McNemar's
test on discordant pairs** — not two independent proportions. Pairing is what makes ~90 usable
pairs meaningful instead of needing hundreds per arm.

Every primitive is imported from the shipped pipeline (`buildSystemPrompt`, `buildUserPrompt`,
`compose`, `normalizeContract`, `verifyV1`, `buildCorpusLookup`, `retrieveCommentary`); only the
attempt loop varies, because the loop is the independent variable.

## Pre-registered sample size and what it can detect

Two-proportion power (α=0.05, power=0.80), computed before the run:

| true effect | pairs needed per arm |
|---|---|
| large (50% vs 30%) | 93 |
| moderate (50% vs 40%) | 388 |
| small (45% vs 40%) | 1,534 |

**This run targets ~90–100 rejected pairs, i.e. it is powered for a LARGE effect only.** 13
questions × 15 repetitions ≈ 195 attempt-0 calls; at the ~46% attempt-0 rejection rate observed on
dev, that yields ≈ 90 pairs, ≈ 180 further compose calls. Total ≈ **375 compose calls.**

**Stated in advance, so a null result is not spun afterward:** if this run comes back null, the
honest conclusion is *"no large effect; a moderate or small effect is NOT excluded"* — not
"feedback does nothing". Detecting a moderate effect would cost roughly 4× this run, and that is a
budget decision for the owner, not something to slide into a footnote.

## Pre-registered decision rules

- **If informed retry wins significantly (McNemar p < 0.05):** the design doc's rejection of a
  blind parallel race is CONFIRMED by measurement. The race stays off the table.
- **If uninformed re-roll wins significantly:** the feedback block is actively harmful and the
  race becomes the preferred fix. Would then need its own design.
- **If null:** undetermined at large-effect power. The race is neither ruled in nor out, and
  **no step-2 design may cite either arm as justification.** Ship the step-1 capture, read real
  traffic, revisit only if the accrued sample makes it cheap.

## Secondary outcome, recorded because v1 surfaced it

Per-question failure-code stability across repetitions. v1 found the same question drawing
different codes on different runs (`anchor_offbase` vs `schema`) and 7 of 13 questions passing
attempt 0 that had all needed retries in production. **If codes prove unstable per question, step
2's counts must aggregate over repeated asks**, never one code per question — that finding stands
independent of the primary result.

## Environment

Dev database (`ep-tiny-hat`), live DeepInfra, compose temperature 0.3 (unchanged — the
stochasticity is the thing being measured, not a nuisance to suppress).
