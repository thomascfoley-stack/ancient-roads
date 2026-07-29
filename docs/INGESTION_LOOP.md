# The Autonomous Ingestion Loop — design

**Status:** design (Phase 2+ not built). Turns the *per-work* harness (`ingest-harness.ts`, Phase 1 — one work → `staged`) into an **unattended run that sweeps the entire manifest in one go**, inspecting, deciding, and ingesting on its own — and self-halts at the boundaries a machine must not cross.

**The principle, above all others** (`THE_LOOP.md`): *the verifier is the bottleneck — no unit of work is "done" without a check that could have failed.* **A loop is only as safe as the weakest per-work check it runs.** So this is not "let the agent ingest everything"; it is "give every work a check that can reject it, auto-apply only known fixes to known failures, and stop the loop itself the moment a machine is out of its depth."

Companions: `INGESTION_HARNESS_DESIGN.md` (the state machine + autonomy tiers this drives), `HISTORY_RETRIEVAL_DESIGN.md` (the historian head), `ACQUISITION_MANIFEST.md` (the queue), the `overnight-run` and `quality-slice` skills (the standing procedures this automates).

---

## 1. What "one go" means — bounded autonomy by reversibility

"Run the entire ingestion in one go" does **not** mean "autonomously publish the corpus." It means **the loop runs fully autonomous all the way to `staged` — which is reversible, because production retrieval never reads staged rows — and batches the one irreversible thing, `publish`, for the owner.** This is the harness autonomy model made continuous:

| Boundary | Reversible? | In the loop? |
|---|---|---|
| acquire → gate → match → chunk → embed → verify → **stage** | yes (nothing served) | **fully autonomous** |
| deterministic fix on a known failure code | yes (re-measured before it counts) | **fully autonomous** |
| `staged → published` | **no — licensing is legally irreversible** | **human digest, never auto-fires** |
| licensing ambiguity / novel failure fork | — | **escalate, don't decide** |

The loop's job is to arrive with the entire manifest **staged, quarantined, or escalated** — and a publish digest waiting. You clear approvals; you never babysit a work. That is the honest reading of "the agent inspecting and deciding and ingesting."

## 2. Two loops

**Inner loop (per work) — the closed loop of `THE_LOOP.md`.** For one work: run it to `staged`, run the per-type **check that could fail**, and on failure apply a *known* fix and **re-measure** — never advance on an unverified fix.

```
acquire → license/provenance gate → text-match/structure → ingest-to-staged
   → run the per-type CHECK → [pass ⇒ STAGE]
                            → [known failure code ⇒ auto-fix ⇒ RE-MEASURE ⇒ (pass⇒STAGE | still-fails⇒ESCALATE)]
                            → [novel failure ⇒ ESCALATE]  → [gate fail ⇒ QUARANTINE]
```

**Outer loop (the driver, new) — sweeps the ranked queue.** Pop the next work, dispatch to its type head (§5), run the inner loop, update the run-log and digest, check the circuit breakers (§4), repeat until the queue is empty or a breaker halts it.

```
build ranked queue (§3)
while queue not empty and no breaker tripped:
    w = next work
    result = inner_loop(w)                     # stage | quarantine | escalate
    append(run_log, w, result, rationale)
    if result == staged: digest.add(w)
    check_breakers()                            # may PAUSE or HALT the whole run
emit digest + escalation list; PUBLISH NOTHING
```

## 3. The ranked queue — front-load wins, defer the tar pits

Order the manifest so the run banks certainty first and meets risk last (fail early, fail cheap):

