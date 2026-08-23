# W-EUSEBIUS — Resume npnf201 ingest (DB-writer lane, position 1)

Branch: `swarm/w-eusebius-npnf201` (worktree `/tmp/swarm-eusebius`, base `9dce273`).
Scope: DEV ONLY (`ep-tiny-hat`). No prod touches. Phase 4 (prod) prepared as owner-packet note
below, never executed.

## Transitions

- CLAIMED 2026-08-22 (lane position 1; re-confirmed 2026-08-23 under amendment A5, single-agent
  cost probe).
- RED-PROVEN 2026-08-23 — scope widening: shipped-path RED before the change
  (`scope-red-prechange.txt`: npnf201 published + 588 history vectors served + 105 "Constantine"
  anchors, `searchHistory("tell me about Constantine")` → 0 results, entity not even in vocab);
  seed red-proofs `scope-seed-genre-clause-red.txt` (genre clause removed → invisible again) and
  `scope-seed-status-clause-red.txt` (status clause removed → staged works leak, suite 2/2 RED).
  Also watched RED: npnf203 annotate 513-token 400 (in `annotate-npnf201-202-203.log`).
- FIXED 2026-08-23 — all works staged + annotated, SCOPE widened with its behavioral test.
- AUDIT-GREEN — PARTIAL, honestly reported: audit red on ONE pre-existing baseline defect
  (see "Verification"); zero reds attributable to this branch. Orchestrator's call whether the
  Wave-7 verifier runs against this baseline.
- VERIFIED / MERGED — for the Wave 7 verifier / Wave 8 orchestrator.

## Resume point used

WORKLOG.md:2156 (2026-08-21, "ALL PHASES COMPLETE" entry): "Eusebius (npnf201): father ingest
died on a transient connection error, resumable; then the annotate pass + scope widening ships
npnf201/202/203 into the lane WITH its behavioral test." Design of record:
`docs/pm/orders/2026-08-20-historian-ingestion-plan.md` (Phase 0 scope note, Phase 3 annotate,
Phase 4 prod). The entry's mechanism matched the scripts exactly — no BLOCKED condition:
`adapter-loop.ts` resume (partial-detect → deleteWork-then-write), `adapter-ccel` for the source,
`annotate-history-existing.mts` for Phase 3, SCOPE clause in `history-search-db.ts` for the
widening, `history-scope-db.test.ts` as the behavioral test.

## Precondition re-check against live dev DB (2026-08-22, §5.1)

- `schaff-npnf201`: `status='ingesting'` (the crash marker), 1,472 flat rows, 0 sections →
  `ingestState='partial'`, resume-safe.
- `schaff-npnf202/203`: ABSENT from dev (the plan doc's 495/584-section reading was prod/lane-b).
  The annotate tool is additive-only over EXISTING sections, so the dev arc staged them first
  through the same existing `ccel` adapter — duplicating nothing on dev; prod's published rows
  untouched (Phase 4 reconcile is the owner's, packet below).
- No `genre` marker anywhere in dev `sources.provenance` → the genre-carriage fix (f6f1275)
  landed BEFORE any ingest, so staged rows carry the ruled datum.
- First resume attempt failed on `permission denied for table sources`: root `.env.local`'s
  DATABASE_URL is a non-owner role. The 08-21 session's own mechanism (`~/.neon_dev_owner_url`,
  the dev owner credential file every ingest script here uses, host verified `ep-tiny-hat`) was
  the working path. No state was written by the failed attempt (verified: counts unchanged).

## What landed on dev (all `status='staged'`, nothing served)

| work | sections | verse anchors | flat embeddings | section_embeddings | history anchors | history_embeddings (served) |
|---|---|---|---|---|---|---|
| schaff-npnf201 | 588 | 141 | 1,948 | 588 | 704 (48 entities) | 588 (0) |
| schaff-npnf202 | 495 | 64 | 1,870 | 495 | 1,302 (36) | 495 (0) |
| schaff-npnf203 | 584 | 127 | 1,403 | 584 | 816 (38) | 584 (0) |

- Parity invariant per work: sections == section_embeddings == history_embeddings exactly;
  section_anchors are the verse-anchored subset (the father-register shape — prod npnf202/203
  carry the same shape). All flat rows `register='prose'`, 0 served, 0 null vectors; the works
  are in no SERVED_* allowlist → the register wall holds (nothing leaks into /ask pools; history
  serving stays behind the owner gate: all history vectors `served=false`).
- Digests (the per-work gate): no flags on any work; anchors/section 1.20 / 2.63 / 1.40 vs
  josephus baseline 1.10; period-dated 0 (father headings carry no verbatim date forms — the
  honest zero, same as the dry-run plan). Gazetteer candidates listed for curation, none adopted.

## Code changes on the branch

1. `f6f1275` — manifest `genre` now rides into `sources.provenance.genre` at register ingest
   (register-writer + adapter-ccel). The ruled Phase-0 mechanism: data per work, never a slug
   list in code. Cost of not fixing: the widening has no datum to key on.
2. `6334963`, `a464575` — ingest digests/logs (npnf201; npnf202/203).
3. `6d56f7c` — annotate applied (counts above) + `embedBatchResilient`: npnf203's first run died
   on the Bede-class 513-token 400 and rolled back clean; the fallback applies the
   register-writer's own per-text adaptive-shortening rule to token-limit 400s. Re-run green.
4. (this commit) — scope widening: `history-search-db.ts` SCOPE admits
   `src.provenance->>'genre' = 'history'`; `history-scope-db.test.ts` restatements + per-result
   assertion widened to match (still literal SQL, deliberately not imported — the
   watchlist-fourteen guard stands); `backfill-history-embeddings.mjs` predicates widened so the
   Phase 4 backfill covers the genre works on prod (no-op on dev: gap 0).

§2.4 note: the widening changes NO live behavior — it admits zero current rows (the three genre
works are staged, `served=false`; every other work carries no genre datum). It is ruled plan
execution (the owner-ruled Phase 0 mechanism), not a retrieval tuning change, so no pre-reg gate
applies; the red/green + seed transcripts are the evidence.

## Verification

- Shipped-path red→green: `scope-red-prechange.txt` → `scope-green-postchange.txt` (Constantine
  resolves; npnf201 closest, 102 section hits; coverage 1→2 works).
- Seed red-proofs: `scope-seed-genre-clause-red.txt`, `scope-seed-status-clause-red.txt`.
- Behavioral suite steady-state green: `scope-suite-steady-green.txt` (2/2).
- Frozen-v1 history eval on dev after the arc: **20/20, ALL PRE-REGISTERED BARS HOLD**
  (`docs/evidence/history-eval/postnpnf-dev-2026-08-23T17-25-44-770Z.log`).
- Temporary dev flips used for the transcripts (npnf201 published + history served) REVERTED and
  verified: all three works staged, 0 served history vectors.
- `npm run audit` (worktree, 2026-08-23): 847/848 tests pass; the ONE red is
  `test/publish-flip-toolchain.test.ts:473` ("thayers evidence gate … no evidence file"),
  which asserts `docs/evidence/thayers-source-verification.md` does not exist. That file is
  TRACKED at origin/main since `abe5252` (parent of the Wave-0 base `9dce273`), and my branch
  changes none of the test's inputs (`git diff 9dce273..HEAD` over the test, the guard, and the
  evidence file is empty). **Pre-existing red at the recorded base, unrelated to this item** —
  filed per §12 (no opportunistic fix; it belongs to the thayers lane / orchestrator). Every
  audit leg attributable to this branch is green, including `history-scope-db` (2/2) inside the
  same run.

