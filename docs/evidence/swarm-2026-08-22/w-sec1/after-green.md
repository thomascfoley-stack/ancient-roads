# W-SEC1 after-green, 2026-08-23

## Full `npm run audit` in worktree /tmp/swarm-sec1 (branch swarm/w-sec1-dependency-truth)
```
✓ env — audit allow-list (shell + ingest env)
✓ typecheck — tsc --noEmit (strict)
✓ typecheck — cutover gate (scripts/)
✓ typecheck — web/ tsc --noEmit
✓ typecheck — web/test tsc --noEmit
✓ lint — eslint src/ test/
✓ lint — web/ eslint
✓ unused — knip (files/exports/deps)
✓ deps-audit: no un-ignored high/critical advisories across 512 prod packages (bulk endpoint; 8 ignored per SECURITY.md).
✓ deps — advisory bulk-endpoint (prod, high+ CVEs)
 ✓ test/unit-ordinal-cohort.test.ts (21 tests) 10ms
 ✓ test/invariants/served-corpus-authors.test.ts (16 tests) 16ms
 ✓ test/invariants/ci-ephemeral-branch.test.ts (10 tests) 8ms
 ✓ test/corpus-manifest.test.ts (23 tests) 52ms
 ✓ test/ref-parse.test.ts (65 tests) 27ms
 ✓ test/verifier.test.ts (31 tests) 22ms
 ✓ test/normalize-contract.test.ts (14 tests) 9ms
 ✓ test/resource-textmatch-calibration.test.ts (9 tests) 15ms
 ✓ test/ask-max-duration-literal.test.ts (5 tests) 7ms
 ✓ test/excerpt-sample-policy.test.ts (13 tests) 33ms
 ✓ test/routing-orchestration.test.ts (21 tests) 9ms
 ✓ test/invariants/upload-root-lockfile.test.ts (6 tests) 35ms
 ✓ test/front-matter-detector.test.ts (30 tests) 18ms
FAIL: shell DATABASE_URL points at ep-odd-fog-atnykudm — not on the audit allow-list (dev endpoints, localhost, or AUDIT_ALLOWED_ENDPOINT / SEED_TEST_ENDPOINT by exact id). Unset it before npm run audit — qa/vitest inherit shell env.
FAIL: shell DATABASE_URL points at ep-fresh-fork-at000000 — not on the audit allow-list (dev endpoints, localhost, or AUDIT_ALLOWED_ENDPOINT / SEED_TEST_ENDPOINT by exact id). Unset it before npm run audit — qa/vitest inherit shell env.
 ✓ test/invariants/dev-only-target.test.ts (15 tests) 47ms
 ✓ test/publish-flip-census.test.ts (25 tests) 888ms
   ✓ the runner imports the serving predicates rather than restating them > refuses production outright — DRIVEN, not grepped 881ms
 ✓ test/invariants/served-lists-respect-the-manifest.test.ts (8 tests) 3ms
 ✓ test/invariants/source-archive-coverage.test.ts (14 tests) 14ms
 ✓ test/passages-anchor-grounding.test.ts (10 tests) 13ms
 ✓ test/license-manifest.test.ts (20 tests) 12ms
 ✓ test/invariants/ci-claims-match-reality.test.ts (4 tests) 86ms
 ✓ test/rate-limit.test.ts (13 tests) 12ms
 ✓ test/invariants/publish-admission-covers-served-lists.test.ts (12 tests) 4ms
 ✓ test/invariants/no-committed-credentials.test.ts (3 tests) 368ms
 ✓ test/invariants/served-backfill-frozen-sync.test.ts (4 tests) 9ms
 ✓ test/teacher.test.ts (6 tests) 19ms
 ✓ test/invariants/explicit-citation.test.ts (21 tests) 11ms
 ✓ test/unit-ordinal-instrument-preflight.test.ts (10 tests) 14ms
 ✓ test/prod-path-no-transpiler.test.ts (5 tests) 67ms
 ✓ test/auth-rate-limit.test.ts (10 tests) 9ms
 ✓ test/invariants/loop-breakers.test.ts (18 tests) 7ms
 ✓ test/served-assets-count.test.ts (9 tests) 52ms
 ✓ test/invariants/target-guard.test.ts (20 tests) 1701ms
   ✓ the shipped scripts refuse an uppercase production URL > assert-ingest-env-dev.mjs passes with a clean shell (no DB vars) 1266ms
 ✓ test/invariants/user-data-invariant.test.ts (6 tests) 5ms
 ✓ test/topical-refs.test.ts (11 tests) 12ms
 ✓ test/invariants/archive-record-merge.test.ts (7 tests) 22ms
 ✓ test/invariants/reingest-guard-wiring.test.ts (7 tests) 18ms
 ✓ test/ccel-primary-book-anchor.test.ts (6 tests) 7ms
 ✓ test/invariants/book-slug-url-forms.test.ts (72 tests) 10ms
 ✓ test/invariants/g10-verdict-agreement.test.ts (2 tests) 6ms
 ✓ test/passages-grounding.test.ts (4 tests) 31ms
 ✓ test/invariants/manifest-provenance.test.ts (3 tests) 3ms
 ✓ test/corpus-blob-sync.test.ts (6 tests) 7ms
 ✓ test/invariants/g10-baseline-floor.test.ts (3 tests) 5ms
 ✓ test/deps-audit-core.test.ts (8 tests) 13ms
 ✓ test/invariants/web-upload-root.test.ts (2 tests) 110ms
 ✓ test/resource-textmatch.test.ts (7 tests) 4ms
 ✓ test/verse-coverage-core.test.ts (6 tests) 7ms
 ✓ test/normalize.test.ts (12 tests) 5ms
 ✓ test/invariants/coverage-census.test.ts (7 tests) 4ms
 ✓ test/verifier-unassigned-not-a-tradition.test.ts (3 tests) 15ms
 ✓ test/invariants/served-reconcile.test.ts (8 tests) 5ms
 ✓ test/reference-intent.test.ts (8 tests) 46ms
 ✓ test/api-error.test.ts (6 tests) 5ms
 ✓ test/invariants/vercel-json.test.ts (2 tests) 2ms
 ✓ test/gate-decision.test.ts (7 tests) 4ms
 ✓ test/invariants/book-slug-alias-wiring.test.ts (5 tests) 3ms
 ✓ test/embedder-model-guard.test.ts (5 tests) 10ms
 ✓ test/invariants/quarantine-served-corpus.test.ts (9 tests) 2855ms
   ✓ filter > is idempotent — a second run removes nothing 411ms
   ✓ filter > MERGES into an existing quarantine file instead of clobbering it 385ms
   ✓ restore > round-trips: filter then restore reproduces the original entries 389ms
   ✓ restore > does not duplicate entries when restored twice 578ms
 ✓ test/heldout-frozen-hash.test.ts (2 tests) 4ms
 ✓ test/web-core-sync.test.ts (9 tests) 4ms
 ✓ test/invariants/adapter-archive-ryle.test.ts (7 tests) 6ms
 ✓ test/content-sanity.test.ts (7 tests) 13ms
 ✓ test/deps-audit-expect-red.test.ts (4 tests) 3ms
 ✓ test/observability.test.ts (2 tests) 9ms
 ✓ test/invariants/neon-branch-guard.test.ts (4 tests) 7ms
 ✓ test/verse-id.test.ts (5 tests) 3ms
 ✓ test/bible-sync.test.ts (9 tests) 5ms
 ✓ test/evals.test.ts (5 tests) 7ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > adjudicates the REAL production census — the positive control 770ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses a host that is not production, however it is dressed up 2758ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses a PUBLISHED cohort — that would mean the flip already ran 552ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses an empty source list rather than issuing a clean bill of health over nothing 394ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses a census whose row count disagrees with its own declared total 455ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses a census with no rollupDigest — an untraceable verdict 397ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > a PUBLISHED hymn does not STOP the flip — it is served by SONG_VERSE_CORPUS_FILTER 414ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > a STAGED hymn reaches the flip list — the consequence no exit code reports 518ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > a published work in NO served list still STOPS — the fix did not just admit everything 522ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses a DUPLICATE slug, which would inflate the flip list 464ms
   ✓ the A3 adjudicator refuses a census it must not adjudicate > refuses a value that is not a slug 413ms
 ✓ test/invariants/uncited-shingle-parity.test.ts (42 tests) 9458ms
   ✓ verse-level parity over the real KJV index > returns the same verse set as the frozen matcher at K=1: a verbatim quote 1743ms
   ✓ verse-level parity over the real KJV index > returns the same verse set as the frozen matcher at K=1: a quote inside prose 703ms
   ✓ verse-level parity over the real KJV index > returns the same verse set as the frozen matcher at K=1: prose quoting nothing 702ms
   ✓ verse-level parity over the real KJV index > returns the same verse set as the frozen matcher at K=1: multiple quotes 868ms
   ✓ verse-level parity over the real KJV index > agrees at every K on the trade curve, not only at the frozen K=1 3762ms
   ✓ verse-level parity over the real KJV index > agrees ON the distinctiveness boundary, where a verse has EXACTLY minVerseShingles 768ms
   ✓ verse-level parity over the real KJV index > agrees one BELOW the boundary too — the floor excludes, it does not merely include 826ms
✗ tests + coverage — vitest
 ✓ test/user-corpus/model-parity.test.ts (18 tests) 9ms
 ✓ test/regression/plans-routes.test.ts (13 tests) 3171ms
   ✓ Plans routes (handler → store → dev DB, session mocked) > POST creates a Romans plan: 201, days persisted, dates arithmetic 777ms
   ✓ Plans routes (handler → store → dev DB, session mocked) > ACCEPTS Song of Songs — the 2026-08-12 ingest closed the known zero-coverage hole 402ms
   ✓ Plans routes (handler → store → dev DB, session mocked) > creates a Pauline-epistles collection plan spanning book boundaries (ADR-048) 425ms
   ✓ Plans routes (handler → store → dev DB, session mocked) > pins the ±48h window BOUNDARY, so the bound cannot silently widen or vanish 380ms
 ✓ test/user-corpus/anchor.test.ts (20 tests) 20ms
 ✓ test/catalog-filter-wiring.test.ts (21 tests) 29ms
 ✓ test/user-corpus/sniff-and-judge.test.ts (22 tests) 12ms
 ✓ test/search-personal-servability.test.ts (6 tests) 5ms
 ✓ test/ask-outcome-persist.test.ts (11 tests) 16ms
 ✓ test/invariants/work-reader.test.ts (7 tests) 7602ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > 404s a staged source on BOTH routes (published-only boundary) 2673ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > TOC: source whitelist, no bodies, (unitOrdinal, ordinal) reading order, never a host URL 489ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > sections: keyset pages are ascending, non-overlapping, cursor-driven 672ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > sections: the default limit applies when limit is absent 421ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > sections: limit=100000 is clamped — NEVER an unbounded response 427ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > sections: walking nextAfter to the end reconstructs the whole work; the cursor ends null 1855ms
   ✓ Book Reader API — /api/work/[slug] + /sections (executed against the real DB) > sections: malformed params are a 400, never a 500 1064ms
 ✓ test/invariants/legal-hnsw-index-sync.test.ts (11 tests) 36ms
 ✓ test/user-corpus/parse-docx.test.ts (13 tests) 1288ms
   ✓ parseDocx refuses what it cannot honestly read > refuses a bomb that LIES about its size — the case the declaration cannot catch 1260ms
 ✓ test/user-corpus/queue-never-drops.test.ts (15 tests | 1 skipped) 11683ms
   ✓ the queue never silently drops a document > a document whose bytes were never stored FAILS with a reason, rather than being skipped 871ms
   ✓ the queue never silently drops a document > processes every document exactly once across repeated drains 1603ms
   ✓ the queue never silently drops a document > an exhausted document is RETIRED, not left invisible in parsing 676ms
   ✓ the queue never silently drops a document > a stale claim from a dead worker is reclaimed rather than stranded 935ms
   ✓ the queue never silently drops a document > a FRESH claim is left alone — the reclaim is by age, not by status 631ms
   ✓ the queue never silently drops a document > one user's drain never touches another user's queue 1080ms
   ✓ the queue never silently drops a document > reapExhausted reports nothing to do when there is nothing to do 570ms
   ✓ the queue never silently drops a document > a worker killed during chunking is reclaimed, not stranded 957ms
   ✓ the queue never silently drops a document > an exhausted document stuck in chunking is retired rather than left invisible 576ms
   ✓ the queue never silently drops a document > a FRESH chunking claim is left alone — the reclaim is by age, not by status 668ms
   ✓ the queue never silently drops a document > a worker killed during embedding is reclaimed, not stranded 964ms
   ✓ the queue never silently drops a document > an exhausted document stuck in embedding is retired rather than left invisible 565ms
   ✓ the queue never silently drops a document > a FRESH embedding claim is left alone — the reclaim is by age, not by status 635ms
 ✓ test/invariants/research-history-static.test.ts (5 tests) 147ms
 ✓ test/invariants/annotation-rls-tenancy.test.ts (6 tests) 3269ms
   ✓ Phase 3 annotation tables — two-account RLS tenancy (executed) > with NO app.current_user_id set, the tables return zero rows (fail-closed backstop) 432ms
 ✓ test/study-position.test.ts (14 tests) 568ms
   ✓ disambiguatePosition > stays strictly inside the gap for EVERY possible suffix, across adversarial bounds 532ms
 ✓ test/invariants/gate-ugc-blindness.test.ts (5 tests) 29ms
 ✓ test/invariants/commentary-entries-provenance.test.ts (4 tests | 2 skipped) 5ms
 ✓ test/regression/studies-routes.test.ts (8 tests) 2358ms
   ✓ Studies routes (handler → lib → dev DB, session mocked) > 404 NOT_FOUND (never 401) for a well-formed id the caller does not own 556ms
   ✓ Studies routes (handler → lib → dev DB, session mocked) > golden path: create → rename/pin → text block → list in order → delete block → delete study 1207ms
   ✓ Studies routes (handler → lib → dev DB, session mocked) > licensing refusal is 409 NOT_SERVABLE, distinct from 404 582ms
 ✓ test/research-store-edges.test.ts (14 tests) 3974ms
   ✓ research store — edge cases (executed) > E1: a crashed ask (question with no answer) renders as an unanswered turn, not lost 567ms
   ✓ research store — edge cases (executed) > E2: interleaved Q1,Q2,A1,A2 pairs by qid — never misattributed (I1-M1 by execution) 453ms
   ✓ research store — edge cases (executed) > E7: title truncates at 80 with an ellipsis; short titles stay verbatim 367ms
   ✓ research store — edge cases (executed) > E11: an archived thread disappears from the list but stays readable at its URL 377ms
   ✓ research store — edge cases (executed) > E13: updated_at ordering — the most recently ACTIVE thread lists first 358ms
 ✓ test/invariants/tab-bar-reserved-once.test.ts (4 tests) 59ms
 ✓ test/regression/annotations-routes.test.ts (12 tests) 23ms
 ✓ test/user-corpus/search.test.ts (17 tests) 23313ms
   ✓ the three searches > semantic > is EXACT brute force — equals a reference cosine computed here (SLICE_1_DATA_MODEL test 2) 353ms
   ✓ the three searches > keyword > does not throw on punctuation that would break to_tsquery 352ms
 ✓ test/invariants/no-dead-user-table-writer.test.ts (4 tests) 4ms
 ✓ test/invariants/health-corpus-identity.test.ts (13 tests) 130ms
 ✓ test/invariants/work-toc-browse.test.ts (15 tests) 8ms
 ✓ test/user-corpus/chunk.test.ts (16 tests) 7ms
 ✓ test/invariants/ask-composer-mask.test.ts (8 tests) 2ms
 ✓ test/invariants/api-hardening.test.ts (14 tests) 26ms
 ✓ test/invariants/fonts-self-hosted.test.ts (5 tests) 46ms
 ✓ test/verifier-origin.test.ts (4 tests) 16ms
 ✓ test/invariants/prayer-carry-forward.test.ts (11 tests) 18ms
 ✓ test/invariants/ask-outcomes-migration.test.ts (7 tests) 7ms
 ✓ test/invariants/licensing.test.ts (6 tests) 27379ms
   ✓ Layer 1 — licensing invariant (behavioral) > search path: Tyndale Study Notes is never returned 418ms
   ✓ Layer 1 — licensing invariant (behavioral) > teacher legal SQL pool: no quarantined author in top candidates 15220ms
   ✓ Layer 1 — licensing invariant (behavioral) > teacher LEGAL_CORPUS_FILTER admits ALL 9 served voices (presence) 1145ms
   ✓ Layer 1 — licensing invariant (behavioral) > teacher retrieveCommentary: no quarantined author in returned chunks 3238ms
   ✓ Layer 1 — static reader forbidden-provenance ratchet > forbidden-provenance count may only decrease (or must be zero) 6039ms
 ✓ test/user-corpus/upload-quota.test.ts (8 tests) 2966ms
   ✓ H5b — upload quotas > route wiring > at the document cap: a DUPLICATE re-upload still answers 200, a new file gets the 403 953ms
 ✓ test/desk-panes.test.ts (37 tests) 5ms
 ✓ test/invariants/wallet.test.ts (3 tests) 52ms
 ✓ test/user-corpus/corpus-join-integrity.test.ts (4 tests) 4ms
 ✓ test/search-groups.test.ts (16 tests) 11ms
 ✓ test/invariants/unit-ordinal-instrument.test.ts (15 tests | 3 skipped) 27732ms
   ✓ unit_ordinal instrument — published works + digest > passes NULL/order/recompute/digest checks on all published works 27115ms
 ✓ test/invariants/today.test.ts (7 tests) 8ms
 ✓ test/invariants/t1-t3-first-run.test.ts (6 tests) 4ms
 ✓ test/invariants/voice-floor-authors.test.ts (8 tests) 5ms
 ✓ test/regression/chat-write-caps.test.ts (12 tests) 25ms
 ✓ test/invariants/register-end-to-end.test.ts (2 tests) 28953ms
   ✓ §B1 per-register end-to-end (real route handlers, real DB) > every published register has a representative work, and the no-catalog set is exactly as declared 921ms
   ✓ §B1 per-register end-to-end (real route handlers, real DB) > runs the five reader checks for every published register 28031ms
 ✓ test/teach-rejection-capture.test.ts (5 tests) 31ms
 ✓ test/user-corpus/scanned-pdf-real-path.test.ts (3 tests) 601ms
   ✓ a PDF with a real text layer > is read, and accepted 565ms
 ✓ test/user-corpus/routes.test.ts (14 tests) 20395ms
   ✓ the user-corpus routes > upload > rejects a request with no file as 400, not 500 349ms
   ✓ the user-corpus routes > upload > accepts a real document as 201 and indexes it through the drain 17313ms
   ✓ the user-corpus routes > search > answers a text query from the indexed rows 652ms
 ✓ test/invariants/fetched-assets-actually-ship.test.ts (3 tests) 97ms
 ✓ test/original/match-english-word.test.ts (13 tests) 7ms
 ✓ test/invariants/prayers-c9.test.ts (6 tests) 5ms
 ✓ test/study-clipping-trim.test.ts (4 tests) 29ms
 ✓ test/invariants/gate-leg-inventory.test.ts (10 tests) 7ms
 ✓ test/plan-canonical-groups.test.ts (9 tests) 6ms
 ✓ test/invariants/section-label.test.ts (12 tests) 5ms
 ✓ test/invariants/teacher-owner-gate-routes.test.ts (4 tests) 81ms
 ✓ test/invariants/sec1-upload-gate.test.ts (7 tests) 2ms
 ✓ test/invariants/annotation-exact-substring.test.ts (5 tests) 886ms
   ✓ §P1 the exact substring survives the persistence round-trip (RLS) > span_start/span_end read back slice the verse to the EXACT selected substring 578ms
 ✓ test/invariants/studies-grants.test.ts (2 tests) 350ms
   ✓ S-11 — every SQL verb lib/studies.ts issues on the studies tables is granted > every derived verb is granted to app_runtime on the live DB 347ms
 ✓ test/user-corpus/readings-reentrancy.test.ts (8 tests) 1402ms
   ✓ H8 — the readings route > 409s a POST while a FRESH pending run exists — the exact H8 reproduction 355ms
   ✓ H8 — the readings route > lets a POST through once the pending is STALE (the crashed-kick escape) 638ms
 ✓ test/invariants/date-locale-and-plan-title.test.ts (6 tests) 53ms
 ✓ test/invariants/reading-progress-contract.test.ts (27 tests) 8ms
 ✓ test/invariants/migration-zero-window.test.ts (8 tests) 3ms
 ✓ test/history-search.test.ts (16 tests) 10ms
 ✓ test/invariants/must-not-serve-veto-on-fts.test.ts (17 tests) 6ms
 ✓ test/invariants/naming-lock.test.ts (9 tests) 13ms
 ✓ test/invariants/section-vector-pairing.test.ts (1 test) 32045ms
   ✓ §B0 class 2 — every section body matches its own stored vector > re-embedding the body reproduces the stored vector, and discriminates against a neighbour 32044ms
 ✓ test/invariants/register-wall-fail-closed.test.ts (6 tests) 11ms
 ✓ test/user-corpus/pdf-dom-globals.test.ts (11 tests) 427ms
   ✓ the PDF globals do not depend on the optional native canvas > loads the real pdfjs module with our matrix already in place 418ms
 ✓ test/invariants/highlight-range.test.ts (11 tests) 7ms
 ✓ test/teach-stage-timings.test.ts (2 tests) 718ms
   ✓ teach() stage timings (B1) > reproduces seeded stage delays, records EVERY compose attempt, and totals coherently 324ms
   ✓ teach() stage timings (B1) > a compose that THROWS still records its duration (the tail must not hide) 393ms
 ✓ test/desk-cap-overflow.test.ts (11 tests) 13ms
 ✓ test/plan-expand.test.ts (10 tests) 11ms
 ✓ test/invariants/seed-owner-url.test.ts (8 tests) 8ms
 ✓ test/ask-outcome-discriminator.test.ts (6 tests) 47ms
 ✓ test/invariants/pr1c-prayer-surface.test.ts (5 tests) 6ms
 ✓ test/invariants/provider-availability.test.ts (8 tests) 16ms
 ✓ test/invariants/n4-fake-doors.test.ts (7 tests) 11ms
 ✓ test/verse-span.test.ts (11 tests) 8ms
 ✓ test/invariants/work-sections-provenance-static.test.ts (3 tests) 2ms
 ✓ test/user-corpus/pipeline-to-ready.test.ts (4 tests) 22855ms
   ✓ a document goes in and comes out searchable > reaches ready, with sections, vectors and anchors all written 19403ms
   ✓ a document goes in and comes out searchable > re-indexing is idempotent — a retry replaces rather than duplicates 2720ms
 ✓ test/invariants/library-nav-labels.test.ts (5 tests) 4ms
 ✓ test/invariants/history-scope-db.test.ts (2 tests) 9032ms
   ✓ history search — scope and excerpt gate against a real DB > returns historian/published works only, every excerpt verbatim 8093ms
   ✓ history search — scope and excerpt gate against a real DB > an entity anchored ONLY in out-of-scope works returns nothing — the leak direction 936ms
 ✓ test/study-export-docx.test.ts (7 tests) 126ms
 ✓ test/invariants/studies-api-no-get.test.ts (3 tests) 3ms
 ✓ test/posthog-wiring.test.ts (6 tests) 84ms
 ✓ test/invariants/translation-licensing.test.ts (6 tests) 86ms
 ✓ test/regression/bait-route-production-gate.test.ts (6 tests) 276ms
 ✓ test/invariants/docx-extract-redos.test.ts (5 tests) 11ms
 ✓ test/invariants/must-not-serve-format-agnostic.test.ts (18 tests) 6ms
 ✓ test/invariants/chapter-advance-identity.test.ts (5 tests) 28ms
 ✓ test/invariants/search-sections.test.ts (6 tests) 4976ms
   ✓ searchSections — deduped to reading units, and capped > collapses many chunks of one reading unit into ONE result 844ms
   ✓ searchSections — deduped to reading units, and capped > caps the page size no matter what the caller asks for 1855ms
   ✓ searchSections — deduped to reading units, and capped > caps the reported count instead of scanning every match 1791ms
 ✓ test/teach-budget.test.ts (6 tests) 5ms
 ✓ test/invariants/coverage-floor.test.ts (3 tests) 307ms
 ✓ test/history-row-to-result.test.ts (5 tests) 6ms
 ✓ test/user-corpus/upload-rate-limit.test.ts (8 tests) 8ms
 ✓ test/invariants/fts-legal-index-sync.test.ts (1 test) 17ms
 ✓ test/invariants/served-veto-db.test.ts (2 tests) 1115ms
   ✓ MUST_NOT_SERVE — nothing vetoed is serving (DB) > no work whose author matches a vetoed name is serving, unless an owner ruling admits it 1016ms
 ✓ test/user-corpus/plain-excerpt.test.ts (8 tests) 12ms
 ✓ test/invariants/bait-harness-uses-shipped-pipeline.test.ts (7 tests) 147ms
 ✓ test/research-tenancy.test.ts (6 tests) 6742ms
   ✓ Research tenancy invariant (two-account, executed) > listThreads clamps an oversized ask to 50 — proven against >50 real rows (I2-H3) 5166ms
 ✓ test/invariants/register-wall-surfaces.test.ts (6 tests) 15610ms
   ✓ register wall — the NEW catalog + search surfaces > every catalog returns ONLY its declared types (fence holds against real data) 1051ms
   ✓ register wall — the NEW catalog + search surfaces > no catalog surfaces lane/other content that exists in the corpus 848ms
   ✓ register wall — the NEW catalog + search surfaces > catalog-scoped SEARCH honours the same fence 11197ms
   ✓ register wall — the NEW catalog + search surfaces > EVERY cross-corpus search result is register-LABELLED (the caller can honour the wall) 2320ms
 ✓ test/teach-lane-flags.test.ts (4 tests) 14ms
 ✓ test/invariants/daily-light-json.test.ts (3 tests) 182ms
 ✓ test/invariants/s2-era-accent.test.ts (4 tests) 7ms
 ✓ test/invariants/published-authors.test.ts (6 tests) 9ms
 ✓ test/tradition-count-matches-gate.test.ts (4 tests) 5ms
 ✓ test/user-corpus/search-limit-default.test.ts (6 tests) 153ms
 ✓ test/invariants/tradition-gap-wiring.test.ts (6 tests) 10ms
 ✓ test/invariants/plan-tenancy.test.ts (6 tests) 1975ms
   ✓ Plans tenancy invariant (two-account, executed) > positive control: user A reads, toggles, and still owns the plan 384ms
 ✓ test/invariants/sec1-route-guard.test.ts (13 tests) 14ms
 ✓ test/invariants/persist-write-retry.test.ts (7 tests) 42ms
 ✓ test/invariants/gate-next-redirect.test.ts (3 tests) 6ms
 ✓ test/invariants/teacher-owner-gate.test.ts (6 tests) 4ms
 ✓ test/invariants/plan-builder-defaults.test.ts (6 tests) 93ms
 ✓ test/invariants/scroll-fade-focus.test.ts (3 tests) 66ms
 ✓ test/clipping-display.test.ts (7 tests) 9ms
 ✓ test/invariants/highlight-palette.test.ts (5 tests) 5ms
 ✓ test/invariants/commentary-entries-work-column.test.ts (4 tests) 2ms
 ✓ test/middleware-gate.test.ts (3 tests) 54ms
 ✓ test/invariants/highlight-tenancy.test.ts (3 tests) 1603ms
   ✓ §7 sub-verse highlight tenancy (two-account, executed) > round-trips the span: A reads back its offsets, color, and translation 348ms
 ✓ test/embed-model-guard.test.ts (7 tests) 152ms
 ✓ test/invariants/s2-polish.test.ts (3 tests) 6ms
 ✓ test/regression/get-messages-filters-by-user-id.test.ts (2 tests) 18ms
 ✓ test/invariants/neon-auth-wiring.test.ts (5 tests) 6ms
 ✓ test/history-search-route.test.ts (5 tests) 18ms
 ✓ test/invariants/chapter-param-guard.test.ts (5 tests) 6ms
 ✓ test/teach-fallback-deadline.test.ts (1 test) 18ms
 ✓ test/invariants/auth-route-table.test.ts (4 tests) 5ms
 ✓ test/user-corpus/metadata-extract.test.ts (6 tests) 10ms
 ✓ test/paragraph-around.test.ts (7 tests) 73ms
 ✓ test/invariants/popover-position.test.ts (6 tests) 4ms
 ✓ test/plan-topical-expand.test.ts (5 tests) 33ms
 ✓ test/invariants/prayers-route.test.ts (4 tests) 44ms
 ✓ test/marketing-verse-panel-sync.test.ts (1 test) 6ms
 ✓ test/plan-reschedule.test.ts (6 tests) 5ms
 ✓ test/word-articles-route.test.ts (3 tests) 11ms
 ✓ test/invariants/eval-whole-capture.test.ts (2 tests) 6839ms
   ✓ eval-heldout whole-capture > GREEN: a complete run writes every record and exits 0 3142ms
   ✓ eval-heldout whole-capture > RED: a short run is marked incomplete and exits NON-ZERO 3692ms
 ✓ test/invariants/no-returns-empty-by-construction.test.ts (2 tests) 106ms
 ✓ test/db-boot-assert.test.ts (4 tests) 1850ms
   ✓ assertAppRuntimeRole — a boot canary, not a single point of total failure > does NOT brick the app when the DB is unreachable (retries, then serves) 1819ms
 ✓ test/regression/add-message-rejects-foreign-channel.test.ts (2 tests) 8ms
 ✓ test/user-corpus/tradition-gap.test.ts (15 tests) 55999ms
   ✓ the tradition-gap join > returns corpus voices on the passages the document engages 5531ms
   ✓ the tradition-gap join > THE INJECTED PREDICATE IS ACTUALLY APPLIED — this is ADR-104s load-bearing assertion 14236ms
   ✓ the tradition-gap join > a voice is an AUTHOR, not an entry 3122ms
   ✓ the tradition-gap join > the LIMIT counts VOICES, not anchor×entry pairs 2564ms
   ✓ the tradition-gap join > never returns the user’s own words — the trust boundary (§7) 2822ms
   ✓ the tradition-gap join > returns nothing for a document that anchors nothing 1621ms
   ✓ the tradition-gap join > bounds its own output 2765ms
   ✓ the tradition-gap join > REAL EXECUTION — relatedVoices runs its sweeps (ef_search + provenance leg) live 2072ms
   ✓ the tradition-gap join > REAL EXECUTION — computeSuggestedReadings runs its category scan (provenance leg) live 1820ms
 ✓ test/invariants/neon-auth-config.test.ts (3 tests) 1328ms
   ✓ neon-auth.ts fails closed on missing env > throws when NEON_AUTH_BASE_URL is missing 1235ms
 ✓ test/invariants/s2-translation-explainer.test.ts (2 tests) 5ms
 ✓ test/invariants/work-toc-grouping.test.ts (3 tests) 6ms
 ✓ test/invariants/bible-translation-gate.test.ts (4 tests) 11ms
 ✓ test/user-corpus/readings-stale-running.test.ts (4 tests) 78ms
 ✓ test/invariants/tenancy.test.ts (3 tests) 1149ms
 ✓ test/invariants/copy-format.test.ts (6 tests) 5ms
 ✓ test/invariants/servedof-provenance-belt.test.ts (1 test) 4ms
 ✓ test/invariants/snippet-sanitize.test.ts (4 tests) 58ms
 ✓ test/lexicon-404-degrade.test.ts (3 tests) 17ms
 ✓ test/invariants/loud-skip.test.ts (2 tests) 5ms
 ✓ test/plan-reading-label.test.ts (4 tests) 3ms
 ✓ test/invariants/g1-measure-executable.test.ts (28 tests) 8203ms
   ✓ G1 digest SQL is executable for every classified table > measureSql(annotation_tags) runs against the real schema 955ms
   ✓ G1 digest SQL is executable for every classified table > measureSql(channels) runs against the real schema 315ms
   ✓ G1 digest SQL is executable for every classified table > measureSql(notes) runs against the real schema 324ms
   ✓ G1 digest SQL is executable for every classified table > measureSql(plans) runs against the real schema 318ms
   ✓ G1 digest SQL is executable for every classified table > measureSql(waitlist) runs against the real schema 303ms
 ✓ test/save-to-study.test.tsx (19 tests) 2723ms
   ✓ SaveToStudy (design §7.5; E7) > no stored target: the FIRST tap opens the picker (there is no default to save to) 1119ms
   ✓ SaveToStudy (design §7.5; E7) > a stored target that is GONE (404) clears the default and opens the picker 392ms
   ✓ sidebar MY STUDIES (design §7.1) > renders pinned studies first, then recents, then "All studies" — signed in 349ms
 ✓ test/verse-ref-preview.test.tsx (11 tests) 2556ms
   ✓ VerseRef — reading a citation without leaving the plan > on a touch device, tapping opens a sheet with the cited verses 973ms
   ✓ VerseRef — reading a citation without leaving the plan > a malformed reference says so instead of rendering an empty box 403ms
   ✓ PassagePane — the cited window, and the chapter behind it > "Read the whole chapter" widens it in the SAME pane, and can go back 487ms
 ✓ test/auth-session-dedupe.test.tsx (4 tests) 3685ms
   ✓ A102 — session fetches are shared across hook call sites > LEG 1 (property): 25 components on the shipped singleton fire ONE /get-session 1922ms
   ✓ A102 — session fetches are shared across hook call sites > LEG 2 (control/red-proof): 25 components each with their OWN client fire 25 519ms
   ✓ A102 — session fetches are shared across hook call sites > LEG 3 (the /ask shape): consumers arriving progressively still fire ONE 555ms
   ✓ A102 — session fetches are shared across hook call sites > LEG 4 (churn): unmounting every consumer and remounting does not refetch per component 684ms
 ✓ test/invariants/bible-position.test.tsx (22 tests) 3773ms
   ✓ the Bible tab honours the saved position (A034) > renders the DEFAULT in render-only markup, then adopts the stored position after mount 1460ms
   ✓ A034 — the sidebar surfaces follow the stored position too > the nav rail Bible link uses the stored position 556ms
   ✓ A034 — the sidebar surfaces follow the stored position too > falls back to the default when nothing is stored 717ms
 ✓ test/components/study-panel-verse-sequence.test.tsx (15 tests) 4386ms
   ✓ A027 — the panel steps through the chapter > offers no stepping controls at all when the caller cannot navigate 890ms
   ✓ A027 — the panel steps through the chapter > steps forward and back to the verses the caller named 369ms
   ✓ A027 — the panel steps through the chapter > disables the control at each end of the chapter rather than leaving a dead button 319ms
   ✓ A027/A028 through the reader page > walks the chapter from inside the panel, skipping a verse that renders nothing 756ms
   ✓ A027/A028 through the reader page > carries the reader’s tab across a step, on the page’s side too 521ms
   ✓ A027/A028 through the reader page > switches verses when a verse number behind the scrim is clicked 410ms
   ✓ A027/A028 through the reader page > still closes when the click lands on the scrim over nothing 386ms
 ✓ test/components/study-editor.test.tsx (8 tests) 5982ms
   ✓ StudyEditor — autosave and save state > typing in a text block saves by itself (update_text on the block id) and shows Saved 833ms
   ✓ StudyEditor — autosave and save state > S-13: a failed write shows Save failed — Retry, keeps the buffer, and Retry resends it 1917ms
   ✓ StudyEditor — the insert point (v2) > inserts between blocks, creates once with the captured placement, then updates on the returned id 1460ms
   ✓ StudyEditor — movement and the trailing composer (v2) > moves a block up via op:move anchored on the saved neighbor, and adopts the returned position 522ms
   ✓ StudyEditor — movement and the trailing composer (v2) > the ghost composer creates an END block (no anchor) seeded with the first keystrokes 726ms
 ✓ test/invariants/annotation-write-failure.test.tsx (8 tests) 454ms
 ✓ test/invariants/settings-and-auth-routes.test.tsx (12 tests) 800ms
 ✓ test/components/selection-popover-add-to-study.test.tsx (5 tests) 2050ms
   ✓ the reader popover offers "Add to study" exactly where a reference exists > renders the shared Save-to-study verb when the surface supplies a clip reference 1020ms
   ✓ the reader popover offers "Add to study" exactly where a reference exists > renders NOTHING on a surface with no corpus key for the selection (the Bible reader) 371ms
   ✓ the reader popover offers "Add to study" exactly where a reference exists > one tap posts a REFERENCE and nothing else — no quote, no text, no attribution 313ms
 ✓ test/catalog-url-facets.test.tsx (11 tests) 5804ms
   ✓ the work list is paged, and the cap is visible > offsets the query by the requested page — the cap becomes passable 1132ms
   ✓ the work list is paged, and the cap is visible > a bad or absent ?page= degrades to the first page rather than 400ing 1791ms
   ✓ the work list is paged, and the cap is visible > renders Next but not Previous on page one, and both in the middle 1406ms
   ✓ the work list is paged, and the cap is visible > a paging link keeps every filter, and a FILTER link resets the page 470ms
 ✓ test/invariants/ask-client-live.test.tsx (12 tests) 6591ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L1: the thread event swaps the URL to /ask/{id} via replaceState — no new history entry 1867ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L3: saved:false renders the not-saved notice; saved:true renders none 631ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L4: the follow-up POST carries the threadId from the first ask 320ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L5: a stream that ends with no done/error resolves to the terminal-state guard 523ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L6: an error event renders the error and a retry that re-asks THIS question 624ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L8: an initialThread mounts with its id armed — the FIRST live ask already appends 600ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L9: filter state is ephemeral — a remount starts with everything visible (§4.7) 502ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L10: a live composed answer renders voices AND the Show row appears with it 608ms
   ✓ live ask path — stream, thread URL, saved signal (exhaustive pass) > L12: a malformed NDJSON line is skipped without killing the stream 413ms
 ✓ test/plans-builder-preview.test.tsx (7 tests) 5692ms
   ✓ the builder previews the real plan > shows the reading count, the pace and the span before anything is submitted 2106ms
   ✓ the builder previews the real plan > disables Create while the preview is a refusal, so the dead end is unreachable 842ms
   ✓ the builder previews the real plan > recomputes when the scope changes, not only the schedule 428ms
   ✓ the builder previews the real plan > a collection previews across book boundaries 467ms
   ✓ the builder previews the real plan > each mode explains itself, so the tabs are not three unlabelled nouns 327ms
   ✓ a half-typed schedule is an incomplete form, not a crash > clearing Weeks shows a quiet finish-the-numbers refusal and disables Create 323ms
   ✓ a half-typed schedule is an incomplete form, not a crash > clearing Days each week never renders "Infinity" in topic mode 1190ms
 ✓ test/catalog-search-sends-filter.test.tsx (7 tests) 2371ms
   ✓ CatalogSearch sends the filter it is showing > sends one ?tradition= per selected value — the line whose deletion nothing caught 372ms
   ✓ CatalogSearch sends the filter it is showing > sends offset=0 on a fresh search, and Load More asks for the next page 1063ms
   ✓ CatalogSearch sends the filter it is showing > a fresh search after Load More replaces results and resets to offset 0 627ms
 ✓ test/invariants/work-toc-bounded.test.tsx (7 tests) 6273ms
   ✓ WorkToc — bounded render (O(units), not O(sections)) > a 3,440-section work mounts on the order of its 16 units, not its sections 1136ms
   ✓ WorkToc — bounded render (O(units), not O(sections)) > every unit is represented exactly once at rest, labelled by its first heading 903ms
   ✓ WorkToc — bounded when the UNIT list is large > a 9,770-unit lexicon does not mount 9,770 rows 880ms
   ✓ WorkToc — bounded when the UNIT list is large > the rest stays reachable — "show more" reveals another page 1129ms
   ✓ WorkToc — bounded when the UNIT list is large > search narrows what is mounted, and says how many matched 1555ms
   ✓ WorkToc — bounded when the UNIT list is large > a query that matches nothing says so rather than rendering an empty drawer 631ms
 ✓ test/invariants/ask-show-filter.test.tsx (10 tests) 6072ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > stored turns render dated and historical, voices and lanes present 1038ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > §4.4 LANE chunks tombstone by sourceId (I1-H1 family) 309ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > chips carry REAL counts (I2-L1) and only registers that returned rows get one 1703ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > unchecking Sermons hides that section INSTANTLY; rechecking restores it 437ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > "only" isolates; "Show all" appears ONLY while something is hidden (I2-L2) and restores 404ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > hiding Commentary hides the framing paragraph with it (deviation D3) 589ms
   ✓ §4.7 Show filter + stored-thread rendering (variant A) > hiding every register states so — never a silently blank pane 1103ms
 ✓ test/invariants/bookmark-write-path.test.tsx (7 tests) 370ms
 ✓ test/components/sidebar-tablet-default.test.tsx (7 tests) 3645ms
   ✓ A093 — the sidebar boots to the icon rail at tablet widths > renders the rail at 768px and the full sidebar at 1280px 2204ms
   ✓ A093 — the sidebar boots to the icon rail at tablet widths > does not fire on the phone side of the cliff either 377ms
   ✓ A093 — the sidebar boots to the icon rail at tablet widths > the rail a tablet boots into carries the SAME destinations as the writing-mode rail 376ms
 ✓ test/components/desk-pane-loading.test.tsx (7 tests) 1965ms
   ✓ a work pane before its metadata arrives > shows neither the raw slug nor "Unlabelled" anywhere a reader can see them 419ms
   ✓ a work pane before its metadata arrives > does not put the slug or "Unlabelled" into the accessible names either 1055ms
 ✓ test/components/my-works-upload-batch.test.tsx (10 tests) 3562ms
   ✓ D14 — the drop zone is a real drop zone > dragover is prevented-default, so the tab does not navigate 611ms
   ✓ D15 — client-side pre-checks, before any transfer > an obviously-unaccepted extension is refused immediately, no network 330ms
   ✓ D13 — parallel uploads with per-file status > the per-file list is a status region 1461ms
 ✓ test/sidebar-catalog-nav.test.tsx (6 tests) 1600ms
   ✓ the sidebar actually RENDERS a link to every catalog > one anchor per catalog, with its label — commenting the block out goes red here 1577ms
 ✓ test/invariants/work-reader-paging.test.tsx (6 tests) 131ms
 ✓ test/components/work-reader-add-to-study.test.tsx (2 tests) 2417ms
   ✓ the Book Reader hands the popover a real corpus key > a selection in a work saves that SECTION to the study, by sections.id 2118ms
 ✓ test/components/desk-nav-and-session-note.test.tsx (7 tests) 3444ms
   ✓ A072 — the Desk is reachable from the app’s own navigation > the rail renders a link to /desk, with a label 455ms
   ✓ B043 — the same entry exists at mobile width > the mobile menu sheet carries the /desk link 2306ms
   ✓ A080 — the Desk states that its state is session-only > a populated desk says so too — the state that can be lost is the one already built 306ms
 ✓ test/components/desk-cap-notice.test.tsx (9 tests) 3183ms
   ✓ a desk under the cap says nothing about it > two panes: no status line at all 1690ms
 ✓ test/components/my-works-file-size.test.tsx (7 tests) 2102ms
   ✓ B016 — fmtBytes reports small files truthfully > THE INVARIANT: no non-empty size formats to a leading zero 1259ms
   ✓ B016 — the status wall shows the real size > a 130-byte upload renders "130 bytes", not "0 KB" 545ms
 ✓ test/components/desk-pane-continuous-read.test.tsx (5 tests) 3666ms
   ✓ the desk work pane reads continuously > loads the next page when the end nears the viewport — no click 853ms
   ✓ the desk work pane reads continuously > keeps a working manual fallback — proven by a real click, not by presence 1583ms
   ✓ the desk work pane reads continuously > a button far below the viewport does not trigger a load; scrolling near does 432ms
   ✓ the desk work pane reads continuously > a burst of scroll events mid-flight does not stack duplicate loads 338ms
   ✓ the desk work pane reads continuously > a failed load-more keeps the read, shows Retry, and does NOT storm 448ms
 ✓ test/components/work-reader-progress-sync.test.tsx (6 tests) 1202ms
   ✓ N1 — the Book Reader syncs a signed-in reader’s position to their account > posts the position to the progress route 467ms
   ✓ N1 — the Book Reader syncs a signed-in reader’s position to their account > collapses a burst of sections into a single write 387ms
 ✓ test/components/marketing-nav-focus-order.test.tsx (4 tests) 781ms
   ✓ A098 — marketing header focus order > the current page is a focusable link that says it is current 646ms
 ✓ test/components/ask-terminal-state.test.tsx (4 tests) 2412ms
   ✓ L1 — a stream that ends without a terminal event still resolves > a truncated stream lands in the failure state with a retry, not a permanent spinner 1909ms
   ✓ L1 — a stream that ends without a terminal event still resolves > a complete stream is NOT forced into the failure state 410ms
 ✓ test/components/daily-office.test.tsx (6 tests) 2485ms
   ✓ the Daily Office on /home > composes Daily Light (the local half), the due plan card, and Spurgeon 1651ms
 ✓ test/components/my-works-resilient-fetch.test.tsx (5 tests) 3028ms
   ✓ My Works — a response the page did not expect > B020: renders a rate-limit error as readable text instead of crashing the page 1959ms
   ✓ My Works — a response the page did not expect > B020: renders a 400 error envelope for an over-long query 446ms
   ✓ My Works — a response the page did not expect > B021: a non-JSON search response says so instead of rendering nothing 339ms
 ✓ test/components/prayer-autosave.test.tsx (3 tests) 7668ms
   ✓ Prayer compose redesign — autosave > has NO Save and NO Cancel, and typing saves by itself: create once, then update 3129ms
   ✓ Prayer compose redesign — autosave > editing an existing prayer autosaves an UPDATE on its id and never creates 2728ms
   ✓ Prayer compose redesign — autosave > an empty draft is never written 1775ms
 ✓ test/invariants/work-section-lineation.test.tsx (6 tests) 174ms
 ✓ test/invariants/search-result-attribution.test.tsx (5 tests) 714ms
   ✓ search results are attributed > renders the AUTHOR of every result 385ms
 ✓ test/invariants/selection-popover-layout.test.tsx (4 tests) 514ms
   ✓ the desktop card: swatches and actions are structurally isolated > all ten colours render — the count that exposed the defect 381ms
 ✓ test/components/word-study-occurrences.test.tsx (2 tests) 2478ms
   ✓ A044 — an occurrence link lands on the verse, not the top of the chapter > the reader word panel links to /read/jhn/3#v16 1213ms
   ✓ A042 — the standalone lexicon carries the cross-verse occurrence list too > opening an entry shows its occurrences, verse-anchored 1260ms
 ✓ test/invariants/selection-collapse-grace.test.tsx (3 tests) 130ms
 ✓ test/invariants/signed-in-derivation.test.tsx (5 tests) 98ms
 ✓ test/components/desk-stacked-pane-position.test.tsx (5 tests) 1139ms
   ✓ a stacked desk says how many panes there are and which one you are on > two panes: each is numbered, and the first says the next is below it 932ms
 ✓ test/components/study-library-panel.test.tsx (3 tests) 3351ms
   ✓ StudyLibraryPanel > searches the active register group and renders labelled rows 917ms
   ✓ StudyLibraryPanel > Add sends a REFERENCE (sectionId + placement), never quote/attribution text, and hands the block back 1543ms
   ✓ StudyLibraryPanel > a 409 from the write renders the not-servable refusal on that row 881ms
 ✓ test/components/ask-signed-out.test.tsx (3 tests) 2113ms
   ✓ Q1 — the sign-in requirement is announced before submission > a signed-out reader is told, and given a link, with nothing submitted 545ms
   ✓ Q1 — the 401 offers a way out, not just a way to re-fail > the failure state carries a sign-in link beside "Ask again" 1476ms
 ✓ test/invariants/drag-handle-swallows-clicks.test.tsx (4 tests) 674ms
   ✓ a press that starts on a control does not become a sheet drag > does not capture the pointer when the press starts on the close button 429ms
 ✓ test/components/word-study-lang-race.test.tsx (2 tests) 2001ms
   ✓ Q3d — an abandoned lexicon load cannot write itself into state > resolving the Greek load AFTER switching to Hebrew does not show Greek 1941ms
 ✓ test/invariants/mobile-menu-labels.test.tsx (4 tests) 3103ms
   ✓ B044 — the Menu trigger announces itself and its state > carries a title that cannot disagree with its accessible name 1140ms
   ✓ B044 — the Menu trigger announces itself and its state > exposes open/closed through aria-expanded, the channel screen readers announce 601ms
   ✓ B044 — every control inside the Menu sheet has a name > the sheet is a named dialog whose X carries a name AND a title 734ms
   ✓ B044 — every control inside the Menu sheet has a name > no control in the sheet is nameless — Sign out included, and visibly labelled 621ms
 ✓ test/components/sidebar-collapse-label.test.tsx (3 tests) 2813ms
   ✓ A095 — the sidebar collapse control names the state it will move to > offers to COLLAPSE while open, and to EXPAND once collapsed 2397ms
   ✓ A095 — the sidebar collapse control names the state it will move to > carries a hover tooltip that follows the state too 332ms
 ✓ test/components/work-header-save-shelf.test.tsx (7 tests) 2337ms
   ✓ N3 — the Book Reader can put a work on the reader’s shelf > asks the shelf route what the state is, and offers Save 1325ms
   ✓ N3 — the Book Reader can put a work on the reader’s shelf > saving PUTs to the shelf route and flips the label 376ms
   ✓ N3 — the Book Reader can put a work on the reader’s shelf > un-saving DELETEs and flips back 440ms
 ✓ test/components/research-thread-delete.test.tsx (4 tests) 3854ms
   ✓ the research-history delete control > takes two taps: the first arms, the second deletes 2531ms
   ✓ the research-history delete control > deletes the row it is on, by id 454ms
   ✓ the research-history delete control > removes the row optimistically 417ms
   ✓ the research-history delete control > puts the row BACK when the request fails — the list must not lie about the account 444ms
 ✓ test/components/tap-highlight-mode.test.tsx (6 tests) 589ms
 ✓ test/components/settings-close-on-study.test.tsx (3 tests) 3432ms
   ✓ A031 — opening the study dialog closes the reading-settings popover > closes on the keyboard path, which fires no mousedown 2308ms
   ✓ A031 — opening the study dialog closes the reading-settings popover > does not reopen when the dialog closes, and Aa still works afterwards 939ms
 ✓ test/components/study-delete-button.test.tsx (5 tests) 1249ms
   ✓ B028 — deleting a study > takes two taps: the first arms, the second deletes 734ms
 ✓ test/components/selection-popover-define.test.tsx (4 tests) 1941ms
   ✓ Option A — the original word in the popover > one match: shows the word, the count, the chip — and picking it hands over the match 1576ms
 ✓ test/components/my-works-dates-and-stuck.test.tsx (4 tests) 2258ms
   ✓ D17 — search results carry the document date > a hit row renders its document's date 1743ms
 ✓ test/components/search-studies-tombstone.test.tsx (4 tests) 430ms
   ✓ StudiesGroupRows — snippet vs tombstone (audit 2026-08-17, domain lens #2) > T1: a snippet hit renders the sanitized headline with its <mark>, linking to the study 403ms
 ✓ test/invariants/ask-passage-link.test.tsx (1 test) 838ms
   ✓ a passage citation links to its verse, or to nothing — never to a substitute book > SEED: restore the local `readerHref` -> a resolvable cite loses its verse and an unresolvable one points at John 834ms
 ✓ test/components/desk-empty-cta-adds-scripture.test.tsx (2 tests) 2805ms
   ✓ the empty desk keeps Scripture ON the desk > offers no route to the plain reader — the Scripture call to action is not a link away 1169ms
   ✓ the empty desk keeps Scripture ON the desk > picking a book and chapter puts a Scripture pane on the desk, in place 1633ms
 ✓ test/components/study-panel-selection.test.tsx (3 tests) 778ms
   ✓ Option C — Word study pins the selection > pins the match on top, expanded, with the twice-in-the-Greek caption and a deduped rest 572ms
 ✓ test/invariants/verse-keys.test.ts (2 tests) 129610ms
   ✓ §3 verse-key distribution (live gate; announces NOT RUN when the gitignored corpus is absent, e.g. CI) > no author (≥200 entries) has >20% of entries keyed verse_start=verse_end=chapter 34785ms
   ✓ §3 verse-key distribution (live gate; announces NOT RUN when the gitignored corpus is absent, e.g. CI) > no SERVED (published) entry carries a biblehub.com / studylight.org sourceUrl 94813ms
 ✓ test/components/pray-entry-point.test.tsx (5 tests) 1473ms
   ✓ PR1a — the Pray entry point > offers Pray over this verse to a signed-in reader, carrying the verse 1232ms
 ✓ test/components/mobile-bar-bookmark-order.test.tsx (2 tests) 1825ms
   ✓ B024 — the mobile bar puts Bookmark ahead of the overflow > Bookmark comes BEFORE the highlight swatch run 1544ms
 ✓ test/components/study-panel-all-voices.test.tsx (4 tests) 1342ms
   ✓ Q3 — a stated shortfall comes with a way to close it > 11 voices: ten render, and the 11th is reachable 711ms
   ✓ Q3 — a stated shortfall comes with a way to close it > expanding APPENDS — the ten already on screen do not reorder 520ms
 ✓ test/components/sidebar-writing-rail.test.tsx (3 tests) 1894ms
   ✓ the sidebar drops to an icon rail while a prayer is being written > swaps the full nav for the rail on the writing signal, and back when it clears 902ms
   ✓ the sidebar drops to an icon rail while a prayer is being written > hover expands the rail, leaving it collapses it again 687ms
   ✓ the sidebar drops to an icon rail while a prayer is being written > ⌘\ toggles the expansion from the keyboard 303ms
 ✓ test/components/foreign-highlight.test.tsx (4 tests) 413ms
 ✓ test/catalog-row-affordances.test.tsx (2 tests) 947ms
   ✓ a catalog work row > names its primary link after the work it opens (A066 reported this missing; it is not) 866ms
 ✓ test/invariants/verse-open-gesture.test.tsx (3 tests) 290ms
 ✓ test/components/unhighlight-affordance.test.tsx (3 tests) 1839ms
   ✓ B046 — un-highlighting is offered in the popover > offers removal when the verse carries a highlight 1694ms
 ✓ test/components/prayer-delete-headless.test.tsx (2 tests) 2084ms
   ✓ PR1c — headless delete, no page-context patching > deletes end to end with NO stubbed confirm, and the DELETE reaches the API 1841ms
 ✓ test/invariants/work-reader-ui.test.tsx (4 tests) 392ms
   ✓ WorkSection — container-concat invariant (§3) > textContent EXACTLY equals a multi-paragraph body with markup-ish characters 340ms
 ✓ test/invariants/verse-deep-link.test.tsx (6 tests) 180ms
 ✓ test/components/ask-error-banner-message.test.tsx (4 tests) 1445ms
   ✓ A017 — the error banner always carries a message > an error event with no message field still renders a message, not a bare frame 856ms
 ✓ test/components/study-panel-bookmark.test.tsx (4 tests) 1346ms
   ✓ B022 — the study panel offers the bookmark toggle > renders the toggle and one press toggles the verse 974ms
 ✓ test/components/cross-verse-selection.test.tsx (3 tests) 10ms
 ✓ test/components/withdrawn-thread-fail-closed.test.tsx (3 tests) 543ms
   ✓ audit #7 — the withdrawal belt fails closed on unresolvable voices > withdrawals present + unresolvable voice = attribution, no quote 400ms
 ✓ test/components/highlight-bloom.test.tsx (3 tests) 164ms
 ✓ test/components/history-filter-reset.test.tsx (1 test) 820ms
   ✓ history filters reset between searches > a century filter from one search does not empty the next 819ms
 ✓ test/components/ask-single-flight.test.tsx (2 tests) 1149ms
   ✓ A015 — a same-tick double submit spends once > two synchronous submits of one question produce ONE POST 348ms
   ✓ A015 — a same-tick double submit spends once > a SECOND question after the first settles still submits 799ms
 ✓ test/components/my-works-retry-remove-errors.test.tsx (3 tests) 1561ms
   ✓ D16 — the server's sentences reach the screen > a 409 on retry surfaces the server's own message 1115ms
   ✓ D16 — the server's sentences reach the screen > a failed remove says so instead of silently keeping the row 322ms
 ✓ test/invariants/chapter-param-no-dispatch.test.tsx (2 tests) 274ms
 ✓ test/components/word-page.test.tsx (4 tests) 566ms
   ✓ Option D — /word/[strongs] > renders the full entry: headword, sounds, senses, and the concordance 330ms
 ✓ test/user-corpus/translation-detect.test.ts (7 tests) 143405ms
   ✓ detection over the real shipped indexes > BAR 3 (pre-registered): 10 synthetic BSB sermons detect bsb, each with confidence > 0.6 143356ms
 ✓ test/components/ask-retry-replaces.test.tsx (2 tests) 901ms
   ✓ A010 — a failed ask is replaced on retry, not duplicated > retrying a 401 leaves ONE question and ONE error, not two 782ms
 ✓ test/components/word-articles.test.tsx (2 tests) 179ms
 ✓ test/components/bookmark-state-label.test.tsx (2 tests) 607ms
   ✓ B023 — the bookmark control reflects the verse it is on > offers to ADD when the verse is not bookmarked 513ms
 ✓ test/invariants/settings-cross-links.test.tsx (3 tests) 415ms
   ✓ B038 — the two settings surfaces link each other > /settings links to account settings (the direction that already shipped) 393ms
 ✓ test/invariants/history-results.test.tsx (5 tests) 843ms
   ✓ HistoryResults > deep links use the established /work/{slug}#s{ordinal} contract and carry the thread + encoded query 459ms
 ✓ test/components/study-entrance.test.tsx (4 tests) 769ms
   ✓ the study entrance routes into History mode > an example chip submits immediately 541ms
 ✓ test/invariants/omnibox-verse-anchor.test.tsx (4 tests) 173ms
 ✓ test/components/history-ask-autorun.test.tsx (2 tests) 269ms
 ✓ test/components/work-section-landing.test.tsx (3 tests) 118ms
 ✓ test/user-corpus/draft-check.test.ts (4 tests) 149385ms
   ✓ draft check > anchors a draft in-process — detection live, no rows written, no spend 146403ms
   ✓ draft check > finds the user's own document on the same passage, and the tradition beside it 2808ms
 ✓ test/components/my-works-draft-check.test.tsx (3 tests) 729ms
   ✓ My Works — the draft check > renders overlaps and tradition voices 536ms
 ✓ test/components/my-works-remove.test.tsx (2 tests) 643ms
   ✓ B017 — removing an upload asks first > the first click does not delete; the second does 507ms
 ✓ test/components/sign-out-arming.test.tsx (2 tests) 591ms
   ✓ B044 — sign-out is a two-step control > the first tap arms and does NOT sign out; the second signs out 496ms
 ✓ test/components/word-links.test.tsx (2 tests) 448ms
   ✓ Strong’s chips are destinations > Word study rows: the chip is a link beside the toggle, never nested in it 395ms
 ✓ test/components/ask-history-invite.test.tsx (2 tests) 411ms
   ✓ the church-history invitation on the voices empty state > leaves the column once a question has been asked 334ms
 ✓ test/components/suggested-readings-load-failure.test.tsx (4 tests) 424ms
   ✓ SuggestedReadings — the wait ends > a 500 ends in a message with a retry, not a permanent "Loading…" 361ms
 ✓ test/components/plan-route-states.test.tsx (2 tests) 324ms
 ✓ test/components/reader-hint-gesture.test.tsx (2 tests) 227ms
 ✓ test/components/search-groups-works-rows.test.tsx (3 tests) 85ms
 ✓ test/components/history-context-bar-query.test.tsx (3 tests) 199ms
 ✓ test/auth-rate-limit.test.ts (10 tests) 7ms
 ✓ test/rate-limit.test.ts (13 tests) 11ms
✓ qa — Layer 1 invariants + regressions
✓ hygiene — no test residue in dev (post-suite)
✓ deploy.sh — gate harness (bash)
✓ GATE B PASSED: no license/provenance violations.
✓ data — Gate B license (fail-closed)
AUDIT FAILED (1): tests + coverage — vitest
```

