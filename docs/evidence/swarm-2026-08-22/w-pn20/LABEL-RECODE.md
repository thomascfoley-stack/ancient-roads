# LABEL-RECODE — W-PN20, per-case re-coding of the three misses

**Ordered by:** docs/pm/orders/2026-08-22-swarm-recovery-amendment.md, "W-PN20 disposition"
(verify labels before anyone recounts hits; zero voices is closer to no-content than to
wrong-passage; the two codes have different remedies). **Labels, not thresholds** — the
ADR-118 18/20 bar is not renegotiated here and no remedy is applied.

**Run:** 2026-08-23 · branch `swarm/w-pn20-proper-noun` · worktree `/tmp/swarm-pn20` ·
**dev (`ep-tiny-hat`), read-only** (no writes; verified the only hosts in the env files are
`ep-tiny-hat*` — no `ep-odd-fog` string present).
**Method:** `web/src/scripts/w-pn20-recode-probe.mts` + `w-pn20-recode-probe2.mts` (committed
with this file) re-run each missed query through the SHIPPED routing path — the same
`lib/teacher/routing.ts` orchestration the frozen harness `eval-heldout.mts --pn20` measures
(legalBasePool → inject → merge → rerank → floor → backfill → selectDiverse; K=6, pool=20,
ef=64) — dumping every stage, then measure served-corpus coverage on the labeled chapter and
pericope directly. Full transcripts: `recode-probe.log`, `recode-probe2.log` (this directory).

## e033023 regression hypothesis — **FALSIFIED**

Hypothesis (recovery order): commit `e033023` (1/2/3-John overlap-dedupe, landed 2026-08-21,
one day before the run; confirmed an ancestor of the measured HEAD) could have regressed
routing so that a 3 John query drops 3 John sections in favor of 1/2 John.

What e033023 actually changes (`git show e033023`): it touches ONLY
`scanReferences()` in `src/bible/ref-parse.ts` (+ its byte-identical `web/` copy). Candidates
now carry source spans; where two VALID parsed candidates overlap in the query text, the
longer span wins. It runs only when the query text contains something that parses as a
numeric scripture reference. It touches no SQL, no pool, no rerank, no floor.

Evidence against the hypothesis, from the shipped-path transcript:

```
===== pn18  Q: "Diotrephes who loveth to have the preeminence"  label: 3 John 1 =====
  scanReferences → (none)
  resolveIntent  → inject: 0 range(s), floor: 0 range(s)
  injection: SKIPPED (no scanned references — routing cannot drop anything here)
```

1. The pn20-18 query contains **no scripture reference**, so `scanReferences` returns zero
   candidates and the e033023 dedupe code **never executes** — its input array is empty.
   (Same for pn20-16 and pn20-13: all three transcripts show `scanReferences → (none)`.)
2. With zero scanned refs, `resolveIntent` produces no inject and no floor ranges, so the
   range-scoped injection SQL never runs either — nothing downstream can "drop 3 John
   sections in favor of 1/2 John" because no passage-scoped routing happened at all.
3. The failure shape contradicts the hypothesis's signature: a dedupe regression would leave
   **1 John / 2 John** content in the final voices. The actual final top-K for pn20-18 is
   Ps 89, Ps 37, Matt 20 (Calvin ×2, Augustine ×2, Chrysostom, Barnes) — no Johannine
   content of any kind, epistle or Gospel.
4. The served pool was never thin on 3 John (see pn20-18 below): 54 served commentary chunks
   across 5 authors are anchored to 3 John 1 — nothing was deduped out of the corpus.

The e033023 fix is exonerated for all three misses; the "routing-regression" label is not
warranted for any of them.

## Per-case re-code

