# CLAUDE.md — standing rules for this repo

Auto-loaded every session. These rules are enforced by `/audit` and CI. Read [`docs/ENGINEERING.md`](docs/ENGINEERING.md) for the full handbook; this file is the always-on subset you must follow.

## The product guarantee (never violate)

Ancient Paths is a **concordance, not a commentator.** It reports what others have said — quoted and attributed — and **never interprets Scripture, never gives a verdict, never fabricates.** The guarantee is *architectural*: retrieval over a licensed corpus → a JSON output contract → a verifier that rejects violations **before render**. Every rule below protects this. See [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) (I1–I6/C1/G1).

## The two quality axes — both are gates, measure both

1. **Faithfulness** — never interpret/fabricate, always attribute, ≥2–3 grounded voices, and every displayed passage grounded in a cited voice's anchor or the query itself (the `passages_grounded` screen, §2 2026-07-13). Measured by the `interpretation_bait` suite through the **live** compose→verify loop: **35/35 observed, 0 breaches** — which is a **95% lower confidence bound of ≈92%** (rule of three on n=35), **NOT** the "≥99%" a 35-case fixture can arithmetically support. Claiming ≥99% needs ~300 clean cases, not another re-run of 35.
2. **Accuracy** — the retrieved sources are the *right* ones ("good shepherd" → John 10, not Luke 2). Measured by the frozen held-out eval (v3), **per category.** Last (2026-07-14, re-measured on the shipped un-starved pool — `docs/PHASE_A_CLOSE.md` §5, supersedes ADR-018): verse-ref HIT@1 95 / HIT@2 98 · pericope 87 / 100 · proper-noun 80 / 90 · **epistle HIT@2 88** (n=25) · **topical HIT@2 70** (n=20) · control clean. **Topical is 70 — NOT an improvement: the earlier 75 was a 5-doc-pool artifact; filling the pool to 20 surfaced the honest read.** **These n are too small to call either category "below 85": topical's 95% CI is [48, 86] and epistle's is [70, 96] — 85 sits INSIDE both.** So the 85/85 gate is currently **unmeasurable, not failed** — the honest next step is a larger v4 (n≈100 per stratum) or a gate that needs no label at all (≥2 distinct grounded voices per answer, the actual product promise); see WORKLOG §7. Re-run the eval on every retrieval change and record it in `WORKLOG.md`.

**Never ship, cache, or curate answers from a pipeline below the accuracy bar** — caching a wrong answer serves it instantly to everyone. Re-run the accuracy diagnostic on every retrieval change (corpus / hybrid / reranker) and record the number in `WORKLOG.md`.

**For ANY retrieval-quality, eval, corpus, or ingestion slice, follow the `quality-slice` skill** ([`.claude/skills/quality-slice/SKILL.md`](.claude/skills/quality-slice/SKILL.md)) — the standing methodology: diagnose-before-fix, measure-before-build, failure-code the misses, held-out discipline (never tune to the test; ship on a fresh vN), pre-registered bars, no-overfit/circularity, verify-the-label-not-just-the-system, test-the-real-code-path. Ingestion automation follows [`docs/INGESTION_HARNESS_DESIGN.md`](docs/INGESTION_HARNESS_DESIGN.md) (per-work digest, auto-decide/escalate, publish = hard human gate). These are enforced, not optional.

**Before ANY production deploy, and after ANY long autonomous agent run, run the `deep-audit` skill** ([`.claude/skills/deep-audit/SKILL.md`](.claude/skills/deep-audit/SKILL.md)) — a parallel 4–8 agent sweep across non-overlapping lenses (attack surface · data layer · AI pipeline · domain invariants · docs-vs-reality · dependencies · client · ops). **Never answer "find the bugs / is this safe" by reading a few files serially** — that reliably misses the biggest defects. An agent may not audit its own output.

## Working protocol (how you and the PM stay in sync)

- **The repo is the shared channel. Do not leave status or recommendations only in chat.** After any unit of work, write what you did, what you found, and what you recommend next into `WORKLOG.md`; update `ROADMAP.md` status; log irreversible/architectural calls in `docs/DECISIONS.md`.
- **The source of truth for status is `ROADMAP.md`, for history/rationale `WORKLOG.md`, for process `docs/ENGINEERING.md`, and for the current VERIFIED system state (numbers/corpus/gates/open gaps, checked against prod) `docs/STATE_OF_TRUTH.md`.** Keep them current — reconcile docs to the actual tree, never to memory.
- **Commit per logical change and push.** Never leave a large uncommitted working tree; the live site must not run ahead of git history with no backup.

