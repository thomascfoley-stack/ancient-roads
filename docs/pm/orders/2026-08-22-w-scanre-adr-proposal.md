# ADR PROPOSAL — SCAN_RE false-floor class: corroboration-gate extension, with two residual design questions

**Status:** PROPOSED, HELD-FOR-OWNER. Written per §2.4 step 3 of
`docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` — the pre-registered bar
(`docs/evidence/swarm-2026-08-22/w-scanre/PRE-REG.md`) did not clear, so the behavior change
was reverted and nothing here is built. Measurement:
`docs/evidence/swarm-2026-08-22/w-scanre/RESULT.md`.

## Context

`SCAN_RE`'s bare `([a-z]{2,})\s+(\d…)` path floors idiomatic non-citations whose book word is a
common English noun. First measured n=2/10 (WORKLOG 2026-08-21 known-issue); W-SCANRE's
pre-registered n=36 adversarial set measures the class at **33/36 on shipped code** — 6/6 each
for mark, james, job, acts, numbers, and 3/6 for kings. Each false floor reserves the top two
answer slots on a topical query and **displaces correct voices** — the ADR-015 hijack class
surviving in the un-corroborated numeric path, where "a chapter number is explicit intent" is
true of `1 Corinthians 13` and false of `1 mark 5`.

## Measured candidate (implemented, measured, then reverted per protocol)

Extend ADR-015's corroboration gate to numerics whose book word ∈ {mark, james, job, acts,
numbers, kings}: always **inject** (soft-boost is false-positive-safe), **floor** only when
corroborated — a second scanned numeric reference, or a `BIBLICAL_LEXICON` token surviving
after the matched span is stripped from the normalized query. Diff: `resolveIntent` in
`pericopes.ts` (both byte-identical mirrors) plus a `scanReferenceSpans` accessor in
`ref-parse.ts` exposing the matched span/book word; ~40 lines net.

**Measured:** false floors **33 → 2**; genuine-citation controls **31/31 preserved**; existing
reference-routing fixtures (ADR-115's probe battery + all pre-existing vitest assertions)
**byte-identical / unchanged**. The pre-registered bar was 0 false floors, so the change does
not merge as-is.

## The two residual cases — the owner-visible design questions

1. **Mutual corroboration of two false candidates** (`she is 1 mark 5 points from winning`).
   The alias `is` (Isaiah) matches `is 1` — itself a false numeric, un-gated — and the
   registered rule "a second scanned reference corroborates" lets it corroborate `mark 5`.
   **Question:** should the corroborating passage be required to be high-confidence itself
   (i.e., second-ref corroboration counts only refs that would floor unconditionally)? That is
   stricter than ADR-015's pericope rule (two bare pericopes corroborate each other today), so
   it is an ADR-level asymmetry, not a patch. Related and out of scope here: the `is` → Isaiah
   alias is a *fourth* false-floor class of its own (`is 1`, `is 5` floor unconditionally).
2. **Person-name lexicon tokens corroborate people-listing idioms** (`i counted 3 james 2
   marys and a paul`). `paul` is a `BIBLICAL_LEXICON` major-figures token, so the stripped
   query reads as biblically corroborated. For pericopes that is ADR-015's design working as
   intended; for the numeric gate, a bare person name is weak evidence. **Question:** for the
   numeric gate only, should corroboration exclude the major-figures tier of the lexicon (or
   require a non-name token)? Touching the shared lexicon for pericopes too would re-open
   ADR-015's measured precision — another reason this is a ruling, not a patch.

## Options

- **A. Ship the measured extension as-is** (2/36 residual false floors, both named and bounded
  above). Rejected by the pre-registered bar; included for completeness.
- **B. Ship the extension + require high-confidence corroborators** (fixes residual 1) **+
  exclude major-figure tokens from numeric-gate corroboration** (fixes residual 2). Expected
  0/36 — but both refinements are post-measurement reasoning and were NOT measured under the
  pre-registration; they would need a fresh pre-registered run (the frozen n=67 set and harness
  are committed and ready).
- **C. Hold the whole class**; accept 33/36 false floors until the full `/ask` accuracy re-run
  (ADR-028, still blocking) re-baselines retrieval.

**Recommended:** B, re-measured under a new pre-registration against the committed frozen set
before merging.

## What merges as infrastructure (brief step 5, regardless of outcome)

`evals/cases/reference_floors.yaml` (n=67 frozen set) + `scripts/probe-scan-floors.mts`
(tier-level harness) + `docs/evidence/swarm-2026-08-22/w-scanre/` (pre-reg, RED/GREEN
transcripts, fixture diffs, RESULT).
