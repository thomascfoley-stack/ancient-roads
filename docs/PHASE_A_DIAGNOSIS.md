# Phase A diagnosis (queue #4 §2) — measured to completion

## FINAL VERDICT (2026-07-12, after exhausting the retrieval-tuning space)

The topical/epistle gap is **NOT content and NOT a re-embed problem** — every failing label has ≥3 distinct
legal authors already vectored. It splits cleanly into two different problems, and **neither is cleanly
shippable tonight**:

- **Epistle → SOLVABLE by recall, but at a latency cost.** The on-label voices sit at exact vector rank
  #22–#95, which the default HNSW `ef_search=40` under the selective legal filter drops from the pool.
  `iterative_scan` + `ef_search=200` lifts **epistle H2 84→92** — but `/ask` latency goes **~5s → 12–14s**
  (2.5×), which is not shippable. Making it fast needs a latency-optimized index (a partial legal HNSW index
  co-designed with `ef`/pool), a real slice — not a knob. A fast partial index at `ef=40` alone gives only
  epistle 84 (the win specifically needs the deep search).
- **Topical → at the RETRIEVAL CEILING (~70–75), not fixable by tuning.** The failing abstract-thematic
  queries' 2nd on-label voice is at exact rank #32–#140; **no** config (pool 20/50/100/200, iterative_scan,
  `ef` 40–400, or a vector/rerank blend α 0.4–0.8) surfaces **two** distinct on-label voices into the top-6.
  It needs a **feature** — query-expansion or an *attributed* topical index (ADR-017 permits the latter only
  as a visible voice, never a hidden router) — or a stronger embedding for thematic queries.

**What was NOT done, deliberately:** no re-embed (the vectors exist; $4 + prod-index risk for zero gain), no
router (ADR-017), and the recall change was **reverted** rather than ship a 12–14s `/ask` or a topical
regression. v3 stands at topical H2 75 / epistle 84. Any real fix ships on a freshly-minted, authority-
grounded v4 — NOT from memory.

This is what looking at the live DB (instead of the brief's assumptions) found:

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

*(An earlier first-pass measurement here reported the "best single label vector" at rank #1 and concluded
"reranker demotes vector-#1." That was wrong on both counts — corrected by the DEFINITIVE per-label test
below, which measures ≥2-distinct-author availability and exact ranks: the failing labels' voices are at
exact #22–#140, and the retrieval, not the reranker, drops them. See that section.)*

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

## The two designed slices (parked — §7), with the tradeoffs MEASURED

**EPISTLE (→85): a latency-optimized recall index.** The win is real (iterative_scan + ef=200 → epistle 92)
but the naive form costs 2.5× latency. Ship path: a **partial legal HNSW index** (`hnsw(embedding) WHERE
<legal predicate>` — searches only the ~84k legal vectors, so a high `ef` is cheap) built as a migration,
wired via `legalBasePool()` (SET LOCAL the GUCs in the same neon transaction — proven to work), then measure
latency AND the number together. Guard: it perturbs the pool, which flips ±1 topical/pericope query, so it
must be measured on a fresh v4 with a no-regression check before shipping.

**TOPICAL (→85): a feature, not a knob.** Measured dead-ends (all leave topical H2 ≤75): pool 20/50/100/200,
iterative_scan, ef 40–400, vector/rerank blend α 0.4–0.8. The failing abstract queries' 2nd on-label voice is
at exact rank #22–#140 by vector; the embedding simply doesn't rank two on-topic passages high enough, and no
re-ranking of a pool that lacks them can help. The real levers: **query-expansion** (expand "justice and care
for the poor" into its scriptural vocabulary before embedding), an **attributed topical index** (ADR-017
permits it ONLY as a visible, cited voice — never a hidden router), or a **stronger/thematic embedding**
(a real re-embed with a better model — different from the rejected chunking re-embed). ep-09-class (#140) is
the hardest; ~1 residual miss likely persists.

Do NOT build the Torrey router (ADR-017 — circular, and it doesn't address this ranking defect anyway).
**The concordance guarantee is untouched by any of this** — reordering which grounded voices surface is not
interpretation; the JSON output contract + fail-closed verifier stay in force.
