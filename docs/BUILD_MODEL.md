# BUILD_MODEL — how builds run in this repo

> **Landed 2026-07-19 (Item 1 first act, Kimi orchestrating).** This is the operating model for agent-run builds in this repo.

This is the operating model for agent-run builds. It does **not** restate the engineering philosophy — [`docs/THE_LOOP.md`](THE_LOOP.md) is the thesis (the verifier is the bottleneck), [`CLAUDE.md`](../CLAUDE.md) is the standing law, and the skills (`quality-slice`, `deep-audit`, `false-confidence-audit`, `overnight-run`) are the deep procedures. This doc is the *shape* those run in: **swarm as the muscle, the loop as the spine, the gates as the nervous system.**

The failure this model exists to prevent is two, learned the hard way: (a) generating faster than you can verify — a slop factory; and (b) more than one hand on the tree with no single owner — the collision that produces stale bases, duplicated ADR numbers, and dirty merge lanes.

---

## 0. The one rule above the others — single orchestrator of record

**One orchestrator owns a build at a time. The repo is the single source of truth for build state. No second agent writes to the tree the owning orchestrator holds.**

- The orchestrator holds the build + design doc, decomposes it into slices, and owns state: `WORKLOG.md` (history), `ROADMAP.md` (status), `docs/STATE_OF_TRUTH.md` (verified state), `docs/DECISIONS.md` (irreversible calls). Status never lives only in chat.
- **Cross-tool / cross-session handoffs are explicit.** The outgoing orchestrator states: *"merged; `main` is at `<sha>`; working tree clean; migrations at `<n>`."* The incoming orchestrator **verifies that before touching anything** (`git status`, `git log`, the migration list) — never assumes "the merge is done."
- A second agent may **read** freely (audits, syntheses, design passes are read-only and safe to run in parallel with anything). It may not **write** to the owned tree. If a second agent must produce a file mid-flight, it writes to a scratch/outputs location and hands it over for the orchestrator to land.
- *Scar:* three orchestrators on one repo in one session produced a triple-booked ADR-021, a dirty `DECISIONS.md` sitting in the merge lane, and a `main` that was a stale snapshot while the real work lived on a feature branch. None of it was intra-swarm concurrency; all of it was missing this rule.

### 0a. The PM/advisor rule — don't interject; trust the borders

**The system was built so it does not need watching. An advisor who narrates over live work is adding noise, not oversight.**

- **Do:** verify *state* before anyone acts on it (`git status`, the sha, the endpoint, the migration list); attach a **falsifiable condition** to any ruling or accepted limitation; set requirements **before** a phase opens. These are cheap and they have repeatedly caught real defects.
- **Don't:** interrupt a running slice to re-assert a guardrail that is already running, ask an agent to re-prove a guard that was proven red-first, or hand over a prompt for work already in flight. Read the report; check its claims; then respond.
- If something genuinely *missing* is spotted mid-flight, raise it to the owner as an observation — not as a prompt to paste. A missing guard is worth an interruption. "The guard exists and I'd feel better if it proved itself again" is not.
- *Scar (2026-07-19):* of roughly eight mid-flight interruptions in one session, two changed an outcome; the rest restated what the gates already enforced or told an agent to do what it was already doing. In the same session the advisor's two substantive technical proposals — a relevance floor, and a data-driven corpus boundary — would each have **broken a standing guarantee** (≥2-voices, and the ADR-023 register wall). Both were caught by *measurement*, not by the advisor's judgment. Weight advisory instinct accordingly: it is not reliably better than the gates, and twice it was worse.

---

## 1. The unit of work — the slice loop

The atomic unit is **one vertical slice**, run as a full loop that ends in a check that could have failed:

