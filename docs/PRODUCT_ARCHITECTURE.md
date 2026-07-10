# Ancient Paths — Product Architecture & Vision

> One captured source of truth for what this product is, the shape it takes, and the order it gets built. The vision is big on purpose; the build order is narrow on purpose. **Status lines below are point-in-time — `ROADMAP.md` is the current status of record.**

## What it is (one line)

A grounded study companion for pastors and laypeople: it surfaces what Scripture and the tradition actually say — with attribution — and never its own interpretation, then helps you study, write, and teach from it.

## The one principle everything sits on

**Concordance, not commentator.** (See `PRINCIPLES.md`.) Every mode below surfaces and attributes real sources; none interpret on the user's behalf. This constraint is what makes the product trustworthy, and it is machine-enforced by the contract + verifier. It applies to every feature in this document without exception.

## The engine (what already exists)

Everything in this product is the *same engine* wearing a different UX:

- **Retrieval** — semantic (embeddings + pgvector) and keyword (Postgres FTS) over the corpus. One pinned embedding model (BGE-large, 1024-dim, English).
- **The teacher** — retrieve → compose → verify → a grounded, attributed answer (or a dignified fallback). Built, secure, fail-closed, behind `/api/ask`. Compose on Qwen3.5-35B-A3B via DeepInfra; hybrid retrieval + reranker.
- **The corpus** — Scripture, commentary (~371k entries / ~168k embedded), sermons, historians, lexicon/word study. New content flows through the same source-adapter → embed → store pipeline, always with the same pinned model (migrating to the `sources`/`sections` model, ADR-010).

The quality of this engine is the ceiling for every mode below. A mode can only be as good as the retrieval underneath it.

## The three modes

### 1. Explore the Paths — grounded Q&A
The teacher. Stateless per turn (no memory, so no cross-turn drift). Ask a question, get attributed voices across traditions, or a dignified "here's what I found, read it directly" fallback. **Status: BUILT; retrieval accuracy at ~9/10 on the diagnostic (up from 4/10 baseline).**

### 2. Workspace Paths — study canvas + artifacts
Free-form spaces where you write (sermon prep, exegesis, notes) and pull in the voices to surface commentary, generate reading guides, and assemble sources into saveable, attributed **artifacts** you reuse.
- **Personal-first.** NOT shared/multi-user — a 10x complexity fork (real-time sync, presence, permissions) deferred until real users ask. The "channel" metaphor is misleading; this is a personal workspace.
- **Why it matters:** it *is* the real workflow of the target users — a pastor gathering commentary into a sermon draft, an M.Div student building an exegesis paper. Likely the highest-value mode to build after the teacher is proven.
- **Principle:** the agent surfaces sources; the user writes freely; nothing interprets for them.

**Status: DESIGN.**

### 3. Studies — structured, ongoing study programs
The home for structured Bible study plans and, later, sermon management.
- **Plan builder** (feeds this mode): conversational and *stateful* — asks book, number of weeks, daily amount, start date. The LLM **parses intent**; **code generates the schedule** (arithmetic — no hallucinated dates); grounded materials are attached. It must **not** compose devotional content in its own voice (principle line). Output = a Study.
- **Sermon management** (later): write, search, and upload your own sermons.
- **Composio integrations** (someday, ADR-011): push work out to the user's tools — calendar, Google Docs/Slides. Each is a new OAuth/permission surface, treated with auth-grade security.

**Status: DESIGN. Depends on the plan builder + integration work.**

### Underneath all three: Reader + Library
Scripture, commentary, sermons, historians, word study, and search — the content every mode draws on. **BUILT.**

## Explicitly deferred — premature-scope guardrails

Real someday-ideas that must NOT be built early ("wide before deep"):
- **Customizable parent-child hierarchy** (Studies > Sermons > …) → build flat first; add hierarchy only when usage demands.
- **"Integrate with all the tools"** via Composio → a platform, not a feature. Pick ONE integration when there's proven need, after the core works.
- **Shared / multi-user workspaces** → personal-first; collaboration only if users ask.
- **LoRA fine-tune (Fireworks)** → only after prompting plateaus AND you have a real failure dataset from usage.
- **Community / social features** → only after you have users.

## Content & rights (the non-technical blocker)
Public-domain content only (see `DATA_SOURCES.md` / `ACQUISITION_MANIFEST.md`); copyrighted translations are display-only via licensed API, never embedded. Decide what you're allowed to host **before** building the pipes.

## Pre-signup gate (before anyone but the owner uses the teacher)
V2 summary-faithfulness · rate-limit `/api/ask` · `rejectUnauthorized` guard · bait ≥99%. SEC-1 auth migration gates *public* launch.

## Sequencing — the discipline
1. **Prove the engine** — retrieval accuracy to 10/10 (near there: 9/10), then dogfood.
2. **Expand the corpus** — the full acquisition manifest (bible/commentary/sermon/historian) into `sources`/`sections`.
3. **Build one mode** — likely Workspace Paths — confirmed by dogfooding, not blind.
4. **Prove the engine deep before building modes wide.** Every mode is the same engine in a new UX; none is better than the retrieval underneath it.

## The rule
Capture the whole vision (this document). Build one proven thing at a time. The vision is allowed to be a platform; the next step is never allowed to be more than one validated feature.
