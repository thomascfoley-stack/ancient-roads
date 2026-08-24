# W-THAYER — Thayer's follow-on chain (DB-writer lane, position 3)

Status: FIXED → AUDIT-GREEN (verification of the four checks done; independent Wave-7 verifier owed)
Branch: `swarm/w-thayer-lexicon-repairs` (worktree `/tmp/swarm-thayer`, base `9dce273` = origin/main)
Scope: DEV ONLY (`ep-tiny-hat`). No prod anything. Prod replay → owner packet (below), never executed.

## Transitions

- CLAIMED 2026-08-23 — lane position 3, after W-EUSEBIUS and W-HISTBACKLOG completed.
- RED-PROVEN 2026-08-23 — RED measurements before any write: (a) the filed defect re-measured
  (484 oversized sections up to 34,598 chars; 2,865 stale chunked-key flat rows of 7,570 —
  exactly the evidence doc's class); (b) vintage probe showing the oversized population's
  vectors reproducible only through run-path-dependent shrink cuts (#1508: 0.9550 at the wrong
  cut); (c) both scripts' fail-closed `--expect` guards watched trip (exit 1) on a wrong count.
- FIXED 2026-08-23 — dev execution complete: 484/484 oversized sections re-chunked to D1(b)
  (bare body, leading ≤1,800 chars) + re-embedded (0 failed); 2,865 stale flat rows backed up
  with vectors and removed (txn-verified, 4,705 live-mapped rows untouched).
- AUDIT-GREEN — `npm run audit` in the worktree: green EXCEPT the known baseline red
  (`test/publish-flip-toolchain.test.ts` thayers evidence gate), which is W-BASEFIX's item
  (BASELINE.md recorded it at origin/main before this lane ran) — noted, not fixed.
- VERIFIED / MERGED — owed to the Wave-7 independent verifier and Wave-8 orchestrator.

## §5.2 confirmation (ran FIRST, before any write)

- Relabel landed on dev: one group `register='lexicon'` n=83,270, **0 prose rows** among the 16
  lexicon works.
- Section-vector unification job **not running** (no host process; 0 active
  `section_embeddings` queries in `pg_stat_activity`) — not written over.

## What was done (dev)

1. **Re-chunk + re-embed** (`scripts/rechunk-thayers-sections.mjs --env=dev --apply`): the 484
   sections with `length(body) > 1800` re-embedded from the D1(b) chunk — bare body, leading
   ≤1,800 chars, adaptive over-window shrink, BAAI/bge-large-en-v1.5 — via the embed path
   mirrored from `scripts/backfill-section-embeddings.mjs`. 484/484, 0 failed. Note: the 08-22
   unification had already landed for thayers (normal sections reproduced at 1.0000 bare-body
   pre-write), so this was a convergent rewrite that makes the oversized population provably
   one convention — and produces the replayable script + run log for prod.
2. **Stale flat-row reconcile** (`scripts/reconcile-thayers-stale-flat.mjs --env=dev --apply`):
   the 2,865 chunked `NNN.MM` rows (keying to no live section) backed up WITH VECTORS to
   evidence and deleted in one verified txn; 4,705 live-mapped rows untouched. **Banked owner
   call framing: this STAGES the evidence for the banked call (recommendation: delete); it
   does not discharge it.** On dev the rows were already unserved; the banked call's object is
   prod's 2,865 SERVED copies.

## The four checks (dev)

1. section-vector-pairing suite: **PASS** (98/129 probed, same coverage as Wave 0).
2. parity invariant (served-reconcile): thayers clean (staged, 0 served, no violation). The
   instrument is RED on dev for 5 **pre-existing** divergences on the OTHER published lexicon
   works (eastons/naves/bdb/isbe/smiths: published on dev, 0 served flat rows — dev never ran
   the prod serve flip). Provably untouched by my write sets; filed here, out of scope.
3. greekHeading/strongsKeyed: **5,507 / 5,507 unchanged** (sections 5,507,
   section_embeddings 5,507 1:1).
4. stale-row count on dev: **0** (was 2,865; flat now 4,705 ⊆ 5,507, zero orphans).

Full record: `docs/evidence/swarm-2026-08-22/w-thayer/VERIFICATION.md` (+ run logs, probe
transcripts, and the 36 MB stale-row backup JSONL in the same directory).

## Spend (A1)

484 embeddings ≈ $0.0022 (token estimate) ≈ $0.0042 (1,948≈1.7¢ rate cross-check); probes
negligible. **Total < $0.01**, ceiling $25. No other provider usage.

## Owner-packet note — prod replay for the W-THAYER repairs (banked call STILL OPEN)

**Banked owner call (WORKLOG 2026-08-22): "delete the 2,865 stale thayers flat rows…
recommendation: delete." This packet row does not discharge it — it is the owner's go, per
occasion.** Dev staged the evidence; prod's 2,865 stale rows are SERVED (dev's were not) but
reachable by no shipped query (type-fenced lanes).

| What is ready | Exact command to run (owner's terminal) | Rollback | Evidence |
|---|---|---|---|
| Prod re-chunk + re-embed of the 484 oversized sections to D1(b) — the same convergent write dev verified; prod's thayers section_embeddings were never unified (WORKLOG 08-22 inherited item (2) covers the six works; this script covers thayers' oversized population with the same convention) | `node scripts/rechunk-thayers-sections.mjs --env=prod --apply` (dry-run first: drop `--apply`; script asserts the prod endpoint itself and fails closed if the population ≠ 484) | Convergent: vectors regenerate from section text; re-run any prior vintage by re-embedding from the desired input. No rows added or removed. | dev dry-run + apply logs + pairing probe in `docs/evidence/swarm-2026-08-22/w-thayer/` |
| Prod delete of the 2,865 stale flat rows — **the banked call itself** | `node scripts/reconcile-thayers-stale-flat.mjs --env=prod --apply` (dry-run first: drop `--apply`; fails closed unless the population is exactly the measured class: 2,865, all chunked-shape, all chunking LIVE entries) | Re-insert from the backup JSONL the script writes before deleting (rows + vectors); the rows are also regenerable by re-copy from dev while... dev's copies are now deleted — the backup file is the restore path. | dev dry-run + apply logs, backup JSONL, post-state census (same evidence dir) |

Suggested order: re-chunk first (convergent, reversible-by-regeneration), then the delete
(the banked call). Neither touches `sources.status`, `served` flags, or any other slug.
Cost of not doing it: prod keeps serving 2,865 dead-weight vectors (unreachable today, but
they would surface in any future type-unfenced lexicon lane) and its oversized Thayer's
sections keep run-path-dependent shrink cuts.

## Notes for the verifier

- The two scripts are new, slug-scoped, dry-run-default, endpoint-asserting; their
  red-proofs are the watched `--expect` guard trips (logs in evidence).
- The audit's single red (`publish-flip-toolchain` thayers evidence gate) predates this branch
  at origin/main (see BASELINE.md) and belongs to W-BASEFIX — do not read it as this item's.
- `docs/evidence/thayers-source-verification.md`'s "stale flat-embedding rows remain" paragraph
  describes prod + pre-reconcile dev; dev's side is now reconciled (this item), prod's is the
  packet row above. Left as-is: it is a point-in-time verification record, and the prod claim
  remains true until the owner runs the replay.
