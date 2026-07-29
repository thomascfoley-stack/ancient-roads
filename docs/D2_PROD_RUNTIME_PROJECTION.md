# D2 - Prod corpus BUILD runtime projection (cutover steps E2 to E4)

**Status: DESIGN / ANALYSIS ONLY. Nothing here ran against prod. No deploy.** This is a
schedulable wall-clock estimate the owner can trust because the reasoning is shown, every input
is cited, and the dev-vs-prod uncertainty is priced into the range rather than hidden.

## Summary line

**E2 to E4 projected at 25 to 50 minutes, dominated by E4 (the section slice, the only step the
measured 121 to 190 s/10k rate actually covers: about 113,000 flat vectors reused 1:1 into
`section_embeddings`).** Top two caveats: (1) prod compute size is unreadable, the census `SHOW`
returned "unavailable" for `neon.compute_size` and friends (census lines 47 to 52), so the rate is
a DEV measurement projected onto an unknown prod class; (2) E1, which runs immediately before this
window, rebuilds the legal partial HNSW index over about 84k 1024-dim vectors under `CONCURRENTLY`
and has NO measured timing in the repo. That E1 line is a separate 8 to 20 minute precondition and
is the single most likely thing to dominate any one step if prod compute is small. **The whole
unattended window E1 through E4 is 35 to 70 minutes.**

## Where each number comes from (the census is the shape, not a dev literal)

Prod shape, all from `docs/evidence/census/prod-census-2026-07-23.txt` (cross-referenced in
`docs/CUTOVER_DESIGN.md` §Census, lines 42 to 55):

- Flat `embeddings` pool: **190,635 rows**, 100% carry no work key (census lines 12 to 13). This is
  E2's scope.
- Forbidden provenance: **71,884 rows** = 15,707 biblehub + 56,177 hcf, studylight 0 (census line
  25). This is E3's scope.
- Sections model already on prod: **Barnes pilot only, 2 sources / 5,510 sections** (census line
  19). Everything else is unbuilt, so E4 has to slice it.
- Positive control within prod: John Gill = 28,843 flat rows (census line 6).
- Prod is pre-migration-016; all of 016 to 030 apply fresh at E1 (census lines 27 to 35;
  `CUTOVER_DESIGN.md` line 53).
- **Compute params UNAVAILABLE:** Neon did not expose `SHOW` for `neon.compute_size`,
  `max_connections`, `shared_buffers`, `work_mem` (census lines 47 to 52). We cannot read prod's
  compute size, so the projection is a range, not a point.

The measured slice rate, from `WORKLOG.md` lines 136 to 151 (2026-07-19, the three-commentary dev
slice, tagged there as the input that "sizes the prod run ... feeds D2"):

- **121 to 190 s per 10,000 rows.** 121 is the warm rate (WORKLOG line 144, gill excluded), 190 is
  the cold/first-run rate (WORKLOG line 145: gill ran first, 190 s/10k, attributed to Neon compute
  cold-start/autoscale, not size). Honest planning band = 121 to 190 s/10k (WORKLOG line 147).
- **What the rate covers, exactly:** the `INSERT INTO section_embeddings` vector copy, 1024-dim,
  table to table, "every run spent >90% of its wall-clock in that one statement, observed live in
  `pg_stat_activity`" (WORKLOG lines 150 to 151). This is the slice operation and nothing else. It
  maps onto **E4 only**. It does NOT describe a metadata UPDATE (E2) or a DELETE (E3).
- Measured on DEV compute; prod compute is not assumed equal (WORKLOG lines 148 to 149).

**No fresher dev timing exists.** The two 2026-07-24 WORKLOG entries are the dependency-CVE bump and
the B2 coverage floor (WORKLOG lines 3 to 43), neither a slice run. `/tmp/overnight-e-v4.log` is the
held-out eval, not slice timings. So the 2026-07-19 rate is the freshest and is used here.

## Per-step estimate