1. **Verse-keyed, clean-source, license-green first** — Tier-1 commentary (Calvin OT, CrossWire batch), then bibles, then PD sermons. High-value, cheapest to check, publish-eligible. (Tier-1 commentary un-skips `web/test/invariants/verse-keys.test.ts` — it must go green; that's the gate.)
2. **OCR works later** — archive.org scans are the multi-week tar pit; they ride behind clean text and are `staged`-only until spot-checked.
3. **Historians last, and gated** — they require the write-contract (`HISTORY_RETRIEVAL_DESIGN.md` §9): additive migrations landed + the one-Schaff **pilot** passing *before* the historian head runs, and they are **terminal at `staged`** (no read-path yet).

Rationale: a broken gate or a bad adapter surfaces on the cheap, well-understood works, where a breaker catches it — not 200 works into an OCR run.

## 4. Circuit breakers — the loop stops itself

An autonomous loop without self-halts is the slop machine by name (`THE_LOOP` rule 8). Five breakers, each earning its place from a scar:

| Breaker | Trip | Action | Scar |
|---|---|---|---|
| **Staged-backlog pause** | unreviewed staged > ~2 source-works (~30 works) | pause intake; wait for the publish digest | pace to owner review, not miles ahead (`HARNESS §Operational`) |
| **Quarantine-rate alarm** | one work quarantines > 30% of its content | stop that work, escalate "source/edition likely wrong" | Origen-on-John full-work drop |
| **Consecutive-failure breaker** | N works in a row fail the *same* code | **HALT** — the gate/instrument is likely broken, don't stage garbage at scale | "kill the broken instrument" (pool 50→5; 3 broken Spurgeon reads) |
| **Novel-fork stop** | a failure the decision tree doesn't cover | real-time escalate; do not invent a fix | fixer must not free-form (`HARNESS §Escalation`) |
| **Budget/rate breaker** | DeepInfra 429 backoff exhausted, or a run-level time/spend cap hit | pause, checkpoint, resume later | embeddings off the request path; polite backoff |

A tripped breaker writes its reason to the run-log and either **pauses** (backlog/budget — resumable) or **halts** (consecutive-failure/novel — needs a human). Never silent.

## 5. One spine, typed heads — the dispatch

Same state machine for every work; the **check that could fail** is type-specific. This is where the loop "inspects and decides":

| `source_type` | The check that could fail (the gate) | Auto-fixable failures | Terminal state |
|---|---|---|---|
| **commentary** | verse-key not collapsed (`web/test/invariants/verse-keys.test.ts` green) · coverage · Gate B license · held-out accuracy delta (no per-category regression) | `no-content` → queue covering work · `<2-voices` → per-author cap · `wrong-passage` → ref/pericope routing | `published` (on digest) |
| **bible** | versification integrity (verse counts vs canon) · license class | translation gaps → gap-fill from a clean version | `published` (on digest); ambiguous license → **escalate** |
| **sermon** | anchor-recall K=3 ≥ 70% (frozen Slice-0 bar) · Gate B | low recall → re-chunk/re-anchor, re-measure | `published` (on digest) |
| **historian** | the **write-contract** (`HISTORY §9`): heading captured · period normalized · entity anchors verbatim-grounded · embedded whole · **zero fabricated `section_anchors`** · clean vs OCR | structural only (re-chunk on headings; re-embed whole) | **`staged` — NEVER served** (no read-path) |

Historians never reach the publish digest — they have no surface to be served through. They accumulate as a *ready* staged corpus.

## 6. The auto-decide tree (Phase 2) — deciding is a coded map, not agent judgment

The agent does not free-form "decide." It maps a **failure code** to a **known fix**, applies it, and re-measures. Known failure + known fix ⇒ auto-apply + log. Anything unmapped ⇒ escalate. (`INGESTION_HARNESS_DESIGN §Failure-code tree`, extended per type in §5.) This is what keeps a fully-autonomous run *auditable*: every action is either a tree entry with a logged rationale or an escalation — never a vibe.

Two failure classes **always** escalate, never auto-fix: **licensing ambiguity** (legally irreversible) and **`verifier-fallback` / interpretation** (never auto-touch the faithfulness path).

## 7. Idempotent + resumable — what makes "one go" safe to kill

Every write is `ON CONFLICT DO NOTHING`; a killed run resumes at the same work and never double-ingests. "One go" therefore does **not** mean "one process that must survive N hours" — it means the run can die and be relaunched freely, converging on the same staged corpus. The outer loop's first act (§ resume) is to skip works already at `staged`/`published`/`quarantined`. Adapters fetch politely, cached and resumable (no re-hammering archive/New Advent).

## 8. The audit trail, and fixer ≠ verifier

Every state transition is logged with its rationale (the run-log) and the run emits a batched **digest** of pre-verified cards (`HARNESS §digest`). The loop is the *fixer*; it may **not** certify itself (`THE_LOOP` rule 6). After the run, a **fresh agent** runs the `deep-audit` skill over the run-log + a sample of staged works — the author-loop sees what it meant, not what it wrote. State every result **no wider than the evidence**: the digest reports per-work n and bound, never "corpus ingested ✓".

## 9. What "one go" does NOT remove (by design, not limitation)

The publish approval (batched digest), licensing-ambiguity escalations, novel forks, and the post-run deep-audit. The loop is measured by **how few real-time stops it produces per 100 works** — not zero. A run that escalates nothing on 400 heterogeneous works (OCR, ambiguous licenses, new adapters) is not a triumph; it's a loop whose gates aren't checking.

## 10. Build scope — what exists vs what this needs

**Exists:** `ingest-harness.ts` (Phase 1: one work → staged + digest), Gate B (`check-licenses.ts`), the shingle matcher (`resource-textmatch.ts`), failure-code diagnosis, the re-measure/held-out harness, the manifest (`ingest/sources.config.json` + `ACQUISITION_MANIFEST.md`), `embed-full-corpus.ts`.

**To build (this is the loop):**
1. **The outer driver** — ranked queue, resume-skip, per-work dispatch, digest/run-log accumulation, the five breakers.
2. **Phase 2 auto-decide tree + escalation log** — map every per-type failure code to a fix or an escalation.
3. **Type heads** — the bible/sermon/historian gates + digests (commentary exists); the historian head depends on the write-contract prerequisites.
4. **Historian prerequisites** — additive migrations (`period_*`, `section_history_anchors`, `tsv` heading fix) landed on dev + the one-Schaff pilot green, *before* the historian head runs.
5. **Real acquire** — adapters that actually fetch for works not already in the DB (Phase 1 "acquire" only counts existing rows).

**Definition of done (the STOP):** the whole ranked queue is `staged` / `quarantined` / `escalated`; the digest + escalation list are emitted; every breaker is clean or its halt is logged; **nothing is published**; a fresh-agent `deep-audit` has reviewed the run-log. Anything short is Partial.

## 11. Loop-engineering checklist (the best-practices summary)

Each line is a rule this loop must satisfy, tied to the scar that earned it:

1. **Every work has a check that could fail** — no "assume staged." (verifier is the bottleneck)
2. **Closed loop** — fix → *re-measure* → then stage; never advance on an unverified fix. (no open loop)
3. **Bounded autonomy by reversibility** — auto to `staged`; human at `publish`; escalate licensing. (never automate the irreversible)
4. **Decide by coded tree, not judgment** — known code → known fix, else escalate. (auditable, fixer≠verifier)
5. **Circuit breakers self-halt** — backlog, quarantine-rate, consecutive-failure, novel-fork, budget. (kill the broken instrument; STOP on every open loop)
6. **Idempotent + resumable** — `ON CONFLICT DO NOTHING`; kill-and-resume safe. (throughput/resilience)
7. **Ranked queue** — clean/cheap/high-value first, OCR + historians last. (fail early, fail cheap)
8. **One spine, typed heads** — dispatch by `source_type`; historians terminal at staged. (one engine, new source)
9. **Log every transition; a fresh agent audits** — the loop can't certify itself. (fixer ≠ verifier)
10. **Conclusions no wider than the evidence** — per-work n and bound in the digest. (claim discipline)
11. **A STOP / definition of done** — §10; nothing published, deep-audit done. (every open loop ends)
