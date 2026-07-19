# Content Go-Live — decision record (2026-07-16)

Captures the decisions coming out of the 12-lens alignment audit (plan-vs-reality). This is the strategic record; the operational work order is delivered to Claude Code separately.

## The thesis (why content, why now)

Content is the **fuel for sermon-building.** The moat is personal sermon work cross-referenced against the corpus — but that's only valuable if the corpus is rich enough to *inspire and source* a sermon: "here's what the church has said, sung, and written about this passage — now build from it." So the phase order is: **ingest and serve the corpus → then build sermon search/build on top of it.** The corpus is not a detour from the moat; it's what makes the moat worth using.

## The corrected architecture (what the audit found — verified against the tree)

- **Production serves from the flat `embeddings` table** via `web/src/lib/teacher/routing.ts` — hardcoded to `source_type='commentary'` + a 9-author `LEGAL_CORPUS_FILTER`, across three SQL builders + a byte-locked partial HNSW index (012) + FTS partials (007/009/011).
- **The reader and Today screen serve from static JSON** (`web/public/commentaries/{book}/{ch}.json`), filtered by a client-side allowlist (`web/src/lib/legal-corpus.ts`). No DB, no verifier.
- **The 006 `sources`/`sections` model is applied but read by nothing** (Barnes pilot, ~5,510 rows). The flat→006 cutover was never built.
- **`acquire` doesn't fetch** (the harness just counts existing rows); the new adapters and the `AcquireResult` contract exist only on paper; `MAX_EMBED_CHARS=1000` truncation is still live.
- **The verifier block `switch` has no `default`** → a new block type would silently pass (fail-open). Must be closed first.

## Decisions

1. **Build & confirm the served read path for the new registers (#1).** Keep the flat `embeddings` table as the served store (lowest risk — it's what retrieval reads); do **not** attempt the full 006 GA cutover in this run (too risky to bundle with a large ingest — tracked separately). New verse-anchored content is written into the served store; historians go to 006 staged (below).
2. **Generalize retrieval beyond commentary-only (#2).** Replace the `source_type='commentary'` + 9-author filter with a **register-aware served-corpus filter**, rebuild the partial indexes to cover the new rows, and update the byte-synced invariant tests. **Hymns/poems surface as a distinct labeled register** ("the church in song / in verse"), never blended into the exegetical commentary voices on a doctrinal query, and never counted toward the exegetical ≥2-voices floor.
3. **Ingest everything minus art. Get it live today.** The clean PD/CC tier in `ingest/sources.config.json` (46 works) is license-verified public domain — the **owner authorizes auto-publish of this tier** once Gate B + quality gates pass (the legal-irreversibility concern that normally gates publish is satisfied for verified-PD content). Copyrighted/ambiguous still escalates.
4. **Historians: ingest to 006 STAGED, not served.** Apply the write-contract (chunk-on-headings, `period_*`, `section_history_anchors`) so they're stored correctly and *ready*, but they have no read path yet (`HISTORY_RETRIEVAL_DESIGN`) — surfaced in a later phase.
5. **Art is PARKED — a known-known.** Do NOT ingest art. It waits on image storage + rendering (a later build). `SOURCE_CATALOGUE.md §19` is the complete, documented acquisition map (sources, licenses, Iconclass verse-anchor, flagships) so we never re-research it — we pull it in when the image subsystem exists.
6. **Close the verifier fail-open hole first** — add a `never`-exhaustiveness `default` to the block switch before anything new touches the contract.

## The 006 GA cutover — deferred, tracked

006 is the correct GA model, and history *must* live there (can't fake a verseId). But cutting the *served* retrieval over from the flat table to 006 is a parity-critical rewrite over 190k+ rows and must not ride along with this ingest. This run keeps the flat table served and writes history to 006-staged. The cutover is a separate, scheduled item.

## Guardrails (non-negotiable)

Dev branch, no prod, no deploy from the ingest session, own worktree. Byte-sync `src/` ↔ `web/src/` for any contract/verifier/prompt edit (both trees atomically). Fail closed everywhere; license fail → quarantine; never store copyrighted full text. Embed whole (no `MAX_EMBED_CHARS` truncation on the new path). Prove every gate/test red-first. **Re-run the accuracy diagnostic on any retrieval change — the existing commentary corpus must not regress** (CLAUDE.md: never ship below the accuracy bar). Fresh-agent `deep-audit` after the run.

## Definition of done

New content (minus art; minus historians-served) is **live on both surfaces** — retrievable in `/api/ask` and rendered in the reader/Today — browser-verified at 390px + desktop, console clean, a real interaction exercised. Commentary accuracy not regressed (eval re-run, recorded in WORKLOG). Historians ingested-staged + documented. Art parked + documented. Verifier hole closed. WORKLOG / ROADMAP / STATE_OF_TRUTH reconciled to reality. Audit green, committed, pushed, **not deployed**.