Operation types are read from `CUTOVER_DESIGN.md` "Steps" (lines 71 to 86). The point of this table
is that only ONE of these four steps is the slice the rate measured; the other three are bulk
metadata operations that are orders of magnitude cheaper, and mapping the slice rate onto them would
inflate the number meaninglessly.

| Step | Operation (from CUTOVER_DESIGN) | Rows (census-derived) | Basis for the estimate | Low | High |
|---|---|---|---|---|---|
| **E1** (precondition, flagged separately) | migrations 016 to 030; 018 rebuilds partial HNSW indexes + 019 rebuilds FTS legal, all `CONCURRENTLY`; assert each `indisvalid=t` | legal HNSW over about **84k** of 190,635 (the ~44% legal predicate; `db/migrations/012` header, `PHASE_A_DIAGNOSIS.md:121`, prod-measured 2026-07-14); FTS GIN over the same ~84k to 119k | from-principles HNSW + GIN build under `CONCURRENTLY` (single-threaded, ~2 to 3x a plain build). **No measured timing exists in the repo.** Other 016 to 030 statements are small DDL/ALTER, seconds each; the work-keyed partial indexes (018 song/sermon/theology) build over ~0 rows on prod because no work keys exist yet | 8 min | 20 min |
| **E2** register-label the flat embeddings | bulk **UPDATE** of `metadata` (set the `work` key), NOT a re-embed | up to **190,635** (the subset that resolves to a register work is what is actually rewritten) | bulk indexed UPDATE / heap rewrite + WAL. Far below the slice rate: no vector copy. On prod the labeled rows are commentaries that stay `source_type='commentary'`, so no partial-index membership churn | 1 min | 5 min |
| **E3** forbidden-provenance cleanup | backup-before-delete, then **DELETE** | **71,884** (15,707 biblehub + 56,177 hcf) | bulk DELETE + index cleanup (seconds to ~2 min) plus dumping ~71,884 vector rows (~280 MB) off the branch for the backup. Seconds-to-minutes, not the slice rate. Forbidden rows were never in the legal HNSW (excluded by predicate), so the delete does not touch it | 2 min | 5 min |
| **E4** slice works into sections | **`INSERT INTO section_embeddings` reusing vectors 1:1** | about **113,000** = 190,635 total minus 71,884 forbidden (removed by E3) minus ~5,510 Barnes (already sectioned) | **THE measured 121 to 190 s/10k rate applies directly here.** 11.3 units x 121 = ~23 min; 11.3 units x 190 = ~36 min. Upper bound if Barnes is re-sliced / more rows resolve (~119k): ~38 min | 23 min | 38 min |
| **E2 to E4 total (headline)** | | | | **~26 min** | **~48 min** |
| **E1 to E4 total (full unattended window)** | | | | **~34 min** | **~68 min** |

Headline E2 to E4 rounds to **25 to 50 minutes**; the whole E1 to E4 window rounds to **35 to 70
minutes**. Dominant step inside E2 to E4 is **E4**. The dominant single line item across the whole
window is **E1's legal HNSW rebuild**, which is also the least certain (see caveats 1 and 5).

### E4 row-count arithmetic (shown so the owner can check it)

E4 slices the post-E3 legal survivors, reusing their existing 1024-dim vectors 1:1
(`CUTOVER_DESIGN.md:83`). Post-E3 legal pool = 190,635 minus 71,884 forbidden = 118,751. Barnes
(~5,510) is already sectioned (census line 19), so E4 slices about 118,751 minus 5,510 = **113,241
rows**. The census does not enumerate per-work legal flat counts beyond Gill (28,843), so this is
the aggregate derivation, not a per-work sum. That is why E4's high uses the full 118,751 as an
upper bound.

## Caveats (stated, not folded in silently)

