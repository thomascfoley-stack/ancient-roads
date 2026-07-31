OUTCOME: §1 (weld check into the CI instrument) NOT DONE — the check landed in `scripts/repair-unit-ordinal.mjs` only, with no test and no CI leg; raised as blocker B-4 in `2026-07-31-stop-verdict-stage2.md` §F. §2 (chrysostom (16,17) correction) NOT DONE. §3 gate-leg redo NOT DONE — reached independently as blocker B-2. §3 `DEPLOY_PREFLIGHT.md` still 25 lines. Filed retrospectively 2026-07-31 (`d946c14`).

# The overnight run answered the question — and the answer is the bad one

## What CI just measured

The relaxed instrument turned itself into a diagnostic, and `db-invariants` at `6896714` printed the exact table Tranche 1 was asking for:

| Work | Distinct `stored − computed` deltas |
|---|---|
| `chrysostom-homilies` | 2 — **(16, 17)** |
| `edwards-works` | 2 — (0, 1) |
| `hodge-systematic` | 3 — (0, 3, 6) |
| `maclaren-expositions` | 3 — (0, 1, 2) |
| `owen-works` | **5 — (0, 1, 2, 3, 4)** |
| `watson-works` | 2 — (0, 1) |

**Six works. Every one non-uniform. Zero uniform.**

That is the dangerous case, not the safe one. A uniform offset is pure renumbering and re-running 024 is harmless. A non-uniform offset means deletions happened *mid-work*, so `dense_rank()` closes gaps differently at different points — and wherever two separated runs of the same bare heading become adjacent, they **weld into one unit** on recomputation.

`owen-works` with five distinct deltas is precisely the named risk: "Chapter III." recurring across 11 books, 509 sections, four units deleted spanning positions 8 to 511. Five deltas means four deletion points, each shifting everything after it.

Note also that `chrysostom-homilies` is **(16, 17)**, not a clean 16. So the tidy "+16 prolegomena" story that Cursor and I were both working from is incomplete — there is a second deletion point in that work, which matches the auditor's table exactly (`suppress-nonauthorial-matter.ts` removed 6 more chrysostom sections at unit 275). The auditor's account survives contact with the data. Ours did not.

## The weld question is still open — and now it is open on six works

The delta table proves *renumbering* happened. It does **not** prove whether units *merged*. Those are different questions and only the second one is dangerous.

The distinguishing query is still the auditor's, and it was not run:

```sql
-- per work: does the unit COUNT change, not just the labels?
HAVING count(DISTINCT sec.unit_ordinal) <> count(DISTINCT c.computed_unit_ordinal)
```

Empty → pure renumbering, a 024 re-run is a safe repair. Any row where `computed_units < stored_units` → that work welds, and re-running 024 there destroys a distinction that currently exists.

**So the repair is now more hazardous than it looked last night, on six works rather than one, and the check that would tell us which is a two-line addition to a test that already runs in CI with database access.**

## What went right, genuinely

The Tranche 2 design decision was good. Changing the instrument from `stored == computed` to *"uniform offset reported, non-uniform offset fails"* turned a binary failure into a diagnostic that emitted the whole table. That is the right shape for a check — report the measurement, fail on the property — and it is what produced the answer above.

`db-invariants` also stayed honestly red rather than being relaxed into green, and the third-door guard landed with a red-proof in `seed-owner-url.test.ts`.

## What went wrong

**It ran on `composer-2.5-fast`.** Every overnight commit carries `Model: composer-2.5-fast`. I asked you to pin the strongest model and gave the reason in advance: *"that is precisely the failure mode a cheaper or auto-routed model produces under a long instruction set — it satisfies the shape of the request."* Eight tranches, 519 additions, in five minutes.

The `Model:` trailer I asked for last night earned its keep immediately. Last time this question was archaeological; this time it is one line of `git log`.

