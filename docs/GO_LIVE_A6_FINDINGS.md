# A6 line-by-line + deep-audit findings — triage & disposition (2026-07-17)

A fresh-agent line-by-line review of every go-live file (10 file groups + 8
non-overlapping lenses, each finding adversarially verified) plus the earlier
64-agent deep-audit. **142 raw findings → 83 adversarially confirmed** (54 verify
agents dropped on a session limit; their findings were neither confirmed nor
refuted and are not counted). This is the disposition of the 83.

Everything below is DEV-only. No prod, no deploy, no Part C. The owner's away.

## Confirmed CRITICAL (3) — all FIXED + verified

| # | Finding | Fix | Verified |
|---|---|---|---|
| C1 | **Live reader register wall was dead code** — the reader route renders `StudyPanel`, but the register-wall split had been added only to the unused `CommentaryPanel`; `StudyPanel`'s Commentaries tab mixed hymns/poetry into exegetical voices on 38,080 verses and let them displace commentators via `pickDiverse`. | Split into a labeled "Hymns & sacred poetry" section in `study-panel.tsx`; shared `EntryCard` chips. | study-panel.tsx |
| C2 | **Gutenberg served front/back matter under authors' names** — Moxon's bookseller catalog as Tennyson, modern Transcriber's Notes as Watts/Milton, William Strode's poem as Traherne, and watts-hymns' "A TABLE of the Scriptures…" index carried an epigraph so it **verse-anchored into the reader at Genesis 3 / Luke 2** as an Isaac Watts entry. | `GUT_MATTER` filter (heading + body markers), never-anchor-matter, traherne `sacred.end` before the Strode appendix. | 0 leaks across 6 served works; Gen-3 index gone. |
| C3 | **Verifier grounding used overlap, not containment** — a canon-spanning anchor (Gen 1:1–Rev 22:21) touched its own section and grounded ANY passage; a shown passage could extend far beyond its grounding anchor on a sliver of overlap (interpretation-by-selection). | `anchor_offbase` = overlap AND within the section's chapter span; `passages_grounded` = passage contained in a single grounded anchor. Both verifier copies byte-identical. | red-first regressions + 41 tests |

## Confirmed MAJOR — FIXED this session

