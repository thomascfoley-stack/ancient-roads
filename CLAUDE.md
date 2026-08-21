# CLAUDE.md — standing rules for this repo

Auto-loaded every session. These rules are enforced by `/audit` and CI. Read [`docs/ENGINEERING.md`](docs/ENGINEERING.md) for the full handbook; this file is the always-on subset you must follow.

## Session start — before you touch anything

@AGENTS.md
@docs/pm/MASTER.md

**Do not remove the two imports above.** Claude Code reads `CLAUDE.md`, *not* `AGENTS.md` — that
import is the only reason the routing file loads at all. The second is the programme sheet: the
plan and the gate board.

Having loaded them, **state the lane, the gate you are on, and the one next action** before making
any change. Numbers and system state come from `docs/STATE_OF_TRUTH.md` and are re-measured, never
quoted from a narrative or from memory — including the narrative in this file.

## The product guarantee (never violate)

Ancient Paths is a **concordance, not a commentator.** It reports what others have said — quoted and attributed — and **never interprets Scripture, never gives a verdict, never fabricates.** The guarantee is *architectural*: retrieval over a licensed corpus → a JSON output contract → a verifier that rejects violations **before render**. Every rule below protects this. See [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) (I1–I6/C1/G1).

## The two quality axes — both are gates, measure both

1. **Faithfulness** — never interpret/fabricate, always attribute, ≥2–3 grounded voices, and every displayed passage grounded in a cited voice's anchor or the query itself (the `passages_grounded` screen, §2 2026-07-13). Measured by the `interpretation_bait` suite through the **live** compose→verify loop: **100/100 observed, 0 breaches** (2026-08-15, suite tripled with 65 new attack vectors) — which is a **95% lower confidence bound of ≈97%** (rule of three on n=100), **NOT** the "≥99%" this gate names. Claiming ≥99% needs ~300 clean cases of comparable adversarial quality — new vectors, never rephrasings. **Every pre-2026-08-15 "35/35" is void**: until that date `bait-run.mts` never called `teach()` — it re-implemented the teacher with its own model literal, `MAX_RETRIES=1` (production: 2) and raw retrieval SQL carrying **no legal-corpus filter**, so the gate composed over rows production would never serve. Rewritten onto `teach()`, welded shut by `web/test/invariants/bait-harness-uses-shipped-pipeline.test.ts`, then run clean at n=35 and again at n=100 against production. [Ticket](docs/pm/orders/2026-08-15-bait-harness-parallel-pipeline.md) · [n=100 run](docs/evidence/ask-latency/bait-100-run-2026-08-15.md).
2. **Accuracy** — the retrieved sources are the *right* ones ("good shepherd" → John 10, not Luke 2). Measured per category on frozen held-out sets. Current (2026-07-18, the option-(c) lane config — exegetical pool = verse-commentary + fathers; sermons/theology in labeled lanes; WORKLOG 2026-07-18): **honest v3 baseline** (v3 is now a **dev set** — measured against repeatedly, never gate on it) verse-ref 95/95 · pericope 87/100 · epistle 68/80 · topical 45/75 · proper-noun 60/90 · controls clean; **frozen v4** (hash `90de5dc3`, bars pre-registered before the run, run ONCE, no tuning) verse-ref 100/100 · pericope 80/100 · epistle 96/100 · topical 80/90 · proper-noun 60/100 · controls clean · no-content 0/110 — **clears every pre-registered bar EXCEPT proper-noun HIT@1 60 < 70** — which is **n=10** (6 of 10 against 7 of 10: one query, 95% CI ≈ 31–83%, all 4 misses HIT@2-pass). **This is RULED and CLOSED — [ADR-028](docs/DECISIONS.md): accepted for gated beta, blocking for public launch, pending a re-measure at larger n. Do not re-derive it, do not re-open it, do not restate its status anywhere but ADR-028.** (Corrected 2026-08-21: this line used to advertise it as an owner decision still to be made, which cost a session an hour.) **The small-n caution still applies:** topical 90 and pericope 80 are point estimates whose 95% CIs straddle their bars — "clears" means point-estimate-clears, not proven-above; v4's KJV-phrase-anchored labels make the doctrinal strata easier than v3's abstract queries (the abstract-topical failure mode is not exercised); and v4 samples no Song of Solomon, so no-content 0/110 does not clear the known SoS hole. See `docs/HELDOUT_EVAL_DESIGN.md` §v4 + WORKLOG 2026-07-18. Re-run the eval on every retrieval change and record it in `WORKLOG.md`.

**Never ship, cache, or curate answers from a pipeline below the accuracy bar** — caching a wrong answer serves it instantly to everyone. Re-run the accuracy diagnostic on every retrieval change (corpus / hybrid / reranker) and record the number in `WORKLOG.md`.

**For ANY retrieval-quality, eval, corpus, or ingestion slice, follow the `quality-slice` skill** ([`.claude/skills/quality-slice/SKILL.md`](.claude/skills/quality-slice/SKILL.md)) — the standing methodology: diagnose-before-fix, measure-before-build, failure-code the misses, held-out discipline (never tune to the test; ship on a fresh vN), pre-registered bars, no-overfit/circularity, verify-the-label-not-just-the-system, test-the-real-code-path. Ingestion automation follows [`docs/INGESTION_HARNESS_DESIGN.md`](docs/INGESTION_HARNESS_DESIGN.md) (per-work digest, auto-decide/escalate, publish = hard human gate). These are enforced, not optional.

