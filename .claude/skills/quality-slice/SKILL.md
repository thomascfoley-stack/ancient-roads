---
name: quality-slice
description: >
  The disciplined loop for ANY retrieval-quality, eval, corpus, or ingestion slice in Ancient Paths —
  diagnosing accuracy failures, changing retrieval/ranking, ingesting or re-sourcing works, tuning the
  corpus, or running/interpreting the held-out eval. Use whenever you are about to "fix" a number,
  build a retrieval change, ingest content, or judge whether something is good enough to ship. Enforces:
  diagnose-before-fix, measure-before-build, failure-code the misses, held-out discipline (never tune to
  the test), pre-registered bars, no-overfit, verify-the-label-not-just-the-system, design-before-code,
  prove-deep-before-wide, licensing fail-closed, and test-the-real-code-path.
---

# Quality Slice — the discipline

You are working on Ancient Paths (concordance, not commentator). This skill is the standing methodology
for any slice that touches retrieval quality, the corpus, ingestion, or the eval. It exists because the
same mistakes recur: fixing the wrong thing, building off noise, tuning to the test, trusting a green
check. Follow the loop; do not skip steps to save time — skipping is how the wrong fix ships.

## The loop (in order)

0. **NAME THE ARTIFACT before you accept any measurement.** State *what column / file / variable you actually
   measured*, and *why that artifact is the thing the mechanism depends on*. If you cannot, you have not
   measured it — you have measured a proxy, and the conclusion will be drawn wider than the evidence. Four
   retrieval diagnoses in a row were wrong this exact way: "corpus too small" (measured entry COUNT, not
   embedded coverage); "reranker demotes the passage" (measured HIT@1, but the gated HIT@2 moved the opposite
   way); "HNSW drops the vectors" (true for epistle, but topical never moved); "truncation eats the argument"
   (measured `embeddings.content`, the STORED column — but the embedder reads a *different variable*, so the
   stored text is not what was embedded). Before every number: which artifact, and is it the one the code
   path actually reads? (See also step 11 "test the real code path" and the "green check is not proof" rail.)

1. **Diagnose before fixing.** Never assume the cause. Look at what the system *actually returned* — the
   top-k passages/authors, the failure code — before deciding on a fix. A low number is a symptom, not a
   diagnosis. (This caught: an 82% "drop" that was a crawl artifact; "1 Cor 13" being a *ranking* miss not
   a content gap; a failing block that was a *broken label*, not a retrieval miss.)

2. **Measure the baseline and the noise floor first.** Establish variance before you build anything. Is the
   pipeline deterministic? What's n? A swing of "−10" may be 2 queries, or an index-state change, or noise.
   Never size a fix to a number you haven't confirmed is real and stable.

3. **Failure-code every miss** — do not report a bare accuracy number. Classify each failure:
   - `no-content` → corpus lacks the passage → a *content/ingest* fix (find a covering work).
   - `wrong-passage` → drifted to a similar passage → a *ranking/routing* fix.
   - `<2-voices` → right passage, too few distinct authors → a *diversity* fix (more authors / author cap).
   - `verifier-fallback` → non-verbatim / interpretation → a *compose/faithfulness* fix (never auto-touch
     the verifier; escalate).
   The single number scores you; the codes tell you *which layer* to fix. Fixing the wrong layer is the
   most common waste (e.g. adding content for a ranking bug — zero effect).

4. **Held-out discipline — the gate must stay honest.**
   - Freeze + content-hash the eval set *before* the first accuracy number exists.
   - Never edit the gazetteer / floor / labels *in response to failures* — that silently re-tunes the test.
     Fixes go in a separate slice, measured against the frozen set.
   - The moment you measure fixes against a set, it becomes a **dev set**. Ship the real decision on a
     **fresh vN** held-out (same methodology, new frozen queries) that no fix was tuned against.

5. **Pre-register the bar** — per-category, before the number exists. State what it gates (beta vs GA).
   Don't grade on a curve; don't move goalposts after seeing results.

6. **Fixes must be general mechanisms, not patches** for the failing queries. Watch the **circularity trap**:
   never build routing/retrieval from your own eval labels; never grow a gazetteer to cover exactly the
   eval's cases. If the fix is query-shaped, the number is a lie — validate on held-out inputs.