## Spend accounting (amendments A1 + A5 — the cost probe)

Embeddings API (DeepInfra `BAAI/bge-large-en-v1.5`), counted from run logs + DB:

- Flat-store ingests: 1,948 (npnf201) + 1,870 (npnf202) + 1,403 (npnf203) = **5,221 embeds**.
- Annotate section embeds: 588 + 495 + 584 = **1,667 embeds**, plus **432** spent on npnf203's
  rolled-back first attempt (API work done, rows rolled back).
- history_embeddings: **0 API calls** (vector reuse, INSERT..SELECT).
- Query embeds (frozen-v1 20 + suite/probe runs ~10): **~30**.
- **Total ≈ 7,350 embedded texts.** At the recovery order's accounting (1,948 embeds ≈ 1.7¢ →
  ≈0.00087¢/embed): **≈ 6.4¢ total**. Token read (estimate): flat chunks ≤1,200 chars,
  windows ≤1,500 chars ⇒ ≈2.6–2.8M tokens embedded.
- LLM calls: **0** (no LLM anywhere in this pipeline).
- Wall-clock: npnf201 ingest 5.6 min; npnf202/203 10.6 min; annotate 4.5 min + 1.6 min retry;
  suite/eval/probes ~2 min; audit (see below). DB-write total ≈ 25 min.
- Agent token spend (best read, low confidence): one long session ≈ 150–200K tokens context
  throughput, dominated by WORKLOG/order reads and tool transcripts; no sub-agents spawned.

## Phase 4 owner-packet note (FORBIDDEN under §1.1 — prepared, never executed)

Per `2026-08-20-historian-ingestion-plan.md` Phase 4, against the dev state above:

1. `corpus-copy` dev→prod for the three works. NOTE: prod npnf202/203 already serve as fathers
   (2026-08-03 ingest); dev's copies are fresh staged ingests of the same CCEL editions —
   reconcile before copying (npnf201-only copy + annotate artifacts for 202/203, or a verified
   overwrite). Dev parity table above is the comparison baseline. corpus-copy's COPIED_TABLES
   does NOT include `history_embeddings` — hence step 2.
2. `backfill-history-embeddings --apply` (prod) — predicates widened on this branch so the genre
   works are covered; dry-run on dev shows gap 0 (rows already present via annotate).
3. `serve-batched --table=history_embeddings` with the serve list grown by the three slugs.
4. publish-flip `--status-only` for shelf visibility; npnf201's staged→published flip is the
   owner's gate, per occasion. (202/203 are already published on prod.)
5. frozen-v1 on prod + coverage re-census.
Rollback: nothing serves before step 3 — the safe stop is before serve-batched; copied rows are
slug-scoped deletable via the corpus tooling.

## Files / evidence

`docs/evidence/swarm-2026-08-22/w-eusebius/` (probe + seed + suite transcripts, ingest/annotate
logs, digests), `docs/evidence/ingest-runs/digest-2026-08-2*`, `docs/evidence/history-eval/
postnpnf-dev-*.log`.
