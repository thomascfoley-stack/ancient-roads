# EMBEDDINGS — pre-design notes (reconnaissance)

**Status: PRE-DESIGN. Not a design, not approved, not the architecture of record.**
Committed to the repo 2026-08-12 under bylaw 1 (a decision that exists only in a chat window does
not exist), so that `docs/EMBEDDINGS_DESIGN.md` v2's provenance chain is openable. Originally
written 2026-08-11 and deliberately held off-repo. `ARCHITECTURE.md` and the ADRs are the record;
these are notes that came before a design, so that whatever gets designed is written against
measured facts instead of memory.

Read 2026-08-11 against `02b1b42` (`feat/marketing-site`). Every claim below is read out of the tree
at that anchor, or out of a comment that records a live measurement — provenance is named inline.
**Nothing here proposes a change.** Its purpose is to make the four vector planes, the one model, and
the lockstep between index predicates and code constants visible in one place. Six questions it
raises are collected in §8; they are questions, not decisions.
**Companions:** `MIGRATION_DESIGN.md` (§5.1, the embeddings-live-apart rule), `PHASE_A_DIAGNOSIS.md`
(recall/latency knobs), ADR-005 (model pin), ADR-010 (sources/sections model), ADR-102 (B2 close),
ADR-104 (one canonical corpus predicate).

> **MEASURED** = read from the tree or a committed evidence file at the stated anchor.
> **RECORDED** = a live-database number captured in a code comment; trustworthy as of its writing,
> not re-measured here (this session has no database reach). **UNKNOWN** = named, not inferred.

---

## 1. There is one embedding model

| | Value | Where |
|---|---|---|
| Model | `BAAI/bge-large-en-v1.5` | `src/retrieval/embedder.ts:16`, `web/src/lib/user-corpus/model.ts:35` |
| Dimensions | 1024 | every vector column; asserted at insert (`user-corpus/embed.ts:67`) |
| Context ceiling | 512 tokens → chunk cap **1800 chars** | `embedder.ts:4`, `ingest-historian.ts:28` |
| Language | English (`to_tsvector('english', …)` throughout) | `db/schema.sql:191` |
| Provider | DeepInfra `/v1/openai/embeddings`, batch ≤64 | `embedder.ts:16`, `user-corpus/embed.ts:11` |
| Failover | Nebius, named behind the same interface — **not built** | `embedder.ts:8` |
| Pinned by | ADR-005; B2 closed on it by ADR-102 | `user-corpus/model.ts:4` |

Two other models sit in the chain and **store no vectors**, so they are not embedding planes:

- **Reranker** — `Qwen/Qwen3-Reranker-0.6B`, a cross-encoder, DeepInfra `/v1/inference`
  (`web/src/lib/teacher/routing.ts:18`, `rerank.ts:4`). Rescores a retrieved pool; never persisted.
- **Composer** — Qwen3.5-35B-A3B (`PRODUCT_ARCHITECTURE.md`). Output passes the verifier.

### 1.1 One model, two spellings — the trap that is already fixed on one plane

The corpus records the model **two different ways**, and the natural parity checks are both wrong.
RECORDED against the live database in `web/src/lib/user-corpus/model.ts:17-28`:

```
section_embeddings.model_slug      'bge-large-en-v1.5'        362,948 rows
embeddings.metadata->>'model'      'BAAI/bge-large-en-v1.5'  1,070,674 rows
```

- Comparing a user row against **our own constant** is tautologically green — writer and check read
  the same literal, so every row passes while silently mismatching the corpus. The bug wearing the
  check's uniform.
- Comparing against the **short** form passes `section_embeddings` and fails every row of
  `embeddings` — which is the plane the cross-plane join actually reads, because `served` lives there.

The resolution is that **parity is about the model, not the spelling**: `normaliseModel` strips the
vendor prefix and lowercases; `isJoinable(userSlug, corpusModel)` takes the corpus's *own recorded
value* and deliberately has no default, so a caller cannot pass our constant by accident
(`model.ts:44-72`).

**Why this matters more than it looks:** Jina v3 is *also* 1024-dim. A vector from the wrong model
inserts, joins, and scores cleanly — there is no width mismatch to raise, no error to log. The
failure is plausible garbage, forever. Nothing catches it except a check that looks.

---

## 2. Four vector planes

MEASURED — every `vector(…)` column in `db/`:

