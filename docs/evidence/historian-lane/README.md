# Historian retrieval lane — corpus-backlog decision 6 (RULED "build it", 2026-08-13)

What exists now that did not this morning:

- **`SERVED_HISTORIAN_WORKS = ['josephus-whiston']`** in `web/src/lib/teacher/routing.ts`,
  wired into `SERVED_WORK_LISTS` (so `ALL_SERVED_WORKS`, the publish-admission invariant
  test, the census, and the adjudicator all pick it up by derivation — verified:
  `publish-admission-covers-served-lists.test.ts` derives five lists and passes).
- **`HISTORIAN_CORPUS_FILTER = (served AND source_type = 'historian')`** + the lane itself:
  `retrieveHistorianLane` (retrieve.ts) on the reusable `laneOnRangeSql`/`lanePoolSql`
  machinery, fired by `teach()` behind `lanes.historians` (default on), parsed by
  `/api/ask/stream`, payload key `historians`. Same shape as the sermon/theology lanes.
- **The FTS wall**: `EXEGETICAL_FTS_EXCLUSION` gained `historian` on the register leg and
  `SERVED_HISTORIAN_WORKS` as its own third slug leg. Historian is deliberately NOT in
  `SERVED_LANE_WORKS` — that union feeds `LEGAL_COMMENTARY_ENTRIES_PREDICATE`, whose
  byte-identity with `idx_commentary_fts_legal` is guarded, so joining it would have
  forced an FTS index rebuild over a table with zero historian rows. The vector-pool
  wall needs no list at all: `EXEGETICAL_TYPE_SQL` admits `commentary`/`father` only.
- **Migration 108** (`108_embeddings_source_type_historian.sql`, applied to dev): the
  `embeddings` CHECK had never allowed `source_type='historian'` (`sources` already did).
  The first embed run failed closed on it — see `embed-run-20260813T042502Z.log`.
- **Flat rows on dev**: `scripts/embed-historian-flat.mts` (new) chunks the 4,112 shelf
  sections with the register-writer's own `chunkWhole` (1200-char budget) and writes
  register-shaped flat rows. Result: **6,492 rows, 0 with served=true, 0 null vectors,
  all 4,112 sections covered, 493 chunks carrying verse anchors**, metadata identical in
  shape to sermon/theology rows (`register='prose'`, model `BAAI/bge-large-en-v1.5`,
  author Flavius Josephus, license Public Domain). `sources.status` untouched
  (`published`, as before). ~1.21M tokens, ~$0.012. See `embed-run-20260813T042733Z.log`.
- **Red-proof**: `scripts/redproof-historian-lane.mts` (new) — `redproof-2026-08-13T04-34-17-044Z.log`
  is the PASS. Using the SHIPPED `laneOnRangeSql` + `HISTORIAN_CORPUS_FILTER`: the lane
  returns 0 rows with all historian rows served=false; flipping ONE row to served=true
  inside a transaction makes exactly that row appear; the exegetical pool predicate over
  the same verse still contains zero historian rows while it is served; ROLLBACK and the
  lane is empty again. (The earlier `redproof-…04-33-39…` log is the same script with a
  mis-aimed wall assertion — it counted legitimate commentary rows on the verse as a
  breach; kept as the record of the correction.)

## What the owner serve-flip still needs (NOT done, by design)

1. **The flip itself** — `scripts/publish-flip.mjs` on `josephus-whiston`, dev then prod.
2. **Migration 108 on prod** (the constraint blocks historian flat rows there).
3. **A partial HNSW index** on exactly `HISTORIAN_CORPUS_FILTER`
   (`idx_embeddings_served_historian`) + a LOCKSTEP entry in
   `legal-hnsw-index-sync.test.ts`. Without it the lane pool query post-filters the
   full-table HNSW graph — correct but unindexed (the gap is recorded in routing.ts at
   the filter). The on-range lane path is already index-covered
   (`idx_embeddings_verseid_served`).
4. **Prod flat rows**: this backfill ran on dev only; prod needs the same
   `embed-historian-flat.mts --env=…` run (or a corpus-copy) before the flip there.
5. **The /ask UI**: ask-client.tsx still shows "History (coming soon)" disabled; making
   it a live toggle + rendering the `historians` payload is product surface work for
   flip time.
