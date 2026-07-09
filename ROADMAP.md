# ROADMAP

Audited from the actual repo on 2026-07-08 — code, tests, `/audit` output, `docs/`, and
git history — not from memory or the earlier hit list.

## Update 2026-07-09 — the teacher landed (done-on-John)

Merged `feat/teacher-pipeline` to `main` (audit green, 95 tests). The intelligence
plane is no longer empty:
- **AI teacher — Partial (done-on-John).** Retrieval → compose (Qwen3.6-35B via
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
  tracked files, clean tree — the prior 81 uncommitted entries landed as 9 small logical commits
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
| **Commentary reader/library UI** | Partial | `web/src/app/library/commentaries/page.tsx` + `components/commentary-panel.tsx`; **FTS built:** `db/migrations/003_commentary_fts.sql` (tsvector/GIN on body), `lib/commentary-search.ts`, `api/search/commentaries/route.ts`, `ingest/ingest-commentary-fts.ts`. Browse + search modes on library page with debounced input, tradition facets, pagination (20/page, max 100), `ts_headline` snippets | Browse/read/search commentary + tested + in audit | No tests; outside `/audit`; **FTS needs migration + ingestion run against Neon** | none | Content · P1 |
| **Word-study / lexicon UI** | Partial | `web/src/app/library/word-study/page.tsx` (173) + `components/{word-panel,interlinear}.tsx`; `lib/original.ts` | Search lexicon + interlinear + tested + in audit | No tests; outside `/audit` | none | Content · P2 |
| **Omnibox navigation (web)** | Partial | `web/src/components/omnibox.tsx` → `web/src/bible/ref-parse.ts` | Reference-first nav + tested + in audit | Web `ref-parse.ts` **differs from the tested `src/` copy** (drift); no web tests | none | Reader · P1 |
| **Highlights + Notes (annotations)** | Partial | `web/src/lib/annotations.ts` (`runAsUser`, 8 fns; `upsertNote` now atomic `INSERT … ON CONFLICT` on the unique partial index, migration `002`), `api/annotations{,/all}/route.ts`, `app/library/notes/page.tsx`; all 8 fns pass staging on `app_runtime` (RLS on); **prod running on `app_runtime` with RLS enforced, DB-layer isolation 6/6** | Built + tested + **RLS enforced in prod** + in audit | No web tests; outside `/audit`; browser isolation check pending | **[SEC-2](docs/SECURITY.md)** (prod flip done, closing) | User data · P0 |
| **SEC-2 — least-priv role + RLS enforcement** | **Done** | `web/src/lib/db.ts` `runAsUser`; migrations `001` (role+grants+RLS) + `002` (unique note index); staging 14/14; **prod live**: `app_runtime` + `APP_DATABASE_URL` + RLS enforced, DB-layer isolation 6/6, persistence confirmed, **neondb_owner password rotated** (old password invalid) | `app_runtime` + RLS live in prod, browser isolation verified, owner rotated | — | none | Security · P0 |
| **Auth (login / account)** | Partial | `app/auth/[path]/page.tsx`, `account/[path]/page.tsx` (`@neondatabase/auth/react`); `lib/auth/{client,server}.ts`, `lib/session.ts`, `middleware.ts` (matcher empty), `api/auth/[...path]/route.ts`. **Standalone logout wired:** `api/auth/sign-out/route.ts` clears all `__Secure-neon-auth.*` cookies directly (no `<AccountView>` dependency). Sidebar shows "Sign out" when session active, "Sign in" when not. **Account management UI (teams/api-keys/orgs/security) is broken-until-Fix-C (SEC-1).** | Login + logout + account + no critical/high CVEs + JWT→RLS wired | `@neondatabase/auth` pins better-auth 1.4.18 → 2 critical + 7 high CVEs; account management UI broken (beta library); standalone logout bypasses it | **[SEC-1](docs/SECURITY.md)**; move to Better Auth-direct ([AUTH_MIGRATION_SPIKE.md](docs/AUTH_MIGRATION_SPIKE.md)) | Auth·Security · P0 |
| **Retrieval (hybrid BM25 + vector)** | Partial | `src/retrieval/{retrieve,ingest,store,embedder,types}.ts`, `sources/commentary.ts`; `test/retrieval.contract.test.ts` (6) pass; `test/retrieval.integration.test.ts` **skipped**; in `/audit`. **Vector retrieval now LIVE**: BGE (`bge-large-en-v1.5`/DeepInfra) 1024-dim embeddings in Neon pgvector, queried by `/ask` (`web/src/lib/teacher/retrieve.ts`, app_runtime + RLS, `user_id IS NULL`). John embedded + Gospels ingesting; ingest resilient (skip-and-continue) | Corpus embedded + **hybrid** search wired + integration test passing | **Vector-only** (no BM25/rerank hybrid yet); integration test still skipped; only Gospels-scale embedded; HNSW index present but at default params (untuned) | DeepInfra key (set); Neon pgvector index (HNSW) | Intelligence · P0 |
| **AI generation / "the teacher"** | Partial (done-on-John) | `src/teacher/{teacher,prompt,llm,run,types}.ts` (CLI) + `web/src/lib/teacher/*` + `web/src/app/api/ask` + `/ask` UI; `test/teacher.test.ts` (6: composed/retry/fallback/non-JSON/empty/extractive) pass, in `/audit`. Compose (Qwen3.6-35B/DeepInfra) → V1 → retry → fallback; verified live on John + partial Gospels; composer extractive (`voice.summary` optional) | Prompt → Qwen3.6 → contract JSON → verifier → render, `interpretation_bait` ≥99% | `interpretation_bait` not yet executed ≥99%; only John(+partial Gospels) embedded; V2 fidelity gate pending; web path outside `/audit` | Retrieval + contract (present); DeepInfra key (set) | Intelligence · P0 |
| **V2 classifier verifier** | Missing — **tracked next (gate before multi-user)** | No `src/verifier/v2*.ts`; OUTPUT_CONTRACT.md §3 "Stage V2 … fine-tuned later, prompted at first". Now the explicit gate before anyone but the owner uses the teacher; extractive composer is the interim drift mitigation | Classifier pass (I1/I2 unattributed, **I4/I6 summary-faithfulness**, I3/I5 prescription) built + evaluated | Entire stage — summary-faithfulness is the priority sub-piece | AI-generation stack (present); logged data for later fine-tune | Intelligence · **P0 (was P1)** |
| **Eval harness + interpretation-bait suite** | Partial | `src/evals/{run,checks,types}.ts`; `test/evals.test.ts` (5) pass; `evals/cases/{interpretation_bait(35),format,diversity,refusal_shape}.yaml`; only `fixtures/bait-001.json` | Harness (Done-level) **and** suites executed vs a teacher, bait ≥99% | Suites **unexecuted** (1 pass / 34 pending — no fixtures/teacher) | AI generation (Missing) | Intelligence · P0 |
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
