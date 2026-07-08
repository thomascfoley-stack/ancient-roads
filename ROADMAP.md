# ROADMAP

Audited from the actual repo on 2026-07-08 — code, tests, `/audit` output, `docs/`, and
git history — not from memory or the earlier hit list.

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
- **No teacher exists yet** → the `interpretation_bait` suite is 1 pass / 34 pending (only `bait-001`
  has a fixture). No AI-generation feature can meet the evals clause.

## The table

| Area | Status | Evidence (files/routes/tests) | Definition-of-done | Gap remaining | Blockers/deps | Bucket · Priority |
|---|---|---|---|---|---|---|
| **Verse-reference parser + verse-id (core lib)** | **Done** | `src/bible/ref-parse.ts`, `verse-id.ts`; `test/ref-parse.test.ts` (33), `test/verse-id.test.ts` (5) — pass; in `/audit` scope | Parse/format refs + canonical IDs, unit-tested, in audit | — (web ships a *drifted copy*, tracked as its own row) | none | Intelligence·core · P1 |
| **Output contract + V1 verifier** | Partial | `src/contract/{types.ts,schema.json}` (schema wired: `v1.ts:11,25,37`); `src/verifier/{v1,screens,normalize,memory-corpus}.ts`; `test/verifier.test.ts` (20) pass, in `/audit`. **But `v1.ts` = 77.6% stmt coverage** (downgraded on verification) | Schema + **every** deterministic reject path unit-tested + in audit | Untested reject paths: whole `reading` block (`reading_resolves`/`reading_attribution`, v1.ts:161-178), `attribution_tradition`, `anchor_valid`/`anchor_order`, `passage_exists`; screens cover I1/I2/I3/I5 only (I4/I6 = V2) and I5 true-positive unasserted | none (closable w/ reject-path tests) | Intelligence · P0 |
| **Bible content plane (22 translations)** | Partial | `web/public/bible/` = 22 translations (244M); served via `web/src/lib/bible.ts` `fetch('/bible/{tr}/{slug}.json')`; ingest `src/ingest/ingest-*.ts` | 22 translations served + ingestion tested + in audit | Ingestion **0% coverage**; serving is `web/` → outside `/audit`; no tests | none | Content · P1 |
| **Interlinear (Gk/Heb) + Strong's lexicon (data)** | Partial | `web/public/original/` (45M), `web/public/lexicon/` (3M); `web/src/lib/original.ts`; `src/ingest/ingest-{original,strongs}.ts` | Per-verse interlinear + lexicon served + tested + in audit | Ingest 0% coverage; not in audit; no tests | none | Content · P1 |
| **Commentary corpus (401 sources / 371k)** | Partial | `web/public/commentaries/` (379M) + `_manifest.json`; `lib/bible.ts` `fetchCommentary*`; `src/ingest/{merge-commentaries,ingest-*commentary*}.ts` | Corpus served + manifest + ingestion tested + in audit | Ingest 0% coverage; not in audit; no tests | none | Content · P1 |
| **Bible reader UI** | Partial | `web/src/app/read/[book]/[chapter]/page.tsx` (260 lines) + `components/{verse-display,reader-header,chapter-nav,reader-settings,book-picker,study-panel,interlinear}.tsx` | Reader works + tested + in audit | **Zero automated tests**; outside `/audit`; not RLS-relevant | none | Content·Reader · P1 |
| **Commentary reader/library UI** | Partial | `web/src/app/library/commentaries/page.tsx` (199) + `components/commentary-panel.tsx` | Browse/read commentary + tested + in audit | No tests; outside `/audit` | none | Content · P1 |
| **Word-study / lexicon UI** | Partial | `web/src/app/library/word-study/page.tsx` (173) + `components/{word-panel,interlinear}.tsx`; `lib/original.ts` | Search lexicon + interlinear + tested + in audit | No tests; outside `/audit` | none | Content · P2 |
| **Omnibox navigation (web)** | Partial | `web/src/components/omnibox.tsx` → `web/src/bible/ref-parse.ts` | Reference-first nav + tested + in audit | Web `ref-parse.ts` **differs from the tested `src/` copy** (drift); no web tests | none | Reader · P1 |
| **Highlights + Notes (annotations)** | Partial | `web/src/lib/annotations.ts` (`runAsUser`, 8 fns), `api/annotations{,/all}/route.ts`, `app/library/notes/page.tsx` (121); RLS proven on branch: `spike/sec2-proof.mjs`, `db/migrations/001` | Built + tested + **RLS enforced in prod** + in audit | RLS **not live in prod** (SEC-2 held → app connects as BYPASSRLS owner); no tests; outside `/audit` | **[SEC-2](docs/SECURITY.md)** | User data · P0 |
| **SEC-2 — least-priv role + RLS enforcement** | Partial | `web/src/lib/db.ts` `runAsUser`; `db/migrations/001_sec2_least_priv_role.sql`; `spike/sec2-proof.mjs` (4/4 pass on branch); `docs/SECURITY.md` | `app_runtime` role + RLS live in prod, verified via repo layer | Prod flip **held for approval**: create role + grants, set `APP_DATABASE_URL`, redeploy | user go-ahead; owner pw rotation (SEC-3) | Security · P0 |
| **Auth (login / account)** | Blocked | `app/auth/[path]/page.tsx`, `account/[path]/page.tsx` (`@neondatabase/auth/react`); `lib/auth/{client,server}.ts`, `lib/session.ts`, `middleware.ts`, `api/auth/[...path]/route.ts` | Login + account + no critical/high CVEs + JWT→RLS wired | `@neondatabase/auth` pins better-auth 1.4.18 → 2 critical + 7 high CVEs | **[SEC-1](docs/SECURITY.md)**; move to Better Auth-direct ([AUTH_MIGRATION_SPIKE.md](docs/AUTH_MIGRATION_SPIKE.md)) | Auth·Security · P0 |
| **Retrieval (hybrid BM25 + vector)** | Partial | `src/retrieval/{retrieve,ingest,store,embedder,types}.ts`, `sources/commentary.ts`; `test/retrieval.contract.test.ts` (6) pass; `test/retrieval.integration.test.ts` **skipped** (gated `RUN_INTEGRATION`); in `/audit` | Corpus embedded + hybrid search wired to a surface + integration test passing | Integration **unproven** (skipped); corpus not embedded in prod; not wired to any route | DeepInfra/embeddings key; Neon pgvector index | Intelligence · P0 |
| **AI generation / "the teacher"** | Missing | No generation code (grep: none in `web/` or `src/`); ARCHITECTURE.md §"Intelligence plane" = "to build (current phase)"; `evals` 34 pending "until the first teacher exists" | Prompt → Qwen3.6 → contract JSON → verifier → render, `interpretation_bait` ≥99% | Entire feature | Retrieval + contract (present); DeepInfra key | Intelligence · P0 |
| **V2 classifier verifier** | Missing | No `src/verifier/v2*.ts`; OUTPUT_CONTRACT.md §3 "Stage V2 … fine-tuned later, prompted at first" | Classifier pass (I1/I2 unattributed, I4/I6 fidelity, I3/I5 prescription) built + evaluated | Entire stage | AI-generation stack; logged data for later fine-tune | Intelligence · P1 |
| **Eval harness + interpretation-bait suite** | Partial | `src/evals/{run,checks,types}.ts`; `test/evals.test.ts` (5) pass; `evals/cases/{interpretation_bait(35),format,diversity,refusal_shape}.yaml`; only `fixtures/bait-001.json` | Harness (Done-level) **and** suites executed vs a teacher, bait ≥99% | Suites **unexecuted** (1 pass / 34 pending — no fixtures/teacher) | AI generation (Missing) | Intelligence · P0 |
| **Chat / Channels / Study-partner** | Missing | Backend scaffold exists (`lib/chat.ts` RLS-refactored; `api/{channels,chats,messages}`), but `app/chat/[id]` + `channel/[id]` are `ComingSoon` stubs "arrive with the trained model" | Full feature: UI + AI teacher + RLS + bait evals | No UI, no AI, no tests | AI generation; SEC-2 (RLS) | Intelligence·User · P2 |
| **Uploads / My books (files, favorites)** | Missing | `app/library/{uploads,books}/page.tsx` = `ComingSoon` stubs; `user_library` designed in USER_DATA.md; Vercel Blob not wired | Upload → Blob + `user_library` row + RLS + UI | Entire feature | Vercel Blob; SEC-2 | User data · P2 |
| **Settings / preferences** | Missing | `app/settings/page.tsx` = `ComingSoon` stub (translation choice only persisted client-side in reader) | Account/reading prefs persisted + UI | Entire feature | auth/user plane | User data · P2 |
| **Sermon companion** | Missing | `docs/SERMON_COMPANION.md` design only; no code, no `stance` block/evals | Sermon ingest + stance step + `stance_grounding` evals | Entire feature | AI-generation stack | Intelligence · P2 |
| **Production deploy / observability** | Partial | `deploy.sh` (`npx vercel --prod`); ARCHITECTURE.md line 28 (Deployment Protection) | Public prod + envs (incl. `APP_DATABASE_URL`) + Sentry/PostHog | Behind Deployment Protection (not public); no observability; `APP_DATABASE_URL` unset in Vercel | SEC-1/SEC-2 before public | Platform · P1 |

