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