1. **Prod compute size is unknown.** The census `SHOW` returned "unavailable" for `compute_size`,
   `max_connections`, `shared_buffers`, `work_mem` (census lines 47 to 52). The 121 to 190 s/10k
   rate is a DEV measurement (WORKLOG line 148). If prod's compute is smaller, every step scales up;
   if it is larger or autoscales higher, faster. This is the widest driver of the range.
2. **Prod is the live-serving branch.** E2 to E4 run against the same branch that serves `/ask` and
   the reader. Contention for shared buffers, connection slots, and autovacuum pressure can slow
   bulk UPDATE/DELETE and index builds in ways the quiet dev branch never showed. The regression
   gate after every chunk (`CUTOVER_DESIGN.md` lines 89 to 93) adds a few `/ask` + reader probes to
   each step's wall-clock, small but real.
3. **Neon cold-start / autoscale tax on the first touch.** The gill outlier (190 s/10k, ran first)
   is attributed to compute cold-start/autoscale, not data size (WORKLOG lines 145 to 146). The
   first heavy operation of the window pays this tax, which is why the high bound uses 190, not 121.
4. **Network egress.** The slice and label steps run table-to-table server-side, so network matters
   little there. E3's backup-before-delete dumps ~71,884 vector rows (~280 MB) off the branch, and
   any per-chunk client round-trips add wall-clock. Budgeted into E3's high bound.
5. **HNSW rebuild cost at E1 could be the real bottleneck.** Migration 018 rebuilds
   `idx_embeddings_vector_legal` (and the FTS legal partial in 019) `CONCURRENTLY` over about 84k
   1024-dim vectors (`db/migrations/018`, `db/migrations/012` header ~44% legal predicate,
   `PHASE_A_DIAGNOSIS.md:121`). `CONCURRENTLY` disables the parallel build and does two heap scans,
   so it is 2 to 3x a plain build, and the repo has NO measured timing for it. If prod compute is
   small this single statement can rival or exceed all of E2 to E4 combined. It is a separate line
   item and a flagged wildcard, not part of the E2 to E4 headline.
6. **E4 row scope is an aggregate, not an enumeration.** The census gives 190,635 flat, 71,884
   forbidden, 5,510 Barnes, and Gill 28,843, but no per-work legal flat counts, so E4's ~113k is
   derived (total minus forbidden minus Barnes). A per-work count would firm it.

## What would tighten this estimate

- **Rehearse on a census clone.** Branch prod in Neon at the same compute class, run E1 through E4
  end to end, read the wall-clock. This is the only way to remove the dev-vs-prod compute
  uncertainty (caveat 1) and to time the E1 HNSW rebuild directly (caveat 5). It gives the real
  prod-class number instead of a dev-rate projection.
- **Read prod's actual compute size.** The owner can pull `compute_size` / autoscale bounds from the
  Neon console or API (the census `SHOW` path could not). That collapses the single widest caveat.
- **Time one `CREATE INDEX CONCURRENTLY` of the legal HNSW on a prod-class clone.** Directly measures
  the E1 wildcard and either promotes or retires it as the bottleneck.
- **Add per-work flat counts to the census** (a one-line query). Firms E4's ~113k row scope into an
  exact number.

## Citations

- `docs/evidence/census/prod-census-2026-07-23.txt` lines 6, 12 to 19, 25, 27 to 35, 47 to 52.
- `docs/CUTOVER_DESIGN.md` §Census lines 42 to 55; Steps lines 71 to 86; regression gates 89 to 93.
- `WORKLOG.md` 2026-07-19 slice measurement lines 136 to 151 (rate, what it covers, dev-only);
  2026-07-24 entries lines 3 to 43 (no fresher slice run).
- `db/migrations/012_partial_legal_hnsw.sql` header (~44% legal predicate, prod-measured 2026-07-14).
- `db/migrations/018_register_partial_indexes.sql` (zero-window `CONCURRENTLY` HNSW rebuilds).
- `docs/PHASE_A_DIAGNOSIS.md:121` (~84k legal vectors, prod).