## What is actually Done (1 row, after verification)

After fresh-eyes verification, **only the verse-reference parser clears the full bar.** The output
contract + V1 verifier was downgraded to Partial (below). Everything user-facing is Partial (no web
tests + outside `/audit`), Blocked (SEC-1 auth, SEC-2 data), or Missing (AI generation and everything
gated on it). This matches the app's real phase: content plane shipped, intelligence plane not started.

## Verification pass (independent fresh-eyes re-check of the Done rows)

- **Verse-reference parser — Done HOLDS.** Independent run: `src/bible/ref-parse.ts` 100% stmt/fn
  (94% branch), `verse-id.ts` 100% stmt/fn; the 38 tests exercise matching, ordinal normalization,
  ranges, `ff`, comma-sequence context inheritance, and every "never guess" reject path; in `/audit`.
  The tested copy is `src/` (the drifted `web/` copy is its own Partial row). Cosmetic-only gap:
  `formatVerseId`'s unknown-book fallback branch is unexercised. Verdict unchanged.
- **Output contract + V1 verifier — DOWNGRADED Done → Partial.** `test/verifier.test.ts` passes but
  `v1.ts` is only **77.6% statement coverage**, and the uncovered lines are real rejection paths with
  **no exercising test**: the entire `reading` block type (`reading_resolves`, `reading_attribution`),
  `attribution_tradition`, `anchor_valid`/`anchor_order`, `passage_exists`. Screens implement I1/I2/I3/I5
  only (I4/I6 are V2 by design); tests assert I1–I3 but not the I5 true-positive. Schema wiring,
  `section_resolves`, `quote_verbatim`, `attribution_author`/`_work`, `translation_licensed`, and G1
  diversity ARE genuinely tested. The original "20 tests → Done" overstated coverage; corrected.
