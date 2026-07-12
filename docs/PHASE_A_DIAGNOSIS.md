# Phase A diagnosis (queue #4 §2) — it is NOT a re-embed problem

**Bottom line: the topical/epistle gap is a POST-RETRIEVAL RANKING problem, not a data/coverage
problem. The chunking + re-embed the brief prescribed would spend ~$4 and prod-index risk to add
vectors for passages that are already ranked #1 by vector similarity. It is not warranted. Do not run it.**

This is what §2.1 (free, read-only) found by looking at the live DB instead of the brief's assumptions.

## What the brief assumed vs what the data shows

| Brief (§2) assumed | Live data (2026-07-12) |
|---|---|
| ivfflat, lists=100, probes=1 → rebuild it | **Index is already HNSW** (`idx_embeddings_vector USING hnsw`). `schema.sql:183` is stale. ivfflat rebuild is **moot**; probes irrelevant. |
| `RERANK_DOC_CHARS` needs setting to 1200 | Already **1200** (`routing.ts:18`). No-op. |
| `MAX_EMBED_CHARS=1000` → 52.7% of text unembedded | Live embedded content goes to **4000 chars** (p50 818, p90 1200) — the vectors came from the ~3000-char helloao path, not `embed-full-corpus.ts`. Truncation is far milder than stated. |
| pool=20 of 84k is the recall budget → raise it | **Pool sweep is FLAT.** |

## The pool sweep (v3, the whole point of §2.1)

| pool | verse-ref H1 | pericope H1 | epistle H2 | topical H2 |
|---|---|---|---|---|
| 20 | 95 | 87 | 84 | 75 |
| 50 | 95 | 87 | 84 | 75 |
| 100 | 95 | 87 | 84 | 75 |
| 200 | 95 | 80 | 92 | **65** |

Raising the pool 20→100 changes **nothing**; 200 makes topical/pericope **worse** (more distractors for the
reranker). The pool is not the limiter.

## The killer measurement — are the failing labels even missing?

For the failing topical queries, I embedded the query and found the vector rank of the label passages in the
legal corpus (`_rankprobe.mts`, since deleted):

| failing query | legal label vectors | best label vector rank | so… |
|---|---|---|---|
| "praise and thanksgiving to God" (Ps 100/150, Col 3, 1 Th 5) | 313 | **#1** | present + top |
| "truthfulness and bearing false witness" (Ex 20, Prov 12, Eph 4) | 317 | **#1** | present + top |
| "justice and care for the poor" (Isa 58, Deut 15, Prov 14, Jas 1) | 316 | **#32** | present + in pool |

**The label passages are present in the vectors and rank #1–#32 by similarity — and the queries still return
voices=0 in the top-6.** The base pool contains the on-label passage at #1; the pipeline then drops it. That
is a **reranker / selection** failure on abstract thematic queries, not a retrieval-recall failure. Chunking
would create more vectors for content whose vector is *already #1* — zero expected benefit.

This also explains the sweep shape: the label is in the pool at every size (so pool is flat), and pool=200
feeds the reranker more off-label distractors (so topical drops to 65).

## §2.2 decision

- **SKIP §2.3.3 (sub-entry chunking + re-embed).** Disproven — the content is already vector-top-ranked. Not
  worth $4 + a corpus-wide rewrite of the production `/ask` vector index + the source_id-scheme migration.
- **§2.3.1 (ivfflat rebuild): moot** — already HNSW.
- **§2.3.2 (`RERANK_DOC_CHARS=1200`): already done.**
- **§2.3.4 (delete dead `embeddings.ts`): DONE** (commit this queue).
- No retrieval change is shipped, so **§2.4 re-measure is a no-op** — v3 stands at topical H2 75 / epistle 84.

## Confirmation — v3 with the reranker BYPASSED (pure vector/hybrid order)

Ran v3 with a measurement-only `--no-rerank` knob (kept the vector-ordered pool, skipped the cross-encoder):

| category (H1 / H2) | WITH reranker (prod) | NO reranker (vector order) |
|---|---|---|
| topical | 35 / 75 | **50** / 60 |
| proper-noun | 70 / 90 | **90** / 90 |
| verse-ref | 95 / 98 | 98 / 98 |
| pericope | 87 / 100 | 80 / 100 |
| epistle | 60 / 84 | 60 / 80 |

**Proof:** removing the reranker lifts **topical HIT@1 35→50** and **proper-noun HIT@1 70→90** — because the
vector-#1 on-label passage (which the reranker was demoting) now leads. It is confirmed: the reranker demotes
vector-top on-label passages for abstract/proper-noun queries. **But** it also *earns its place* — it lifts
topical **HIT@2** (75 vs 60) and pericope (87 vs 80) by finding the 2nd distinct voice / handling
multi-passage. So the answer is a **query-type-aware blend**, never a blanket removal (ADR-014 stands for the
categories where it helps).

## The REAL fix (parked — §7) — a reranker/selection investigation, not a data migration

The topical/epistle limiter is that **`Qwen3-Reranker-0.6B` + `selectDiverse` demote the vector-#1 on-label
passage for abstract thematic queries** (queries that name a theme, not a passage — the opposite of the
verse-ref/pericope queries the reranker *excels* at, ADR-014/015). Proposed experiments, cheapest first, each
measured on v3 as a dev-set, none shipped without a fresh vN and a no-regression check on verse-ref/pericope:
1. **Free:** re-run v3 topical/epistle with the reranker BYPASSED (pure vector/hybrid order) to confirm the
   reranker is the culprit and estimate the ceiling. If vector-order tops the label, the reranker is proven.
2. If confirmed: a **query-type-aware blend** — for abstract topical queries (no resolved reference, no
   proper noun), weight the vector/hybrid score higher vs the cross-encoder, OR widen `selectDiverse` so a
   vector-top on-label passage cannot be capped out. Must NOT touch the verse-ref/pericope path (the reranker
   is load-bearing there — ADR-014).
3. Do NOT build the Torrey router (ADR-017) — it is circular and does not address this ranking defect.

**The concordance guarantee is untouched by any of this** — reordering which grounded voices surface is not
interpretation; the JSON contract + fail-closed verifier stay in force.
