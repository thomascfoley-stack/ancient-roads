# W-EUSEBIUS — Resume npnf201 ingest (DB-writer lane, position 1)

Status: IN PROGRESS
Branch: `swarm/w-eusebius-npnf201` (worktree `/tmp/swarm-eusebius`, base `9dce273`)
Scope: DEV ONLY (`ep-tiny-hat`). No prod anything. Phase 4 → owner packet (below), never executed.

## Transitions

- CLAIMED 2026-08-22 — lane position 1.
- RED-PROVEN — n/a for the resume itself (a crashed ingest, not a code defect); the scope-widening
  code change carries its own red/green transcripts (see below).
- (further transitions appended as they happen)

## Resume point used

WORKLOG.md:2156 (2026-08-21, "ALL PHASES COMPLETE" entry): "Eusebius (npnf201): father ingest
died on a transient connection error, resumable; then the annotate pass + scope widening ships
npnf201/202/203 into the lane WITH its behavioral test." Design of record:
`docs/pm/orders/2026-08-20-historian-ingestion-plan.md` (Phase 0 scope note, Phase 3 annotate,
Phase 4 prod).

## Precondition re-check against live dev DB (2026-08-22, per §5.1)

- `schaff-npnf201`: sources row `status='ingesting'` (the crash marker), 1,472 flat embeddings,
  0 sections → `adapter-loop` `ingestState` = `partial`, resume-safe (deleteWork-then-write).
- `schaff-npnf202/203`: ABSENT from dev entirely (no sources/sections/flat rows). The plan doc's
  "495/584 sections serving" reading was prod (+lane-b). The annotate tool is additive-only over
  EXISTING sections, so the dev-side arc requires their ordinary father ingest first — the same
  existing `ccel` adapter, landing `staged`, duplicating nothing on dev. Prod's published rows are
  untouched; Phase 4 reconcile is the owner's (packet note below).
- `history_embeddings` on dev: 44,575 served (the 08-21 historians, matching the WORKLOG census).
- No `genre` marker anywhere in dev `sources.provenance` (0 rows) — hence the genre-carriage fix
  (commit f6f1275) BEFORE any ingest, so staged rows carry the ruled datum.

## Phase 4 owner-packet note (FORBIDDEN under order §1.1 — prepared, never executed)

Per `2026-08-20-historian-ingestion-plan.md` Phase 4, with the dev state this item produced:

1. `corpus-copy` for `schaff-npnf201/202/203` dev→prod (carries sources/sections/section_anchors/
   section_embeddings/section_history_anchors/embeddings — verified in `scripts/corpus-copy.mjs`
   COPIED_TABLES). NOTE for the owner: prod npnf202/203 already serve as fathers (495/584 sections
   from the 2026-08-03 ingest); dev's copies are FRESH staged ingests of the same CCEL editions.
   Reconcile before copying — copying may need to be npnf201-only plus the annotate artifacts
   (section_embeddings/history rows) for 202/203, or a verified overwrite. Dev digests + parity
   numbers are the comparison baseline (evidence dir below).
2. `backfill-history-embeddings --apply` (prod) for the three works.
3. `serve-batched --table=history_embeddings` with the serve list grown by the three slugs.
4. publish-flip `--status-only` for shelf visibility; npnf201's `sources.status` flip staged→published
   is the owner's gate, per occasion.
5. frozen-v1 on prod + coverage re-census.
Rollback: staged/prod copies are deletable per slug via the corpus tooling; nothing serves until
step 3/4, so the safe stop is before serve-batched.

## Evidence

`docs/evidence/swarm-2026-08-22/w-eusebius/` (on the branch).
