# W-THAYER — verification record (dev, 2026-08-23)

Order: docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md §6 W-THAYER. All DB work on
`ep-tiny-hat` (dev) only. No prod connection of any kind was made.

## §5.2 preconditions (confirmed FIRST, before any write)

- Relabel landed: `SELECT metadata->>'register', count(*) FROM embeddings WHERE user_id IS NULL
  AND source_type='lexicon' GROUP BY 1` → exactly one group, `lexicon` n=83,270 — **0
  register='prose' rows** among the 16 lexicon works (matches the WORKLOG 2026-08-22 re-verify).
- Section-vector unification job NOT running: no node unify/relabel/backfill processes on the
  host (`ps`), 0 active queries touching `section_embeddings` in `pg_stat_activity`. Not
  written over — confirmed idle before the lane writes began.

## Step 2 — re-chunk oversized sections to D1(b) + re-embed

- Population: 484 sections of thayers-lexicon with `length(body) > 1800` (max 34,598 chars).
- Pre-write vintage probe (RED measurement): normal sections reproduced stored vectors at
  1.0000 from the BARE body (the 08-22 unification had already landed for thayers); oversized
  sections reproduced at 0.9994–0.9998 from the adaptively-shrunk bare body — same D1(b)
  convention, with the shrink cutoff depending on run path (#1508 at 0.9550 from an 882-char
  reconstruction vs the stored 1,227-char cut). The re-embed collapses the population to one
  provable convention.
- Dry-run: `rechunk-dev-dry-run-2026-08-23T17-53-39-174Z.log` (census 484, est ~217,800 tokens
  ≈ $0.0022). Fail-closed guard watched RED: `--expect=483` → STOP, exit 1
  (`rechunk-dev-dry-run-2026-08-23T17-53-45-368Z.log`).
- Apply: `rechunk-dev-apply-2026-08-23T17-53-53-070Z.log` — **484/484 re-chunked (bare body,
  leading ≤1,800 chars) + re-embedded with BAAI/bge-large-en-v1.5, 0 failed, exit 0**;
  over-window inputs adaptively shrunk per the backfill's idiom (per-section cuts logged);
  coverage after 484/484. (The log's `~truncated` counter multi-counts bisect retries — same
  loose counter as the original backfill; the authoritative count is 484/484 embedded, 0 failed.)

## Step 3 — stale flat-row reconcile

- Stale class re-measured exactly as docs/evidence/thayers-source-verification.md: 7,570 flat
  rows = 4,705 bare-integer keys mapping to live sections + **2,865 chunked `NNN.MM` rows keying
  to no live section** (all 2,865 chunked-shape; every chunk's integer part DOES name a live
  section — dead-vintage chunks of live entries; 0 served on dev).
- Dry-run: `reconcile-stale-flat-dev-dry-run-2026-08-23T18-02-13-871Z.log`. Fail-closed guard
  watched RED: `--expect=2864` → STOP, exit 1
  (`reconcile-stale-flat-dev-dry-run-2026-08-23T18-02-15-244Z.log`).
- Apply: `reconcile-stale-flat-dev-apply-2026-08-23T18-02-22-828Z.log` — backed up 2,865 rows
  WITH VECTORS → `stale-flat-backup-dev-2026-08-23T18-02-22-828Z.jsonl`, then deleted in one
  txn, verified inside the txn: **2,865 deleted; 0 stale remain; 4,705 live-mapped rows
  untouched**. **This dev execution STAGES the evidence for the banked owner call
  (recommendation: delete) — it does not discharge it.**
- Post-state account: sections 5,507; flat keys 4,705, all mapping to live sections
  (flat_without_section=0); 802 sections have no flat row — the formerly multi-chunk entries,
  by design of the sections model (flat ⊂ sections, exact).

## Step 4 — the four checks

1. **section-vector-pairing suite** — `verify-section-vector-pairing-dev.txt`: PASS (1/1,
   37.6s), 98/129 published works probed, 0 vectorless, 31 unsampleable — identical coverage to
   the Wave-0 run. (thayers-lexicon is staged on dev, so the suite does not sample it; the
   thayers-specific probe below covers it.)
2. **parity invariant** — served-reconcile (publish-means-serve) on dev:
   `verify-served-reconcile-dev.txt`: exit 1 with 5 violations, ALL pre-existing dev
   divergences on the five OTHER published lexicon works (eastons/naves/bdb/isbe/smiths —
   published on dev per the Wave-0 census with 0 served flat rows; the /word-shelf serve flip
   was prod-side). My write sets provably exclude them (I wrote only thayers section_embeddings
   upserts + thayers flat-row deletes; no `sources.status`, no `served` flags, no other slug).
   **thayers-lexicon itself is clean: staged, 0 served, appears in no violation.** Filed, not
   fixed — outside this item's scope.
3. **greekHeading/strongsKeyed unchanged** — sections=5,507, greek_headings=5,507,
   strongs_keyed=5,507, section_embeddings=5,507 (1:1), oversized coverage 484/484 — identical
   to the pre-write census.
4. **stale-row count on dev = 0** — bucket re-run: total 4,705, bare_int_live 4,705,
   bare_int_dead 0, chunked 0, other_shape 0.

Thayers-specific pairing proof (the suite can't see a staged work):
`verify-thayers-pairing-probe-postwrite.txt` — the two >30K-char sections reproduce their NEW
stored vectors at exactly 1.0000 from body[0:1227] (the shrink cut the writer used); three
normal sections at 1.0000 from the full bare body; heading-prefixed reconstructions score
0.93–0.99 (old vintage gone). Discrimination control lives in the suite run above.

## Spend (A1)

- Rechunk apply: 484 embeddings, est ~218K tokens ≈ **$0.0022** at $0.01/M (DeepInfra
  bge-large-en-v1.5); cross-checked against the 1,948-embeds≈1.7¢ Eusebius rate: 484 ×
  (1.7¢/1,948) ≈ **$0.0042**. Verification probes: ~24 single embed calls ≈ negligible.
- **Total recorded spend: < $0.01** — far under the $25 workstream ceiling.