## Engineering values

1. **Verify, don't assume.** Check the number, read the diff, run the query. A green check is not proof. **This is the whole practice — [`docs/THE_LOOP.md`](docs/THE_LOOP.md) is the standing definition: the verifier is the bottleneck; no unit of work is "done" without a check that could have failed. Read it; the `quality-slice` / `false-confidence-audit` / `deep-audit` / `overnight-run` skills are its deep procedures.**
2. **Design before code.** For anything touching data model, auth, retrieval, or the contract: write a short design doc (smallest slice, interfaces, scaling risks named, out-of-scope) and get approval before implementing.
3. **Prove deep before wide.** One correct vertical slice over five half-features. Every mode is the same engine in a new UX.
4. **Boring, obvious code.** No premature abstraction (inline until the 3rd real call site); no speculative generality.

## Coding standards (enforced)

- **Types:** TypeScript strict. **No `any`** — use `unknown` and narrow. Type all boundaries; validate external input at the edge (schema-parse, don't trust).
- **Structure:** narrow module interfaces; no reaching into another module's internals.
- **Errors:** no empty `catch`, no silent failures. Fail fast in dev; typed/safe at API boundaries. **The verifier fails closed** — on any verifier error, fall back to raw retrieval; never emit unverified model text.
- **Data:** every filtered/joined query path has its index; **never return unbounded result sets** (paginate/`LIMIT`); no N+1; keep embeddings/LLM calls **off the request path**.
- **Secrets:** server-only; never logged; **never printed in output**; never placed in prompts.
- **Sync guards:** code duplicated across `src/` ↔ `web/` must be **byte-identical**, enforced two ways — `test/web-core-sync.test.ts` (the integrity core: verifier, contract, teacher prompt) and `test/bible-sync.test.ts` (all of `src/bible/` ↔ `web/src/bible/`: `ref-parse`, `pericopes`, `verse-id`, aliases — same file set AND byte-identical). If you change one copy, copy it to the other or the guard test goes red — that's intended.

## Security

- RLS is the data-isolation boundary. Verify it with two accounts, not by reading policy. The app connects as least-privilege `app_runtime` (not owner). See [`docs/SECURITY.md`](docs/SECURITY.md).
- **Pre-signup gate — clear before anyone but the owner uses the teacher:** V2 summary-faithfulness · rate-limit `/api/ask` · `createPgStore` `rejectUnauthorized` guard · `interpretation_bait` clean through the live loop (currently 35/35 = 0 breaches, a **~92% lower bound**; the **≥99% bar needs ~300 clean cases**, not another run of 35). SEC-1 (auth-beta CVEs) gates *public* launch.
- Run `/security` on any change to auth, API routes, DB access, or uploads.

## Data & licensing (existential)

Ingest **only** public-domain or commercially-permissive (CC BY / CC BY-SA) content; store a per-work provenance + license record. **Never store the full text of copyrighted translations** (ESV/NIV/NASB/NLT/CSB) — display-only via a licensed API. Never scrape ToS-protected aggregators (BibleHub/StudyLight). Primary sources: SWORD/CrossWire, Wikisource, archive.org, STEP Bible. See `DATA_SOURCES.md`.

## The gate — nothing merges red

Before a PR: `npm run audit` (typecheck strict · lint · knip · `pnpm audit` high/critical · tests+coverage · web typecheck+lint). On demand: `/audit` (adversarial slop review), `/security` (authz/RLS/secrets). CI enforces the gate on every PR/push.

**Definition of Done (strict):** built AND tested AND passes `/audit` AND (data paths) RLS-enforced in prod AND (AI features) `interpretation_bait` clean through the **live** loop (35/35 = 0 breaches is a **~92% lower bound** — the ≥99% bar it names needs **~300 clean cases**, not a re-run of 35; never claim ≥99% off n=35) AND (retrieval changes) accuracy diagnostic recorded AND (any UI/client change) **actually loaded in a browser at 390px AND desktop width — looked at, no horizontal overflow/overlap, no console errors, a real interaction exercised** (a screenshot is not optional; "typechecks" is not "runs"). Anything short is Partial/Missing.

## Never

- Print a secret value, or store copyrighted full text.
- Merge red, or leave a large uncommitted tree.
- Emit unverified model text to a user.
- Cache/curate/ship answers from a pipeline below the accuracy bar.
- Interpret Scripture in the product's own voice.
