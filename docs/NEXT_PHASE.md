# Next Phase — Data Foundation (deploy → gated ingest → trust → features)

The sequence for the next stretch: deploy + back up the current state, build **two upfront gates** (coverage + license), ingest the full corpus **through** them so the data is complete *and* legal, then polish UI and build features on data you trust. The rest of the QA harness is fleshed out **reactively** as real failures surface — not speculatively upfront.

## Current state (2026-07-09 handoff)

- **Retrieval: 10/10** — validated two ways: the 10-query true-success diagnostic (0 wrong-source every run) and a **new 30-query labeled eval** (`eval-retrieval.mts`) across hard categories (verse-ref, proper-noun, exact-term, rare-topic, topical).
- **Reranker is now CORE, not polish — decided on data.** The 30-query eval settled the deferred hybrid-vs-vector question: `vector = hybrid = 97%`, `full (hybrid + reranker) = 100%`. The reranker is the only config that hits 100% (it fixed "the Word became flesh" → John 1, which vector/hybrid scattered). **Deploy and keep the full pipeline.** BM25 fusion is neutral on pure retrieval; the reranker adds the lift. → needs an ADR (see coordination note below).
- **Compose/verify: ~9/10, accepted with safe fallbacks.** Residual is stochastic quote-drift on long-prose sources; the verifier fails closed to showing retrieved sources (never a wrong answer). Entity-decode + retry=2 + snap-to-source landed and are tested; they made 10/10 *achievable*, not guaranteed — do not chase n=10 variance further. The chosen path is to **grow the eval set**, which the new harness begins.
- **Two commits (`9b2d653`, `67a18aa` → now `cbe9ea7`) are unpushed** — the agent environment has no git creds. **Immediate action: `git push origin main` from your side** before deploy, so the live site never runs ahead of backed-up history.

## The two upfront gates (everything rides on these)

Only two checks are built before ingest; every other integrity check (empty rows, content sanity, referential integrity) is added **reactively** as failures reveal what to guard. These two are upfront because their failures are the ones you **can't recover from**.

### Gate A — Coverage (completeness). Fail LOUD.
The corpus must be **completely embedded — no silent gap** (this is what caught the 47k). One query, wired to exit non-zero:
- `pnpm check:coverage` — anti-join: eligible `sections` minus `section_embeddings` (with the pinned `model_slug`) = missing. If `missing > 0` → print the per-source missing counts and **exit 1**.
- Run it **after every ingest batch** and as the final publish gate. A source is not `published` until its coverage gap is 0.
- Adapt the existing `src/ingest/measure-embedding-gap.ts` (it already computes this) — just add the fail-loud exit + per-source breakdown.

### Gate B — License (legal). Fail CLOSED. UPFRONT, not reactive.
A licensing violation is **legally irreversible** — you cannot "react" to having hosted copyrighted content for months. So license-gate every source *before* publish:
- Every `source` row has `license NOT NULL`, set from `ingest/sources.config.json` (the per-work manifest), in the allowed set: **`Public Domain | CC BY | CC BY-SA`**.
- `pnpm check:licenses` — assert: **zero** `published` sources with a license outside the allowed set; **zero** with null/empty license; every source has `provenance` (source URL, translator/edition, year). Any violation → **exit 1**.
- **Fail closed:** any source without a confirmed allowed license → `status = quarantined`, never `published`, never retrieved.
- Mind the **edition trap** — record translator + year; a public-domain *author* with a post-1929 *translation* is NOT allowed (see `ACQUISITION_MANIFEST.md` §4).

Both gates run inside `npm run audit` (or a `pnpm check:data` step) so they can't be skipped.

## The phased plan

1. **Deploy + back up the current state.** Get the working teacher (10/10 retrieval, ~9/10 e2e) deployed and everything committed + pushed. This is the quick part. **Deploy ≠ open to users** — the pre-signup gate (V2 · rate-limit `/api/ask` · `rejectUnauthorized` guard · bait ≥99%) still holds before anyone but the owner uses the teacher. Keep the site gate / SSO wall ON.
2. **Build the two upfront gates** (A coverage + B license) as fail-loud scripts, wired into the audit/data check.
3. **Build the ingestion pipeline** per `docs/INGESTION_TASK.md` (the `sources`/`sections` model, ADR-010) + `docs/ACQUISITION_MANIFEST.md` (the grab-list). Resilient batches (de-poison, adaptive truncation, `COPY`, resumable) per the throughput rules. Ingest *through* the gates.
   - **Coordination gate — resolve before writing the migration.** Two sessions are touching the `sources`/`sections` design (ADRs 010–013 from a parallel session; the current embedding work runs against `commentary_entries`). Per the *design-before-code* rail, this migration gets **one owner and an approved design doc** before anyone writes it — otherwise two sessions design the same schema in parallel and the embed `source_id` scheme diverges. Reconcile ADR ownership first.
4. **Ingest the full corpus — Bibles → commentaries → sermons → historians.** Each source passes Gate A (coverage) + Gate B (license) before `published`. Record counts in `WORKLOG.md`. Re-run the accuracy diagnostic after (retrieval change → record the number, per `CLAUDE.md`).
   - **Grow the eval with the corpus — the accuracy number is only as honest as its coverage.** The current 30-query eval is Gospel/reformed-heavy. Every new tradition or book block ingested (historians, non-reformed voices per `ACQUISITION_MANIFEST.md` §4, OT) must add labeled queries to `eval-retrieval.mts` (label = expected book/chapter) *before* claiming accuracy holds there. An unchanged eval over a growing corpus is a silent regression risk.
5. **Polish the UI** — the Fable design pass (highlighter per `docs/HIGHLIGHTER_POLISH.md`, redesign) on now-complete data.
6. **Build data-product features** — the modes (`docs/PRODUCT_ARCHITECTURE.md`) on data you now trust: complete + legal.
7. **Flesh out the harness reactively** — add integrity checks (empty rows, content sanity, referential integrity) *as real failures surface* what to guard. Do not build them speculatively upfront.

## Rails (from `CLAUDE.md` — don't drift)

- Commit per logical change + push; never a large uncommitted tree.
- Re-run the accuracy diagnostic on every retrieval change; record in `WORKLOG.md`.
- **Fail closed on unlicensed content**; never publish below Gate A or Gate B.
- **Deploy ≠ beta-open** — the pre-signup gate holds until it's cleared.
- Design-doc before touching the data model / contract; get approval before implementing.
