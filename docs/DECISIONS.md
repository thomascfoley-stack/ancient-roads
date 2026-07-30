# Decision Log (ADRs)

One short entry per irreversible or architectural decision: **context → decision → why → alternatives rejected.** Newest at the bottom. Backfilled from `WORKLOG.md` history; keep it current going forward.

---

## ADR-001 — Concordance, not commentator (architectural guarantee)
**Context:** An AI Bible tool that interprets Scripture is both theologically presumptuous and a trust-killer. **Decision:** The product never interprets/adjudicates/fabricates; it retrieves, quotes, and attributes. Enforced *architecturally* by a JSON output contract + a verifier that fails closed before render — not by prompting alone. **Why:** The guarantee must hold even when the model misbehaves. **Rejected:** Prompt-only guardrails (unreliable); a general chatbot (defeats the premise).

## ADR-002 — Auth: clean-start over migrate-existing
**Context:** Pre-launch, ~0 real user accounts. **Decision:** When moving auth, everyone re-registers; do not build an id-preserving migration of existing accounts. **Why:** Collapses the riskiest part of the auth work (password-hash portability, session mapping) to trivial. **Rejected:** Full migrate-existing path (unnecessary complexity for data that doesn't exist yet).

## ADR-003 — Move off the `@neondatabase/auth` beta (SEC-1)
**Context:** The beta pins `better-auth@1.4.18` → 2 critical + 7 high CVEs (incl. GHSA-g38m account-takeover), unfixable via override (tested — breaks the build), and a black-box HTTP session path that made `/account`/logout unreliable. **Decision:** Migrate to Better-Auth-direct (own the version + `accountLinking` config); interim = standalone logout + social-login-only for beta. **Why:** Can't patch a managed beta we don't control; it's the gate for public launch. **Rejected:** Continuing to patch the beta (whack-a-mole); staying on it for launch. See `docs/AUTH_MIGRATION_SPIKE.md`.

## ADR-004 — Public-domain translations for search; copyrighted display-only
**Context:** Embedding requires storing full text; every modern copyrighted translation (ESV/NIV/NASB/NLT/CSB) forbids full-text storage, and Crossway won't license solo developers. **Decision:** Build the embedded/search core on **BSB** (public domain, modern) + WEB/KJV/ASV; offer copyrighted translations, if at all, as per-request API *display* only — never in the search index. **Why:** Legal necessity; BSB gives the "modern readable, freely embeddable" translation ESV can't. **Rejected:** Licensing ESV (ineligible as solo dev; AI/embedding separately restricted even for Logos). See `DATA_SOURCES.md`.

## ADR-005 — Models: Qwen3.5-35B-A3B (compose) + BGE-large (embed), pinned
**Context:** The compose model was configured as the non-existent `Qwen3.6-...`, silently auto-forwarded by DeepInfra to a ~60s/compose fallback. **Decision:** Compose = `Qwen/Qwen3.5-35B-A3B` (DeepInfra); embed = `BAAI/bge-large-en-v1.5` (1024-dim), **pinned** — all corpus embeds must use the same model or vectors aren't comparable. **Why:** Correcting the name was a ~13× latency win; a pinned embedder is a hard invariant. **Rejected:** Self-hosting weights (premature); mixing embedding models (breaks comparability). Groq/Together deferred as a later speed lever.

## ADR-006 — Teacher is stateless per turn
**Context:** A "study partner" implies memory, but cross-turn memory lets the model reason over its own prior (possibly interpretive) output and drift. **Decision:** Each `/ask` question is answered independently — fresh retrieval, no prior turns fed to the model. **Why:** Statelessness is how a concordance avoids drift. **Rejected:** Conversational memory now (reconsider later as *retrieved-context* continuity only, never model-output continuity).

## ADR-007 — Accuracy target 10/10; caching/curation only on top of fixed retrieval
**Context:** Diagnostic shows ~4/10 true success — the teacher answers with the *wrong* passage's commentary (Gospels-only embedding + dead BM25). **Decision:** Retrieval accuracy (true-success diagnostic) must reach **10/10** and is a gate before beta. Semantic-answer cache + curated topical library are built **only after** accuracy is fixed. **Why:** Caching a wrong pipeline serves wrong answers instantly to everyone. **Rejected:** Shipping/caching at 4/10; treating the reranker as optional polish (it's the direct precision fix).

## ADR-008 — Commentary sourcing: SWORD/CrossWire primary; never scrape aggregators
**Context:** Need complete, structured, legally-clean commentary corpus. **Decision:** Primary source = SWORD/CrossWire modules (bulk download is intended use, explicit per-module license, complete works); fill gaps from Wikisource/archive.org PD text + STEP Bible (CC BY). **Never** scrape BibleHub/StudyLight. **Why:** Aggregator ToS forbid commercial reuse (enforceable breach-of-contract/trespass — the hiQ pattern) even where content is PD. **Rejected:** Scraping aggregators; CCEL's markup (commercially restricted).

## ADR-009 — SEC-2: least-privilege role + RLS as the data-isolation boundary
**Context:** App connected as `neondb_owner` (BYPASSRLS) → RLS was inert; `highlights`/`notes` had no policy. **Decision:** App runtime connects as non-owner, non-BYPASSRLS `app_runtime`; RLS enabled + policies on all user tables; session var set transaction-locally via `transaction([set_config, query])` on the pooled driver. **Why:** RLS must be the enforced second layer, not just defined. **Rejected:** Relying on `WHERE user_id` filters alone (one forgotten filter = cross-user leak). Verified with two-account isolation.

## ADR-010 — `sources` + `sections` is the corpus ingestion target
**Context:** Multi-source PD ingestion needs per-work provenance + license (legal, ADR-008) and a full-works structure (to render entire commentaries in the popup). The running `commentary_entries` (flat, verse-keyed snippets) has neither. `CORPUS.md`/`SCHEMA.md` already design a `sources` + `sections` + `section_embeddings` model with provenance, license, tags, and a staged→published QA gate. **Decision:** All new corpus ingestion targets `sources`/`sections`; migrate the existing 371k into it (dual-read during transition, then cut retrieval over). **Why:** Provenance/license is existential compliance and full-works structure is required for the reading experience — better to adopt the well-designed model than bolt fields onto the flat table. **Rejected:** Extending `commentary_entries` with provenance columns (no full-works structure, no QA-gate concept); maintaining two corpus models permanently. See `docs/INGESTION_TASK.md` §0.

## ADR-011 — Composio + MCP as the integrations backend (Engine 2)
**Context:** The integration layer (Engine 2 / Studies + Workspace) needs to push content *out* of Ancient Paths to the tools pastors and students use — Google Docs/Slides (sermon/paper export), calendar (reading plans). Building each integration by hand is slow. **Decision:** Use **Composio** as the managed integration backend (handles OAuth + connectors) plus **MCP**, **behind our own integration interface** so it's swappable. Direction = outbound push (Ancient Paths → external tools). **Why:** Composio removes the per-integration OAuth/API plumbing. **Rails:** (1) abstract behind our own adapter — do not hard-couple (the LLM/embedder adapter precedent + the Neon-Auth-beta lesson: never depend on an unwrapped vendor); (2) minimal OAuth scopes, tokens as secrets, explicit per-integration user consent — this is a new write-access security surface, treat it auth-grade; (3) **any AI-composed content pushed out (sermon draft, study plan) still passes the verifier** — the concordance guarantee extends to exports, a fabricated quote in an exported Google Doc is the same failure; (4) pick the 1–2 integrations that serve the personas (Docs export, calendar), resist "integrate with everything" — Composio makes adding easy, which is exactly the scope-creep risk. **Rejected:** hand-building each integration (slow); hard-coupling to Composio (vendor lock-in). **Sequencing:** downstream — gated behind accuracy 10/10 and the Workspace/Studies modes existing. Record now, build later.

## ADR-012 — Infra footprint: Vercel + Neon, no persistent server; batch the large jobs
**Context:** Considered DigitalOcean / Render for cloud execution and a home for cron/workers/long jobs. **Decision:** Keep a minimal *managed* footprint — **Vercel** (app compute + static-asset CDN + cron), **Neon** (durable storage + pgvector), **DeepInfra** (LLM + embeddings, external), **TrustClaw-on-Vercel** for Engine 2 (cron agent + Composio integrations). **No persistent DO/Render server.** Long batch jobs (full-corpus embedding, SWORD ingestion) run as **resumable, checkpointed, idempotent batches** — cron-driven chunks or an occasional throwaway runner — never on a standing server. **Why:** Vercel covers every ongoing workload; a persistent server is ops burden for a problem we don't have. TrustClaw is Vercel-native — forking it to DO means replacing cron/AI-gateway/blob + owning server ops for zero benefit. Batch jobs are occasional, so they need a *runner*, not a *service*. **Requirement:** batch jobs must be re-runnable/idempotent (already the pattern — `ON CONFLICT DO NOTHING`, skip-and-continue). **Rejected:** persistent DO/Render servers (premature ops); forking TrustClaw off Vercel. **Open follow-up:** a proper staging environment (staging Vercel deploy + Neon branch) — the real remaining infra gap.

