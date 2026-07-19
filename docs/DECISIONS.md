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