AUDIT_EXIT=1 — sole failure is the PRE-EXISTING thayers baseline red:
```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses at the same gate (subprocess, no DB, no evidence file)
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true
```
Baseline attribution: the test asserts docs/evidence/thayers-source-verification.md does NOT exist; that file is committed at base 9dce273 (`git ls-tree -r 9dce273 --name-only | grep thayers`), so this test fails identically on the unmodified base. It is W-BASEFIX's item — noted, not fixed, per the W-SEC1 brief.

## deps gate inside the audit (the leg this workstream owns)
```
▶ deps — advisory bulk-endpoint (prod, high+ CVEs)
(node:49803) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)
deps-audit scanned package versions (findings):
✓ deps-audit: no un-ignored high/critical advisories across 512 prod packages (bulk endpoint; 8 ignored per SECURITY.md).
✓ deps — advisory bulk-endpoint (prod, high+ CVEs)
```

## web/package-lock.json regenerated (upload-root-lockfile invariant)
Recipe from test/invariants/upload-root-lockfile.test.ts header: package.json + .npmrc copied to a dir with no ancestor node_modules, `npm install --package-lock-only`, copied back. `npx vitest run test/invariants/upload-root-lockfile.test.ts` -> 6/6 pass. This staleness was introduced by the version bump and is part of the fix.

## web build
`npx next build` in web/ -> "✓ Compiled successfully in 6.9s" (log /tmp/wsec1-web-build.log).