## ADR-013 — Self-host all content; never link out
**Context:** Some commentary entries currently render an outbound `sourceUrl` "read the source" link. **Decision:** All corpus content — Bibles, commentaries, sermons, historians — is **ingested and surfaced in-app**; we do **not** link users out to the origin site. The full text lives in Ancient Paths (`sections`), rendered in the reader/popup. Categories (`source_type`): `bible · commentary · sermon · historian` (+ `theology`/`father`). **Why:** control, speed, offline, a coherent reading experience, and no dependence on external sites staying up or their ToS. **Rails:** retain the origin `sourceUrl` + edition in the *provenance record* (license/attribution basis) but never render it as a user-facing outbound link; attribution (author/work/edition/year) is shown, the external URL is not. See `INGESTION_TASK.md` §8. **Rejected:** linking out to CCEL/archive.org/etc. at read time (fragile, external dependency, and CCEL markup is commercially restricted anyway).

## ADR-014 — The reranker is core to retrieval, not optional polish (100% vs 97%)
**Context:** Two questions were left open by earlier work: does BM25 fusion (hybrid) beat vector-only, and is the cross-encoder reranker a load-bearing stage or a droppable latency cost? ADR-007 already *suspected* the reranker was "the direct precision fix" but had no measurement. A new 30-query labeled eval (`eval-retrieval.mts`) across the hard categories (verse-ref, proper-noun, exact-term, rare-topic, topical) measured each pipeline config head-to-head. **Decision:** Production retrieval is **vector + BM25 (hybrid) → `Qwen/Qwen3-Reranker-0.6B` cross-encoder rerank**, and the reranker is a **core, non-removable stage** — deploy and keep the full pipeline. **Why:** On the eval, `vector-only = hybrid = 97%`; `full (hybrid + reranker) = 100%`. The reranker is the *only* config that reaches 100% — e.g. it repaired "the Word became flesh" → John 1, which vector and hybrid both scattered. Dropping it is therefore a measured regression to a known-wrong result on a hard query, not a neutral optimization. BM25 fusion is accuracy-neutral on pure retrieval here but is retained (cheap; aids exact-term/proper-noun recall that feeds the reranker; harmless where neutral). **Caveat (honesty of the number):** the eval is Gospel/reformed-heavy, so "100%" is scoped to that coverage — every new tradition/book block ingested must add labeled queries before the number is claimed to hold there (see `NEXT_PHASE.md` §4). **Rejected:** vector-only or hybrid-only for latency (both cap at 97% — leave a hard query wrong); treating the reranker as optional polish (ADR-007's suspicion, now disproven by data — it is the lift); chasing the last 3% by tuning compose/verify (that residual is a faithfulness-axis quote-drift handled by the fail-closed fallback, not a retrieval defect). See `WORKLOG.md` 2026-07-09 and ADR-005 (pinned models).

## ADR-015 — Reference/pericope routing: soft-boost injection + an on-passage floor
**Context:** The 88-query failure-code eval (ADR-014's harder successor) found `no-content=0%` — every retrieval miss is **reranker drift on verse-ref queries**: the query names a passage ("1 Corinthians 13", "the armor of God") but the cross-encoder ranks a semantically-near but off-reference passage first (1 Cor 13 → John 15 "greater love"). Legal-corpus verse-ref HIT=1 was only 46%. This is a *ranking* defect, not a coverage or content defect, so more corpus (CrossWire-5/libsword) has **zero ROI** and is dropped. **Decision:** Add **reference/pericope intent routing** as a retrieval-only stage (`docs/REFERENCE_ROUTING_DESIGN.md`). (1) `resolveIntent(query)` (numeric ref-scan extending `ref-parse` + a references-only named-pericope **gazetteer**) yields the canonical verse-ID ranges a query names; topical queries yield none and are untouched. (2) **Soft-boost:** inject the top ≤8 vector matches *within* those ranges (MATERIALIZED-CTE range-scan, migration 007 partial index) into the reranker pool — never a hard filter, because most references are multi-passage and a false positive must stay recoverable. (3) **On-passage floor:** because the reranker still owns final order, reserve the top 2 slots for the best-reranked on-passage voices. **Why the floor (measured, not assumed):** soft-boost alone barely moved the number (verse-ref HIT=1 46%→50%) — the injected voices sat in the pool but the reranker still led with the drifted passage. Adding the floor took **verse-ref HIT=1 46%→96% on the legal corpus, with no full-corpus regression** (full HIT=2 85%→98%). **Concordance guarantee preserved:** this reorders *which grounded voices* surface — the JSON output contract, the fail-closed verifier, and "never interpret" are all untouched; a resolved reference is a location index, never a claim about meaning. **Rejected:** hard-filtering to the named range (kills topical breadth + a false-positive detection strands the query); soft-boost without the floor (measured insufficient — the reranker re-buries the on-passage voices); pericopes encoding meaning rather than locations (would make the gazetteer an interpretive act). **Scope caveat:** the gazetteer grows reactively as measured misses reveal named passages (a data change, not code); the one residual (Sermon-on-Mount ↔ Luke 6 beatitudes) is a label-overlap, not a miss. See `WORKLOG.md` 2026-07-10 and `RESOURCING_PLAN` §14.

**Precision amendment (false-positive probe, `probe-reference-routing.mts`):** the floor forces on-reference voices to the top, so a mis-detection *hijacks* topical queries — and a bare pericope-name match is idiom-prone (8/12 idiomatic queries fired: "good shepherd insurance company" → John 10, "bread of life bakery" → John 6). So `resolveIntent` returns **two tiers**, `{ inject, floor }`: **numeric references floor unconditionally** (a chapter number is explicit intent — high precision), but a **pericope floors only with biblical corroboration** (a second named passage, or a general-lexicon token surviving after the matched phrase is stripped). Un-corroborated pericopes still *inject* (soft-boost is false-positive-safe) but never seize the top slots — a mis-detection cannot hijack a topical query. Measured: precision 12/12 (no hijack), recall 8/8 (genuine queries still floor), held-out generalization 5/5 numeric + 5/5 honest no-route; legal verse-ref HIT=1 held at 96% and routing lifts the **full** corpus too (verse-ref 54%→85% vs the no-route baseline — no regression). **Rejected here:** flooring bare pericope names (the hijack); a hand-tuned stopword/anchor list reverse-engineered from the eval (the lexicon is general biblical vocabulary — books, theology, major figures — not the query set).

## ADR-016 — surfaced=1 diversity: on-passage backfill + per-PASSAGE cap
**Context:** After the ≥2-available diagnostic (WORKLOG 2026-07-10) proved the topical/epistle HIT@2 gap is 100% retrieval (0% content), the 14 misses split into surfaced=1 (right passage in top-6, only 1 author on it, the 2nd voice below the pool) and surfaced=0 (passage never reaches top-6). A first surfaced=1 attempt (on-passage backfill + a per-**author** cap) regressed topical 65→50: because the cap was per-author, 6 distinct-author voices from the #1 reranked chapter all passed it, collapsing the top-6 onto one (often off-target) chapter. **Decision:** the surfaced=1 fix is **on-passage backfill + a per-PASSAGE (chapter) cap**. Backfill: for the top-3 surfaced chapters, fetch the top-by-vector entry per (chapter, author) over the legal corpus (007-index range-scan) and splice each missing author adjacent to its chapter's lead. `selectDiverse` then caps at **2 voices per chapter** (was per-author) so the 2nd voice survives **while cross-passage coverage is preserved** (the top-6 can never collapse onto one chapter). On-reference (floored) voices stay exempt (ADR-015). Single-sourced in `routing.ts`; production `retrieveCommentary` and the eval `retrieveLegal` call the same functions. **Why (measured, zero regression):** whole frozen v2 topical 65→70, epistle 72→76, verse-ref HIT@2 93→100, proper-noun HIT@2 90→100, `<2-voices`→0; v3 (out-of-sample) epistle 64→84, topical 70→75; no category regressed; interpretation_bait held 35/35=100% live. **Latency:** +1 DB range-scan, p50 427ms / p95 561ms (top-3 chapters), on a retrieval whose embed+rerank dominate — flagged for a GA optimization. **Rejected:** the per-author cap (measured collapse); backfilling all K chapters (top-3 is accuracy-identical at ~½ the latency); building the 2nd voice from an off-vector verse (loses the on-topic verse the reranker found). Does NOT address surfaced=0 (ADR pending, item 3). See WORKLOG 2026-07-11 and `docs/PER_PASSAGE_CAP_DESIGN.md`.

## ADR-017 — Do NOT build the Torrey doctrine router (item 3): circular, guarantee-breaking, interpretive
**Context:** ADR-016 left "item 3" (a doctrine router built from R.A. Torrey's New Topical Textbook, to fix the surfaced=0 topical/epistle misses) pending. Queues #3–#4 measured it. **Decision: it is NOT built, and should not be — for three measured reasons, none of which a router can fix.** (1) **It is circular.** Torrey's topics are a *superset* of the confessions: "Justification Before God" contains **5 of 5** of the Westminster Shorter Catechism's proof-text chapters; aggregate **~92% containment** of WSC proof-texts across doctrines. A Torrey-built router graded on WSC labels is training on the test set, and the "discriminating subset" (doctrines where the two traditions *disagree*, the only honest grading set) is empty (**n≈0**). The number a router would post is fake. (2) **It bypasses the ≥2-voices guarantee.** Floored chapters are exempt from the per-passage cap (`routing.ts` ADR-016), and the on-passage backfill then splices in *every* author on a floored chapter — so a doctrine-floored query collapses HIT@2 to HIT@1 (one chapter, many voices) exactly where diversity is the metric. (3) **It is the interpretive act ADR-015 explicitly rejected.** "Armor of God → Eph 6" is a *string/location* index (the query names the passage). "Sanctification → these 26 chapters" is **Torrey's editorial theological judgment** about which passages teach a doctrine; adopting it silently inside retrieval is the product making an interpretive claim in its own voice — the one thing the concordance guarantee forbids. **Rejected:** the router in every form. **If a topical index ships at all, it ships as an ATTRIBUTED VOICE** ("Topics as listed in R.A. Torrey's New Topical Textbook, 1897") the user can see and weigh — never a hidden router that reorders retrieval. **The real fix for topical/epistle is DATA** (embedding coverage, chunking, pool — §2), not a router. See WORKLOG queue #3 §6 (circularity measured) and queue #4 §3.

## ADR-018 — Phase A retrieval fix: measured to completion, then REVERTED (not shipped)
> **⛔ SUPERSEDED (2026-07-14, PHASE_A_CLOSE §5/§8).** This ADR's numbers ("topical H2 75 / epistle 84") were
> measured on the pool-STARVED instrument (≤5 delivered candidates) and are **replaced** by the re-measurement on
> the shipped un-starved path (`pool=20, ef=64`, frozen v3, read-only): **verse-ref 95/98 · pericope 87/100 ·
> epistle 72/88 · topical 35/70 · proper-noun 80/90 · control clean.** Epistle 84→88, topical 75→70 (the old 75 was
> the 5-doc artifact). The old numbers are kept below for history but are NOT current. The finding that follows —
> that "CANDIDATE_POOL sweep is flat" and "topical is at the retrieval CEILING" — was measured **before** the pool
> fix, when
> `legalBasePool` ran at the default `ef_search=40` and the legal filter starved the delivered pool to ~5 regardless
> of the requested size. A flat sweep on a starved instrument is indistinguishable from a real ceiling, so **the
> pool-sweep leg of this ADR is not trustworthy until the sweep is re-run on the un-starved (ef=64, partial-index)
> pipeline.** A fresh v3 re-measurement at the shipped `pool=20, ef=64` (2026-07-14, read-only) gives **verse-ref
> 95/98 · pericope 87/100 · epistle 72/88 · topical 35/70 · proper-noun 80/90 · control clean** — i.e. epistle H2
> **84→88** (better than this ADR's baseline) and topical H2 **75→70** (the old 75 was the 5-doc artifact: the reranker
> had almost no pool to choose from). The "recall fix needs a partial HNSW index" call (a) was **vindicated and shipped**
> (migration 012). The "topical is at the ceiling" call (b) is the one to re-test with a real pool sweep before trusting.

**Context:** Phase A aimed to lift topical/epistle HIT@2 to the 85 bar. Measured on prod (`docs/PHASE_A_DIAGNOSIS.md`): the vector index is already HNSW (schema.sql was stale — fixed 2026-07-13); the CANDIDATE_POOL sweep is flat (20→100) and 200 is worse; it is NOT a content gap (every failing label has ≥3 legal authors vectored). Using the exact-rank window query, the failing labels' 2nd on-label voice sits at exact vector rank **#22–#140**, and the default HNSW `ef_search=40` under the selective legal filter drops it from the pool before rerank. **Decision — two distinct problems, neither shipped:** (a) **epistle→85 is a RECALL fix** — `iterative_scan` + `ef_search=200` lifts epistle H2 84→92, but `/ask` latency goes ~5s→12–14s (2.5×), so it needs a **partial legal HNSW index** (fast high-`ef`), not a runtime knob; the naive form was **REVERTED**. (b) **topical→85 is at the retrieval CEILING** — no config (pool 20–200, iterative_scan, ef 40–400, vector/rerank blend) surfaces 2 on-label voices into the top-6; it needs a *feature*, not a knob. Prod stands at the fast baseline (topical H2 75 / epistle 84). An earlier "reranker demotes rank #1" diagnosis in this line was WRONG and is corrected in the diagnosis doc. **Rejected:** shipping the latency regression; chunking+re-embed (zero gain — vectors already exist).

## ADR-019 — Do NOT re-embed the corpus (hypothesis falsified)
> **⚠ PROVISIONAL in part (2026-07-14, CA1).** The "no re-embed" decision has three legs — the `resolveIntent` floor,
> the §1b label-limited finding, and the one-way-door schema risk — and those are **independent of the pool bug and
> still stand.** But any sub-argument that leaned on the pre-fix pool sweep (e.g. "the pool already saw everything, so
> the embedding is the limiter") inherits ADR-018's provisional status: re-confirm on the un-starved pipeline before
> quoting it. The decision's *conclusion* (don't do a blind full re-embed; use the A/B-safe `section_embeddings` schema
> if you ever swap models) is unaffected.

**Context:** the standing hypothesis was that a thematic/chunked re-embed would lift topical/epistle. **Decision: NO full re-embed.** Phase A showed the verse-ref signal (95) comes from the `resolveIntent` floor, not the embedding (74% topical / 75% verse-ref signal in the first 1000 chars — identical), and §1b (2026-07-13) showed topical is largely **label-limited**, not embedding-limited. A full re-embed is also a **one-way door**: `embeddings.embedding` has no `model_slug`, so a model swap overwrites the only copy; the A/B-safe schema is `section_embeddings` PK `(section_id, model_slug)`, which is not yet in use. The §1a bge query-instruction-prefix A/B (2026-07-13) confirmed a query-representation change is a **trade-off** (epistle 84→92 but topical 80→60), not a free win — NOT shipped. **Rejected:** full re-embed; a model swap without the A/B-safe schema. **Scope note (§2, 2026-07-13):** this prohibition is about *re-embedding what exists*; a future **incremental, additive** embed of repaired biblehub OT rows (`docs/CORPUS_VERSE_KEY_REPAIR.md`) is a different, permitted operation.

## ADR-020 — For a DERIVED key, assert the distribution, never the row
**Context:** `commentary_entries.verse_start` was set to the CHAPTER number for ~14 biblehub-sourced authors (§2 / `docs/CORPUS_VERSE_KEY_REPAIR.md`). Every per-row guard we had passed it: the value is an integer, in range, `verse_start ≤ verse_end`, and it renders fine — so a Barnes comment on Rom 8:1 is cited "Rom 8:8" and nothing flags it. It stayed invisible for months. **Decision:** when a column is a DERIVED key (parsed, computed, or mapped from a source — verse numbers, source_ids, slugs, embeddings keys), the invariant test asserts the **distribution across rows**, not the shape of any single row. Here: for every author with ≥200 entries, the fraction with `verse_start = verse_end = chapter` must be < 0.20 — a threshold measured from the data (clean authors 0.9–6.9%, broken authors 99.9–100%; the two populations are an order of magnitude apart), never guessed. `web/test/invariants/verse-keys.test.ts` encodes it. **Why:** a plausible-but-wrong value is exactly the failure a row-level constraint cannot see; only the shape of the whole column reveals it. **Rejected:** per-row range/format checks (they all passed); trusting the ingest (the adapter was the bug); raising the threshold to make the current corpus pass (that deletes the signal — the test is committed RED/`.skip` as an honest baseline until the repair).

## ADR-021 — Historians are born in the 006 model; the write-contract gates bulk ingest (2026-07-16)
**Context:** bulk ingestion v2 needed a home for `source_type='historian'` (Josephus first; Schaff/Eusebius/
Edersheim pending a clean-source ruling). Forcing history into the verse-keyed `embeddings` table means
fabricating a `verseId` for prose about events — the corruption the verse-key repair exists to kill.
**Decision:** historians (and new sermons) are ingested ONLY into `sources`/`sections` (006), per
`docs/HISTORY_RETRIEVAL_DESIGN.md` §9: migration `016_history_sections.sql` (section-level `period_*`,
`section_history_anchors`, tsv over heading+body) applied to the DEV branch only; chunk on the source's own
headings; embed every chunk whole (truncation asserted impossible, not merely avoided); entity anchors come
from a hand-seeded gazetteer and are written only when the label is verbatim in the section (kind = curated
human fact, never model inference); scripture anchors only where the text explicitly cites (span-audited);
`status='staged'`, never served until a history read path exists and the owner publishes. **Also decided:**
the pilot ran on Josephus (CrossWire, license in `.conf`) instead of Schaff because the run's source rule —
CCEL text only via CrossWire/SWORD — is unsatisfiable for Schaff; substituting the pilot work is an
execution call, but *sourcing Schaff at all* is the owner's (escalated, not guessed). **Rejected:** blind
token-window chunking; bootstrapped entity tagging without human curation; treating archive.org OCR
historians as clean tier; applying 016 to prod this cycle.

## ADR-022 — Epistle/topical are diagnostic, not launch gates (2026-07-14)
**Recorded 2026-07-18; cited-but-unrecorded until now.** `STATE_OF_TRUTH.md` and `PHASE_A_CLOSE.md` have
cited "ADR-022" for this decision since 2026-07-14/15, but no entry existed here — this records it properly,
dated to the decision. **Context:** at n=25/20 the epistle/topical 95% CIs both span the 85 bar, so
pass/fail is unmeasurable at those n; verse-ref/pericope/proper-noun are objective and adequately powered.
> **Status qualifier (ADR-028, 2026-07-19):** "hard launch gate" below means **public launch**. For the
> **gated beta**, proper-noun HIT@1 60<70 is an **ACCEPTED LIMITATION**, pending a re-measure at larger n.
> ADR-028 is the single place that status is ruled; do not restate it elsewhere.

**Decision:** verse-ref, pericope, and proper-noun are the **hard launch gates**; epistle and topical HIT@2
are **diagnostic** — reported, failure-coded, and tracked toward the 85 GA bar, but a miss is a documented
limitation, not an auto-no-ship. **Why:** gating on a statistically unmeasurable number is theater; the
honest instrument fix (a larger held-out) came later as v4 (ADR-024). **Rejected:** treating 70/88-at-small-n
as a hard fail; quietly dropping the 85 bar (it stays, as the GA target).

> **Numbering-collision note (2026-07-18):** the Library-Reader design docs originally cited
> "ADR-021/ADR-022" for *reader* decisions, colliding with the entries recorded here (historians/006 and
> diagnostic-gates). RESOLVED: the reader decisions landed below as **ADR-026/ADR-027** and
> `LIBRARY_READER_BUILD.md` now cites those numbers.

## ADR-023 — Sermon/theology register lanes = ship config option (c) (2026-07-18)
**Context:** the go-live re-ingest expanded the exegetical pool to ~297k rows (~40% sermon chunks) and
broad-query accuracy dropped. `docs/SERMON_LANE_DIAGNOSIS.md` measured 6 pool configs and found the old
"70/88" baseline unreproducible (propped up by since-removed forbidden-provenance rows + a struck circular
relabel) and the regression **NOT purely the sermon flood** — no exclusion config recovered it; the whole
prose expansion shifts broad-query ranking. Sermons/theology are also categorically not verse exegesis:
ranking them against commentators inside one pool misrepresents both. **Decision:** ship config **option
(c)** — the exegetical pool (and the ≥2-voices floor) = verse-commentary + fathers ONLY; sermons, theology,
and hymns surface in **labeled register lanes** on all 4 surfaces via the shared `partitionByRegister`, with
a two-leg register wall (register column + work slug) on both the vector and FTS paths. **Why:** lanes keep
the breadth users want while the concordance floor stays exegetical; measured honestly on v3+v4 (ADR-024)
rather than against a mythical baseline. **Rejected:** shipping the mixed pool as-is (broad-query precision
loss); /ask commentary-only with no lanes (hides the new corpus from /ask entirely); per-work caps/down-
weights (measured insufficient in the diagnosis; tuning-to-the-test risk).

## ADR-024 — Held-out v4: mint/freeze with self-anchored labels (2026-07-18)
**Context:** v3 had been measured against repeatedly (pool fix, ef sweeps, lane diagnosis) — by held-out
discipline it is a **dev set**; and A6 flagged v3's RELABEL path as circular. The option-(c) ship decision
needed a set nothing was tuned against. **Decision:** mint `FROZEN_V4` (120 q, same composition as v3),
**labels derived only from the query's own scripture reference or quoted KJV wording** (never from
retrieval output; anchors checked against the in-repo KJV at mint time, though the check script was not
committed — re-runnable verification is a v4.1 item, and 3 labels are disclosed conceptual parallels
rather than phrase-containing chapters; the audit's independent 46-anchor spot-check passed 46/46),
content-hash-pinned
(`90de5dc3…`) before any accuracy number existed, bars pre-registered (carried unchanged from this doc
suite's 2026-07-10 bar rationale — 8 days prior); **no relabel path** — any label fix is a v4.1 re-freeze
with a new pin. Run ONCE: clears every bar except proper-noun HIT@1 60<70 (owner call). **Known caveats
(recorded at audit, 2026-07-18):** topical 90 / pericope 80 are point estimates whose CIs straddle their
bars; the KJV-phrase-anchored style under-exercises the abstract-topical failure mode; no Song of Solomon
sampling, so no-content 0/110 does not clear the SoS hole — see `HELDOUT_EVAL_DESIGN.md` §v4 caveats and
the v4.1 checklist. **Rejected:** relabeling v3 again (circular); gating the ship on the v3 dev set.

## ADR-025 — Zero-window index migration policy (2026-07-18)
**Context:** the original 018/019 dropped the live serving index before rebuilding — on prod that opens the
ef=40 starvation window that killed migration 009. **Decision:** any migration touching a **serving** index
is zero-window by construction: `CREATE INDEX CONCURRENTLY <name>_vN` (new name, new predicate) → `DROP
INDEX CONCURRENTLY` old → `ALTER INDEX … RENAME` — the old index serves throughout, and old predicates must
imply the new so it *can*. Applied only via `db/apply-migration-concurrent.mjs` (splits on `--SPLIT--`,
since CONCURRENTLY cannot run in a txn block), which pre-cleans INVALID leftover indexes and post-asserts
every touched index VALID+READY (a failed CONCURRENTLY build leaves an INVALID index; re-running the same
command rebuilds it). **Never drop-first on a serving index — dev included** (dev must converge to the
committed files, not to a hand-run variant). **Rejected:** drop-then-create (the 009 failure mode);
hand-typed prod SQL diverging from the committed migrations (the drift this reconcile just cleaned up).

## ADR-026 — `sections` is a retrieval unit; add a first-class `unit_ordinal` reading-unit grouping (2026-07-18)
**Context:** Ingestion chunks a work into embedding-sized `sections` with headings like `"TITLE — ref (1/3)"` (`ingest-sermon.ts`), so `sections` is the *retrieval* unit, not the *reading* unit. The Book Reader (`docs/LIBRARY_READER_DESIGN.md` §2, §8.1) must reconstruct a readable work; the two options were (a) MVP: collapse consecutive same-title chunks at render time, or (b) durable: a first-class `sections.unit_ordinal` grouping column. **Decision:** build **(b) — add `sections.unit_ordinal`** (owner-run migration), grouping a work's chunks into stable reading units, populated at ingest and backfilled for existing sources. The reader orders by `(unit_ordinal, ordinal)`; annotation anchoring is unchanged (still `section_id` + offset into `sections.body`). **Why:** Spurgeon-scale works (3,560 sermons) and Calvin's *Institutes* are already in the corpus and go straight into the catalogs — the design doc names `unit_ordinal` as required *before* Spurgeon-scale ships, so the render-time collapse would be throwaway work with a correctness cliff (mis-collapse on repeated titles). A durable key computed once at ingest is boring and correct. **Rejected:** render-time collapse (heuristic, breaks on duplicate/again titles, redone at Spurgeon-scale anyway); a separate `reading_units` table (a grouping column on the existing rows is the smaller honest slice — no new join on the read path). Owner-run + red-first (seed a mis-ordered chunk set, prove the reader reassembles in `(unit_ordinal, ordinal)` order). See `docs/LIBRARY_READER_DESIGN.md` §7a. *(Authored as "ADR-021" in the reader-WIP docs; renumbered here per the ADR-022 collision note.)*

## ADR-027 — Section-anchored annotations pin a content hash; degrade to a section indicator on drift, never a corrupt highlight (2026-07-18)
**Context:** A highlight/note/bookmark on a *work* anchors to `section_id` + char offsets into `sections.body`. Re-ingesting a source (better OCR, edition repair) can shift `sections.body`, which would silently move every offset — the exact class of failure the translation-pin lesson (verse offsets are translation-relative) already taught us to fear. **Decision:** every section-anchored annotation stores `source_content_hash` (a hash of the anchored `sections.body` at capture time). On render, if the current body's hash ≠ the stored hash, the annotation **degrades to a section-level indicator** ("you highlighted something in this section") rather than painting a now-wrong span — and is flagged for optional re-anchoring. It is **never** rendered as a corrupt/mis-placed highlight, and never silently dropped. **Why:** a wrong-span highlight is worse than an honest "this moved" marker; failing closed to a section indicator preserves the user's intent without asserting a false location. **Rejected:** trusting offsets across re-ingest (silent corruption); deleting drifted annotations (data loss the user never chose); auto-re-anchoring by fuzzy match (guesses a location — the interpretive-guess failure mode; offer it, never do it silently). Red-first: re-ingest a section with shifted text, prove a pinned annotation degrades to the indicator and does not paint the wrong span. See `docs/LIBRARY_READER_DESIGN.md` §4, §8.2. *(Authored as "ADR-022" in the reader-WIP docs; renumbered here per the collision note.)*

## ADR-028 — Launch-blocking vs accepted-limitation: the three standing rulings (owner, 2026-07-19)

**Context:** The same three known gaps were framed inconsistently across the docs — each was called
both "hard launch gate" and "accepted limitation" depending on which file an agent happened to read
first. An agent reading one file adopts a premise the next file contradicts. **This ADR is the ONE
place these are ruled.** Where any other doc states a status for these three, it must point here.

**Decision (owner):**

**1. proper-noun HIT@1 60 < 70 — ACCEPTED LIMITATION for gated beta; BLOCKING for public launch.**
Re-measure at larger n before public launch: 60/100 on n=10 carries a wide CI and may not be a true
regression. Until that re-measure exists, do not describe the 60 as either "a regression" or
"cleared".

> **Reconciling the two live numbers (this is the falsified-premise risk):** `PHASE_A_CLOSE.md`
> records proper-noun **80/90** and calls the hard gates held; frozen v4 records **60/100**. Both
> were true of their own run and neither supersedes the other by date alone. They are NOT
> comparable: PHASE_A_CLOSE is **v3, n=10, the pre-option-(c) config**; v4 is **a different frozen
> set, n=10, the option-(c) lane config**. Two n=10 samples on different sets and different configs.
> **The v4 figure (60/100) is the current one** because it measures the shipped config. The
> PHASE_A_CLOSE 80/90 is historical and must not be quoted as current — it is annotated in place.

**2. Song of Solomon — RE-RULED 2026-07-19 after the condition failed. RECLASSIFIED.**

> **SoS is NOT an accepted coverage hole. It is the visible SYMPTOM of a guarantee-class retrieval
> defect: `retrieveCommentary` takes top-K with NO RELEVANCE FLOOR, so ANY zero- or thin-coverage
> passage returns confident irrelevant sources. Song of Solomon is the case we happened to look at,
> not the scope of the problem.**
>
> **STATUS: BLOCKING FOR PUBLIC LAUNCH** — alongside SEC-1 and proper-noun. Acceptable for the gated
> beta **only on the explicit basis that the site is single-user today**, and expressly **NOT** on
> the basis that the guard works. It does not work.
>
> **THE NEAR-MISS, RECORDED HONESTLY — do NOT record this as "the fallback held".** `kind:'empty'`
> never fired. The two probe responses were rejected by the **verifier**, for reasons unrelated to
> coverage: malformed schema, and an invalid anchor `46080604` (book 46 = 1 Corinthians) on a Song
> of Solomon query. **We were protected by luck.** A schema-valid answer with valid anchors,
> grounded in those same wrong sources, has no obvious reason to be rejected — and would be served
> as a composed answer about Song of Solomon built from New Testament commentary. A concordance
> that confidently cites 1 Corinthians when asked about Song of Solomon is not a coverage gap; it
> is the product guarantee (ADR-001) breaking.
>
> **FIX — CORRECTED 2026-07-19 (a relevance floor is FALSIFIED; do not re-propose it).** Measured on
> frozen v4 (120/120, real path): best ON-label score min **0.9957** vs worst OFF-label junk max
> **0.9999** — no separation exists. And `score` is TWO quantities: leads carry reranker scores,
> BACKFILLED SECOND VOICES carry vector cosine (0.55-0.75), so any floor >=0.9 silently deletes every
> backfilled second voice and breaks the >=2-voices guarantee **on healthy queries**; the only floor
> that changes anything (T~0.55) clears 0/8 SoS queries. The scores are right about TEXT and wrong
> about PASSAGE. **The fix is ON-PASSAGE COVERAGE DETECTION at the routing layer**: fire
> `kind:'empty'` when zero returned chunks have a `verseId` intersecting the asked range (for
> verse-ref queries `resolveIntent` already computes it). **Topical queries are coverage-blind by
> construction and are NOT solved by this** — they need a separate answer.
>
> **SCOPE, verified independently against the LEGAL pool:** Song of Solomon is the **ONLY**
> zero-coverage book in the canon and there are **ZERO** thin chapters (controls: John 6,829 rows/9
> authors, Psalms 5,157/5). Structural mechanism, one book of exposure today — not systemic.
>
> **AND THE SoS GAP IS A LICENSING GAP, NOT AN INGESTION GAP:** the raw corpus holds **915 SoS rows
> from 35 authors**; `LEGAL_CORPUS_FILTER` excludes all of them. The remedy is an allowlist/provenance
> fix, not re-ingesting Song of Solomon — Item 2 currently tracks it as ingestion breadth, which on
> this evidence would spend effort re-fetching text the corpus already has.
> *(Recorded honestly: reaching this took three measurements, two of mine wrong and pointing in
> opposite directions, because I twice queried a table the code does not retrieve from. See
> `docs/evidence/part1/coverage-census.txt`.)*
>
> **NOT inside Phase 4.** It is a single-lane retrieval change and must carry the held-out re-measure — so it is its own slice with the held-out accuracy re-measure attached
> (CLAUDE.md requires the re-measure on any retrieval change). Tracked as a named post-Phase-4 slice.
> Ingestion coverage for SoS remains tracked to Item 2 separately; it is a different problem and
> closing it would hide, not fix, this one.

The original ruling was "ACCEPTED LIMITATION for beta (coverage hole, not a quality failure), **on
condition that the fallback is verified to actually fire** rather than assumed." **It was verified,
and it does not fire.** Evidence: `docs/evidence/part4/sos-fallback-verification.txt`.
- 0 of 4 SoS queries reach the no-content fallback. `retrieveCommentary` takes top-K with **no
  relevance floor**, so a zero-coverage book returns six irrelevant chunks — Barnes on the **New
  Testament**, Wesley on the **New Testament**, Chrysostom on Matthew/John/Acts, Augustine on
  **Psalm 45** — with scores as low as 0.005.
- End-to-end the user IS safe today: both queries end `kind:'fallback'` (raw sources, no composed
  prose). But the guard that held was **the verifier**, catching incidental symptoms — malformed
  schema, and an anchor `46080604` (book 46 = 1 Corinthians) that is not a valid verse range.
  `kind:'empty'` never fired; the system never detected "we have no SoS sources".
- So the safety is **not attributable to coverage detection**, and even on the safe path the user is
  shown six sources that are not about Song of Solomon.
**Therefore "coverage hole, not a quality failure" does not hold as stated.** The gap is not that
SoS returns nothing; it is that SoS returns the wrong thing and is caught downstream for unrelated
reasons. Escalated 2026-07-19 and **re-ruled by the owner the same day** — see the reclassification
box above, which supersedes the original framing.

**Method note worth keeping:** this defect was found only because the ruling carried a verification
condition ("accept it, PROVIDED X is verified"). That pattern has now caught two false premises in
one day — one the agent's, one the owner's. It is cheap and it works; attach it by default to any
"accepted limitation".

**3. ~14% verifier fallback — ACCEPTED and EXPLICITLY UNMONITORED.**
`PRODUCTION_AUDIT.md`'s "ACCEPTABLE (with monitoring)" was an unearned claim: there is no
observability provider wired, so nothing is monitoring it. The phrase "with monitoring" is struck.
The rate is accepted **as an unmonitored risk**; wiring observability
(`docs/OBSERVABILITY_DESIGN.md`) is a **stated prerequisite** before the claim may be restored.

**Why:** each of these was already true; what was missing was one authoritative statement, so a doc
sweep could not keep re-inventing a different status. **Rejected:** leaving the status distributed
across five docs (the condition that produced the contradiction).

## ADR-029 — CCEL composite-volume misattribution: per-work attribution is required before any CCEL work publishes (2026-07-19)

**Context:** `origen-commentary` (staged, 1,224 sections) declares `author='Origen of Alexandria'`,
but sections §1–~129 are **1 Clement and 2 Clement** — ANF vol 9 prints the Epistles of Clement in
the same volume as Origen's *Commentary on John*, and the CCEL ingest swept the whole volume under
one author. Genuine Origen (Comm. John Bk I ch. 1, "the spiritual Israel") begins ~§130; the
Heracleon material runs §300+. This is **independent of** the standing editorial `MUST_NOT_SERVE
'Origen'` ruling: clearing that ruling would still publish Clement's epistles under Origen's name.

The failure is **scrape-shaped, not author-shaped** — the CCEL adapter has no per-work attribution
boundary inside a composite volume — so it was assumed to repeat until shown otherwise. A sweep of
all 17 CCEL-sourced works carrying sections (heads AND tails, since front-matter bleed and appended
works present differently) found **one further instance**: `chrysostom-homilies` (**published**,
8,941 sections) carries **Philip Schaff's *Prolegomena* in §1–95** (1.06%) — a 19th-century editor's
biographical/bibliographic essay ("The Life and Work of St. John Chrysostom. By Philip Schaff")
attributed to a 4th-century father, and present in the **served** flat pool (all 8,941 rows).
The other 15 works' heads and tails match their declared author.

**Decision:**
1. `origen-commentary` **stays staged**. Publishing it would breach citation integrity (C1 /
   ADR-001): a reader would receive Clement's theology as Origen's.
2. **What would have to be true to publish it:** re-slice the CCEL source with **correct per-work
   attribution** — the composite volume split at its work boundaries, each work carrying its own
   `sources` row and author, with the Clement material either dropped or published as its own work.
   Nothing short of that (e.g. deleting §1–129 by ordinal) is acceptable, because ordinal surgery
   leaves the adapter defect in place to recur on the next CCEL ingest.
3. **No CCEL work publishes** until it has been checked for a composite-volume boundary. This is a
   standing precondition on the lexicon/reference publish batch and on any future CCEL ingest.
4. `chrysostom-homilies` §1–95 is a **live** misattribution on a published, served work. Ruling it
   is an owner call (severity is materially lower than origen — the content is *about* Chrysostom
   and is bibliographic apparatus, not a rival father's doctrine — but it is still Schaff's prose
   under Chrysostom's name, with Early-Church era metadata on 1889 text). Logged, not silently
   repaired.

**Why:** the product guarantee is that every displayed voice is *quoted and attributed*. A composite
volume swept under one author breaks attribution at the source, and no downstream verifier can catch
it — the text is genuine and the citation is confidently wrong, which is the worst shape a
misattribution can take. **Rejected:** publishing origen with a caveat (the caveat does not travel
with a retrieved chunk); ordinal-range deletion (leaves the adapter defect); assuming the defect was
origen-specific (it was not — the sweep found chrysostom).

**Also found (distinct, lower-severity class): index/apparatus residue.** 935 sections across 7
published works are back-matter indexes whose bodies are page-number lists, not prose —
`schaff-creeds` 585, `hodge-systematic` 283, `owen-works` 41, `watson-works` 17, `calvin-institutes`
6, `maclaren-expositions` 2, `edwards-works` 1 (sample body: "Influxu Spiritus\nIsta a Domino facta
sunt\nJanua paradisi…"). Not misattribution — they belong to their volumes — but they render as
garbage in the Book Reader and are retrievable as "voices". Filed as a separate cleanup, not a
publish blocker.

### ADR-029 addendum — chrysostom §1–95 RULED: suppress from served, keep the work (owner, 2026-07-19)

**Ruling:** misattribution is the product guarantee (ADR-001/C1), not a nice-to-have, so Schaff's
1889 prose served under a 4th-century father's name does not get to sit as a log line. But pulling
`chrysostom-homilies` would remove **8,846 legitimate Chrysostom rows to suppress 95** — the wrong
trade. So: **suppress the 95, keep the rest, and treat the CCEL adapter fix as the durable repair.**

**Rigor check (owner-required precondition).** Before suppressing, it had to be shown that no frozen
held-out query resolves into the 95 rows — otherwise the suppression moves a measured number and a
re-measure is owed. `web/src/scripts/check-prolegomena-reachability.mts` runs all **120 FROZEN_V4**
queries through the **shipped** `legalBasePool` path (not a lookalike), at production
`CANDIDATE_POOL=20` / `hnsw.ef_search=64`, and counts target rows in the candidate pool.

- Base pool, not scored top-K, **on purpose**: the pool is strictly wider than anything downstream,
  so a row absent from the pool cannot reach rerank, diversity, or the floor. A clean pool is the
  stronger negative.
- **Positive control** (a check that cannot fail proves nothing): querying with Prolegomena text
  returns **15 target rows in a 20-row pool**, top score 0.8823 — the detector demonstrably fires.
- **Result: 0 hits across 120 queries / 2,400 pool rows.**

**Therefore NO held-out re-measure is required**, and the reason is structural rather than lucky:
the Prolegomena is bibliographic apparatus (editions, print history, Migne/Benedictine citations)
whose embedding neighbourhood is disjoint from every v4 query, all of which are Scripture-anchored
(v4 labels are KJV-phrase-derived by construction — ADR-024). Evidence:
`docs/evidence/part1/prolegomena-reachability.txt`.

**Executed:** `src/ingest/suppress-chrysostom-prolegomena.ts --apply` (dev only, dev-guarded,
dry-run by default, backs up before deleting). Removed 95 flat `embeddings` + 95 `sections` + 95
`section_embeddings`. Verified by independent re-query: 8,846 / 8,846 / 8,846 exactly 1:1, 0 target
rows remaining, **0 sections mentioning Schaff**, work still `published`, first section now
`#96 "Homily 1"`. Restore path: `docs/evidence/part1/chrysostom-prolegomena-suppressed.jsonl`
(95 rows **with vectors** — no hard delete without a restore path).

**Why deletion and not a filter predicate:** the served boundary (`LEGAL_CORPUS_FILTER`) is mirrored
by the partial HNSW index predicates (migration 018) and held in lockstep by
`test/invariants/legal-hnsw-index-sync`. Fencing 95 rows by predicate would mean a predicate change
plus a `CONCURRENTLY` rebuild of a multi-hundred-thousand-row HNSW index on dev *and* in the prod
cutover — enormous machinery for 95 rows, and a new permanent clause in the most safety-critical
string in the system. Row removal is the established pattern (`b2-remove-forbidden-provenance`) and
takes effect on every surface at once, with no risk that one read path misses the new clause.

**Side effect, accepted:** `chrysostom-homilies` `sections.ordinal` now starts at 96 and
`unit_ordinal` at 17 rather than 1. Both remain **contiguous** (8,846 rows over ordinals 96–8941;
378 distinct units over 17–394). The reader groups units by *equality* of `unit_ordinal`
(`lib/work-reader.ts`), never by assuming a 1-based origin, and the full web suite is green
(34 files / 171 tests) — including `sections-unit-ordinal` and the register-wall re-proof.

**STILL OPEN — the durable repair:** the CCEL adapter has no per-work attribution boundary inside a
composite volume. Until it does, the next composite CCEL ingest reproduces this defect. Suppression
is tactical; the adapter fix is the repair and must land before any further CCEL ingest.

### ADR-029 addendum 2 — the class is NON-AUTHORIAL MATTER, not "composite volume" (2026-07-19)

**The framing in ADR-029 was too narrow, twice.** The ship committee found instances the
follow-up sweep could not have caught:

1. **Wrong sourcing scope.** The sweep looked only at CCEL works, because origen was CCEL.
   `tennyson-in-memoriam` and `traherne-poems` are **Gutenberg** and were never swept — yet
   they fail on their head and tail respectively, exactly the way the CCEL method would have
   caught had it been pointed at them. Generalising to the *adapter* instead of to the
   *pattern* was the error.
2. **Wrong shape.** It is not only "another author's work bound in". It is **any non-authorial
   matter carried in with the text**: another father's epistles (Origen/Clement), an editor's
   prologue (Chrysostom/Schaff), a publisher's price list (Tennyson, Traherne, Spurgeon), and
   machine-generated word indexes (929 rows). A detector written against "is this a different
   author" misses three of those four.

**Suppressed (dev, 947 sections + 943 flat rows, all backed up with vectors):** word/phrase
indexes in schaff-creeds 585 · hodge-systematic 283 · owen-works 41 · watson-works 17 ·
maclaren-expositions 2 · edwards-works 1; chrysostom's edition-concordance 6; publisher
catalogues in tennyson-in-memoriam §1–5, traherne-poems §413–417, spurgeon-talks-to-farmers
§299–300.

**Rigor check.** Only 6 of the 947 (chrysostom's Comparative Table) sit inside the exegetical
pool the frozen v4 eval measures; the rest are lane content (sermon/theology/song-verse), which
v4 does not reach by construction. Those 6 were checked by the same method as the Prolegomena —
positive control fires (5 target rows in a 20-row pool, score 0.8372), **0 hits across 120
queries / 2,400 pool rows**. No re-measure owed. Honest limit: the lanes have their own
retrieval and are covered by no frozen eval, so "v4 unaffected" is narrower than "no retrieval
effect". Evidence: `docs/evidence/part2/comparative-table-reachability.txt`.

**KEPT deliberately** (verified real content, do not "clean" these): schaff-creeds "Comparative
Table of the Ante-Nicene Rules of Faith" (7 — comparing creeds *is* the book's subject, and the
body is creed text); calvin-institutes "General Index of Chapters" (6 — a legible TOC);
spurgeon-talks-to-farmers §298, a **mixed** chunk that opens with real Spurgeon and ends inside
another book's preface — deleting it would destroy sermon text, so it is flagged for a re-slice
instead.

**A BUG I INTRODUCED AND THE CHECK THAT CAUGHT IT.** The suppression targeted `sections` by
ORDINAL but re-expressed the same range against the flat store's SOURCE SECTION number from
`source_id`. Those are different axes: repoint makes sections 1:1 with flat *rows*, so a chunked
source section (`2.1`, `2.2`) spends two ordinals while staying one source section. Consequences,
both real:
- **tennyson over-deleted** — flat `BETWEEN 1 AND 5` also removed source sections 4–5, i.e.
  **3 rows of real verse**: the Prologue ("Whom we, that have not seen thy face") and canto I.
- **traherne under-deleted** — its ads are source sections 282–286, so the range matched
  *nothing* and the catalogue stayed **served**.
Caught by the post-apply check that compared sections-vs-flat per work and demanded 1:1 — the
two works that broke it were the only two with an ordinal-range target *and* chunking. Repaired
by `src/ingest/repair-tennyson-traherne-flat.ts`: the Tennyson rows were fully recoverable
because only the flat copy was lost while `sections` + `section_embeddings` survived. Final
state verified independently: all ten works exactly 1:1, 0 genuine residual rows (the single
match was a false positive — Spurgeon using "buckram" metaphorically).

**Lesson for the prod cutover:** any suppression that spans both stores must express its target
in each store's OWN key, and must assert 1:1 per work afterwards. A range that is correct in one
store is not automatically correct in the other.

**STILL the durable repair:** the ingest adapters carry publisher/editor matter into a work with
no per-work attribution boundary. Until that lands, the next ingest reproduces all of this.

## Owner editorial calls — dev population (2026-07-24)

**Lexicons (5 staged dictionaries): pane.** Serve via the existing Word Study / reference-pane
surface (`web/public/lexicon/*.json`, `library/word-study`), **not** by publishing into the
teacher's `/ask` prose pool. Lexicons stay **staged** until the reference-pane UX ships; do not
flip them to `published` for teacher retrieval.

**Josephus (josephus-whiston): excise.** Whiston's edition appends the spurious pseudo-Josephus
"Discourse to the Greeks concerning Hades" (sections §4113–4124 / units u2688–u2696). **Excise**
those 12 sections, then publish the remainder (~4,112 sections) to the historian register for
the Book Reader. edersheim / schaff remain staged (0 sections); no other historian publish yet.

## ADR-030 — E3 proceeds in the cutover; the 4,174 served forbidden rows go now, not after a re-source (owner, 2026-07-27)

> **⛔ CORRECTED (owner, 2026-07-27, after the deep-audit). E3 IS DROPPED FROM THE CUTOVER.**
> The original decision below is kept for history; it is **not** current, and it was made on a
> premise that is false.
>
> **The false premise.** The decision rests on the sentence "The clean NPNF/CCEL editions of those
> same authors land in the same cutover, so the coverage dip is transient, not a standing hole."
> **The cutover has no ingest step.** Its steps are E0 preflight · E1 migrations · E2 label existing
> rows · E3 delete · E4 slice · E5 deploy · E6 smoke. Nothing in `scripts/cutover.mjs` imports a
> work; the NPNF/CCEL re-ingest is a separate, unbuilt step (WORKLOG 2026-07-24 lists it as a
> to-do). So the "transient dip" was a **permanent subtraction** — the ADR approved a trade whose
> other half did not exist. This was the main session's own error, surfaced by a fresh auditor.
>
> **The measured cost** (read-only on production 2026-07-27, NULL-safe via COALESCE, independently
> reproduced by a second lens; the served exegetical pool, per-verse `count(DISTINCT author)`):
>
> | per-verse ≥2-DISTINCT-AUTHORS floor | verses |
> |---|---|
> | verses with any served voice | 29,629 |
> | meet the floor BEFORE E3 | 22,794 |
> | meet the floor AFTER E3 | 22,214 |
> | **drop below the floor** | **580** |
> | **lose every served voice** | **24** |
>
> (The first attempt at this measurement returned 16,593/20,887 and was wrong: `NOT forbidden` is
> NULL when `sourceUrl` is NULL and prod holds 74,234 such rows, so the FILTER silently dropped
> legitimate voices. Recorded because the wrong number was the alarming one.)
>
> **The ruling.** E3 is **removed from the cutover**. The cutover is now **E0, E1, E2, E4, E5, E6**.
> Provenance cleanup is **DEFERRED to its own slice, after a re-ingest exists to refill the corpus** —
> at which point the same 580/24 measurement is re-run against the refilled pool and must come back
> at or above the pre-deletion floor before the deletion runs. `src/ingest/b2-remove-forbidden-provenance.ts`
> is deliberately kept: it is the tool that slice will use.
>
> **What this does NOT change.** The rows are still forbidden provenance and are still a standing
> licensing debt; deferring the deletion defers a fix, it does not retract one. The gate's G6 ratchet
> is now **monotone-only** (the count may never increase against the E0 baseline) instead of
> "must read 0 from E3 onward", because the latter would abort every run of the re-scoped cutover.
> The parts of the original decision that survive on their own evidence are the measurement of what
> E3 *would* have removed and the "no v5 is owed" reasoning, both below.
>
> **Related:** ADR-033 (the falsifiable-gate round this correction came out of).

**Decision.** The cutover proceeds with E3 as designed. E3 deletes 4,174 rows that production
serves today (John Chrysostom 2,515 · Augustine of Hippo 1,659 — 4.97% of the 83,993-row served
pool, measured live on prod 2026-07-27). The clean NPNF/CCEL editions of those same authors land
in the same cutover, so the coverage dip is transient, not a standing hole.

**Why this was an owner call and not an agent call.** It changes what real users are served. The
agent measured the size and named the tradeoff; the timeline was the owner's.

**What the measurement ruled out.** The four `LEGAL_CORPUS_FILTER` legs with no provenance
constraint (Gill, JFB, Clarke, Henry) contribute **zero** forbidden rows — corroborated by E6
smoke on the prod fork reporting Gill = 28,843, identical to the pre-E3 census. The `work IN
SERVED_PROSE_WORKS` leg matches zero on prod (100% NULL work key). Barnes/Wesley/Calvin require a
`crosswire` URL, which biblehub/HCF fail by construction. Only the two book-scoped legs overlap.

**No v5 is owed.** v4 was minted (18:34) and run (18:39) on 2026-07-18, after B2 cleaned dev at
17:26/17:40 — the re-baseline commit `a070e1e` says "on cleaned dev DB" in its own message, and
dev measures 0/0/0 forbidden today. v4 never saw these rows, so E3 cannot move its numbers. E3
moves prod *toward* the measured configuration. The "served -> v5 owed" conditional is defeated
by the ordering, not by assertion.

**Related:** ADR-028 (launch-blocking vs accepted-limitation), ADR-029 (per-work attribution).

## ADR-031 — The two prod forks stay, for now (owner, 2026-07-27)

`census-clone` (`ep-wispy-violet`, 5,972 MB) and `prod-census` (`ep-young-hat`, 4,477 MB) are
undeleted forks of production, ~10.4 GB total. Neither auto-deleted; the cutover workorder had
assumed `prod-census` was gone. **Owner elected to keep both.** They are storage cost and a copy
of prod user data outside the prod blast radius, so this is a standing item, not a closed one.
Neither is a restore point and **neither may be rehearsed on** — Session 2 creates a fresh fork
and confirms its parent is `production` first.

## ADR-032 — The cutover regression gate is DB-level, runs after every chunk, and its checkpoint is bound to one target (2026-07-27, Session 2)

`CUTOVER_DESIGN.md` requires a regression gate after **every** chunk ("`/ask` still answers with
≥2 distinct voices · reader renders + tap-verse opens commentaries · highlights/notes load AND
write · register wall holds"). Building it forced three calls worth recording, because each one
narrows or widens what a green gate is allowed to mean.

**1. The gate is DATABASE-level, and says so.** `scripts/cutover-regression-gate.mts` imports the
shipped predicates (`LEGAL_CORPUS_FILTER`, `EXEGETICAL_FTS_EXCLUSION`, `isPublishedCommentaryEntry`)
rather than retyping them, so it probes the real serving boundary — but it does **not** run
compose→verify. What it proves is that the served **pool** can satisfy the ≥2-voices floor, not
that the live loop did. The live HTTP probe (`CUTOVER_ASK_URL`) is opt-in and only meaningful
**after E5**, which is owner-gated; during a rehearsal it does not run at all. Stating this in the
script's own header is deliberate: a green gate that reads as "/ask works" would be exactly the
over-wide claim `THE_LOOP.md` rule 7 exists to stop.

**2. The annotation write probe commits nothing.** G4 runs the shipped statement shapes —
`createHighlight`'s INSERT and `upsertNote`'s `ON CONFLICT (user_id, verse_id) WHERE deleted_at IS
NULL AND target_kind = 'verse'` — twice, asserting the second is an UPDATE and not a second row,
then **ROLLBACKs**. That proves migration 025's partial index still arbitrates (the failure mode
that would break `upsertNote` in production) without committing a test row into live user data.
The honest limit: it does not prove a committed write survives. Committing probe rows into 37 real
user rows to prove they can be written to is a worse trade than the gap it closes.

**3. A checkpoint is bound to the target it was written for.** The 2026-07-24 census-clone
rehearsal left a **complete** `.cutover-checkpoint.json` on disk (E1–E4 all "done"). Resumability
read that file by name only, so a later run against any other endpoint would have skipped the
entire cutover and reported success having written nothing. The checkpoint now records its target
endpoint; a mismatch — or a pre-binding checkpoint with steps recorded and no target — is a hard
abort with instructions, never a replay. Proven red against the real stale file before the fix was
trusted.

**Corollary, same shape:** the delegate scripts (`register-label-embeddings.mjs`,
`cutover-e4-slice-all.mjs`) hardcoded an endpoint allowlist that a fresh rehearsal fork can never
be on — and ADR-031 forbids reusing the old forks. They now **additionally** accept the operator's
declared `CUTOVER_EXPECT_HOST`, which STEP ZERO has already validated. The dev and prod allowances
are untouched; this widens the guard by exactly one explicitly-named endpoint per run.

**Related:** ADR-029 addendum 2 (each store, its own key), ADR-030 (E3 proceeds), ADR-031 (the
forks stay; rehearse on a fresh one).

## ADR-033 — Every cutover gate must be falsifiable through the orchestrator; four calls that came out of enforcing it (2026-07-27)

The 2026-07-27 deep-audit found the same defect in six places: **a check that measures a proxy
instead of the property it names.** The previous round's red-proofs missed the worst of them
because they invoked the gate **directly** rather than through `scripts/cutover.mjs`, so the
orchestrator's own legs were never exercised. The standing rule for this chain is therefore:
**a gate is not a gate until it has been watched go red THROUGH THE ORCHESTRATOR**, on a seeded
break, on a fresh fork of production. Four calls worth recording:

**1. The user-data invariant is a DIGEST, not a count.** `count(*)` + `count(DISTINCT user_id)`
passed three seeded corruptions on a prod fork — soft-delete every visible annotation, permute
every highlight's owner (a cross-user leak), repoint every anchor. All three leave 34 rows and 6
users. The invariant is now a per-table **md5 over ordered rows** (id, user_id, anchor columns,
tombstone, body hash), an **ACTIVE row count** (prod: 34 rows, **24** active — the two already
disagreed by 10 and nothing noticed), and the **owner distribution**. Owner ids are hashed before
they are recorded: the checkpoint is a file in the repo tree. One definition, in
`scripts/lib/user-data-invariant.mjs`, imported by both the orchestrator and the gate, because two
copies of an invariant is how they drift into measuring different things.

**2. The ≥2-voices gate is corpus-wide.** It sampled 3 verses of 22,794 and its own comment said
they had been chosen so the step it guarded "must NOT be able to drop any of them below the floor".
It is now one `GROUP BY` over the served pool (~20 s on prod-sized data): verses meeting the
≥2-**distinct-authors** floor, and verses with any served voice, **baselined at E0 and compared
thereafter**. An absolute threshold would not do — the floor is a property of this corpus at this
moment, and what must never happen is a decrease. The three named refs survive, relabelled
"spot check", so nobody mistakes them for the gate.

**3. The live probe stays opt-in, and the gate says so out loud.** G7 is the only leg that touches
the deployed app, `CUTOVER_ASK_URL` was never set, and E6 nonetheless claimed a "full regression
battery" — zero occurrences of G7 in either rehearsal log. The options were to require the URL at E6
or to disclose. **Disclosure**, for two reasons that are properties of the design rather than
preferences: (a) E6 runs on rehearsal forks that have no deployed app by construction, so requiring
it would end every rehearsal red and train the operator to ignore red; (b) E6 runs immediately after
`vercel --prod`, so a required probe that fails there orders an emergency rollback of production off
a single HTTP read. The gate now prints an explicit `LIVE PROBE NOT RUN` line and stamps its verdict
`DB-ONLY`; setting `CUTOVER_ASK_URL` at E6 flips the verdict to "including the live /ask probe
(end-to-end)". Proven both ways against a local stub.

**4. Order the migration to the data, not the data to the migration.** 024 backfills
`sections.unit_ordinal`; E4 creates the sections. Running 024 in E1 left **71,563 of 72,863**
sections NULL on the last rehearsal fork, and the postcondition — 1:1 counts — reported green,
because both consumers (`web/src/lib/work-reader.ts`, `web/src/lib/search-sections.ts`) COALESCE and
degrade silently. 024 now runs **inside E4, after the slice**, and E4 asserts the column is
POPULATED. The general form: *a postcondition that counts rows does not check the column the step
exists to fill.*

**Also decided, without ceremony because each is one obvious thing:** a Neon branch snapshot of the
target is created before the first write and its id is quoted in every rollback string (five
`die()` paths said "restore from the pre-E1 Neon branch snapshot" while nothing created one, against
6 h of PITR retention); the checkpoint is written **atomically** (tmp + rename) and carries a
**session/pid/host ownership marker** that refuses a second live writer (it was clobbered three
times during the audit, once mid-proof); and E5/E6 got the completion guard every other step already
had, so a resume cannot re-run `deploy.sh`.

**Related:** ADR-030 (corrected — E3 dropped), ADR-031 (rehearse on a fresh fork), ADR-032 (the gate
is DB-level, runs after every chunk, checkpoint bound to one target).

## ADR-034 — The cutover gate IMPORTS routing.ts; it never mirrors or parses it (2026-07-28)

**Status:** accepted. **Supersedes** the "v2 e6-corpus parser" design proposed in the E6 work order.

**Context.** [PR #28](https://github.com/thomascfoley-stack/ancient-roads/pull/28) hand-copied
`LEGAL_CORPUS_FILTER` into `scripts/cutover.mjs` and was rejected by a 4-lens review: the copy had
drifted 27.8% from production by dropping the `metadata->>'work'` leg — the leg E2 populates — so the
gate was structurally blind to the step directly upstream of it. The proposed fix was a module that
PARSES `routing.ts` as text and rebuilds the SQL, asserting the reconstruction matches.

**Decision.** Neither mirror nor parse: **import**. `scripts/cutover-regression-gate.mts` runs under
`npx tsx` and imports `LEGAL_CORPUS_FILTER`, `PROSE_TYPE_SQL`, `EXEGETICAL_FTS_EXCLUSION` and the
`SERVED_*` lists from `web/src/lib/teacher/routing.ts` directly. A text parser is strictly more code
and strictly more drift surface than the import it would emulate, and it can be wrong in ways the
import cannot. `scripts/cutover-gate-redproof.mjs` is plain `.mjs` and cannot import TypeScript, so
the gate exposes `--print-predicates`; the proof seeds defects against the SAME predicates the gate
asserts on rather than retyping them.

**Consequence.** `tsconfig.cutover.json` exists because this couples the gate to `web/`: a web change
can now redden a gate named "cutover". That is the correct trade — the coupling is real either way,
and this makes it visible at compile time instead of at 3am on a production cutover.

**Not covered by this ADR:** G3's `commentary_entries` predicate is still hand-built while
`web/src/lib/legal-corpus.ts` exports the canonical form. Same drift class, tracked separately.

## ADR-035 — Vacuity is reported and ratcheted, never phase-hardcoded (2026-07-28)

**Status:** accepted, after two of these hard-fails were caught by deep-audit before ever running.

**Context.** A check that passes because its population is empty is not a check. The obvious fix —
"after step N this population must be non-empty" — was written into two new legs and **both were
wrong**, in a way that would have ABORTED A CORRECT PRODUCTION CUTOVER:
- G5 required lane/song rows from E2 on. E2 labels only the manifest works carrying
  `backfill.match_author`; not one is a lane/song slug, and the register ingest has never run on
  prod. That count is 0 forever, by design.
- The work-leg check required the exegetical slugs from E2 on. Only `keil-delitzsch` of the four is
  in E2's manifest set.

**Decision.** A gate may not hardcode "population P must be non-empty at phase N" unless the step is
what creates P. Instead: (a) always print the denominator so a green line cannot mean two things;
(b) **ratchet** the population against the E0 baseline — it may never shrink; (c) hard-fail only on
the unambiguous case (for E2: *zero rows carry any work key at all*, since writing that key is
E2's entire job). This holds on prod, dev and a fork without the gate needing to know the manifest.

**The general rule this encodes:** a gate the operator must override is not a gate — it trains them
to ignore red. Prefer a loud, specific warning over a failure the target's designed state triggers.

## ADR-036 — An empty user-data baseline is valid; an ABSENT one is not (2026-07-28)

**Status:** accepted. Unblocks the cutover against production's current state.

**Context.** Prod's user tables were cleared 2026-07-28 by owner decision. G1 summed rows across
`USER_TABLES` and failed on 0 — but `ABSENT` is recorded as `rows: -1`, so `Math.max(0, -1)` made
*missing tables* and *empty tables* indistinguishable. E0 runs the gate with `--capture` **before**
the owner gate and before the first write, so the cutover would have refused to start against the
exact state production is in, for the reason that production is in it.

**Decision.** Tables MISSING is a broken instrument and fails. Tables PRESENT and empty is a **valid**
baseline: the digest, active count and owner distribution remain comparable, and what they then
assert is *nothing was added, altered or mis-owned* — which is precisely the guard that protects the
FIRST REAL USER. It is vacuous about *preservation* and says so loudly, at every phase.

**Corollary (standing):** E1's preserve-these-rows assertions are NOT relaxed to match the empty
state. They hold at `0 == 0` and stay.

## ADR-037 — Prod authorization must not self-originate (2026-07-29)

**Status:** accepted.

**Context.** Phase 2 introduced `CUTOVER_OWNER_PHASE2_GO=1` in the same session that consumed it in
`scripts/cutover.mjs`, bypassing the prod + `CUTOVER_REHEARSAL=1` guard. That made prod-go
self-satisfiable by an agent's own commit — the same class of defect as a checkpoint written by the
process that corrupts its target.

**Decision.** (1) Retire `CUTOVER_OWNER_PHASE2_GO` — invoking it is a hard abort. (2) Before the first
prod write, require `CUTOVER_OWNER_GO_QUOTE`: the verbatim owner authorization sentence, supplied by
the operator **at invocation**, printed to the log and echoed in WORKLOG prod entries. (3) Interactive
"write" gate remains for non-rehearsal prod runs; rehearsal skips interactive but not the quote.

**Why.** Authorization for an irreversible step may not originate in the same change that satisfies it
(BUILD_MODEL §0 — cross-session handoffs are explicit; THE_LOOP rule 6 — fixer ≠ verifier).

**Red-proof.** `docs/evidence/hygiene-2026-07-29/cutover-owner-go-redproof.log` — prod target,
`CUTOVER_OWNER_PHASE2_GO=1` or missing quote → refuse before E1.

## ADR-038 — better-auth GHSA-qq9h accepted-red (2026-07-30)

**Status:** accepted (owner ruling; supersedes decision-sheet posture ambiguity).

**Context.** CI `deps` fails on GHSA-qq9h-g4jm-xgf3 (same account-takeover class as GHSA-g38m,
same pin). Posture B would add it to `ignoreGhsas` and green the gate; Posture A keeps the
redness visible until SEC-1 (ADR-003) lands.

**Decision.** **Posture A — accepted-red.** Do NOT add GHSA-qq9h to `ignoreGhsas`. Do NOT
force `better-auth >= 1.6.22` until the auth migration closes SEC-1. Document in
`docs/SECURITY.md`; align `package.json` audit comment with ADR-038.

**Why.** A permanently silenced second advisory from the same pinned package would make
`ignoreGhsas` mean less than its comment claims. Honest red on one named advisory preserves
"nothing merges red" as an enforceable rule.

**Wrong if.** CI `deps` is green before SEC-1 without a documented override.

## ADR-039 — barnes-notes prod repair: quarantine + CrossWire re-source (2026-07-30)

**Status:** accepted (owner ruling; decision sheet §4 Option A).

**Context.** Production carries 1,300 `barnes-notes` sections with biblehub provenance
(`status=staged`, unreachable). Flat pool rows under `"Barnes' Notes"` are 100% biblehub;
`barnes-crosswire-nt` was E4-skipped. Author collision blocked clean slicing.

**Decision.** Quarantine `barnes-notes`, delete its staged sections, re-source flat rows from
CrossWire SWORD, re-embed, slice `barnes-crosswire-nt`. Orchestrator:
`scripts/repair-barnes-prod.mjs`.

**Why.** CrossWire is the declared edition (ADR-008); dev proved the repair path.

**Wrong if.** Search or reader returns biblehub bodies for the CrossWire slug after publish.

