# OWNER RETURN PACKET — autonomous swarm closeout (2026-08-22/23)

**Status: LIVING DRAFT — finalized at Wave 8.** Every row cites its evidence file; every
command was dry-run on dev and has a stated inverse. Nothing here requires trusting prose.
The swarm touched no production resource; everything prod-bound is in this packet.

## A. Decisions only the owner can make

| # | Item | What is ready | Evidence |
|---|---|---|---|
| A1 | **ADR-118 proper-noun gate is OPEN (launch-blocker).** Two independent runs measured HIT@2 17/20 vs the 18/20 bar (W-PN20 and W-ADRV4RERUN, same three misses). Labels re-coded: no mis-scored cases; all three misses retrieval-side; `e033023` exonerated. Measured contributor: **ef=64 base-pool starvation** (5/20 and 8/20 rows vs correct fill at ef=1000). Per ADR-118 the bar is NOT renegotiated; remedies are re-run with more cases or an explicit owner amendment. The ef lever is flagged, not pulled (retrieval change = your ruling or a pre-registered slice) | full per-case tables, label re-code, pool-starvation probe logs | `docs/evidence/swarm-2026-08-22/w-pn20/` (RESULT.md, LABEL-RECODE.md, recode-probe logs); `docs/evidence/swarm-2026-08-22/w-adrv4rerun/RESULT.md` |
| A2 | **W-SEC-CCEL remedy.** The false ` (CCEL)` citation suffix: four divergent fixes preserved on pushed branches — host-from-`provenance->>'url'` (`f98494a`), edition (`cba1bcc`), host+export plumbing (`13e676d`), or DELETE the tag (argues GO_LIVE A5 forbids host attribution; `bad9875`). One of the two premises is wrong and it is a policy call | four candidate implementations, adjudication table | `docs/pm/swarm-2026-08-22/ADJUDICATION.md` |
| A3 | **Thayer's stale flat rows (banked call, recommendation: delete).** Dev execution stages the evidence (W-THAYER); the prod replay is yours to run or decline | prod replay script + dry-run log (W-THAYER, in flight) | `docs/evidence/swarm-2026-08-22/w-thayer/` (pending) |
| A4 | **W-EUSEBIUS Phase 4 (npnf201/202/203 dev→prod).** Five steps prepared by the workstream: (1) corpus-copy — reconcile first, prod's 202/203 already serve as fathers; (2) `backfill-history-embeddings --apply`; (3) `serve-batched --table=history_embeddings` with the three slugs added; (4) publish-flip `--status-only` (npnf201 staged→published = your per-occasion gate); (5) frozen-v1 on prod + re-census. Safe stop anytime before step 3. NOTE: merge `swarm/w-eusebius-npnf201` BEFORE re-ingesting anything in this arc or the genre datum is lost | step sheet + digest + eval log | `docs/pm/swarm-2026-08-22/items/w-eusebius.md`; `docs/evidence/ingest-runs/digest-2026-08-22T17-43-30-752Z.*` |
| A5 | **`foxe-martyrs`** — the entire historians remainder. No ThML edition exists at any CCEL id (live re-probe 2026-08-23: HTML at the only id). Options: a new ThML-bearing id/edition, or an owner-authorized HTML adapter. Never an invented choice | candidate row + probe log | `docs/evidence/swarm-2026-08-22/w-histbacklog/foxe-ccel-probe.txt` |
| A6 | **W-SIXWORKS scope.** The 08-15 "six never-staged works" do not resolve to manifest slugs (no `luther-church`; `brooks`→`jowett-brooks`; manton×9, bunyan×5, pascal×3, ignatius×2). Enumeration table + quota estimate + recommended minimal interpretation being prepared (W-SIXWORKS, not started) | mapping table (pending) | `docs/pm/swarm-2026-08-22/items/w-sixworks.md` (pending) |
| A7 | **SEC-1 / public launch.** The gate decision is yours (owner decision #6). W-SEC1 reports the current dependency truth (better-auth transitive state post-`dc87099`) | memo (W-SEC1, not started) | `docs/SECURITY.md` SEC-1; `docs/DECISIONS.md` ADR-109 |
| A8 | **D3 blob-store write credential.** Public corpus CDN store created, deliberately not connected (connecting can overwrite Lane B's `BLOB_READ_WRITE_TOKEN`). Your move: dashboard token, or connect with a non-default env prefix. A1–A4 built, merged, audited; dry run plans 24,992 uploads / 0 deletes | dry-run plan | MASTER.md D3; `MASTER_HISTORY.md §lane-d` |
| A9 | **Historians out-of-scope entity population.** 50 of 81 served anchored entities live only in staged historian works (the F4 signal). Publish-or-unserve vs accept drift — your call | finding + regenerable script | `docs/evidence/swarm-2026-08-22/W-HISTSCOPE/FINDING-historians-lane.md` |
| A10 | Ruled holds, unchanged, no action item (do not re-raise): **O-1 rotation (January)**; repo public / GitHub Pro (after rotation); E3 forbidden-provenance deletion (71,884 rows); `chesterton-aquinas` (ADR-112); S1 copy; T4 schema ruling; historian-lane retirement; §10 un-scope; interlinear highlighting; Journeys/Rules/Lectio/memory (gated); T3 device leg (hardware); fourth deferred security finding (history-limiter daily ceiling — unscheduled, carried so it is not lost) | — | `docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` §1.3; `docs/SECURITY.md` SEC-5 |

## B. Prod-bound artifacts prepared by the swarm (each: dry-run on dev + inverse)

| # | Item | Command / artifact | Rollback | Evidence |
|---|---|---|---|---|
| B1 | Migration 127 — drop `idx_embeddings_vector` (~8 GB prod). AUTHORED, NOT APPLIED anywhere (R1 measured the index PRESENT on dev; header corrected). Order: deploy the related-voices bundle first, confirm the panel, then drop | `db/migrations/127_drop_full_table_vector_index.sql` via `db/apply-migration-concurrent.mjs` (owner, per occasion) | `CREATE INDEX CONCURRENTLY idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);` (hours at size) | `swarm/W-RELVOICE-related-voices-source-type` @ 71ef715; EXPLAIN pair `docs/evidence/swarm-2026-08-22/W-RELVOICE/` |
| B2 | Thayer's prod replay (re-chunk + stale-row reconcile) | per A3 | slug-scoped; vectors regenerable | (pending W-THAYER) |
| B3 | Eusebius Phase 4 | per A4 | safe stop before serve; slug-scoped deletion | per A4 |
| B4 | Migration 128 — `asserted_ownership_at` (W-OWNERSHIPCOL, not started) | (pending) | drop column | (pending) |
| B5 | W-ANCHORBACKFILL prod run (pre-detection My Works anchors) | (pending; dev run first) | re-run with detection is idempotent | (pending) |
| B6 | W-REGDURABLE prod register flips (sermon/theology durability) | (pending) | batched idempotent tool, dry-run default | (pending) |

## C. Merge-then-deploy surface (Wave 8 output)

The integration branch `swarm/closeout-2026-08-22` assembles all VERIFIED workstreams (merge
order and conflict rules: closeout order §10). Deploy is YOURS — `deploy.sh` from a clean
tree, per AGENTS.md. Items carrying migration-dependent code are flagged in their item files
(migration-before-code ordering, the 2026-08-22 lesson).

## D. Honest NOT RUN / UNVERIFIED ledger (final version at Wave 8)

- W-DRAIN, W-HISTSCOPE, W-VEC429, W-SEC-CSRF, W-ADRV4RERUN, W-EUSEBIUS, W-HISTBACKLOG,
  W-DOCRESTATE, W-SEC-CURSOR, W-L2TOGGLE, W-UX2VERIFY, W-FILE3DOCS: work complete,
  author-audit green (modulo the pre-existing thayers baseline red W-BASEFIX owns) — but
  **Wave 7 independent verification is what makes any of it "done"** (§2.3). This column is
  only meaningful after Wave 7.
- Bait empty-rate observation (W-ADRV4RERUN): 25/100 empty on dev vs 0/100 in the 2026-08-15
  prod run — safe outcomes, reliability observation, unexplained. Flagged, not chased.
- The `bad9875` branch merges nothing; retained on origin as the W-SEC-CCEL deletion candidate.
- `scripts/ci-fetch-bible-kjv.mjs` staged deletion in the primary tree belongs to a prior
  session (superseded by `ci-fetch-bible-assets.mjs`); left exactly as staged for you.
