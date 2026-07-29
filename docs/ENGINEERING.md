# Engineering Handbook — Ancient Paths

The single "start here" for how this project is built, tested, shipped, and governed. Every other doc is linked from here. When something is ambiguous, this file points you to the doc of record; when a framework isn't its own doc yet, it's defined here.

> **Rule of the house:** the product's promise is *architectural, not trained* — retrieval over a licensed corpus → a JSON output contract → a verifier that rejects violations before render. Every standard below exists to protect that guarantee.

---

## 1. How to use this handbook

- **New to the repo?** Read §2 (what's built), §3 (doc map), §5 (standards), then the doc of record for whatever you're touching.
- **Building a feature?** Design-doc first (§6), then build to the standards (§5), gate it (§8), and update `ROADMAP.md` + `WORKLOG.md`.
- **Reviewing?** §8 gates + `/audit`; §9 for anything touching auth/data.
- **The source of truth for *status* is [`ROADMAP.md`](../ROADMAP.md); for *history/rationale* it's [`WORKLOG.md`](../WORKLOG.md).** This handbook is the source of truth for *process*.

## 2. What's built vs. scoped (pointer)

For current verified numbers, corpus counts, gates, and open gaps read **[`docs/STATE_OF_TRUTH.md`](STATE_OF_TRUTH.md)** — reconciled from evidence logs and read-only probes, not from this handbook's narrative. For status rows and priority direction see [`ROADMAP.md`](../ROADMAP.md).

## 3. Document map (pointer)

**Start here for docs of record:** [`README.md`](../README.md) § Documents of record and [`AGENTS.md`](../AGENTS.md) § Facts and records — binding order, task entry points, and where status/history live. This handbook covers *process* (§4 onward); it does not duplicate the index.

## 4. Engineering values

1. **Verify, don't assume.** Check the number, read the diff, run the query. This habit has caught a 51% data-loss, a fabricated quote, an RLS silent-empty trap, and a model-name typo — each invisible behind a green check.
2. **Design before code.** Interfaces and a plan before implementation, reviewed.
3. **Prove deep before wide.** One correct vertical slice beats five half-features. Every mode is the same engine in a new UX.
4. **The gate is the guarantee.** Nothing merges red. The verifier fails closed.
5. **Boring, obvious code.** No premature abstraction (inline until 3 call sites), no `any`, no dead code.

## 5. Engineering standards (the enforced rules)

These are enforced by `/audit` and CI and **belong in a root `CLAUDE.md`** (currently missing — create it; see §15):

- **Types:** TypeScript strict; no `any` (use `unknown` + narrow). Type all boundaries; validate external input at the edge.
- **Structure:** narrow module interfaces; no reaching into internals; no premature abstraction (extract at the 3rd real call site).
- **Errors:** no empty `catch`, no silent failures; fail fast in dev, typed/safe at API boundaries; the verifier fails **closed**.
- **Data:** every query path has its index; never return unbounded result sets (paginate/`LIMIT`); no N+1; expensive work (embeddings, LLM) off the request path.
- **Secrets:** server-only; never logged; never printed in output; never in prompts.
- **Sync guards:** code duplicated across `src/` ↔ `web/` (verifier, contract, prompt, ref-parse) is byte-identical and enforced by `test/web-core-sync.test.ts`.

## 6. Design-doc process (before building non-trivial work)

Google-style: write a short design doc first. It states the **smallest vertical slice**, the **interfaces/seams**, the **scaling risks named up front**, and **what's deliberately out of scope**. Reviewed and approved before implementation. Keep them in `docs/` (e.g. `AUTH_MIGRATION_SPIKE.md`, `DATA_SOURCES.md`, `SERMON_COMPANION.md` are examples). Small changes skip this; anything touching data model, auth, retrieval, or the contract does not.

## 7. Testing strategy (the pyramid)

Current tests live in `test/` and run via `vitest` in the `/audit` gate. Target shape:

| Layer | What it proves | Where | Status |
|---|---|---|---|
| **Unit** | Pure logic: parser, verifier reject paths, normalizer, checks | `test/*.test.ts` | Strong (`v1.ts` 100%) |
| **Contract** | Behavioral contracts with fakes (retrieval ranking/limit/hydration) | `test/retrieval.contract.test.ts` | Present (6/6) |
| **Integration** | Real DB/API path (gated behind `RUN_INTEGRATION`, no paid calls in CI) | `test/*.integration.test.ts` | Skipped by default |
| **Eval** | The product's *promise* — the interpretation-bait + diversity/format suites | `src/evals/`, `evals/cases/` | **Not run at its ≥99% bar through the live teacher — that bar needs ~300 clean cases; n=35 certifies only a ~92% lower bound** |
| **E2E / web** | User flows in `web/` | — | **Missing (biggest gap)** |

**Standards:** test behavior, not implementation; a bug fix ships with a failing-without-the-fix test; don't over-mock (tests exercise the real `verifyV1`). **Coverage:** measured (`vitest --coverage`, `all:true`) but **not yet gated** — set a threshold on the critical modules (`src/verifier`, `src/retrieval`, teacher) rather than a global %.

## 8. Quality gates & Definition of Done

**The gate** (`npm run audit`, enforced by `.github/workflows/audit.yml` on every PR/push — see [`AUDITING.md`](../AUDITING.md)): typecheck (strict) · lint · knip · `pnpm audit` (high/critical CVEs) · tests + coverage · (add: web typecheck+lint). On-demand: `/audit` (adversarial slop review), `/security` (authz/RLS/secrets).

**Definition of Done (strict, from ROADMAP):** built **AND** tested **AND** passes `/audit` **AND** (data paths) RLS-enforced in prod per SEC-2 **AND** (AI features) passes `interpretation_bait` in `PRINCIPLES.md`. Anything short is Partial/Missing.

## 9. Security process

`docs/SECURITY.md` is the record. **Pre-signup gate — clear before anyone but the owner uses the teacher:** (1) V2 summary-faithfulness, (2) rate-limit `/api/ask`, (3) `rejectUnauthorized` guard, plus (4) re-run bait through the current pipeline. SEC-1 (auth-beta CVEs) gates *public* launch. Run `/security` on any change to auth, API routes, DB access, or uploads. RLS is the data-isolation boundary; verify it with two accounts, not by reading policy.

## 10. QA / eval framework (the product-promise gate)

The eval suites in `evals/cases/` (`interpretation_bait`, `diversity`, `format`, `refusal_shape`) are how you prove the guarantee, not just that code runs. Two distinct quality axes, both required:

- **Faithfulness (guardrails):** never interpret, never fabricate, always attribute, ≥2–3 grounded voices. Measured by the bait suite through the live compose→verify loop: currently 35/35 clean = a **~92% lower bound** (rule of three, n=35); the **≥99%** bar needs ~300 clean cases. *Outstanding.*
- **Accuracy (relevance):** the retrieved sources are the *right* ones (the "good shepherd → John 10, not Luke 2" test). Measured by the **10-query true-success-rate diagnostic** — currently 4/10. This must become a **tracked regression metric**, re-run on every retrieval change (corpus/hybrid/reranker), with the number recorded in WORKLOG.

Release QA (manual, pre-deploy): sign-in→sign-out cycle, reader touch highlighting, a real `/ask` question on mobile, and the two-account RLS check.

## 11. Release & deploy process

`deploy.sh` builds locally then `vercel --prod`. Discipline: **stage first** (branch + verify as `app_runtime`) → deploy → smoke-test → keep a one-line rollback ready (clear the changed env var + redeploy). The `SITE_PASSWORD` gate (`lib/gate.ts`) is beta access control — set = beta-only, unset = public. *Formalize this as `docs/RELEASE.md` with a checklist + rollback runbook (gap).*

## 12. Observability (planned — currently zero)

**Biggest operational gap.** Before real traffic: error tracking (Sentry), product analytics + query logging (PostHog or equivalent — also feeds the topical-caching flywheel), slow-query alerting on Neon, and a minimal uptime check. You cannot run a multi-user product blind. *Create `docs/OBSERVABILITY.md`.*

## 13. Decision log (ADRs — to start)

Decisions currently live scattered in `WORKLOG.md`. Start a lightweight `docs/DECISIONS.md` (one short entry per irreversible/architectural call: *context → decision → why → alternatives rejected*). Backfill the big ones: clean-start over migrate-existing auth, Better-Auth over the beta, BSB over ESV (licensing), Qwen3.5 via DeepInfra, stateless-per-turn teacher, semantic-cache-on-top-of-retrieval.

## 14. Data, licensing & provenance

`DATA_SOURCES.md` is the acquisition plan. **Compliance rule baked into ingestion:** store a per-work provenance + license record; ingest only public-domain or commercially-permissive (CC BY / CC BY-SA) content; never store full text of copyrighted translations (ESV/NIV/etc.) — display-only via licensed API. This is an existential legal constraint, not a nicety.

## 15. Maturity checklist — what's missing to reach "engineering excellence"

Honest gaps, roughly by leverage:

- [ ] **`CLAUDE.md` doesn't exist** — the enforced coding standard is referenced by `/audit` but absent. Create it (§5). *High — cheap.*
- [ ] **`web/` is outside the gate** — no web tests, no web coverage, web typecheck/lint only partially wired. Your entire user-facing surface is unverified. *High.*
- [ ] **Observability = zero** — no error tracking, analytics, or alerting. Blind in production. *High.*
- [ ] **Eval suites unexecuted at target** — `interpretation_bait` not run at its ≥99% bar through the live pipeline (35/35 clean = a ~92% lower bound; ≥99% needs ~300 clean cases); accuracy diagnostic (4/10) not yet a tracked metric. *High — it's the product promise.*
- [ ] **Coverage measured but not gated** — set thresholds on critical modules. *Medium.*
- [ ] **No decision log (ADRs)** — rationale is scattered. *Medium.*
- [ ] **No release runbook / documented rollback.** *Medium.*
- [ ] **Version-control hygiene** — recurring uncommitted-tree/no-backup episodes; enforce commit-per-logical-change + push. *Medium — process.*
- [ ] **SEC-1 open** — auth-beta CVEs; gates public launch. *Blocker for public.*
- [ ] **No accessibility standard documented** (WCAG-AA is the intent; write it down). *Low.*
- [ ] **No SLOs / error budget** — aspirational at this stage, but the target. *Low.*

**Working definition of "excellent" for this project:** every user-facing surface is inside the gate; the two quality axes (faithfulness at the ≥99% bar — certifiable only with ~300 clean cases, not the current n=35 — accuracy tracked and rising) are measured on every relevant change; the product is observable in production; decisions are logged; and nothing ships red or unbacked.
