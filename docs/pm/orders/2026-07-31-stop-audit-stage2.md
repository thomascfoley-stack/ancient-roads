OUTCOME: audit executed against `chore/work-order-v2-stage2` @ `ac19935`; verdict filed as `2026-07-31-stop-verdict-stage2.md`; 12/12 inventory items VERIFIED, 3 blockers raised (later 4 — see verdict addendum); gate A1 still OPEN at `d946c14`.

# Stage 2 STOP audit — prompt as issued

> Filed verbatim per bylaw 1. This is the prompt handed to the independent auditor (a fresh Claude
> Code session that wrote none of Stage 2). It is reproduced unmodified, including the two premises
> the auditor found to be false — the "untracked" status of `2.2-prod-unit-ordinal.log`, and the
> availability of dev credentials. Those errors are part of the record: the auditor's corrections to
> them are in the verdict, and a cleaned-up prompt would hide that the brief was wrong twice.

---

You are joining `ancient-roads` as the **independent auditor for the Stage 2 STOP**. The work order requires this: *"Independent audit is required at the Stage 1 and Stage 2 STOPs, by an agent that wrote none of it, which **re-executes** the red-proofs from committed evidence rather than reading them."* Stage 2 is closing and this audit is the gate. PR #48 does not merge until you report.

Read `AGENTS.md`, `CLAUDE.md`, `docs/THE_LOOP.md`, `docs/BUILD_MODEL.md`, then `docs/STATE_OF_TRUTH.md`.

Branch: `chore/work-order-v2-stage2` @ `ac19935`. Both CI jobs are currently green.

## HARD RAILS

- **No production connection of any kind.** Not `ep-odd-fog`, not a count.
- **No writes to any database.** Read-only queries against **dev** are permitted where a claim cannot be settled otherwise; say when you use one.
- **READ-ONLY on the tree.** No commits, branches, or PRs. Write to `/tmp` and hand back the path.
- **Do not touch the untracked `2.2-prod-unit-ordinal.log`.**
- Another agent holds the working tree. Work in an isolated copy; never write to theirs.
- **Re-execute. Do not read.** A committed log is not evidence that a check can fail. Seed, watch red, revert, verify the revert is clean.
- You wrote none of this. Say so, and do not defend it.
- No publish flip. No Neon branch create or delete. No merge.

## Verify state before reasoning about it

`git status`, `git log --oneline -20`, confirm the sha. If the tree is dirty or the branch has moved, say so before anything else.

---

## PART 1 — the red-proof inventory you were handed

The builder produced this list of what to check. **Treat it as input, not boundary.**

| Area | Evidence / test | Property |
|---|---|---|
| Tranche 0 | `docs/evidence/work-order-v2-tranche0/0.1-0.2-redproof.log` | prod path: no transpiler, no TS on the instrument path; seeds A/B/C actually fail |
| Tranche 1 | `docs/evidence/work-order-v2-tranche1/cohort-redproof.log` | unnamed / wrong cohort refused **before** DB connect |
| Tranche 2 | `docs/evidence/work-order-v2-tranche2/census-redproof.log` | publish-flip census fails closed |
| Tranche 4 | `docs/evidence/work-order-v2-tranche4/corpus-identity-redproof.log` | corpus gates refuse on real corpus |
| Tranche 5 | `docs/evidence/work-order-v2-tranche5/front-matter-redproof.log` | detector fires on admitted hits |
| Unit ordinal | `web/test/invariants/unit-ordinal-instrument.test.ts` | 024 perturbations RED on mis-order; uniform offset OK, non-uniform RED; published leg not vacuous |
| Prod guard | `web/test/invariants/seed-owner-url.test.ts` | `runtimeDbUrl` refuses `ep-odd-fog` |
| Gate legs | `web/test/invariants/gate-leg-inventory.test.ts` | silent leg → gate refuses |
| G10 | ADR-043 | honest skip — prod has 0 published works; **must not** be counted as discharged |

For each: **VERIFIED / FAILED / INCAPABLE OF FAILING**, with the command, the seed you applied, and the live output.

Two specific traps in that list:

