# Parked retrieval levers — design + exact steps (DO NOT build without a dev branch)

**Status: PARKED (2026-07-13). Both need a Neon DEV branch (`.env.local` points at PROD; tonight is read-only).**
Written so the next session can execute without re-deriving. Neither is started.

---

## Lever A — Calvin's Old Testament (already downloaded, filtered out by us)

**Claim (owner, to verify first):** Calvin's CrossWire/SWORD module already contains Genesis→Malachi; the
NT-only shape of the teacher's Calvin (books 40–65, §6 2026-07-13) is **our** extraction filter, not the
module's limit. So the OT is a re-extraction, not a re-download or a re-scrape.

**Why it matters:** Calvin is 1 of 3 legal whole-Bible Reformed voices. Adding his OT roughly doubles his
verse coverage and directly helps OT **topical** breadth (the category §1b/§7 care about), with zero new
sourcing/licensing risk (same module, same provenance).

**Exact steps (on a dev branch):**
1. **Verify the claim.** Inspect the Calvin module `.conf` (`Versification`, `Feature`, book list) — confirm it
   enumerates OT books. If it does NOT, STOP: this becomes a sourcing task (CCEL/Wikisource), a different design.
2. Find the extractor that produced the current NT-only Calvin (the SWORD→`commentary_entries` adapter) and
   locate the book filter that drops books < 40. Widen it to 1–66.
3. Re-extract Calvin OT to a **staged** table (not `commentary_entries`), per-verse keyed. **Watch the §2/§3
   trap:** assert the distribution (`verse-keys.test.ts` threshold: collapsed fraction < 0.20) on the staged OT
   BEFORE promoting — a bad extractor would reproduce the biblehub `verse_start=chapter` defect.
4. Dedupe against existing crosswire Calvin NT (avoid double-voicing).
5. Incremental, additive embed of the new OT rows only (ADR-019 permits additive; this is not a model swap).
6. Re-measure v4 topical before/after. Publish only if no regression.

---

## Lever B — the HNSW config nobody has run: partial legal index + `ef_search=128` + `iterative_scan` OFF

**The smoking gun, finally named.** `web/test/invariants/licensing.test.ts:56-59` records, as a flaky-test
footnote: *"legalBasePoolSql(50) … returned 0 rows (flaky)."* Asking for **50** legal rows returned **zero**.
That is **post-filter starvation**, observed months ago and never connected to the architecture: the HNSW index
covers the WHOLE `embeddings` graph (~190k rows), `hnsw.ef_search=40` collects 40 nearest neighbours, and the
**selective** `LEGAL_CORPUS_FILTER` is applied AFTER — if those 40 are mostly non-legal, the legal pool comes
back tiny or empty. The test "fixed" it with a deterministic legal-anchored sample vector — a workaround that
hides the defect instead of removing it.

**Why the Phase A latency does not apply here.** Phase A (ADR-018) got epistle 84→92 with `iterative_scan` +
`ef_search=200`, but at 12–14s /ask latency — because `iterative_scan` re-searches the **full** graph until it
has enough post-filter rows. A **partial HNSW index built only over the legal rows** removes the reason
`iterative_scan` exists: every neighbour in that index is already legal, so a modest `ef_search=128` with
`iterative_scan=OFF` fills the pool directly, fast. Nobody has run this exact combination.

**Exact steps (on a dev branch — this is a `CREATE INDEX`, a prod write; DO NOT run against prod):**
1. On the dev branch: `CREATE INDEX CONCURRENTLY idx_embeddings_vector_legal ON embeddings USING hnsw
   (embedding vector_cosine_ops) WHERE user_id IS NULL AND source_type='commentary' AND <LEGAL_CORPUS_FILTER>;`
   (a partial HNSW index — the predicate must match `LEGAL_CORPUS_FILTER`; add a sync guard like the §6 FTS one).
2. Own the transaction in `routing.ts`: `SET LOCAL hnsw.ef_search = 128; SET LOCAL hnsw.iterative_scan = off;`
   inside a `sql.transaction([...])` — a bare `SET LOCAL` on the stateless HTTP driver is a no-op (the Phase A
   trap). Verify with `SHOW hnsw.ef_search` inside the same transaction.
3. Add a **recall probe**: assert `legalBasePoolSql(50)` returns ≥ 50 rows on the dev branch (the thing that
   returned 0). That probe is the regression guard for post-filter starvation.
4. Measure v4 epistle + topical + latency. Gate: epistle ↑ toward 92, topical no regression, /ask p95 back
   near the ~5s baseline (the whole point vs Phase A's 12–14s). Publish only if latency AND accuracy both hold.

**Interaction:** Lever B is confounded by the corpus until Lever A + the §2 verse-key repair land (more legal
rows change the graph). Sequence: fix the corpus (verse-key repair, Calvin OT) → then tune B on the real graph.