1. **Plan.** Smallest honest slice; name the falsifiable check first. **Owner sign-off is mandatory before implementing if the slice touches the data model, auth, retrieval, or the output contract** (CLAUDE.md value #2). Otherwise proceed.
2. **Build** — one coder agent, in an **isolated git worktree**, one writer per file.
3. **Gate** — `npm run audit` (typecheck ×3 · lint · knip · deps · tests+coverage · qa invariants · Gate B license) **plus** the slice-specific checks: retrieval changes → the held-out accuracy eval recorded in `WORKLOG.md`; AI-output changes → `interpretation_bait` through the **live** loop; any UI → loaded in a browser at **390px and desktop**, real interaction, no console errors. Watch a check go **red** on a broken input before trusting green. **For a doc slice** (no code), the falsifiable check is docs-vs-reality: every claim is verified against the tree/DB (the `STATE_OF_TRUTH` method) and spot-verified by a fresh reader — a claim that can't be checked against reality doesn't belong in the doc.
4. **Independent audit** — a **fresh agent that did not write the slice** reviews it (`/audit`, and `/security` on data/auth). Fixer ≠ verifier.
5. **Merge** — only when green. Orchestrator integrates serially.
6. **Record** — `WORKLOG.md` entry (what/found/next), `ROADMAP.md` status, `DECISIONS.md` for any irreversible call. **STOP at the definition of done.**

No slice is "done" on "it typechecks." A screenshot is not optional. Nothing merges red.

---

## 2. Lanes — parallel slices, disjoint by construction

- **2–3 slices run in parallel only when they are file-disjoint**, each in its own worktree. If two slices touch the same file, they are one slice or they are serialized.
- **Retrieval core, schema/migrations, and the byte-synced `src/`↔`web/` integrity core stay single-lane.** These are the highest-collision, highest-consequence surfaces; never parallelize them.
- The orchestrator owns **merge order** and integrates serially — never two branches merging into the owned tree at once.
- Migrations are **owner-run**: agents author the SQL + its red-first test; the owner applies it (dev first), then confirms.

---

## 3. Swarm inside the slice — where the fan-out is real

When a slice contains **N independent units**, that is where parallel agents earn their keep:

- **Ingestion** — one agent per work (adapter → license/provenance gate → text-match → staged digest → escalate). Autonomy tiers per `INGESTION_HARNESS_DESIGN.md`; **publish stays a hard human gate.**
- **Audits** — `deep-audit`: 4–8 agents on non-overlapping lenses; no agent audits its own output; one deduplicated, severity-ordered, coverage-tagged report.
- **Evals** — parallel per-stratum analysis of held-out misses, failure-coded.
- **Doc / migration sweeps** — independent files, independent checks.

**Sizing: batches of 5–8 concurrent agents, not 50.** The swarm is sized to what the **verifier and the quota can actually feed** — 50 streams of code you can't gate at 50× is the slop factory, not a build system. Concurrency-capped; results funnel back through **one gate**. Prove deep before wide (CLAUDE.md value #3).

---

## 4. Hard rails (inherited, non-negotiable)

- **Nothing merges red.** The gate in §1.3 is the merge condition.
- **Publish / prod is a human gate.** Deploy is the eyes-open, owner-run cutover: `deploy.sh` (clean-tree gate first) → prod migrations in order → re-ingest — **never a git push, never a Neon branch-promote** (it wipes live user data). Real prod is the `web` Vercel project, git-disconnected by necessity; **committed ≠ live** — verify in the environment the change protects.
- **Owner decision points stay the owner's** — data model, auth, retrieval, the contract, and any accuracy-bar call.
- **The concordance guarantee holds through every build** — never interpret in the product's voice, never emit unverified model text, never ship a pipeline below the accuracy bar, never store copyrighted full text.
- **Secrets server-only, never in output or prompts.**

---

## 5. Why not 50 agents on 50 builds

Because this repo's own laws forbid it: the verifier is the bottleneck (THE_LOOP), the `src/`↔`web/` byte-sync guard makes wide parallelism collide on mirrored files, the quota window can't feed dozens of concurrent long-horizon agents, and "prove deep before wide" is a stated value. The swarm's power is real on *embarrassingly parallel, independent* units inside a gated slice — not on the critical path, which stays a single, verified line.

---

*Operate along this doc plus `CLAUDE.md`. It is a shared playbook: any orchestrator — Claude, or another agent runtime — runs the same loop, the same lanes, the same gates, under the same single-owner rule.*