| # | Plane | Key | Model identity | Vector index |
|---|---|---|---|---|
| P1 | `embeddings.embedding` | `UNIQUE (source_type, source_id, chunk_index)` — `source_id` is a **synthesized TEXT** key | `metadata->>'model'`, **no column, no constraint** | 1 full HNSW + **4 served-partial HNSW** + FTS GIN + 2 verseId btrees |
| P2 | `section_embeddings.embedding` | `PK (section_id, model_slug)`, `section_id` → `sections(id)` BIGINT | `model_slug` column | `se_hnsw_idx`, full HNSW |
| P3 | `user_section_embeddings.embedding` | `PK (section_id, model_slug)` → `user_sections(id)` TEXT | `model_slug` column | **none, by design** — brute force per user |
| P4 | `hybrid_search(query_embedding vector(1024))` | — | — | function parameter, not storage |

P1 and P2 are the same disjoint-key problem the studies design ran into: both have a `source_id`,
in different types, meaning different things, with no join between them
(`006_sources_sections.sql:36-43`).

### 2.1 P3's missing index is a decision, not an omission

`100_user_corpus.sql:75-81`: one user's chunks are ~1 % of the table, so a shared HNSW starves the
way the corpus index did. Brute-force cosine over `WHERE user_id = $1` is 100 % recall and fast at
low-thousands of chunks; the btree on `user_id` makes the scan cheap. The escape hatch — a per-user
HNSW partition above ~20–30k chunks/user — is a separate future migration fired by a tripwire.

### 2.2 P2 is written by two scripts and read by nobody

MEASURED, and the most consequential finding in this document:

- **Writers:** `src/ingest/migrate-sections-slice.ts:256` and `repoint-sections-work.ts` only —
  both of which *reuse* `embeddings.embedding` verbatim rather than re-embedding, so DeepInfra cost
  is zero (`repoint-sections-work.ts:6`).
- **`register-writer.ts` — the writer for every new register work — inserts into `sources`,
  `embeddings`, `sections`, `section_anchors`, and `DELETE`s from `section_embeddings` at :208. It
  never inserts there.** So new works get no P2 vectors and P2's coverage decays as the corpus grows.
- **Readers at runtime: none.** Every reference outside `src/ingest/` is a comment. The library
  search surface reads `sections.tsv` — full-text, not vectors (`web/src/lib/search-sections.ts`).

Net: **362,948 vectors and one HNSW index that no request path touches**, maintained on every
migrate/repoint. Either the sections plane gets wired to vector retrieval, or the table and index go.
Drifting is the only wrong answer — see §8.1.

---

## 3. Ingest — how a vector comes to exist

```
source adapter (sword · gutenberg · archive · ccel · crosswire)
      │
      ▼  chunk, ≤1800 chars — the 512-token ceiling, never truncated
   DeepInfra /v1/openai/embeddings   model=BAAI/bge-large-en-v1.5   batch ≤64
      │        5 retries, 2s×n backoff, 60s timeout; 5xx/429 retried, other 4xx fail fast
      │        rows whose vector ≠ 1024 dims are DROPPED, not stored
      ▼
   embeddings  (source_type, source_id, chunk_index, content, embedding,
                metadata{model, work, verseId, …})            ← P1, served=false
      │
      ├─► sources (slug, license, provenance, status='staged')
      ├─► sections (ordinal, heading, body, unit_ordinal)      ← FTS plane
      └─► section_anchors (verse_id_start, verse_id_end)       ← the verse join
                                    │
                    ⚑ OWNER GATE — licensing adjudication
                                    │
                    sources.status → 'published'      (work-level)
                    embeddings.served → true          (row-level, 044)
                                    │
                    ▼ the four served-partial HNSW indexes now admit these rows
```

`embeddings.served` was added by `044_embeddings_served_expand.sql:90`. Before it, four partial index
predicates and four `*_CORPUS_FILTER` constants each carried an author allowlist that had to be
edited in lockstep with an index rebuild, forever — "that treadmill is why 76 of…" (`044:22-24`).
`served` collapsed the treadmill into one boolean.

**Two gates, not one.** `sources.status='published'` is work-level and governs the FTS/reader plane.
`embeddings.served` is row-level and is *the switch for vector retrieval* (`routing.ts:141`). They
were unrelated facts before 044 and are still separate columns on separate planes; a work can be
published and served by nothing — `lexicon` is exactly that today, "no lane exists (open A8
decision, not an oversight)" (`routing.ts:171`).

---

## 4. Retrieval — three read paths, one shared model

### 4.1 `/ask` — the composed exegetical answer (P1)

