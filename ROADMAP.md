# ROADMAP

Audited from the actual repo on 2026-07-08 — code, tests, `/audit` output, `docs/`, and
git history — not from memory or the earlier hit list.

## Update 2026-07-11 (BETA PLAN — decisions locked; building the walls in order)

**Where we are:** the faithfulness gate CLEARS (interpretation_bait 35/35 = 100% live through the real
`teach()`; WORKLOG 2026-07-10). Retrieval is at the accepted beta limitation 65/72. Original "Phase A"
(topical/epistle ≥85%) is **retired as a beta blocker → GA target.** Now building the three beta walls in
sequence (design-doc → approval → build → report, each its own slice):
1. **Fail-closed site gate + rate-limit `/api/ask`** — smallest, highest-safety; `middleware.ts:16` fails
   **OPEN** today. ← NEXT.
2. **Migrate + publish the legal corpus** (`docs/MIGRATION_DESIGN.md`) — hard correctness gate; prod serves
   quarantined content today (legal filter is eval-only). Biggest slice.
3. **Observability** — error tracking / query logging / alerting, landing right before we open.

Then mint a **fresh v3** held-out, run it ONCE, report the honest topical/epistle number, and open a gated
beta to invited testers.

### Documented BETA LIMITATIONS (accepted by owner 2026-07-11 — conscious beta/GA split, not passed bars)
1. **Retrieval topical/epistle HIT@2 = 65% / 72%** (verse-ref 100%, pericope/proper-noun/controls/no-content
   all pass). 85% is a **GA target**; the per-passage-cap correction is stashed for post-beta GA (WORKLOG
   2026-07-10 backfill entry).
2. **Fallback rate ~14%** (≈1 in 7 queries shows retrieved sources, not a composed answer). Stochastic
   (compose temp 0.3); fail-closed-safe. A compose-**reliability** cost, not a faithfulness gap. GA: reduce
   the dominant `schema` (invalid-block) failure mode to lift the composed rate.
3. **Faithfulness proven on n=35 seed bait** — a strong **de-risk, NOT a statistical guarantee** on arbitrary
   traffic, and **bound to the extractive composer** (one neutral framing line is the whole app-voice
   surface). GA: grow the bait suite from real queries + every verifier rejection, and add **production
   faithfulness monitoring**.

### V2 classifier verifier — HARD RE-GATE TRIGGER (owner-locked 2026-07-11)
V2 is post-beta defense-in-depth **only while the composer stays extractive.** V2 **returns as a REQUIRED
pre-ship gate** the moment the app-voice generative surface expands — specifically: re-enabling
`voice.summary`, richer/longer summaries, or the **debate-topics / attributed-stance** feature. Today's 100%
is bound to the extractive composer and **does not transfer** to a product with more app-voice prose; any
such change must re-run interpretation_bait AND stand up V2 before shipping.

## Update 2026-07-09 (next phase — Steps 1–2: backup + the two upfront gates)

Executing `docs/NEXT_PHASE.md`. Steps 1 and 2 done; **stopped at the Step 3 boundary** (the `sources`/`sections` ingestion migration — unresolved cross-session owner, needs an approved design doc first, per the design-before-code rail).