**Tranche 1 has no commit.** It was blocked on missing dev credentials, exactly as flagged before the worker started. But the data arrived through CI anyway — and nobody noticed. Cursor's summary mentions "6 works non-uniform offset" as a passing detail in a sentence whose main clause is *"repair stays deferred."* The most important measurement of the night is filed as a footnote to a deferral.

**Two tranches are thin enough to need redoing.** The gate leg inventory — the original audit's *"one structural finding under most of the others"* — is 30 lines. `DEPLOY_PREFLIGHT.md` is 25 lines against a brief asking for the ordered deploy sequence, what gets uploaded that is not in git, what the rollback actually restores, and the checks that close G4 and prove G7. Those are not 25 lines of content.

---

# Cursor order — finish the weld question

Paste everything below the line. **Pin the strongest model. Not auto, not fast.** Last night's run produced eight commits in five minutes on `composer-2.5-fast`, and two tranches need redoing because of it.

---

Last night's Tranche 2 was a good call: relaxing the instrument to *report* uniform offsets and *fail* non-uniform ones turned it into a diagnostic, and CI printed the table we needed. Credit for that.

But the table is the alarming answer, and the run filed it as a footnote.

```
chrysostom-homilies   (16, 17)
edwards-works         (0, 1)
hodge-systematic      (0, 3, 6)
maclaren-expositions  (0, 1, 2)
owen-works            (0, 1, 2, 3, 4)
watson-works          (0, 1)
```

**Six works, all non-uniform, none uniform.** Non-uniform means mid-work deletions, which is the weld-risk case — not the safe renumbering case.

## §1 — answer the weld question (BLOCKING)

Renumbering and merging are different failures and only one is destructive. The delta table proves the first. Nothing yet tests the second.

**Property:** for each affected work, report whether the number of distinct units changes under recomputation, not just their labels.

Add it to the instrument the same way Tranche 2 added the offset analysis — it already runs in CI with database access, which is how last night's table got measured despite the local machine having no credentials. **Report per work: `stored_units`, `computed_units`, and equal-or-not.**

- `computed_units == stored_units` for a work → pure renumbering, a 024 re-run on that work is safe.
- `computed_units < stored_units` → **that work welds.** Re-running 024 there destroys a distinction that exists today.

`owen-works` is the expected offender — "Chapter III." recurs across its 11 books and four units were deleted spanning positions 8 to 511.

**Red-proof:** seed two separated runs of an identical bare heading, delete the rows between them, and confirm the check reports a unit-count decrease. Revert, watch it report equality.

**Still no data writes.** This measures; it does not repair.

## §2 — correct the chrysostom record

`chrysostom-homilies` shows deltas **(16, 17)**, not a uniform 16. The "+16 prolegomena" account in `STATE_OF_TRUTH` §2e and ADR-029's framing is incomplete — there is a second deletion point, consistent with `suppress-nonauthorial-matter.ts` removing 6 more sections at unit 275.

Correct the record to say what the data says: two deletion points, deltas 16 and 17. A tidy story that the measurement contradicts is worse than no story.

## §3 — redo two tranches properly, on the pinned model

**Tranche 7, the gate leg inventory.** 30 lines does not discharge *"a green line whose absence is invisible."* The property: the set of legs the gate is expected to run is **derived from the gate's own structure**, and the gate refuses if any declared leg did not report. Red-proof: make one leg silently not report, watch the gate refuse and name it. If the current 30 lines already do that, show the seeded red and I will accept it.

**Tranche 8's `DEPLOY_PREFLIGHT.md`.** 25 lines against a brief asking for: the ordered sequence from clean tree through `./deploy.sh` naming every gate and what each refuses on; what is uploaded that is **not** in git and how to verify it before upload rather than after; what the rollback actually restores versus what is merely available; the post-deploy checks that close G4 and prove G7 for the first time; and the owner's one-pass checklist. Write it properly.

## §4 — report

§1's per-work result set in full. Both CI jobs by name. `Model:` trailer on every commit, and state the model in the report body too.

No production. No data writes. No merge. No self-audit — the Stage 2 STOP audit is a separate Claude Code session and it is still owed.
