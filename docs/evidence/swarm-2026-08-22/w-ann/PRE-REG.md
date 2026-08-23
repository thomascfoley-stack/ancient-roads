# W-ANN PRE-REGISTRATION — ANN post-filter recall collapse in history search

Committed BEFORE any measurement of the candidate fix, per order
`docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` §2.4 + §7 (W-ANN).
The defect reproduction (RED) preceded this document and is committed at
`red-shipped-2026-08-23T03-14-40.log`; no post-fix number exists at commit time.

## The claim (fix hypothesis)

The history vector lane (`web/src/lib/history-search-db.ts`, the KNN query in
`searchHistory`) starves because its partial HNSW index
(`idx_history_embeddings_served`, predicate `served`) holds 44,575 rows of which
only 9.2% (4,112) survive the query's full scope filter
(`he.served AND src.status='published' AND src.source_type='historian'`). The
published/historian conjuncts are JOIN filters — they cannot be pushed into the
index — so a strict HNSW scan stops after ~`ef_search` graph candidates and the
post-filter keeps ~9% of them: usually 0 rows.

**Hypothesis:** adding `set_config('hnsw.iterative_scan','relaxed_order', true)`
to the SAME transaction that already sets `hnsw.ef_search=120` makes the scan
continue past the first ef candidates until the LIMIT (50) in-scope rows are
found. pgvector 0.8.1 on dev (measured, `info` mode) supports the GUC. The filed
2026-08-21 evidence agrees with the direction (`iterative_scan=relaxed_order →
50` rows) at the then-current ef; this pre-reg re-measures at the SHIPPED
ef_search=120, which stays unchanged — one knob, one line.

**Why not the alternatives:**
- `ef_search=1000`: filed evidence says → only 5 rows. Insufficient alone, and
  it pays the full candidate cost up front for every query.
- Rescoping the index predicate: impossible — the scope involves a join.
- Flipping `served=false` on the 40,463 staged-work rows: a data/sync-semantics
  change to the serve pipeline (A9), outside this item's least-code envelope
  and touching the publish-flip machinery another workstream owns.

**Related, explicitly OUT OF SCOPE:** W-PN20 flagged `ef_search=64` base-pool
starvation in the /ask routing lane (`routing.ts`) as the cheapest lever for the
proper-noun HIT@2 miss (17/20 vs 18/20). Same defect CLASS (ANN + post-filter),
different lane, different index, different owner item. This pre-reg cites it;
this item does not touch `routing.ts`.

## The measurement

Instrument: `web/src/scripts/history-ann-probe.mts` (committed with the RED,
089dfab — the probe set froze with it). One embedder (shipped `embedQuery`),
one probe set, two modes:

- `shipped` — current code shape: `ef_search=120`, strict scan (RED, already
  captured).
- `fix` — the candidate: `ef_search=120` + `iterative_scan=relaxed_order`, via
  the identical set_config-in-transaction pattern the code change ships.

For each probe the harness records: KNN rows returned, KNN wall time, and the
EXACT in-scope top-50 (index scans disabled) with max cosine — the ground truth
that above-floor in-scope neighbours exist.

**Failing set (recovery measurement):** the 12 text-only probes frozen in the
harness. At RED, 6/12 returned 0 rows; all 12 have a 50-row exact in-scope
neighbourhood with max cosine 0.645–0.795 (all above
`HISTORY_TEXT_COSINE_FLOOR = 0.6`).

**No-regression sets:**
1. Frozen-v1 history eval (`web/src/scripts/history-eval-run.mts`,
   hash-verified set): pre-registered bars must HOLD — control 4/4 zero-match,
   entity ≥6/8, period 4/4 exact, combined ≥3/4. This catches the fix feeding
   the floor new LOW-quality rows that change heroes (the floor judges every
   text candidate on real cosine; nonsense must stay empty).
2. End-to-end `searchHistory` behaviour on the 12 probes (post-fix code run):
   nonsense controls stay empty; recovered probes show `matched` including
   'text' only at cosine ≥ 0.6 (the floor is unchanged code).
3. `npm run audit` green in the worktree (includes the history-scope-db
   invariant and the history suites).
4. Latency: per-probe KNN wall time, fix vs shipped. ADR-018's lesson
   (iterative_scan + ef=200 on the 13 GB shared index → 12–14 s) is why this is
   a bar and not an assumption; here the graph is 44,575 rows, but it is
   measured, not argued.

## Pass/fail bars

The change merges only if ALL of:

- **R1 (recovery):** post-fix, every one of the 12 probes returns ≥1 KNN row,
  and each of the 6 probes that returned 0 at RED returns ≥25 rows (half the
  LIMIT — the exact top-50 exists for all of them).
- **R2 (no probe regresses):** no probe that returned rows at RED returns fewer
  post-fix.
- **N1 (frozen-v1):** all four pre-registered frozen-v1 bars HOLD on dev.
- **N2 (floor honesty):** frozen-v1 controls remain 4/4 zero-match (counted in
  N1, named separately because it is the honesty gate) and no recovered probe
  surfaces text-matched rows below the 0.6 floor (the floor code is untouched;
  verified by reading the end-to-end run).
- **N3 (audit):** `npm run audit` green in the worktree, with the one
  pre-existing red leg (`test/publish-flip-toolchain.test.ts`, thayers gate,
  owned by swarm/w-basefix-thayers-guard) noted, not fixed.
- **N4 (latency):** fix-mode KNN p50 ≤ 2× shipped-mode p50 AND fix-mode max ≤
  5 s across the 12 probes.

## Withdrawal bar

If R1/R2 fail, or any of N1–N4 fails: revert the behavior change, keep all
measurements, write the ADR proposal at
`docs/pm/orders/2026-08-22-w-ann-adr-proposal.md`, mark the item
HELD-FOR-OWNER. No re-tuning after this commit: probes, ef_search value, bars,
and floors are frozen here.

## Notes

- Dev counts at RED (drift-prone, §5.1): 44,575 served / 4,112 in-scope rows /
  1 published historian work. If the DB-writer lane publishes more historian
  works on dev before the fix measurement, in-scope counts rise; the bars are
  stated against the probe behaviour, not absolute counts, and the `info` mode
  re-snapshot is recorded with the result.
- Provider spend: probe embeddings only (bge-large via the existing key), tens
  of calls — recorded in the item file per amendment A1.