- **CCEL typed-selector truncation** (~2.7M chars lost from served Owen/Schaff — the entire Trent canons + Longer Catechism): same-level backreference close. Verified Trent unit 248,589 chars (was ~10k).
- **helloao missed chapters** (K&D Ps 147–150, Ezk 46–48, Exo 39–40, Num 36, Job 42): iterate `first..lastChapterNumber` with a discriminated fetch result (absent=skip vs error=fail-closed); unknown book id fails closed; cache validated before write.
- **gutenberg publish default** ignored the manifest serve flag (published quarantined works on a direct CLI run) → respects `serve`.
- **register-writer cross-chapter anchor** produced a broken backwards range in the wrong reader chapter → capped at rest-of-chapter.
- **today.ts had no register wall** — a hymn satisfied the ≥2-voices floor and filled Today's exegetical slots → excludes song/verse.
- **commentary-search FTS failed open on NULL register** → `EXEGETICAL_FTS_EXCLUSION` excludes by register AND by song/verse work slug.
- **legal-corpus publish check was author-blind** on the work-slug branch — a MUST_NOT_SERVE author inside a served work would serve → MUST_NOT_SERVE veto checked first (+ prototype-safe `hasOwnProperty`).
- **adapter-loop resume-integrity could never fire for register works** (they don't write the `sections` table) → uses `sources.status='ingesting'` as the crashed-mid-write signal.
- **b2 skipped the static corpus sweep when the DB was already clean** → checks both stores always.
- **gate-ingest R5** reported green on zero compared chapters (empty-result-as-pass) → SKIP with reason; **L5** DB check was exact-match + commentary_entries-only → normalized `isMustNotServeAuthor` across BOTH stores; **L2b** added — an unparseable served chapter file now fails closed (was a silent skip bypassing L3/L5).
- **register-wall-check had three fail-open legs** (tautological FTS probe, cwd-relative reader path, no-op tally) → real detectors applying the live serving predicates.
- **historian-contract-backfill** trusted the self-attested branch label → endpoint guard.
- **adapter-archive** executed remote JS from GitHub `master` via `Function()` → pinned to a commit SHA.
- **verifier diversity** counted raw voice blocks (two blocks / one section satisfied the floor) → distinct `section_id`s, normalized traditions; **reading title/note** were unscreened assistant text → screened.
- **migration 022** (Part B, dev-applied): `embeddings_write_policy` admitted `user_id IS NULL`, letting `app_runtime` INSERT platform-served rows → scoped to the caller's own rows (owner ingest bypasses RLS). **Migration runners** got the dev-endpoint guard (Part C sets `MIGRATE_ALLOW_PROD=1`).
- **FTS snippet sink** (`ts_headline` → `dangerouslySetInnerHTML`) hardened to escape all HTML and restore only `<mark>` (security review).
- **Index lockstep tests** added for the song/verse HNSW + FTS-legal indexes (routing.ts claimed a guard that no test enforced).

## Confirmed — ESCALATED (logged, deliberately not fixed this run)

### Owner design calls (pre-auth: "log, don't decide")
- **Lexicon/dictionary serving UX.** ISBE (8,928), Easton (3,933), Nave (4,870), Smith (4,362), BDB (9,794 rows on dev; 11,845 was the JSONL decode count) are ingested STAGED (never served). How to surface a topic-keyed reference work — a separate reference pane vs. blending into the exegetical pool — is a product design decision. They are NOT wired to any serving surface; the reference bridge sets `publish:false` unconditionally.
- **Origen.** Staged, never served (standing MUST_NOT_SERVE). But **Catena Aurea serves Origen EXCERPTS** (Aquinas quoting Origen, attributed "Origen (as quoted by Aquinas)"). Whether the Catena's second-hand Origen is acceptable while the Origen voice itself is staged is an editorial call.
- **Herbert OCR warts.** The recovered 1887 Cassell edition has scattered OCR errors in headings (`NATUKE.`, `COLOSSIANS hi. 3.`). Accept, or source a cleaner transcription.

### Part C prod-migration concerns (the deliberate owner step)
- **018/019 drop the live serving index before rebuilding it — RESOLVED (2026-07-18 reconcile).** Both migrations were rewritten zero-window as committed (`CREATE INDEX CONCURRENTLY …_v5` → `DROP` old → `RENAME`; the old app keeps index service throughout), applied via `db/apply-migration-concurrent.mjs`, which is now hardened with an invalid-index guard (pre-cleans INVALID leftovers, post-asserts every touched index VALID+READY). Dev re-applied + converged 2026-07-18. Part C uses the committed files directly — no hand-typed SQL.
- **Duplicate migration number 020 — RESOLVED (2026-07-18 reconcile).** `020_sources_status_ingesting.sql` renamed to `023_sources_status_ingesting.sql` (dependency-free CHECK relaxation; nothing orders after it; runs last, before the re-ingest). Numbers 016-023 are now unique + gap-free. Migrations are applied by explicit filename (no tracking table), so the rename is safe; dev already has it applied under the old name (idempotent re-apply is a no-op).

### GA / status-column cutover (tracked separately, pre-existing debt)
- **sources.status is consulted by no serving surface.** Serving uses the work-slug allowlist, not `status`. A work stuck at `status='ingesting'` whose slug is in the served list would serve partial rows. The permanent fix is the GA status-column cutover (docs/MIGRATION_DESIGN.md). **Mitigation:** the final clean re-ingest stamps every served work `published`; the driver verifies no served work is left `ingesting`. See the post-reingest check in GO_LIVE_STATUS.md.

### Verifier hardening follow-ups (lower exploitability)
- **quote_verbatim admits mid-word / cross-sentence substrings.** A quote is required to be a normalized substring of the cited section (already enforced) — the gap is that it need not respect word/sentence boundaries. Real but low blast radius (still grounded in the source's own text). Follow-up: add word-boundary anchoring to the quote check.
- **`test/verifier.test.ts` dispatch-default regression can't fail in isolation.** The COMPILE-TIME `never` exhaustiveness check is the actual guard (tsc rejects a new block type with no case); the runtime default is a backstop that a test cannot isolate because schema validation rejects unknown types first. Documented limitation, not an open hole.
- **eval RELABEL circularity.** The held-out eval's manual relabels are DIAGNOSTIC (they measure accuracy, not the serving contract) and do not gate what ships. A clean v4 eval rebuild (label from the query's own scripture, never from retrieval output) is the right follow-up.

### Minor (defense-in-depth / API-robustness — logged)
Notable: `/api/search/commentaries` + `/api/messages` numeric params (NaN → 500 rather than a clean 4xx); annotations route catch-all → 401 for non-auth failures; today.ts / library-facet dropping register-work authors from the library browse; various stale doc comments (reconciled in the status-doc rewrite). Full list in the workflow journal.

## Fresh-agent security review — 0 high-confidence vulnerabilities

SQL injection (user inputs are bound params + numeric coercion; only hardcoded
constants are interpolated), XSS (no `dangerouslySetInnerHTML` except the now-
hardened snippet sink; the PR removed the old host-link vector), XXE (regex XML
parsing, no parser), path traversal (sanitized cache ids / numeric verse paths),
secrets (none hardcoded or logged), authZ (no new routes; 021+022 tighten). Two
sub-threshold notes both actioned (snippet sanitize done; the `Function()` eval
pinned).
