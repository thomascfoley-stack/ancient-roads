# WORK ORDER — Kimi as backlog runner

> **Approved by owner 2026-07-19. Kimi is orchestrator of record for `main` (baton verified @ `821689c`).**

## 0. What this is

You (Kimi) are taking over as the build orchestrator to run down the outstanding backlog: a doc-hygiene sweep, then the ingestion + corpus run, then Phase B, then everything still open — under the repo's own engineering discipline. You run the **loop with lanes** and swarm *inside* slices (5–8 agents, not 50), gated by the repo's checks. Nothing here overrides `CLAUDE.md`.

## 1. Baton — verify before you touch anything (§0 of BUILD_MODEL)

Handoff state as of this order:
- `main` @ `821689c`, working tree **clean**.
- Reader build stopped cleanly. **Phase 1 (annotation engine + Logos highlighter) lives on the `reader` branch (5 commits ahead of main, unmerged).** Do **not** modify the reader's web/ files; leave the `reader` branch alone. Your work is file-disjoint from it.
- Reader **Phase 2 is blocked on the corpus** — its inventory found no published work has `sections` rows. Your ingestion run (item 4) is what unblocks it.
- Migrations on `main` top out at **023**. The `reader` branch reserves **024** for `unit_ordinal` (ADR-026). **Start your corpus migrations at 025+** to avoid a numbering collision.

**Your first action:** verify the above yourself — `git status` (clean), `git rev-parse --short HEAD` (= `821689c`), `git worktree list`, the migration list. Never assume. If any of it doesn't match, STOP and report.

## 2. Operating context — read first

Read `docs/PORTABILITY.md` first (it's your adapter: the dialect map, env, toolchain traps, repo-shape facts). It points you to `CLAUDE.md`, `docs/THE_LOOP.md`, `docs/BUILD_MODEL.md`, `docs/STATE_OF_TRUTH.md`, `docs/DECISIONS.md`. Operate along `BUILD_MODEL.md`.

Key reminders from `PORTABILITY.md` you will otherwise get wrong: **pnpm not npm** (`corepack pnpm install` wires the git hooks); `/audit` = `pnpm run audit`; skills are markdown you *read and follow*, not invoke; DB/eval checks silently no-op without secrets — report **UNVERIFIED**, never **PASSED**, for anything you couldn't run; and **the copyrighted/sample content in the corpus is owner-accepted test data — do NOT flag it, do NOT remove it, do NOT raise it as a licensing risk.**

## 3. The ordered backlog

Run these in order; each item is a full loop (plan → build in isolation → gate → fresh checker ≠ author → integrate → WORKLOG → STOP).

**Item 0 — Pressure-test the operating docs, return feedback (do this before executing anything else).**
Read `BUILD_MODEL.md` and `PORTABILITY.md` (in the owner's outputs; the owner will provide them). Stress-test them against reality: is the loop runnable by your swarm as written? Are the dialect map and env list complete and correct for your runtime? Is anything ambiguous or missing? **Return a findings list to the owner. Do not rewrite them unilaterally** — they are the canonical playbook; propose edits, the owner/orchestrator folds them in.

**Item 1 — Doc-hygiene sweep (proves the handoff on low-stakes work first).**
Land `BUILD_MODEL.md` + `PORTABILITY.md` into `docs/` (committed), then the validated punch-list: rewrite the stale README (names none of web/db/ingest, still Supabase-flavored); a single env-var reference table (fix `web/.env.local.example`); an as-built schema doc generated FROM `db/migrations/` (SCHEMA.md is Supabase-era fiction); supersession banners on the Supabase-era docs (INFRA/SCHEMA/CORPUS/DESIGN_BRIEF); reconcile the bge-m3-vs-bge-large and ≥99%-vs-~92% contradictions to their ADRs; ops runbooks (rollback, TESTING/RELEASE/OBSERVABILITY, an ingestion operator runbook). Reference ADRs by title where practical so renumbers can't rot. (These are the owner's tasks #19–21.)

**Item 2 — Ingestion + corpus run (the load-bearing one; unblocks the reader).**
Run the declared queue in `ingest/sources.config.json` through the ingestion harness (`INGESTION_HARNESS_DESIGN.md`): one agent per work, adapter → license/provenance gate → text-match → **stage**. Then **slice works into `sections`** (the reader's fuel) with per-work reading-order calls — sermons chunk on structure, verse-anchored works are verse-ordered, poetry/hymns preserve lineation. Priorities: the works the reader needs first (a real vertical slice + a scale work), then breadth — poetry (12 declared), hymns (6), historians (staged, no served read path yet — stage them), the 63-vol Spurgeon set, Song of Solomon exegetical coverage (currently zero served rows). **Record the held-out accuracy re-measure in `WORKLOG.md` on every retrieval-affecting change** (CLAUDE.md rule). Migrations at 025+, owner-run/red-first. **PUBLISH STAYS A HARD HUMAN GATE** — you stage and produce a per-work digest; the owner publishes. Staging/dev-publishing to unblock your own build is allowed and must be logged loudly and reversibly.

**Item 3 — Phase B.**
Read `docs/WORKORDER_PHASE_B.md` for scope and execute it under the same loop. (If its premises are stale post-reconciliation, surface that first — don't run a work order against falsified numbers.)

**Item 4 — Everything outstanding.**
The open items on the ledger (below) and any remaining backlog, each as its own gated slice, until the owner calls stop or credits run out.

## 4. Rails (non-negotiable — BUILD_MODEL §4 + CLAUDE.md)

- **Nothing merges red.** The gate (`pnpm run audit` + slice-specific evals/bait/browser DoD) is the merge condition.
- **Publish and prod are human gates.** You never run `deploy.sh`, never push prod, never branch-promote. Part C (prod cutover) is the owner's.
- **Migrations are owner-run against shared DBs** by default; if you dev-apply to unblock (the reconciliation precedent), log it loudly, reversibly, and put it on the ledger for owner ratification.
- **One orchestrator owns the tree** — you, now. Reads (audits) may run parallel; no other writer. Hand back cleanly (sha + clean tree + branch/phase state + ledger).
- **The concordance guarantee holds** — never interpret in the product's voice, never emit unverified model text, never ship a pipeline below the accuracy bar.
- **Copyrighted/sample content is accepted** — not your call to remove or flag.

## 5. Owner-decision stop points (escalate, don't decide) — keep this ledger visible

Surface these to the owner; do not resolve them yourself:
- proper-noun HIT@1 60 vs the 70 bar (all misses HIT@2-pass) — accept / hold / re-measure?
- the v4.1 re-freeze scope (v4's disjointness overstated, zero Song of Solomon, verbatim-KJV task-easing).
- which works to **publish** (vs stage) — every publish.
- the biblehub deleted-rows backup — confirm it's on durable storage, not ephemeral `/tmp`.
- any new decision touching the data model, auth, retrieval, or the contract.

## 6. First move

Verify the baton (§1). Read the operating docs (§2). Return your Item-0 feedback on `BUILD_MODEL`/`PORTABILITY`. Then, on the owner's go, run Item 1 to its DoD before opening Item 2.