**Before ANY production deploy, and after ANY long autonomous agent run, run the `deep-audit` skill** ([`.claude/skills/deep-audit/SKILL.md`](.claude/skills/deep-audit/SKILL.md)) — a parallel 4–8 agent sweep across non-overlapping lenses (attack surface · data layer · AI pipeline · domain invariants · docs-vs-reality · dependencies · client · ops). **Never answer "find the bugs / is this safe" by reading a few files serially** — that reliably misses the biggest defects. An agent may not audit its own output.

## Working protocol (how you and the PM stay in sync)

- **The repo is the shared channel. Do not leave status or recommendations only in chat.** After any unit of work, write what you did, what you found, and what you recommend next into `WORKLOG.md`; update `ROADMAP.md` status; log irreversible/architectural calls in `docs/DECISIONS.md`.
- **The source of truth for status is `ROADMAP.md`, for history/rationale `WORKLOG.md`, for process `docs/ENGINEERING.md`, and for the current VERIFIED system state (numbers/corpus/gates/open gaps, checked against prod) `docs/STATE_OF_TRUTH.md`.** Keep them current — reconcile docs to the actual tree, never to memory.
- **Commit per logical change and push.** Never leave a large uncommitted working tree; the live site must not run ahead of git history with no backup.
- **Only one agent session per working tree at a time — a second session must be read-only AND write-free, or work in a separate clone.** Any write by a second session blocks the first's deploy: `deploy.sh` gates on a clean tree and cannot tell whose file it is. See `AGENTS.md` ground rules.

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
- **Pre-signup gate — clear before anyone but the owner uses the teacher:** V2 summary-faithfulness · rate-limit `/api/ask` · `createPgStore` `rejectUnauthorized` guard · `interpretation_bait` clean through the live loop (currently 100/100 = 0 breaches, a **~97% lower bound** — n=100, 2026-08-15, shipped pipeline; the **≥99% bar needs ~300 clean cases** of new vectors, not rephrasings). SEC-1 (auth-beta CVEs) gates *public* launch.
- Run `/security` on any change to auth, API routes, DB access, or uploads.

## Data & licensing (existential)

Ingest **only** public-domain or commercially-permissive (CC BY / CC BY-SA) content; store a per-work provenance + license record. **Never store the full text of copyrighted translations** (ESV/NIV/NASB/NLT/CSB) — display-only via a licensed API. Never scrape ToS-protected aggregators (BibleHub/StudyLight). Primary sources: SWORD/CrossWire, Wikisource, archive.org, STEP Bible. See `DATA_SOURCES.md`.

## The gate — nothing merges red

Before a PR: `npm run audit` (typecheck strict · lint · knip · `pnpm audit` high/critical · tests+coverage · web typecheck+lint). On demand: `/audit` (adversarial slop review), `/security` (authz/RLS/secrets). CI enforces the gate on every PR/push.

**Definition of Done (strict):** built AND tested AND passes `/audit` AND (data paths) RLS-enforced in prod AND (AI features) `interpretation_bait` clean through the **live** loop (100/100 = 0 breaches is a **~97% lower bound** — n=100, 2026-08-15, shipped pipeline; the ≥99% bar it names needs **~300 clean cases** of new vectors; never claim a bound without its n) AND (retrieval changes) accuracy diagnostic recorded AND (any UI/client change) **actually loaded in a browser at 390px AND desktop width — looked at, no horizontal overflow/overlap, no console errors, a real interaction exercised** (a screenshot is not optional; "typechecks" is not "runs"). Anything short is Partial/Missing.

## Never

- Print a secret value, or store copyrighted full text.
- Merge red, or leave a large uncommitted tree.
- Emit unverified model text to a user.
- Cache/curate/ship answers from a pipeline below the accuracy bar.
- Interpret Scripture in the product's own voice.

## UX remediation work

Active spec: [`docs/UX_REMEDIATION.md`](docs/UX_REMEDIATION.md). When working any block from it:

- Work **one block at a time**, on a branch named `fix/<block-id>`. Do not batch blocks.
- **Write the exit test before the fix.** If it fails, change the fix — never the test. If a test
  is genuinely wrong, stop and flag it in that block's Findings log.
- Stay inside "Minimal change". Escalate reluctantly: string → CSS declaration → moving existing
  code → new component. Do not skip levels.
- Obey the block's "Do NOT" list. Those are the guardrails that keep this remediation small; a
  change that violates one should be reverted even if it works.
- **Stop and report** if a minimal change needs more than ~3 files or ~50 lines, if a "reuse the
  existing X" instruction turns out to be false, if the fix needs a route/schema/API contract
  change, or if the root cause differs materially from the block's hypothesis. Do not expand scope
  to force a fix through.
- **Scope creep goes to section 9 (Backlog), not into the branch.** (Section 8 is Wave 5 — the
  numbering moved in spec v1.2 and the original of this snippet said 8. If a document you are
  reading says "section 8 (Backlog)", it predates that renumber.)
- No new dependencies without writing the justification into the Findings log first.
- Only mark `AGENT` exit checks yourself. `BROWSER` needs a rendered page, `HUMAN` needs a
  person's judgement, `DEVICE` needs real hardware. **Never mark the last two.**
- Update the status board in section 1 when a block's state changes.
- Waves are ordered. Do not start a wave until the previous one's blocks all pass their `AGENT`
  checks and their `HUMAN`/`DEVICE` checks are passed or explicitly deferred.

Naming is locked in section 2 — do not re-litigate it. The counted noun changed from `works` to
`items` everywhere. Section 2.2 (amended v1.4) scopes the lock to **user-visible strings only**;
wire fields such as `lanes` on `POST /api/ask/stream` are exempt.