```
question → embed (same model, same 1800-char cap)
        → vector search over embeddings under a REGISTER LANE predicate:
             user_id IS NULL AND served AND source_type IN (…)
             ├ legal       commentary + father          idx_embeddings_served_legal
             ├ song/verse  hymn + poetry                idx_embeddings_served_song_verse
             ├ sermon      sermon                       idx_embeddings_served_sermon
             └ theology    theology + confession         idx_embeddings_served_theology
        → Qwen3-Reranker-0.6B cross-encoder rescore of the full pool
        → on-range floor · diversity selection · chapter backfill · song/verse + lane injection
        → compose (Qwen) → verifier → render
```

Hybrid (vector + BM25) was **dropped from the request path deliberately** — measured no-loss, vector
97 % ≈ hybrid 97 %, with the reranker doing the work BM25 was there for (`retrieve.ts:32`). The
`hybrid_search(query_embedding …)` SQL function from 003/004 survives in the schema; whether anything
still calls it is UNKNOWN (§8.6).

### 4.2 Library search — the register-walled surface (no vectors)

FTS over `sections.tsv`, published-only, unit-deduped via `unit_ordinal`, register-labelled from
`sources.source_type`. `DEFAULT_LIMIT=20`, `MAX_LIMIT=100`, globally ranked — which is why the
grouped topic view must issue **one capped query per register** rather than grouping one truncated
set (`search-sections.ts`; STUDY_DOCS_DESIGN §2.5).

### 4.3 User corpus — the pastor's own documents (P3)

```
their .docx/.pdf → parse queue → user_sections (heading/body/footnote, ordinal, tsv)
                                → user_section_embeddings  (brute-force plane)
                                → user_section_anchors     (verse_id ranges;
                                     channel ∈ explicit | prose | uncited, + confidence)

read paths:  brute-force cosine WHERE user_id=$1   ·   per-user FTS
             verse-presence fast path over anchors ("have I written on Romans 8")
```

### 4.4 The cross-plane join — "the moat"

`user-corpus/tradition-gap.ts`: which voices from the tradition speak on the passages *you* engaged.
It joins P3 against **P1** (because `served` lives there), which makes it the one place where model
parity is load-bearing — hence §1.1.

Two structural properties worth keeping visible:

- The corpus predicate is **injected as a branded compile-time constant**, never a bound parameter
  and never a second hand-written copy — that is ADR-104. The branded type exists so
  `corpusPredicate(userInput)` is something you have to write on purpose (`tradition-gap.ts:26-28`).
- RECORDED there: `328,775 of 1,070,674 rows served`. The 2026-08-10 prod read-only probe recorded
  **398,113** served (WORKLOG). Both are true at their own moment; the served set grows as licensing
  adjudication proceeds. Any doc quoting one without a date is wrong within a week.

---

## 5. The dependency that has drawn blood

**Index predicates and code constants must move in lockstep, and the failure is silent.**

If the predicate a query implies matches no partial index, the planner falls back to the full-table
HNSW at the shipped `ef_search`, collects its 40 nearest neighbours, and *then* applies the selective
filter — which starves the pool. Fewer voices, no error, no log line.

The scar tissue, in order:

| Migration | What happened |
|---|---|
| 009 | died of exactly this mechanism — the canonical reference for the failure |
| 012 | partial HNSW over the legal rows to kill post-filter starvation |
| 018 | register-scoped partial indexes |
| 037 | nearly repeated 009; `legal-hnsw-index-sync.test.ts` caught it |
| 044 | EXPAND — `served` column + four new served-partial HNSW under **new names**, dropping nothing, so both bundles plan onto a matching index across the deploy window |
| 045 | CONTRACT — drops the pre-`served` bundle. **Precondition enforced by nothing mechanical:** the deployed bundle must already query `served`, confirmed by an `/ask` smoke test and an `EXPLAIN`. Applying it under the old bundle reopens 009. |

**045 also closed the redeploy window** (`045:16-18`): after it, rolling back to a pre-`served`
deployment id restores a bundle whose predicates match no partial index — the same silent starvation.
That is a live operational constraint on incident response, not a historical note.

### 5.1 Failure modes, all silent

| # | Failure | Why nothing raises |
|---|---|---|
| 1 | Wrong-model vectors | Jina v3 is also 1024-dim — inserts, joins, scores cleanly |
| 2 | Predicate/index drift | Planner degrades to full HNSW + post-filter; returns *fewer*, not *none* |
| 3 | Tautological parity check | Writer and check share a constant |
| 4 | Rollback past 045 | No matching partial index for the old predicates |
| 5 | P2 coverage decay | Nothing reads it, so nothing notices |
| 6 | Model-identity drift at the provider | DeepInfra silently forwards deprecated models (`SERMON_COMPANION.md` HAZARD) — no alert exists |

