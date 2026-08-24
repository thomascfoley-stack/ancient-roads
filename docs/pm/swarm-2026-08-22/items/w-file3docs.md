# W-FILE3DOCS — File the three missing programme docs

**Workstream:** W-FILE3DOCS · **Branch:** `swarm/W-FILE3DOCS-programme-docs` · **Worktree:** `/tmp/swarm-W-FILE3DOCS` · **Base:** `origin/main` `9dce273`

## Status: AUDIT-GREEN* (pending Wave 7 verification)

*Green except the single pre-existing thayers-gate red leg owned by `swarm/w-basefix-thayers-guard` —
expected per the closeout briefing; proven pre-existing and not this branch's (see Audit below).

Transitions: CLAIMED 2026-08-23 → RED-PROVEN 2026-08-23 → FIXED 2026-08-23 → AUDIT-GREEN 2026-08-23.

## What was done

Filed the three docs the `MASTER.md` index carried as **NOT YET FILED**, each as a reconstruction
per the §10 brief (header: "Reconstructed 2026-08-22 from [sources]; this is a faithful index of
what was executed, not a recovered original"), index-and-pointer style, no invented rulings:

- `docs/pm/WORKORDER_V2.md` — the six-stage plan, indexed stage-by-stage from executed artifacts
  (Tranche 0 hardening; Stage 1 items 1.1–1.10; Stage 2 `unit_ordinal` instrument; Stage 3.1/3.2
  static-corpus gates; Stage 4 Book Reader deploy; Stage 5 twelve journeys). **Stage 6's content is
  not recoverable** — no file in the repo names it; the doc says so rather than inventing it.
- `docs/pm/PROGRAM_BRIEF.md` — honest placeholder: the original was never filed and its content is
  not recoverable; the doc points at where the programme's substance actually lives (CLAUDE.md,
  PRINCIPLES.md, MASTER.md, STATE_OF_TRUTH.md, DECISIONS.md, orders/).
- `docs/pm/orders/2026-07-31-strategy-two-lanes.md` — the two-lane strategy **as executed**
  (Lane A product pipeline / Lane B sermon search, file-disjoint, two-is-the-ceiling), sourced from
  `2026-07-31-search-programme.md` §3b, MASTER.md, BUILD_MODEL §2, and the WORKLOG execution record.

Also updated the three `MASTER.md` index rows from "NOT YET FILED" to "FILED 2026-08-22 as a
reconstruction" — the change makes those statements false otherwise (§2.9: fix the falsehood where a
reader meets it). Small, localized hunks in the Index section; noted here in case W-BOARDHYGIENE
also touches the board (Wave 8 conflict rule: merge the smaller first).

## Red / red-proof / green evidence (`docs/evidence/swarm-2026-08-22/w-file3docs/`)

- `red-absence.txt` — RED before the change: all three paths ABSENT at base `9dce273`.
- `redproof-seeded-absence.txt` — red-proof of the check itself: with `WORKORDER_V2.md` seeded away,
  the presence check reports ABSENT; restored, all three PRESENT.
- `green-presence.txt` — GREEN: all three present, each carries the exact reconstruction banner, and
  `MASTER.md` no longer contains "NOT YET FILED".
- Every path cited inside the three docs was verified to exist in the tree (checked 2026-08-23).

## Audit

`npm run audit` in the worktree (`docs/evidence/swarm-2026-08-22/w-file3docs/audit-final.log`):
**one red leg**, `tests + coverage — vitest`, on exactly the expected pre-existing failure —
`test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses at the same
gate` (1 failed / 847 passed). Root cause: the gate asserts
`docs/evidence/thayers-source-verification.md` is absent, and that file is **committed at base
`9dce273`** — the leg fails at base, independent of this branch. Proof it is not mine:
`not-mine-proof.txt` (branch diff is docs-only; the failing test file is byte-identical between
base and HEAD). Owned and verified by `swarm/w-basefix-thayers-guard` per the closeout briefing;
not fixed here, per instruction. All other audit legs green, including the deploy.sh gate harness
(59/59) and Gate B license (fail-closed, manifest-checked).

## Spend (A1)

**$0.00.** Docs-only workstream: no embeddings, no compose→verify runs, no provider calls of any kind.

## Not done / for the packet

- Stage 6 of work-order v2 remains unrecoverable; if the owner has the original memo, it should
  replace the reconstruction (the reconstruction says this on its face).
- The same holds for the original PROGRAM_BRIEF and two-lane memo if they exist anywhere off-repo.
