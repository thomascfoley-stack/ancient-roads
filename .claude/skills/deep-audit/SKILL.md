---
name: deep-audit
description: >
  Exhaustive parallel audit of a codebase using 4–8 simultaneous agents across non-overlapping lenses.
  Use whenever the ask is "find the bugs", "is this right", "is it safe", "review everything", "what did we
  miss", "audit this", "check deep and wide", or BEFORE any production deploy, and AFTER any long autonomous
  agent run. Replaces serial one-file-at-a-time checking, which reliably misses the biggest defects.
  Produces ONE deduplicated, severity-ordered, file:line-cited checklist with an explicit coverage section.
---

# Deep Audit — parallel, exhaustive, non-overlapping

**The failure this exists to prevent:** reading one file per question, drip-feeding findings across many turns, and giving the owner false confidence. A properly designed parallel sweep finds more in one pass than a dozen serial checks. **Never answer "is this safe / find the bugs" by reading a couple of files.**

## When to fan out

- Any request to find bugs, audit, review, verify safety/correctness, or "what did we miss".
- **Before any production deploy.**
- **After any long autonomous agent run** — an agent that just wrote 2,000 lines is the last thing that should be trusted to have reviewed itself.
- When the owner pushes back twice on thoroughness. That's the signal you were being shallow.

## The lenses — run 4–8 in ONE parallel batch, non-overlapping by construction

Assign each agent exactly one lens. Overlap wastes tokens and produces duplicate findings; gaps produce missed CVEs.

1. **Attack surface** — every route/endpoint/entry point. For each: authenticated? rate-limited? does it spend money? input validation, length caps, injection, IDOR, unbounded results, pagination. **Adversarial framing: assume every temporary protection (a password gate, an unset env var) will be removed — what breaks then?**
2. **Data layer** — schema, every migration in order, RLS on every user table, role privileges (grants are *additive* — a later SELECT-only grant does NOT revoke an earlier DML default), indexes for every filtered path, transactions, migration ledger, destructive operations.
3. **AI/ML pipeline** (if present) — does the eval measure the **shipped code path** or a reimplementation? Can unverified model output reach a user? Secrets in prompts/logs? Retry/cost bounds? Frozen eval sets actually hash-verified at runtime?
4. **Domain invariants** — the product's *existential* rules, whatever they are (here: licensing/provenance — only PD/CC content, never a forbidden aggregator). **Enumerate EVERY code path that touches the protected resource and check each one.** The invariant is usually enforced on one path and forgotten on three.
5. **Docs vs reality** — fact-check every claim in the docs against the code. Hunt: things claimed "done/verified/deployed/tested" that aren't; stale auto-loaded rules; status files contradicting the tree.
6. **Dependencies & supply chain** — known CVEs, pinned/transitive risk, abandoned packages.
7. **Client/frontend** — XSS sinks (`dangerouslySetInnerHTML` over untrusted content), secrets in client bundles, error states, mobile viewport, accessibility.
8. **Ops/deploy** — what is actually *deployed* vs merely committed, env var management, secrets, rollback path, observability that a human can actually be paged on, whether CI gates cover the code that matters.

## The agent brief — every agent gets ALL of this

> Report **FINDINGS ONLY** — no file dumps, no summaries of what the code does.
> Every finding: **file:line**, **severity** (CRITICAL/HIGH/MEDIUM/LOW), and **why it matters**.
> Be adversarial. Assume temporary protections are removed.
> Return a numbered list ordered by severity.
> Also return a **"verified clean"** list — the things you checked that are genuinely fine, so coverage is provable.
> Also return **"not covered"** — what you did NOT read, so the gap is visible.

Without the findings-only rule you get essays. Without "verified clean" you can't tell thoroughness from laziness. Without "not covered" you get false confidence — **the biggest defect is usually in the file nobody opened.**

## Synthesis — your job after the agents return

1. **Deduplicate.** The same defect will surface under several lenses; merge, keep the sharpest citation.
2. **Severity-order** across all lenses, not within each.
3. **Write ONE checklist** to a doc (`REMEDIATION_CHECKLIST.md` or similar): each item = what, where (file:line), why, and a checkbox. This is what the owner operates against.
4. **State coverage explicitly** — what was audited, and what was NOT.
5. **Lead with the finding that reframes everything**, if there is one. There usually is.
6. **Do not start fixing.** Present the list; let the owner direct. Fixing while auditing loses the map.

## Anti-patterns

- Serial file-by-file checking in response to "find the bugs." (Today's lesson.)
- Agents with overlapping scopes → duplicate findings, false coverage.
- Accepting an agent's summary of code instead of demanding findings.
- Skipping the "not covered" section — that's where the real bug is.
- Auditing only the diff. **Ask "did this change create a new entrance?"** — new routes, new static assets, new bypass paths. Diff-scoped reviews miss these by construction.
- Trusting an agent to audit its own output.