- **Tranche 1's "refused before DB connect"** — confirm the refusal genuinely precedes the connection, not merely precedes the query. A guard that connects and then refuses has already opened the door.
- **The gate leg inventory is 30 lines**, for what the original deep-audit called *"the one structural finding under most of the others."* That is either elegant or thin. Seed a silent leg and find out. It is also the one place where writing a second hand-maintained list to fix a missing-list problem would be the **eighth** instance of this repo's recurring defect — check whether the expected set is derived from the gate's structure or typed out.

## PART 2 — what the inventory omits

### A — the repair, which is the largest action of the stage

On 2026-07-31 a repair rewrote **61,486 sections** across two non-production databases — `ep-tiny-hat` (dev) and `ep-tiny-bonus` (`ci-test-20260729`) — via `scripts/repair-unit-ordinal.mjs`, a slug-scoped re-apply of 024's backfill. Seven works: `chrysostom-homilies`, `edwards-works`, `hodge-systematic`, `maclaren-expositions`, `owen-works`, `tennyson-in-memoriam`, `watson-works`. Evidence: `docs/evidence/work-order-v2-stage2/UNIT_ORDINAL_REPAIR.md`.

This is the only irreversible action anyone took in Stage 2, and it is not on the list above.

The tool claims three guards — **dry-run by default**, **weld abort**, **production refused**. Verify each by seeding, not by reading:

1. **Weld abort.** Construct a case where recomputation would *reduce* the distinct unit count — two separated runs of an identical bare heading with the rows between them removed. The tool must abort and name the work. This is the guard that made the repair safe; **if it cannot fire, the repair was not guarded, it was lucky.**
2. **Production refusal.** Point it at a production-shaped host and confirm it refuses. Confirm the refusal keys on the resolved endpoint, not on a flag the caller passes.
3. **Dry-run default.** Confirm that invoking it without an explicit apply flag writes nothing, and seed the apply path to prove the difference is real rather than cosmetic.
4. **Scope.** Did the repair modify anything other than `unit_ordinal`? Establish this from the tool's SQL, not from its documentation.
5. **`tennyson-in-memoriam`** was repaired but was **not** among the six works that failed CI. Say why it was in scope, from the evidence. If the record does not say, that is the finding.

### B — the causal chain must be legible

`db-invariants` was **red** at `6896714` and is **green** at `ac19935`. It went green because **the measured data was repaired**, not because the code changed.

That is a legitimate route to green and the honest one. But someone reading those two runs side by side in three months must see it without reconstructing it. Check that `STATE_OF_TRUTH.md` and the evidence index say so plainly, in one sentence, naming both databases.

### C — is the evidence directory honest?

For every log under `docs/evidence/work-order-v2-*`, say whether it is a **red-proof** (seed → red → revert → green), a **pass log**, or a **receipt** — and whether the index describes it correctly. Stage 1's index initially called nine things red-proofs when five were.

### D — the recurring classes

Seven times the root cause has been one of two shapes: a **hand-maintained expected set that nothing enforces**, or a **verdict computed separately from the report of that verdict**. The most recent was a CLI that grew its own `formatExcerptLine`, making a byte-symmetry assertion guard a function the CLI never called.

Sweep the whole Stage 2 surface for both shapes specifically, including the repair tool and the gate leg inventory.

### E — the model question

Part of this stage was produced under `Model: composer-2.5-fast` after an API limit switched models mid-run. The commit trailers record which. Where you find work that is thin rather than wrong, note whether it correlates.

---

## Report

Write to `docs/evidence/work-order-v2-stage2/independent-audit-report.md` in `/tmp` and hand back the path — **do not write into the tree.**

Per item: **VERIFIED / FAILED / INCAPABLE OF FAILING**, with command, seed, and live output.

Then, explicitly:

- **What you audited that the inventory did not list**, and **what the inventory listed that you could not verify.** The gap between those two sets is itself a finding.
- **BLOCKS THE STAGE 2 STOP** — must be fixed before PR #48 merges.
- **NOT BLOCKING** — real but can follow.
- **COVERAGE** — what you did not examine, and what a clean report therefore does not prove. Anything you could not execute is UNVERIFIED, not passed.

End with one line: **is Stage 2 done, yes or no.** You are not authorising it — that is the owner's — but say what you would do.
