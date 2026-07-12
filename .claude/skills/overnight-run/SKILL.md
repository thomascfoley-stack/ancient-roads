---
name: overnight-run
description: >
  The lifecycle protocol for any bulk, long-horizon, or overnight autonomous job in Ancient Paths, and
  for reviewing one the morning after. Use whenever a job will run unattended, produce a large diff, or
  span many steps, and whenever the ask is "review last night's run", "QA the overnight work", or "did the
  agent do this right". Enforces a DECISION-LOCK before work starts (so direction stops flip-flopping), a
  self-report contract during the run, and a parallel DEEP-AUDIT by fresh agents before anything is trusted
  or shipped. Kills the challenge -> flip-hypothesis -> repeat loop that wastes the owner's time.
---

# Overnight Run — lock the decision, then let it run, then audit it cold

**The two failures this exists to prevent:**
1. **The ping-pong loop** — a job starts from an *opinion*, the owner challenges it, the agent flips its
   hypothesis, and this repeats 8 times because nothing was ever committed to. Cured by a **decision-lock**
   written and approved *before* work starts. After the lock, direction changes only on **new evidence that
   violates the locked rule** — never on a new opinion or a fresh challenge.
2. **The author grading its own homework** — trusting the agent that just wrote 2,000 lines overnight to
   have reviewed them. Cured by a **cold audit**: fresh agents (`deep-audit`), never the author.

## Phase 1 — DECISION-LOCK (before any bulk work; owner approves)

Write these five, get a yes, then do not re-litigate them mid-run:

1. **Question** — one sentence, answerable with evidence.
2. **Hypothesis** — falsifiable. ("Ranking, not coverage, is the limiter" — not "improve accuracy".)
3. **Decision rule** — written *before* the number exists: *"if X ≥ bar → ship on vN+1; if X < bar →
   failure-code the misses and stop; if evidence Y appears → escalate."* This is the anti-ping-pong core.
4. **Pre-registered bars** — per category, what each gates (beta vs GA). No moving goalposts after results.
5. **Out of scope** — what this run will NOT touch, so scope can't creep overnight.

**The rule of the lock:** a challenge is only valid if it points at *evidence that violates the locked
decision rule*. "I have a different hunch" is not evidence. If the lock itself was wrong, say so explicitly
and re-lock with the owner — one deliberate re-lock, not eight silent flips.

For retrieval/corpus/eval/ingestion slices, the lock's steps 2–4 are executed via `quality-slice`
(diagnose-before-fix, freeze+hash the held-out set, failure-code the misses). This skill governs the job;
`quality-slice` governs the method inside it.

## Phase 2 — RUN (self-report contract, so the morning review is possible)

The overnight agent MUST leave, as it goes:
- A running **`WORKLOG.md`** entry: what it did, what it found, what it changed, the numbers.
- A **"not covered"** list — what it deliberately skipped or couldn't reach. (The biggest defect hides here.)
- **PARK, don't guess.** If a load-bearing authoritative input is unreachable, park the task and record the
  blocker; never proceed from memory. Momentum is never a reason to downgrade a load-bearing input.
- Commit per logical change and push. Never leave a large uncommitted tree the owner can't diff.

## Phase 3 — COLD AUDIT (the morning after; before anything ships)

Do **not** ask the overnight agent whether its work is good. Fan out `deep-audit`: 4–8 fresh agents, one
non-overlapping lens each, in ONE parallel batch. Every agent returns **findings-only** (file:line +
severity + why), a **verified-clean** list (proves coverage), and a **not-covered** list (exposes gaps).

Beyond the standard lenses, an overnight run demands two extra questions:
- **"Did this create a new entrance?"** New routes, new static assets, new env-var bypasses, new cache
  paths. Diff-scoped review misses these by construction — audit the whole surface, not just the diff.
- **"Was a wrong answer cached or curated?"** A pipeline below the bar that ran unattended may have
  persisted bad output that now serves instantly to everyone. Check the caches/curated sets it wrote.

Synthesize into ONE deduplicated, severity-ordered `REMEDIATION_CHECKLIST.md` with an explicit coverage
section. **Do not start fixing** — present the map, let the owner direct.

## Phase 4 — DECIDE against the lock

Compare results to the **Phase-1 decision rule**, not to a fresh opinion. Ship / stop / escalate per what
was pre-registered. Record the number + failure-code breakdown in `WORKLOG.md`; update `ROADMAP.md`. If the
rule says stop, stop — the discipline is worthless if it only holds when the number is good.

## Anti-patterns

- Starting an overnight job with no locked decision rule → guaranteed ping-pong the next morning.
- Flipping hypothesis on a challenge that carries no new evidence.
- Letting the author agent review its own overnight output.
- Auditing only the diff; missing the new entrance the run created.
- "Committed ≠ live" — reporting a fix as done off a passing test, not verified in the environment it protects.
- Caching/curating/shipping from a pipeline below the bar because the run "finished".
