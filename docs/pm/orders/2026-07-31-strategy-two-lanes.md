# ORDER — the two-lane strategy (reconstructed index)

> **Reconstructed 2026-08-22 from [`2026-07-31-search-programme.md`](2026-07-31-search-programme.md)
> §3b, [`../MASTER.md`](../MASTER.md) ("Where the work is" + Lane A/B gate boards),
> [`../../BUILD_MODEL.md`](../../BUILD_MODEL.md) §2, and the `WORKLOG.md` execution records of
> 2026-08-03 onward; this is a faithful index of what was executed, not a recovered original.**

## Status of the original

The two-lane strategy memo was owed by the owner as of 2026-07-31 and was never filed
(`2026-07-31-search-programme.md` §2 lists it among the three owed programme docs). Per bylaw 1
it was never issued. This reconstruction records the strategy **as it was actually executed**,
from the artifacts the execution left. Whatever else the original memo said is not recoverable.

## The strategy, as executed

**Two lanes, and two is the ceiling.** The filed statement of the strategy is §3b of the
search-programme order, issued the same day this memo was owed:

- **Lane A — the product pipeline.** Publish, deploy, walk it. Executed as `MASTER.md` gates
  A1–A9 (Stage 2 blocker closure and PR #48; prod read-only census; publish flips; Deploy A and
  Deploy B; the product walks; the register ingest slice; the `served` cutover).
- **Lane B — sermon search.** `docs/SERMON_SEARCH_DESIGN.md`; writes user tables on a Neon dev
  branch. Executed as `MASTER.md` gates B0–B5 and the Slice 1 uploader
  (`orders/2026-08-03-lane-b-slice1-uploader.md`).

**File-disjoint by construction** (BUILD_MODEL §2): Lane A's surface was `scripts/lib/*`,
`web/test/invariants/*`, `docs/STATE_OF_TRUTH.md`; Lane B's was
`docs/SERMON_SEARCH_DESIGN.md`, `docs/SLICE_1_DATA_MODEL.md`, the eval harness, and new tests.
The one recorded departure: `db/apply-migration*.mjs` are shared files both lanes touch without
modifying — noted in the WORKLOG 2026-08-03 Lane B entry, not a collision. Migration numbering
separated the lanes: Lane A held the 039–045 range, Lane B the 100-block.

**No third lane.** The binding constraint is the owner's review bandwidth — one reviewer who
reads every diff — not agent availability. Lanes run in parallel only while file-disjoint; the
orchestrator owns merge order and integrates serially.

**The rails did not change.** Both lanes ran under the standing rules: no production connection
without explicit owner go per occasion (bylaw 7), publish/prod stays a human gate, fixer ≠
verifier, red before green, least code.

## What this file does not do

It does not schedule new work, does not reopen lane scope, and does not claim to reproduce the
owner's original memo. Current lane state is the `MASTER.md` gate board; this file exists so
the index pointer resolves and the bylaw-1 record is complete.
