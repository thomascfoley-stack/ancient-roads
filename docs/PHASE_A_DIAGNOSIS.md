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

## DEFINITIVE per-label test (owner's window-function query) — 85 is RANKING/RECALL, not content

Exact vector rank of every on-label legal author, per failing label
(`row_number() OVER (ORDER BY embedding <=> $1)` over the legal corpus, then filter to on-label):

| label | authors avail | ≥2 in exact top-20 / top-100 | best ranks | class |
|---|---|---|---|---|
| tp-09 | 5 | 2 / 4 | Matthew#1, Adam#3 | reachable @ pool-20 |
| tp-12 | 8 | 2 / 4 | Matthew#1, John#8 | reachable @ pool-20 |
| tp-08 | 3 | 0 / 3 | Jamieson#32, John#56, Matthew#83 | recall (2nd+ voice #30–80) |
| tp-15 | 7 | 0 / 4 | Adam#48, Matthew#50 | recall |
| tp-17 | 4 | 1 / 4 | Jamieson#12, John#21 | recall |
| ep-04 | 5 | 1 / 3 | John#1, Matthew#22 | recall |
| ep-09 | 6 | 0 / 1 | Adam#54, then #140 | **HARD (semantic)** |

**Not one failing label is content-limited** — every one has ≥3 distinct legal authors with vectors on the
passages. **6 of 7 are recall/ranking** (≥2 voices within the exact top-100; the 2nd voice sits at exact
#20–#95 and the retrieval — HNSW `ef_search=40`, pool=20 — never reaches it). **1 of 7 (ep-09) is a genuine
semantic miss** — its 2nd on-label voice is at exact #140, which no recall/pool knob surfaces; that needs
hybrid/query-expansion or a stronger embedding, and it is why **85 is reachable but 100 is not.**

Two earlier claims in this doc were wrong and are corrected here: (a) the failing labels are **not** all
vector-#1 (that was one lucky query — tp-08's best is #32); (b) it is **not** primarily the reranker demoting
a top passage — the passages never reach the reranker because approximate HNSW under the selective legal
filter drops them from the pool first.

## Tested fix — partial legal HNSW index (built, measured, REVERTED)

Built `idx_embeddings_vector_legal` = `hnsw(embedding) WHERE <legal predicate>` (the queue-#3 FTS pattern),
so the ANN search runs only over the ~84k legal vectors instead of post-filtering 190k. The planner used it.
Measured v3:

| | verse-ref | pericope | epistle | topical | proper-noun |
|---|---|---|---|---|---|
| before | 95 | 87 | 84 | **75** | 70 |
| with partial index | 95 | **93** | 84 | **70** | **80** |

It **helped proper-noun (+10) and pericope (+6)** — recall recovered for their 2nd voice — but **did not help
topical** (still flat across pool 20/50/100) and nudged it 75→70 (one query). Why: the partial HNSW index
still has `ef_search=40`, so recall depth is capped ~40 and topical's #48–#95 on-label voices remain
unreached. **Reverted** (`DROP INDEX`) — I will not leave an unmeasured, target-regressing retrieval change
live on prod, and shipping one needs a fresh vN + a no-regression proof.

## The REAL fix (parked — §7) — a designed recall slice, measured on a fresh vN

Not a re-embed, not a router. A co-designed change, each step measured, verse-ref/pericope guarded:
1. **Partial legal HNSW index** (recovers proper-noun/pericope recall) **+ raised `ef_search`** (≥100–200, so
   the pool reaches exact rank #90 — proven: `ef_search=400` recovers tp-08/tp-15 on-label to match exact) **+
   a larger `CANDIDATE_POOL`** (the 2nd voice sits below #20). These three are interdependent — none alone
   moves topical; measured together they should clear 85 for the 6 recall-class labels.
2. Watch the reranker/`selectDiverse` interaction — topical is sensitive to which distractors enter the pool
   (it moved ±1 query on every change). The `--no-rerank` data (topical H1 35→50) says the reranker also
   demotes the on-label 1st voice for abstract queries; a query-type-aware blend may be needed on top.
3. The ep-09-class semantic residual (2nd voice at exact #140) will not yield to recall — accept ~1 miss, or
   add hybrid/query-expansion, to close the last gap toward 100.

## The REAL fix (superseded note) — the earlier reranker-only framing below is incomplete; see the section above

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