7. **Verify the label/measurement, not just the system.** A "miss" can be a broken or narrow label. Audit
   label-incompleteness before concluding a real gap — but corrections must be **authority-grounded** (a
   published source says so), applied **uniformly** and **before** the re-run, never "this should pass."
   Systematic label gaps → re-freeze + re-run, never per-query fudging.

8. **Design before code** for anything touching retrieval, the data model, or the contract. Short doc:
   options, the measurement plan, named scaling risks (request-path cost, index needs), out-of-scope.
   Get owner approval before implementing.

9. **Prove deep before wide.** One correct vertical slice before scaling — one source before 400, a
   targeted per-work fetch before a whole-corpus crawl, the simplest lever measured before the complex one.

10. **Re-measure the WHOLE frozen set after any change**, not just the block you touched — a retrieval
    change reorders results everywhere and can regress a passing category. Confirm no regression + no overfit.

11. **Test the real code path.** Measure through the *shipped* function, not a reimplementation. If you must
    duplicate orchestration, single-source it or sync-guard it — a lookalike eval validates a lookalike.

## Non-negotiables (Ancient Paths)

- **Never substitute your own knowledge for a required authoritative source.** If a task needs authority-grounded input (proof-texts, licenses, editions, specs, prices) and the source is unreachable, **try alternate URLs/mirrors first — then PARK the task**, record the blocker, and move on. Do NOT proceed from memory and disclose it afterward. An unauthoritative input silently corrupts every number built on top of it, and "I flagged it" does not undo a frozen eval or a shipped decision. Momentum is never a reason to downgrade a load-bearing input.
- **Committed ≠ live.** A fix is not real until it is deployed to the target environment *and verified there*. Never report a security fix, gate, or limit as "done" on the strength of a passing test — say explicitly whether it is deployed, and verify the behaviour in the environment it protects.

- **Licensing is existential and fails closed.** Verify each work by **per-work text-match to a PD reference**
  (shingle containment), not by author name — an author with a PD edition can still have a *copyrighted*
  translation in your copy. Forbidden aggregators live **in the gate**, not in memory. **Quarantine, never
  delete** — reversible if a PD source later surfaces.
- **Gates fail closed.** Coverage gap must be 0; license + provenance must be present; the verifier falls
  back to raw retrieval on any error. Never emit unverified model text. A missing config denies, not exposes.
- **A green check is not proof.** Run the query, read the diff, seed a bad row and confirm the gate rejects
  it. "I built the gate" ≠ "the gate fails closed."
- **LOOK AT THE DATA BEFORE YOU PARK. A number is not evidence until you have seen the input that produced
  it.** Before you park a P0, reject a source, or conclude "the data won't work," **print the raw input and
  read it with your own eyes** — the first 800 chars, the title page, the actual tokens being compared. Two
  nights of content were lost because an agent verified "is this scan Ryle-on-John?" by *grepping for a
  string* (false positive) and parked the P0 on a 9.3% score that was actually **Ryle-on-John vs
  Ryle-on-Luke — two different Gospels, each title page saying so in the first 800 characters**. Grep finds a
  substring; it does not tell you what the document *is*. A low number has two explanations — the method is
  weak, or the inputs are wrong — and you cannot tell which without reading the inputs. Never let a measured
  number stand in for having looked.
- **Load the page and look — at 390px AND desktop.** Any slice that changes something a user sees or a route
  serves is not done until you have actually opened it in a browser at **390px mobile and desktop width**,
  looked (no horizontal overflow, no overlap, no unreadable text, no console errors), and exercised one real
  interaction end-to-end. Boot the dev server (`preview_start`), screenshot both widths, run a real query.
  "It typechecks / the API returns 200" is not "it renders and works." A screenshot is the proof.
- **Never cache/curate/ship an answer from a pipeline below the bar.** Caching a wrong answer serves it to
  everyone.
- **Record the number.** Every retrieval/corpus change → the accuracy number and its failure-code breakdown
  go in `WORKLOG.md`; status in `ROADMAP.md`. Don't leave findings only in chat.

## When to escalate to the human (real-time)

Only for genuine forks the loop doesn't resolve: a licensing ambiguity a text-match can't settle; an
accuracy regression the failure-code→fix mapping can't self-correct; a fix that needs a design decision; a
failure class the codes don't cover; or a ship/no-ship gate call. Routine failure-code→fix decisions are
applied and logged, not asked. The measure of good work is *few* real-time stops per slice, never zero
discipline.
