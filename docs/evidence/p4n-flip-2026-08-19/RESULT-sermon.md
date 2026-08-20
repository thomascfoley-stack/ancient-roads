# P4.n Phase B — sermon result (95 works). Lane isolation CONFIRMED.

95/95 published, **146,205/146,205 served**, verified independently. Corpus served
608,596 → **754,801** (+146,205 exactly). Production: **363 published** / 445 staged / 3 quarantined.

## The eval moved one query out of 110

Measured against `postcommentary-v3-2026-08-19T12-55-00Z.log`, the run this must be compared to —
not the pre-flip baseline, or sermon's effect and commentary's become inseparable.

| category | post-commentary | post-sermon |
|---|---|---|
| verse-ref | 100 / 100 | 100 / 100 |
| pericope | 73 / 100 | 73 / 100 |
| epistle | 48 / 88 | 48 / 88 |
| topical | 35 / 70 | 35 / 70 |
| proper-noun | 90 / 90 | 90 / 90 |
| control | clean 10/10, 0 hijacks | clean 10/10, 0 hijacks |

**Every headline figure is identical.** The per-query diff — possible for the first time, because both
captures are complete — finds exactly one change across 110 comparable queries:

```
v3-tp-07   HIT@1 n->n   voices 0 -> 1   wrong-passage -> <2-voices
```

Marginally better (it finds a voice where it previously found the wrong passage) and still a
failure, since the floor is two voices. One query moving between failure categories does not shift
a percentage at n=20.

**The prediction was "sermon moves nothing", and it moved one.** Near-right is not right, and the
distinction is worth keeping: `SERMON_CORPUS_FILTER` puts sermon in a labelled lane outside
`EXEGETICAL_TYPE_SQL`, so the exegetical pool is unchanged at 143 works / 316,861 rows — yet a
topical query still saw a difference. Lane isolation holds for the headline metrics; it is not
absolute at the level of individual retrievals.

## Licensing

`served-veto-audit.mts` against production after the flip: 811 works scanned, 25 name-matched
candidates, **0 serving against a ruling**, exit 0.

## How it was served, and what that cost

The first three attempts at sermon as ONE transaction all died with **nothing written** (146,205
rows/~120 min; 39,974/~16 min; a 414-row probe at the consent prompt). Root cause measured, after
eliminating locks, bloat, triggers, chunk size, duration and compute restarts: `served` appears in
**six index definitions** on `embeddings`, so a HOT update is impossible, and each row is 4,100
bytes (one per 8 kB page) so a second version never fits — every row is therefore re-inserted into
all 14 indexes, 13 GB, including an 8 GB HNSW graph.

Served via `--status-only` + `serve-batched.mjs` (500-row committed batches). It **also** lost its
connection, at 77.9% — and cost one batch instead of everything. The re-run's preflight reported
`32,291 rows to serve`, which is the resumption working, stated before any write.

**Rate is wildly variable and mostly bad:** 1.07 rows/sec cold, 2.5 on resume, 6.3 climbing, 33 at
its best. Same statement, a thirtyfold spread. **Theology (245,236 rows) is 2 hours at 33/s and 11
hours at 6/s**, and nothing tonight predicts which. That decision should not be made on this
evidence; the drop-HNSW / bulk-rebuild alternative wants designing properly.

## Instrument note

The first per-query diff of this run compared the wrapper's stdout instead of its log file, found
**0 comparable queries, and printed "NOTHING changed"** — a vacuous pass from an empty set, in a
throwaway script, on precisely the defect this session spent hours fixing elsewhere. The corrected
version refuses to report a verdict below 100 comparable queries.
