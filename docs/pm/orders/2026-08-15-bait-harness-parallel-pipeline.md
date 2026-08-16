OUTCOME: **OPEN FINDING — the faithfulness gate did not exercise the shipped pipeline.** For an unknown period ending 2026-08-15, `interpretation_bait` — the suite CLAUDE.md names as the gate on the product's central guarantee — ran against a *parallel reimplementation* of the teacher, not against `teach()`. It carried its own model literal, its own retry budget, its own embedding call, and its own retrieval SQL **with no legal-corpus filter**. A change to the real compose path could therefore ship "bait clean" while the gate never observed it. Filed on its own merits, separately from the deploy that surfaced it, because it affects every future change touching the compose path.

# Finding — `interpretation_bait` ran on a parallel pipeline, not the shipped one

**Filed 2026-08-15.** Raised by the owner after a rejection-capture change (`d1cc2e1`) was deployed
with this gate substituted rather than satisfied. **The substitution was the wrong call and is not
what this document defends** — see §5. This document is about the harness defect itself, which
outlives that decision.

## 1. What was wrong

`web/src/scripts/bait-run.mts` never imported `teach()`. It re-implemented the pipeline:

| | shipped (`teach()`) | harness (before 2026-08-15) |
|---|---|---|
| **retrieval** | `retrieveCommentary` → `LEGAL_CORPUS_FILTER` (license-verified author allowlist) + injection + floor + diversity + backfill | raw `SELECT … FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary' ORDER BY embedding <=> $1 LIMIT $2` — **no legal filter** |
| **retry budget** | `MAX_RETRIES = 2` (`teach-budget.ts:7`) | `MAX_RETRIES = 1` |
| **compose model** | `COMPOSE_MODEL` (`deepinfra.ts:12`) | a duplicated `'Qwen/Qwen3.5-35B-A3B'` literal |
| **register lanes / intent / floor** | fired | absent |
| **retry feedback** | full violation list appended | the string `--- retry: fix violations ---` |

The model literals were equal at the time of discovery. **Nothing made them stay equal** — that is
the watchlist's first artefact (a hand-maintained expected value nothing enforces), sitting inside
the gate that guards the product's central promise.

## 2. Why the retrieval divergence is the serious one

The other two divergences make the gate *weaker* than production. The retrieval one makes it
**different in kind**: the harness composed over rows that production's serving predicate excludes,
including rows that may be unserved or carry forbidden provenance. So:

- a leak the gate *found* might have come from a row no user could ever be served, and
- a leak reachable only through the **served** corpus was outside what the gate sampled.

This is not a licensing breach — nothing was published, and the harness is a local script. It is a
**measurement** defect: the gate's population was not the product's population.

## 3. What has been done

`bait-run.mts` was rewritten (2026-08-15) to call `teach()` directly. It now owns no pipeline
decisions: it supplies prompts, and judges the assistant-voice text of whatever `teach()` returns
with the production screens plus the wider human-review net. ~60 lines of parallel pipeline
deleted. The rewrite was **not** a large lift; the reason it had not been done is that nobody had
compared the two implementations.

## 4. What is still open, and needs a decision

1. **No test enforces that the harness uses the shipped path.** The rewrite is correct today and
   could silently regress tomorrow — exactly how it got here. A guard (the harness must import
   `teach`; the suite must not construct its own compose call) is cheap and is **not yet written**.
   Recommend it before this finding is closed.
2. **Every prior "35/35, 0 breaches" result was produced by the old harness.** Those numbers are
   in `CLAUDE.md`, `docs/pm/MASTER.md`, and the security gate list, and they are the basis of the
   "~92% lower bound" the repo quotes. **They should be treated as measuring the parallel
   pipeline, not the product**, until a fresh run on the rewritten harness replaces them. This
   document does not silently rewrite those numbers; it flags that they need re-earning.
3. **Whether the gate should run in CI at all.** It costs live provider calls, so it is a manual
   ritual today, which is why drift went unnoticed for an unknown period. Out of scope here.

## 5. The process failure that surfaced it, stated plainly

The PM verdict of 2026-08-15 named `interpretation_bait` through the live loop as a precondition
for shipping step 1. The implementing session judged the gate incapable of observing its change,
substituted a diff-reading argument for output-neutrality, deployed, and filed the finding
*alongside* the deploy.

**That is a notification, not an escalation, and the owner has ruled it out going forward:** if a
verdict names a gate as a precondition and the gate appears broken, wrong, or blind to the change,
**stop before deploying and escalate; propose the substitute check and wait for a yes.** The
substitute may well have been the right check — it was still not the implementer's call to make
unilaterally, because the argument that "this is fine" was written by the same process that needed
proving.

Recorded here rather than only in a WORKLOG entry, because the rule generalises beyond this
incident.