> **OWNERSHIP — Step 3 (`sources`/`sections` ingestion migration): owned by this session as of 2026-07-09.** No other session writes the migration schema or scripts. Deliverable in flight is a single approval-ready design doc (`docs/MIGRATION_DESIGN.md`); **no migration code until the owner (Thomas) approves it.** This resolves the cross-session ownership ambiguity flagged in `NEXT_PHASE.md` §3.
>
> **APPROVED 2026-07-10 (`docs/MIGRATION_DESIGN.md`):** Path A (re-point the 173,806 existing vectors in place — $0, coverage stays 0), Barnes' Notes first slice, schema corrections folded into SCHEMA.md, one `ingest/sources.config.json`.
>
> **BARNES FIRST SLICE — DONE + PROVEN GREEN (2026-07-10).** Migration `006` applied (sources/sections/section_anchors/section_embeddings). Barnes re-pointed: **1,300 embeddings → 1,300 sections = 1,300 anchors = 1,300 section_embeddings** (reused vectors, $0). **Gate A (sections) = 0**, **Gate B PASSED** (published Barnes + config manifest), **`npm run audit` green**. Legacy retrieval untouched (dual-read). **Stopped before the other ~400 sources.**
>
> **Two-track gate before scale-up (2026-07-10):**
> - **Track 1 (provenance) — DONE.** Gate B now fails closed on forbidden-aggregator provenance (biblehub/studylight); it correctly flagged Barnes → Barnes unpublished (staged) + quarantined. Re-sourcing plan written (`docs/RESOURCING_PLAN.md`) — biblehub = 14 mega-works / 16,072 embeddings; text-match ⇒ provenance-repair ($0) vs re-embed; plus 242 no-provenance + CCEL + historicalchristian.faith flagged. **Awaiting plan approval.**
> - **Track 2 (parity) — DONE.** Baseline (legacy) = **97/97/100** (vector/hybrid/full). Section model proven **byte-identical to legacy** on migrated data (exact-NN probe, `parity-probe-sections.ts`); corpus-wide equality follows by construction (same vectors/anchors/BM25-text). Literal corpus-wide number needs the full re-point = the gated scale-up.
> - **Held:** no scaling to the other ~400 works, no retrieval cutover, until the owner approves Track 1 + Track 2 + the plan.
>
> **Full cleanup APPROVED + underway (2026-07-10):** tooling HTTP-first; historicalchristian.faith forbidden; Schaff canonical for fathers.
> - **Unit 1 DONE — helloao PD commentaries provenance-repaired ($0):** Gill/JFB/Clarke/Matthew Henry fully verified vs bible.helloao.org — **~60,241 verses, ~99.99% $0 repair, 3 genuine-differ**. Clean config entries written with helloao PD provenance + forward-compatible rebuild recipes. Gate B green (5 sources). The 62,708-entry no-provenance bucket is cleared.
> - **Patristic probe (biggest unknown) — MIXED:** ANF/NPNF core + Catena-Newman ≈ half is PD-repairable; **Theophylact/Oecumenius/Bonaventure/Jerome-prophets (~12–18k entries) are modern-only → DROP.** Needs per-work edition classification (not blanket Schaff-repair).
> - **Reusable re-source module DONE** (`resource-textmatch.ts` matcher + `SourceAdapter` contract, unit-tested; helloao refactored onto it, byte-identical result). Drives the patristic phase via a new adapter.
> - **biblehub-14 → HELD quarantined (decided):** no clean HTTP source (CrossWire has ~5 but needs `libsword`; ~9 have none). All PD, unpublished, reversible. Follow-up: libsword adapter for the CrossWire-5; other 9 = low-priority backlog. Hold list in `RESOURCING_PLAN` §9–10.
> - **Patristic — adapter built + sample proven vs REAL NPNF/ANF (New Advent):** word-set match failed (control caught it) → **shingle 4-gram containment** (control 0/123). **Chrysostom-Gal 99.2%, Augustine-1John 88.5% → $0-repair; Origen-John 1.6% → DROP** (our catena text ≠ the ANF translation — proves per-work match is essential, author-name isn't). Drops → quarantined. **Next: scale classify to all ~384 patristic works.**
> - **Patristic classify — TOP-N TARGETED (read-only), the reliable number.** Whole-corpus BFS crawl was contaminated (discarded — §11). Targeted per-work fetch (each work from its own New Advent index → content → shingle-match) gives the entry-weighted distribution of 62,444 patristic entries: **repairable 8.4%** (Chrysostom Acts/John/Matt, Augustine Ps/John — verified 78–99%), **drop 16.1%** (modern-only), **needs-review 6.1%** (Catena-Newman/Gregory/Cyril — PD exists, not wired), **quarantine-by-default 69.5%** (unmeasured long tail; top-20 = only 30.5% coverage). **True repair rate far below the ~50% author estimate, as predicted.** Corpus is long-tailed → tail = later expansion phase. (`RESOURCING_PLAN` §12.)
> - **Legal-corpus ACCURACY measured (read-only, `eval-legal-corpus.mts`):** publishable set (verified-repairable = helloao 4 + patristic 5 = 66,801 embeddings, 38.4%) → **true-success 93% (28/30), ≥2-voices 87% (26/30)** vs 100% baseline (reproduced). Loss is in **verse-ref** (famous passages), NOT diversity/topical (those held 100%). 2 genuine misses (1 Cor 13, propitiation) + 2 diversity gaps (Isaiah 53, Sermon on Mount). **Decision: wire Catena Aurea (Gospels) + CrossWire-5 (whole-Bible PD) — targets all 4 losses; gap is small + recoverable.** (`RESOURCING_PLAN` §13.)
> - **Failure-code eval (88-query, read-only) — the gap is RANKING, not content.** Legal corpus: HIT=1 64%, HIT=2 84%. Codes: pass 84%, <2-voices 10%, wrong-passage 6%, **no-content 0%**. **`no-content=0%` ⇒ CrossWire-5/libsword has ZERO ROI — dropped.** All failures are reranker drift on **verse-ref** queries (query names the reference, retrieval drifts to a semantically-similar passage) — systemic. **ROI-ranked interventions: (1) verse-ref intent routing (highest leverage, no install); (2) Catena Aurea (Gospels, no install); (3) libsword/CrossWire-5 — DO NOT BUILD.** (`RESOURCING_PLAN` §14.)
> - **Reference/pericope routing — BUILT + VALIDATED + DEPLOYED (gated dogfood) (ADR-015, `REFERENCE_ROUTING_DESIGN.md`).** Soft-boost injection + an **on-passage floor**, hardened to a **two-tier `resolveIntent` `{inject, floor}`** after a false-positive probe found bare pericope names hijack idiom (8/12): numeric refs floor unconditionally; pericopes floor only with biblical corroboration; un-corroborated pericopes inject-only (safe). Validated pre-real-users: **precision 12/12** (no hijack), **recall 8/8**, held-out **5/5 numeric generalizes** + 5/5 honest no-route. 4-way re-measure (frozen 88): **legal verse-ref HIT=1 46%→96%; full verse-ref 54%→85% (routing lifts the full corpus, no regression)**; legal ≥2-voices 84%→90%, full ≥2-voices 95%→97%. Retrieval-only; verifier/contract untouched; migration 007 applied; `retrieveCommentary` wired; audit green; `no-content` still 0. Deployed behind `SITE_PASSWORD` (gate verified live).
> - **Eval-vs-production parity CLOSED.** `eval-routing.mts` no longer hand-duplicates the retrieval path — the inject cap, injection SQL, pool merge, floor, and rerank model now live in one shared module (`web/src/lib/teacher/routing.ts`) that both production `retrieveCommentary` and the eval import, so the measured 96% runs through the shipped orchestration (proven: identical routed numbers post-refactor). `test/routing-orchestration.test.ts` pins the floor/merge.
> - **Recommended next — the real accuracy gate:** the **larger held-out eval** for launch-readiness on the legal corpus. The 96% is still largely **in-sample** (gazetteer + floor tuned on these 88; held-out check only n=5/bucket) and **must not stand in for it**. Residual = **topical** `<2-voices` (~5-6/88, epistle topics: "propitiation", "justification by faith"). **Catena NOT wired** (Gospels-only — adds nothing to epistles). **CrossWire-5/libsword deferred, not killed:** the measured 0-ROI was *no-content-specific*; Barnes/Calvin DO cover the epistles, so revisit once the bigger eval shows whether epistle breadth is systemic. Patristic tail stays dropped.

- **KNOWN LIMITATIONS (tracked — tied to eval-set growth, revisit with data, both gated on the eval not now):**
  1. **source_id collapse:** no `entry_index` → **341,912 eligible entries collapse to 168,233 keys**; only the first per key is embedded (~173,679 entries FTS-only, not in the vector index). Fixing = re-embed = cost + reopened gap.
  2. **Truncation:** stored section bodies are truncated for long comments (Matthew Henry 88%, Gill 44%), clustered in the long/high-value expositions; vectors are over the truncated text. Full-text rebuild re-fetches untruncated text via each source's `provenance.rebuild` recipe.
  Both are **preserved as-is** for the $0 compliance clear; whether they cap answer quality is unknown until the broader eval measures it (NEXT_PHASE §4). Section identity is surrogate + append-only (`MIGRATION_DESIGN.md` §4.1) so any fix is a pure insert, never a re-migration.

- **Backup done + DEPLOYED to prod + beta gate verified live.** `origin` = `github.com/thomascfoley-stack/ancient-roads`; `main` at **`cd897b4`** (history rewritten to the owner's personal identity — commits had been authored `thomas@composio.dev`; force-pushed a metadata-only rewrite → `thomascfoley@gmail.com`; content byte-identical; **other clones must `git reset --hard origin/main`**). Working tree clean. **Deployed** via `deploy.sh` (`vercel --prod`, personal account `thomascfoley-7284`, `dpl_DSUdSsb6eDjoao4z9a6GBB9QK3ju`, READY). **Beta gate verified live** on the beta URL `https://web-psi-eight-83.vercel.app`: unauth `POST /api/ask` → **401**, `GET /` → **307 → /gate** (the wall, not the app). Other prod aliases sit behind Vercel's own deployment-protection SSO (`302 → vercel.com/sso-api`); no prod URL serves an unauthenticated 200. `SITE_PASSWORD` set in Production (Sensitive) and picked up by this deploy — closing the earlier gap where prod ran **public** with the var unset.
- **Found HEAD was lint-red, not deploy-ready.** `cbe9ea7` (the "ready to deploy" handoff commit) failed `eslint src test` on two committed files (dead `rate`/`processed` in `embed-full-corpus.ts`, unused `quote` param in `normalize-contract.test.ts`). Fixed (`3c530fb`); `npm run audit` now green.
- **Gate A — coverage (completeness, fail LOUD): built + green.** `pnpm check:coverage` anti-joins eligible `commentary_entries` against embedded `source_id`s; ran it against Neon → **gap = 0** (168,233 sources). `source-id.ts` is now the single key-format source of truth shared by the embed job *and* the checker (they were duplicated before — free to drift). In `pnpm check:data` (not `audit` — hard-requires DB).
- **Gate B — license (legal, fail CLOSED): built + green + in `npm run audit`.** `license-manifest.ts` validator (Public Domain | CC BY | CC BY-SA + provenance url/edition/year, the edition-trap guard) + `check-licenses.ts` runnable gate + defence-in-depth DB check (inert until `sources` exists) + 13 unit tests. `pnpm check:licenses`. CI-safe, so wired into `audit` — license is legally irreversible and must never be skippable.
- **ADR-014** records reranker-is-core (full pipeline 100% vs vector/hybrid 97%); numbered past the parallel session's 010–013.

## Update 2026-07-09 (later — reconciled from the repo working tree, not memory)

Post-`4403795`, a large body of work is DONE but was **uncommitted and undocumented**. Reconciled by reading the actual tree + git:

- **Teacher speed fix (in tree, deployed):** compose model corrected `Qwen3.6 → Qwen3.5-35B-A3B` — the `3.6` name did not exist on DeepInfra and was silently auto-forwarded to a ~60s/compose fallback (the `INFRA.md` model-drift hazard). Added `web/src/lib/teacher/normalize-contract.ts` (coerce numeric-string IDs + **backfill attribution from the cited section** = "select, don't regenerate"), capped retries at 1, compose over the **top 3 voices** (guaranteeing ≥2 traditions). Measured: single-compose **59.7s → 4.4s** (~13×), end-to-end worst **~210s → 8.6s**, first-attempt verify **63% → 75%**. New `test/normalize-contract.test.ts` (fail-closed). Integrity core (verifier/prompt/contract) untouched; sync-guard intact.
- **Commentary FTS is LIVE in prod** (`a7744e6`): migration 003 applied, **371,406 rows** re-ingested with `entry_index` added to the unique key — this fixed a **51% dedup data-loss** (180,558 → 371,406) — loaded via `COPY`. The old "FTS needs migration + ingestion run" gap is **done**.
- **Redesign + full mobile pass + PWA + site gate — DONE but uncommitted:** Ancient Paths visual redesign + hero photo; mobile-first (bottom tab nav `mobile-nav.tsx`, bottom-sheet study panel, `use-drag-dismiss.ts`, safe-area, keyboard-aware `/ask`, 16px inputs); `manifest.ts` PWA + icons; a `SITE_PASSWORD` gate (`lib/gate.ts`, `app/gate`, `api/gate`).
- **Went public, then intended beta-gated.** Prod gate state lives in a Vercel env var — **confirm `SITE_PASSWORD` is set** (beta-only) vs. absent (public). Not verifiable from the repo.

**⚠️ RISK — uncommitted delta:** 25 modified + 12 untracked files, all since `4403795`. The live site runs far ahead of git history and there is **no GitHub remote / backup**. Committing + pushing is the top housekeeping priority. (Note: `.git/index.lock` unlink was denied from the mounted sandbox — commits must run on the host / via Claude Code, not this environment.)

**Pre-signup gate still open (before beta users):**

- **[TOP SECURITY FIX] The site gate fails OPEN when `SITE_PASSWORD` is unset** (`web/src/middleware.ts:16` — `if (!password) return NextResponse.next()`). A missing/empty gate password must **deny, not expose**: one unset or typo'd env var silently drops the entire wall — exactly the exposure found 2026-07-09 (prod ran fully public, `/api/ask` included, until the var was set). Make it fail **closed**: no configured password ⇒ 401 / redirect-to-gate, never open. *Docs-only note; do not implement without owner sign-off.*
- **Rate-limit `/api/ask`** — still required. The site gate *reduces* exposure (anonymous callers are walled) but does **not** remove the need: a beta user who has the password — or any path where the gate is bypassed — can still hammer the paid, DeepInfra-backed endpoint. Add per-IP/per-user rate limiting independent of the gate.
- V2 summary-faithfulness; `createPgStore` `rejectUnauthorized` guard; and **re-run `interpretation_bait` through the NEW (Qwen3.5 + normalizer + 3-voice) pipeline** to confirm the guardrails survived the model swap — the old bait result predates it.

## Engineering-excellence backlog (2026-07-09) — see `docs/ENGINEERING.md` §15

**RETRIEVAL ACCURACY — DONE (10/10), 2026-07-09.** Was ~4/10 (Gospels-only embedding + dead BM25). Fixed: embedded the **full commentary corpus** (168,233 unique sources / 66 books; a hardened de-poisoned batch pipeline recovered a 47k coverage gap to MISSING=0), migration 004 hybrid (`plainto_tsquery`), Qwen3-Reranker-0.6B top-20→6. The 10-query true-success diagnostic now reports **retrieval 10/10 every run (0 wrong-source flags)** across vector/hybrid/full. A larger 30-query labeled eval (`web/src/scripts/eval-retrieval.mts`) settles vector-vs-hybrid-vs-full on data (see WORKLOG).

**Residual limiter = COMPOSE/VERIFY reliability (~9/10), a faithfulness-axis issue, NOT retrieval.** Fallbacks are the V1 verifier correctly refusing non-verbatim quotes on long-prose sources → safe fallback (retrieved sources shown, no unverified narrative). Owner accepted ~9/10 with safe fallbacks as beta-acceptable; fixes landed (entity-decode in `normalizeForMatch`, `MAX_RETRIES` 1→2, snap-to-source) make 10/10 achievable, not guaranteed. Caching/topical-curation still only *after* the pipeline is at bar (never cache a sub-bar answer).

Scaffolding status (this pass):
- [x] `CLAUDE.md` — created; enforced standards, auto-loaded by Claude Code every session.
- [x] `docs/ENGINEERING.md` — master handbook created (indexes all docs, defines testing/QA/release frameworks, maturity checklist).
- [x] `docs/DECISIONS.md` — ADR log created + big decisions backfilled (ADR-001…009).
- [ ] **`web/` inside the gate** — add web tests + web coverage; the entire user-facing surface is currently unverified (biggest quality hole). *High.*
- [ ] **Coverage thresholds** on `src/verifier`, `src/retrieval`, teacher — measured today, not gated. *Medium.*
- [ ] **Eval suites at target** — `interpretation_bait` ≥99% through the *live* pipeline; accuracy diagnostic tracked as a metric. *High — the product promise.*
- [ ] `docs/RELEASE.md` — release checklist + rollback runbook. *Medium.*
- [ ] **Observability** (error tracking / query-logging / alerting) — **DEFERRED per owner: infra foundation first, analytics later.** Required before real traffic. *Do before public.*
- [ ] SEC-1 auth migration — gates public launch.
- [ ] **Extract `src/ingest/batch-runner.ts`** — a reusable high-throughput batch primitive, lifted from the proven `embed-full-corpus.ts` after the accuracy gate closes. Pattern: bounded worker-pool (N concurrent API calls) **decoupled from** a small PgBouncer-pooled DB writer (pooler endpoint + `connect_timeout`), retry-on-any-transient-error w/ backoff, idempotent upsert + pre-skip for crash-safe resume, progress/ETA + completion signal. Callers: `ingest-original.ts`, `ingest-strongs.ts`, bible-translation ingests, and any future re-embed (model swap / corpus additions). Debugged the hard way 2026-07-09: coupling API concurrency to raw Postgres connections (183 direct conns) drowned Neon's auth handshake; the fix is 180-way API concurrency over a 20-conn pooler. *Medium — do after 10/10, extract from working code (not speculative).*

## Update 2026-07-09 — the teacher landed (done-on-John)

Merged `feat/teacher-pipeline` to `main` (audit green, 95 tests). The intelligence
plane is no longer empty:
- **AI teacher — Partial (done-on-John).** Retrieval → compose (Qwen3.5-35B via
  DeepInfra) → V1 verifier → retry-with-feedback → fallback. Wired to the web app as
  **`/ask` ("Ask the voices")**, authed-only, verified end-to-end on John commentary.
  Composer is **extractive** (`voice.summary` now optional — quotes over paraphrase)
  to bound drift until V2. Not full **Done**: `interpretation_bait` ≥99% not yet run,
  and only John (+ partial Gospels) is embedded.
- **Pre-signup gate — must clear before anyone but the owner signs up:**
  1. **V2 summary-faithfulness classifier** — the fidelity check the extractive composer
     only *mitigates*; the real gate against summary drift (I4/I6).
  2. **Rate-limit `/api/ask`** — authed but unthrottled today; a signed-up user could run
     up embedding + LLM spend (wallet-DoS). Add a per-user limiter before opening signups.
  3. **`createPgStore`'s `rejectUnauthorized:false` must never reach a runtime path** —
     it is offline-ingest-only today (the web runtime uses the verified neon serverless
     driver, not `pg`). Before multi-user, guarantee it can't be imported into a request
     path (e.g. `server-only`/lint guard) and tighten the CLI to `sslmode=verify-full`.
- **Tracked next (post-dogfood, not gated on signup):** **full-corpus embedding**
  (~$0.6–1.0 one-time; the real cost is Neon Large ~$110/mo to hold the index) +
  **HNSW tuning** (the `idx_embeddings_vector` HNSW index already exists at default
  params — raise `ef_construction`/`ef_search`, move to Neon Large) + **hybrid/rerank**.
  Decide after real dogfooding.
- **Deferred cosmetic nit:** `/ask` passage-range label is approximate for cross-chapter
  ranges.

## The "Done" bar (strict)

A row is **Done** only if it is: **built AND tested AND passes `/audit` AND** (for data paths)
**RLS-enforced per [SEC-2](docs/SECURITY.md) in prod AND** (for AI features) **passes the
`interpretation_bait` evals in [PRINCIPLES.md](docs/PRINCIPLES.md).** Anything short of all of
that is **Partial** or **Missing**. Status values: Done / Partial / Missing / Blocked.

## Audit-wide caveats (they cap many rows at Partial)

- **Working tree committed to a clean baseline (2026-07-08).** `git log` is now 11 commits / 145
  tracked files, clean tree **at that point** (⚠️ SUPERSEDED — the tree is no longer clean; see the reconciliation block at the top: 25 modified + 12 untracked since `4403795`, uncommitted) — the prior 81 uncommitted entries landed as 9 small logical commits
  (`e58c7e3` gitignore … `d8fac3c` web-reader). Generated data (`web/public/*`, `data/`), `coverage/`,
  and the throwaway `spike/` workspace are gitignored. Evidence below is the tree + test/audit runs.
- **`/audit` covers `src/` + `test/` only, not `web/`.** `tsconfig.json` include = `["src/**/*.ts","test/**/*.ts"]`;
  `scripts/audit.sh` runs `eslint src/ test/` and vitest over `test/`; `web/` has its own tsconfig and
  **no test script**. So **no `web/` feature can satisfy "passes /audit"** as things stand — the reader,
  annotations UI, and auth are all outside the gate. This alone drops every web surface to Partial.
- **`/audit` is green only because 2 critical + 7 high CVEs are ignored** (SEC-1; `pnpm audit` line:
  "2 critical (2 ignored)"). Coverage is 30% statements.
- **A teacher now exists (2026-07-09, done-on-John)** but the `interpretation_bait` suite still
  runs against fixtures, not the live teacher (1 pass / 34 pending). Running the suite through the
  real compose→verify loop at ≥99% is outstanding, so no AI-generation row is full **Done** yet.

## The table

| Area | Status | Evidence (files/routes/tests) | Definition-of-done | Gap remaining | Blockers/deps | Bucket · Priority |
|---|---|---|---|---|---|---|
| **Verse-reference parser + verse-id (core lib)** | **Done** | `src/bible/ref-parse.ts`, `verse-id.ts`; `test/ref-parse.test.ts` (33), `test/verse-id.test.ts` (5) — pass; in `/audit` scope | Parse/format refs + canonical IDs, unit-tested, in audit | — (web ships a *drifted copy*, tracked as its own row) | none | Intelligence·core · P1 |
| **Output contract + V1 verifier** | **Done** | `src/contract/{types.ts,schema.json}` (schema wired: `v1.ts:11,25,37`); `src/verifier/{v1,screens,normalize,memory-corpus}.ts`; `test/verifier.test.ts` (28) pass, in `/audit`. **`v1.ts` = 100% stmt coverage** — all reject paths exercised | Schema + **every** deterministic reject path unit-tested + in audit | — | none | Intelligence · P0 |
| **Bible content plane (22 translations)** | Partial | `web/public/bible/` = 22 translations (244M); served via `web/src/lib/bible.ts` `fetch('/bible/{tr}/{slug}.json')`; ingest `src/ingest/ingest-*.ts` | 22 translations served + ingestion tested + in audit | Ingestion **0% coverage**; serving is `web/` → outside `/audit`; no tests | none | Content · P1 |
| **Interlinear (Gk/Heb) + Strong's lexicon (data)** | Partial | `web/public/original/` (45M), `web/public/lexicon/` (3M); `web/src/lib/original.ts`; `src/ingest/ingest-{original,strongs}.ts` | Per-verse interlinear + lexicon served + tested + in audit | Ingest 0% coverage; not in audit; no tests | none | Content · P1 |
| **Commentary corpus (401 sources / 371k)** | Partial | `web/public/commentaries/` (379M) + `_manifest.json`; `lib/bible.ts` `fetchCommentary*`; `src/ingest/{merge-commentaries,ingest-*commentary*}.ts` | Corpus served + manifest + ingestion tested + in audit | Ingest 0% coverage; not in audit; no tests | none | Content · P1 |
| **Bible reader UI** | Partial | `web/src/app/read/[book]/[chapter]/page.tsx` (260 lines) + `components/{verse-display,reader-header,chapter-nav,reader-settings,book-picker,study-panel,interlinear}.tsx` | Reader works + tested + in audit | **Zero automated tests**; outside `/audit`; not RLS-relevant | none | Content·Reader · P1 |
| **Commentary reader/library UI** | Partial | `web/src/app/library/commentaries/page.tsx` + `components/commentary-panel.tsx`; **FTS built:** `db/migrations/003_commentary_fts.sql` (tsvector/GIN on body), `lib/commentary-search.ts`, `api/search/commentaries/route.ts`, `ingest/ingest-commentary-fts.ts`. Browse + search modes on library page with debounced input, tradition facets, pagination (20/page, max 100), `ts_headline` snippets | Browse/read/search commentary + tested + in audit | No tests; outside `/audit`; **FTS LIVE in prod** (migration 003 applied, 371,406 rows re-ingested with `entry_index` via COPY — `a7744e6`) | none | Content · P1 |
| **Word-study / lexicon UI** | Partial | `web/src/app/library/word-study/page.tsx` (173) + `components/{word-panel,interlinear}.tsx`; `lib/original.ts` | Search lexicon + interlinear + tested + in audit | No tests; outside `/audit` | none | Content · P2 |
| **Omnibox navigation (web)** | Partial | `web/src/components/omnibox.tsx` → `web/src/bible/ref-parse.ts` | Reference-first nav + tested + in audit | Web `ref-parse.ts` **differs from the tested `src/` copy** (drift); no web tests | none | Reader · P1 |
| **Highlights + Notes (annotations)** | Partial | `web/src/lib/annotations.ts` (`runAsUser`, 8 fns; `upsertNote` now atomic `INSERT … ON CONFLICT` on the unique partial index, migration `002`), `api/annotations{,/all}/route.ts`, `app/library/notes/page.tsx`; all 8 fns pass staging on `app_runtime` (RLS on); **prod running on `app_runtime` with RLS enforced, DB-layer isolation 6/6** | Built + tested + **RLS enforced in prod** + in audit | No web tests; outside `/audit`; browser isolation check pending | **[SEC-2](docs/SECURITY.md)** (prod flip done, closing) | User data · P0 |
| **SEC-2 — least-priv role + RLS enforcement** | **Done** | `web/src/lib/db.ts` `runAsUser`; migrations `001` (role+grants+RLS) + `002` (unique note index); staging 14/14; **prod live**: `app_runtime` + `APP_DATABASE_URL` + RLS enforced, DB-layer isolation 6/6, persistence confirmed, **neondb_owner password rotated** (old password invalid) | `app_runtime` + RLS live in prod, browser isolation verified, owner rotated | — | none | Security · P0 |
| **Auth (login / account)** | Partial | `app/auth/[path]/page.tsx`, `account/[path]/page.tsx` (`@neondatabase/auth/react`); `lib/auth/{client,server}.ts`, `lib/session.ts`, `middleware.ts` (matcher empty), `api/auth/[...path]/route.ts`. **Standalone logout wired:** `api/auth/sign-out/route.ts` clears all `__Secure-neon-auth.*` cookies directly (no `<AccountView>` dependency). Sidebar shows "Sign out" when session active, "Sign in" when not. **Account management UI (teams/api-keys/orgs/security) is broken-until-Fix-C (SEC-1).** | Login + logout + account + no critical/high CVEs + JWT→RLS wired | `@neondatabase/auth` pins better-auth 1.4.18 → 2 critical + 7 high CVEs; account management UI broken (beta library); standalone logout bypasses it | **[SEC-1](docs/SECURITY.md)**; move to Better Auth-direct ([AUTH_MIGRATION_SPIKE.md](docs/AUTH_MIGRATION_SPIKE.md)) | Auth·Security · P0 |
| **Retrieval (hybrid BM25 + vector + reranker)** | Partial (in progress) | `src/retrieval/*`; `web/src/lib/teacher/{retrieve,rerank}.ts` (hybrid+rerank pipeline); `db/migrations/004_hybrid_search_v2.sql` (plainto_tsquery, applied); `src/ingest/embed-full-corpus.ts`. **Full-corpus embedding running** (~342k entries, 0 errors at 1000-char truncation). Hybrid search + BGE-reranker-v2-m3 code ready. Diagnostic harness: `web/src/scripts/diagnose-pipeline.mts` | Full corpus embedded + hybrid+reranker wired + **10/10 true success rate** + integration test passing | Embedding job ~3% complete (~2.5h remaining); diagnostic re-runs pending after each step; integration test still skipped; HNSW untuned | DeepInfra key (set); Neon pgvector index (HNSW) | Intelligence · **P0 (TOP PRIORITY)** |
| **AI generation / "the teacher"** | Partial (done-on-John) | `src/teacher/{teacher,prompt,llm,run,types}.ts` (CLI) + `web/src/lib/teacher/*` + `web/src/app/api/ask` + `/ask` UI; `test/teacher.test.ts` (6: composed/retry/fallback/non-JSON/empty/extractive) pass, in `/audit`. Compose (Qwen3.5-35B/DeepInfra) → V1 → retry → fallback; verified live on John + partial Gospels; composer extractive (`voice.summary` optional) | Prompt → Qwen3.5 → contract JSON → verifier → render, `interpretation_bait` ≥99% | `interpretation_bait` not yet executed ≥99%; only John(+partial Gospels) embedded; V2 fidelity gate pending; web path outside `/audit` | Retrieval + contract (present); DeepInfra key (set) | Intelligence · P0 |
| **V2 classifier verifier** | Missing — **post-beta defense-in-depth (owner-locked 2026-07-11); HARD RE-GATE on app-voice expansion** | No `src/verifier/v2*.ts`; OUTPUT_CONTRACT.md §3 "Stage V2 … fine-tuned later, prompted at first". **2026-07-10: V1 screens + extractive composer HELD on interpretation_bait (35/35, 0 leaks) → V2 = defense-in-depth for beta.** REQUIRED again the moment the app-voice surface grows — re-enabling `voice.summary`, richer summaries, or debate-topics/attributed-stance (see top-of-file trigger) | Classifier pass (I1/I2 unattributed, **I4/I6 summary-faithfulness**, I3/I5 prescription) built + evaluated | Entire stage — summary-faithfulness is the priority sub-piece | AI-generation stack (present); logged data for later fine-tune | Intelligence · **P0 (was P1)** |
| **Eval harness + interpretation-bait suite** | Partial | `src/evals/{run,checks,types}.ts`; `test/evals.test.ts` (5) pass; `evals/cases/{interpretation_bait(35),format,diversity,refusal_shape}.yaml`. **interpretation_bait EXECUTED live through the real `teach()` 2026-07-10 → 35/35 = 100%, 0 breaches reached the user** (WORKLOG; the fail-closed verifier was observed catching prescription + fabrication wobbles) | Harness (Done-level) **and** suites executed vs a teacher, bait ≥99% | ✅ bait ≥99% MET on the seed set (n=35, one run + spot re-runs). Remaining: CI-wire it via a permanent **authed** harness (the 2026-07-10 run used a throwaway local endpoint) + grow the set from real queries | AI generation (present) | Intelligence · P0 |
| **Chat / Channels / Study-partner** | Missing | Backend scaffold exists (`lib/chat.ts` RLS-refactored; `api/{channels,chats,messages}`), but `app/chat/[id]` + `channel/[id]` are `ComingSoon` stubs "arrive with the trained model" | Full feature: UI + AI teacher + RLS + bait evals | No UI, no AI, no tests | AI generation; SEC-2 (RLS) | Intelligence·User · P2 |
| **Uploads / My books (files, favorites)** | Missing | `app/library/{uploads,books}/page.tsx` = `ComingSoon` stubs; `user_library` designed in USER_DATA.md; Vercel Blob not wired | Upload → Blob + `user_library` row + RLS + UI | Entire feature | Vercel Blob; SEC-2 | User data · P2 |
| **Settings / preferences** | Missing | `app/settings/page.tsx` = `ComingSoon` stub (translation choice only persisted client-side in reader) | Account/reading prefs persisted + UI | Entire feature | auth/user plane | User data · P2 |
| **Sermon companion** | Missing | `docs/SERMON_COMPANION.md` design only; no code, no `stance` block/evals | Sermon ingest + stance step + `stance_grounding` evals | Entire feature | AI-generation stack | Intelligence · P2 |
| **Production deploy / observability** | Partial | `deploy.sh` (`npx vercel --prod`); ARCHITECTURE.md line 28 (Deployment Protection); `APP_DATABASE_URL` set in Vercel (app_runtime, pooled) | Public prod + envs + Sentry/PostHog | Behind Deployment Protection (not public); no observability | SEC-1 before public | Platform · P1 |
| **Note panel doesn't close on save** | Partial | `web/src/app/read/[book]/[chapter]/page.tsx:251` — `onSaveNote` now calls `setStudy(null)` after optimistic save | Panel closes on successful save | Needs visual confirmation (behind SSO wall) | none | UX bug · P2 |
| **Highlighter "red is moving"** | Partial | Analysis in WORKLOG.md: no red in palette (likely pink dot); "moving" is likely the `position:fixed` hover quick-menu following verses or scroll-floating. Three candidate causes identified | Thomas reproduces in browser → confirm which element + trigger → fix | Thomas must confirm: which element is "red" and what "moving" means (hover-follow / multi-line snap / scroll-float) | none | UX bug · P2 |
| **Separate text color from highlight color** | Partial | Design proposal in WORKLOG.md: migration 003 (`highlight_color` rename + `text_color` column), 5-color text palette, two-row UI in all 3 surfaces (hover menu, study panel, commentary panel) | `highlights.color` → `highlight_color` + `text_color` (migration 003 + backfill); UI exposes two independent color pickers | Thomas approves design → implement migration + UI + queries | SEC-2 closed (RLS on the table being altered) | UX feature · P2 |

## What is actually Done (2 rows, after verification)

- **Verse-reference parser** — Done since initial audit.
- **Output contract + V1 verifier** — Done after 2026-07-08 reject-path test expansion (see below).

Everything user-facing is Partial (no web tests + outside `/audit`), Blocked (SEC-1 auth, SEC-2 data),
or Missing (AI generation and everything gated on it). Content plane shipped, intelligence plane not started.

## Verification pass (independent fresh-eyes re-check of the Done rows)

- **Verse-reference parser — Done HOLDS.** Independent run: `src/bible/ref-parse.ts` 100% stmt/fn
  (94% branch), `verse-id.ts` 100% stmt/fn; the 38 tests exercise matching, ordinal normalization,
  ranges, `ff`, comma-sequence context inheritance, and every "never guess" reject path; in `/audit`.
  The tested copy is `src/` (the drifted `web/` copy is its own Partial row). Cosmetic-only gap:
  `formatVerseId`'s unknown-book fallback branch is unexercised. Verdict unchanged.
- **Output contract + V1 verifier — RESTORED to Done (2026-07-08).** Previously downgraded to Partial
  at 77.6% stmt coverage with untested reject paths. Added 8 tests covering: `reading_resolves`,
  `reading_attribution`, `attribution_tradition`, `anchor_valid`, `anchor_order`, `passage_exists`,
  I5 true-positive screen, and valid reading block acceptance. `v1.ts` now at **100% statement coverage**.
  All 28 tests pass, audit green. `memory-corpus.ts`, `normalize.ts`, `screens.ts` also 100%.
