# CLAUDE.md — standing rules for this repo

Auto-loaded every session. These rules are enforced by `/audit` and CI. Read [`docs/ENGINEERING.md`](docs/ENGINEERING.md) for the full handbook; this file is the always-on subset you must follow.

## The product guarantee (never violate)

Ancient Paths is a **concordance, not a commentator.** It reports what others have said — quoted and attributed — and **never interprets Scripture, never gives a verdict, never fabricates.** The guarantee is *architectural*: retrieval over a licensed corpus → a JSON output contract → a verifier that rejects violations **before render**. Every rule below protects this. See [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) (I1–I6/C1/G1).

## The two quality axes — both are gates, measure both

1. **Faithfulness** — never interpret/fabricate, always attribute, ≥2–3 grounded voices. Proven by the `interpretation_bait` suite through the **live** compose→verify loop at **≥99%**.
2. **Accuracy** — the retrieved sources are the *right* ones ("good shepherd" → John 10, not Luke 2). Proven by the true-success-rate diagnostic. **Retrieval accuracy is now 10/10** (full corpus embedded 2026-07-09 — 168k sources / 66 books; the old ~4/10 was Gospels-only coverage). The remaining limiter is **compose/verify reliability** (~9/10, verifier fail-closes non-verbatim quotes to a safe fallback — a faithfulness-axis issue, not retrieval). Re-run the eval on every retrieval change and record the number in `WORKLOG.md`.

**Never ship, cache, or curate answers from a pipeline below the accuracy bar** — caching a wrong answer serves it instantly to everyone. Re-run the accuracy diagnostic on every retrieval change (corpus / hybrid / reranker) and record the number in `WORKLOG.md`.

## Working protocol (how you and the PM stay in sync)

- **The repo is the shared channel. Do not leave status or recommendations only in chat.** After any unit of work, write what you did, what you found, and what you recommend next into `WORKLOG.md`; update `ROADMAP.md` status; log irreversible/architectural calls in `docs/DECISIONS.md`.
- **The source of truth for status is `ROADMAP.md`, for history/rationale `WORKLOG.md`, for process `docs/ENGINEERING.md`.** Keep them current — reconcile docs to the actual tree, never to memory.
- **Commit per logical change and push.** Never leave a large uncommitted working tree; the live site must not run ahead of git history with no backup.

## Engineering values

1. **Verify, don't assume.** Check the number, read the diff, run the query. A green check is not proof.
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
- **Pre-signup gate — clear before anyone but the owner uses the teacher:** V2 summary-faithfulness · rate-limit `/api/ask` · `createPgStore` `rejectUnauthorized` guard · bait re-run at ≥99%. SEC-1 (auth-beta CVEs) gates *public* launch.
- Run `/security` on any change to auth, API routes, DB access, or uploads.

## Data & licensing (existential)

Ingest **only** public-domain or commercially-permissive (CC BY / CC BY-SA) content; store a per-work provenance + license record. **Never store the full text of copyrighted translations** (ESV/NIV/NASB/NLT/CSB) — display-only via a licensed API. Never scrape ToS-protected aggregators (BibleHub/StudyLight). Primary sources: SWORD/CrossWire, Wikisource, archive.org, STEP Bible. See `DATA_SOURCES.md`.

## The gate — nothing merges red

Before a PR: `npm run audit` (typecheck strict · lint · knip · `pnpm audit` high/critical · tests+coverage · web typecheck+lint). On demand: `/audit` (adversarial slop review), `/security` (authz/RLS/secrets). CI enforces the gate on every PR/push.

**Definition of Done (strict):** built AND tested AND passes `/audit` AND (data paths) RLS-enforced in prod AND (AI features) passes `interpretation_bait` ≥99% AND (retrieval changes) accuracy diagnostic recorded. Anything short is Partial/Missing.

## Never

- Print a secret value, or store copyrighted full text.
- Merge red, or leave a large uncommitted tree.
- Emit unverified model text to a user.
- Cache/curate/ship answers from a pipeline below the accuracy bar.
- Interpret Scripture in the product's own voice.