| case | original label | observed failure shape (shipped path, dev) | corrected label | remedy class |
|---|---|---|---|---|
| pn20-18 Diotrephes / 3 John 1 | wrong-passage, 0 voices | Content verifiably present: 54 served commentary chunks on 3 John 1 across **5 authors** (Clarke 14, Barnes 13, Gill 13, Wesley 10, Henry 4); 16 on-label chunks name "Diotrephes" (Barnes 6, Gill 4, Clarke 3, Wesley 2, Henry 1). But the shipped ef=64 base pool returned **only 5 rows** (HNSW scan starved below LIMIT 20), all off-passage (Ps 89, Ps 37, Matt 20, Acts 5). No injection (no scanned ref) → rerank/floor/backfill can only permute the wrong 5. **Zero on-target candidates ever entered the pipeline.** At ef=1000 the pool fills to 20 and contains 4 on-label rows, incl. 3 John 1:9 itself (Henry, Wesley, Clarke). | **wrong-passage — CONFIRMED** (present-but-unretrieved; not no-content, not routing-regression) | **retrieval-routing** — base-pool recall: ef=64 starvation compounds a weak vector signal for the entity query |
| pn20-16 Stephanas / 1 Cor 16 | wrong-passage, 0 voices | Same shape. Served pool holds 107 commentary chunks on 1 Cor 16 across **6 authors** (Clarke 24, Barnes 23, Gill 20, Wesley 18, Jamieson 17, Henry 5); 9 on-label chunks name "Stephanas" across 5 authors. Shipped ef=64 base pool returned **only 8 rows**, all Old Testament (Dan, Ezra, Ezek, Gen, Nah) — none on-label, no injection, backfill anchors to Dan 11/Ezra 4/Ezek 27. Zero on-target candidates ever entered. At ef=1000 the pool fills to 20 with 4 on-label rows, incl. 1 Cor 16:15 (Wesley ×2, Clarke, Gill). | **wrong-passage — CONFIRMED** (present-but-unretrieved) | **retrieval-routing** — same base-pool recall defect as pn20-18 |
| pn20-13 Joseph of Arimathaea / Luke 23 | `<2-voices` (1 voice) | **Not a coverage gap.** Pericope-level coverage (chunks anchored to Luke 23:50-56 itself): **5 distinct served authors** — Aquinas 7, Clarke 4, Barnes 4, Gill 1, Henry 1. Chapter-level: 6 commentary authors / 197 chunks on Luke 23. The shipped pipeline DID retrieve the right pericope — Luke 23:50 (Aquinas) twice in the base pool, once in the final top-K — but the rest of the pool is synoptic parallels of the same episode (Matt 27:57, Mark 15:42, John 19:38), which the frozen single-chapter label cannot count. Even at ef=1000, no non-Aquinas Luke 23 chunk enters the top-20 vector pool: the other 4 authors' pericope chunks exist but embed farther than the parallel-account chunks. Surfaced: 1 voice (matches the original run). | **`<2-voices` — retrieval-limited** (NOT `<2-voices-coverage`; ≥2 distinct authors exist on the pericope in the served pool, pipeline surfaced 1) | **retrieval-ranking** — on-pericope chunks from Clarke/Barnes/Gill/Henry lose the vector race to synoptic parallels; a corpus remedy would add nothing |

## Count interpretation, both ways (reported, not judged)

- **As labeled (frozen, RESULT.md):** HIT@2 = 17/20 = 85.0%. Codes: pass 17 ·
  `<2-voices` 1 · `wrong-passage` 2 · `no-content` 0.
- **As re-coded:** HIT@2 = **17/20 = 85.0% — unchanged.** Re-coding moved no case across the
  pass/miss line (none was mis-scored; the miss in each case is real). What changes is the
  failure taxonomy: **3/3 misses are retrieval-side** (`wrong-passage` 2 confirmed,
  `<2-voices` re-attributed from assumed-coverage to retrieval-limited), `no-content` 0,
  coverage-limited 0, routing-regression 0. No case qualifies for exclusion from the
  denominator on coverage grounds, so the ≥2-available denominator is also 20.
- Remedy implication of the re-code (for the owner's decision, not acted on here): the
  corpus lane buys nothing for these three cases; all three point at retrieval
  (base-pool recall / ranking), with the ef=64 pool starvation (5 and 8 rows returned of a
  LIMIT-20 pool) a concrete, measured contributor in the two 0-voice cases.

## Reproduction

```sh
cd web && npx tsx --env-file=.env.local src/scripts/w-pn20-recode-probe.mts    # stage-by-stage transcripts
cd web && npx tsx --env-file=.env.local src/scripts/w-pn20-recode-probe2.mts   # ef sweep + pericope coverage
```

Logs: `recode-probe.log`, `recode-probe2.log` in this directory. Both probes are read-only
(SELECTs + embedding/rerank API calls; no DB writes, no tuning).