---

## 6. What already guards this

MEASURED — existing invariants:

| Check | What it holds |
|---|---|
| `legal-hnsw-index-sync.test.ts` | index predicates ↔ routing constants agree |
| `fts-legal-index-sync.test.ts` | same, for the FTS plane |
| `served-backfill-frozen-sync.test.ts` | the served backfill matches the frozen record |
| `served-lists-respect-the-manifest.test.ts` | served lists cannot exceed the licensing manifest |
| `publish-admission-covers-served-lists.test.ts` | a published work served by nothing stops the flip |
| `quarantine-served-corpus.test.ts` | quarantine removes rows from the served set |
| `served-reconcile.test.ts` · `served-corpus-authors.test.ts` | reconciliation and author-level gating |
| `uncited-shingle-parity.test.ts` | the uncited-quote channel's parity |
| `verify-served-backfill.mjs` | proves the backfill |

**The gaps** (no check exists): model identity on P1 (§8.3), provider model-identity drift (§5.1 #6),
P2 liveness (§8.1), and the 045 redeploy-window precondition, which is prose in a migration header.

---

## 7. Numbers, with provenance and dates

| Quantity | Value | Source | As of |
|---|---|---|---|
| `embeddings` rows | 1,070,674 | `user-corpus/model.ts:18` (RECORDED) | at writing |
| `embeddings` served | 328,775 | `tradition-gap.ts:10` (RECORDED) | at writing |
| `embeddings` served | 398,113 | prod read-only probe, WORKLOG | 2026-08-10 |
| `section_embeddings` rows | 362,948 | `model.ts:17` (RECORDED) | at writing |
| prod `sources` | 7, all `commentary` | `docs/evidence/a2-prod-readonly-2026-08-01/census.txt` A2.1 | 2026-08-01 |
| Gill | 28,843 sections → 1,169 units | prod probe, WORKLOG | 2026-08-10 |

---

## 8. Questions this raises — not decisions

Each is stated with what would settle it. **None are being decided here, and none should be actioned
off this document** — that is what the design these notes precede is for.

1. **P2: wire it or drop it.** Nothing reads `section_embeddings`; `register-writer` never writes it;
   `se_hnsw_idx` is maintained anyway. *Settles by:* a ruling — (a) point library search's semantic
   mode at P2 and make `register-writer` populate it, or (b) drop table + index and let P1 remain the
   only corpus vector plane. Measure current row count and index size on dev first.
2. **The corpus plane's hand-typed model literals.** `model.ts` fixed the user plane and records the
   corpus plane's ~12 copies as "a pre-existing condition… Lane A, not this slice." *Settles by:* one
   exported constant, ingest edited broadly — a mechanical change with a wide diff.
3. **P1 has no model column.** Identity lives in `metadata->>'model'` with no constraint, so a second
   model can land silently. *Settles by:* a CHECK on the JSONB path, or a real column with a FK to a
   models table. Cheap now; a backfill over 1.07 M rows later.
4. **`lexicon` is served by nothing** — "no lane exists (open A8 decision, not an oversight)"
   (`routing.ts:171`). *Settles by:* the A8 ruling — give it a lane, or state that lexicon is a
   shelf-only register.
5. **Single-provider dependency.** DeepInfra serves both embed and rerank; Nebius is named, not built.
   *Settles by:* deciding whether failover is required before the next corpus-scale embed run.
6. **`hybrid_search()` liveness.** The function exists (003/004); the hybrid path was dropped from
   `/ask`. *Settles by:* one grep for call sites — if none, it joins item 1's ruling.

---

## 9. What this document does not claim

- **That it is a design.** It proposes nothing, ratifies nothing, and supersedes nothing. If it ends
  up cited as architecture, that is a misuse of it.
- That any number in §7 is current. They are dated; the served set moves with licensing.
- That `section_embeddings` is unused *in the database* — it claims no **runtime read path exists in
  this tree**, which is a claim about code, not about whatever else may connect.
- That the 045 redeploy constraint is enforced. It is prose in a migration header.
- That parity is guaranteed on the corpus plane. It is guaranteed on the user plane by `isJoinable`;
  P1's own model identity is unconstrained (§8.3).
- Anything about recall, latency, or accuracy. No measurement of retrieval quality was made here.
