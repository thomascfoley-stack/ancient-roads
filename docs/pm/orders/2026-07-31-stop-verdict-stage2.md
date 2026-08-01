OUTCOME: 12/12 inventory items VERIFIED at `ac19935`; 3 blockers raised (B-1 causal sentence, B-2 typed gate-leg set, B-3 unscoped perturbation backfill), plus a 4th added on review (weld check absent from CI — see §F). None closed as of `d946c14`; gate A1 OPEN. PR #48 not merged.

# Independent audit - Work Order v2 Stage 2 STOP

**Auditor:** fresh Claude Code session. **I wrote none of this work.** No commit on
`chore/work-order-v2-stage2` is mine, and I have no stake in its passing. Where I record VERIFIED
below it is because I re-executed the check and watched it fail on a seeded defect, not because a
committed log says so. Where I could not execute, I say UNVERIFIED and do not soften it.

**Date:** 2026-07-31 · **Branch:** `chore/work-order-v2-stage2` · **sha:** `ac19935122d8293c24b83c95ccc062a13a99ad86`

---

## 0. State verification, before reasoning about anything

| Check | Result |
|---|---|
| Remote branch head | `ac19935122d8293c24b83c95ccc062a13a99ad86` = the stated `ac19935` ✅ |
| Builder's tree `/Users/foley/Projects/ancient-roads-git` | on `chore/work-order-v2-stage2` @ `ac19935`, **clean** (0 porcelain lines), read with `--no-optional-locks` ✅ |
| My working copy | fresh clone at `.../scratchpad/audit-stage2`, `ac19935`, clean. **I never wrote to the builder's tree.** |
| Tree at end of audit | 0 modified files, still `ac19935` (every seed reverted, verified after each) |

### Two corrections to the brief I was given

1. **`2.2-prod-unit-ordinal.log` is not untracked.** It is **tracked** at `ac19935`, committed in
   `e3c5b87`. `git ls-files --error-unmatch` resolves it; the builder's tree is clean with the file
   present. The Stage 2 README already says so ("see ADR-042 on the file now in git"). I did not
   modify it. Nothing turns on this, but a rail written against a stale premise is worth correcting.
2. **There are no dev credentials on this machine.** No `.env.local` (root or `web/`), no
   `NEON_API_KEY`, no `DATABASE_URL`. So the "read-only queries against dev" permission was
   unusable. I did **not** connect to dev, and obviously not to prod. Instead I stood up a
   **throwaway PostgreSQL 15 cluster in my scratchpad** (port 55432, SSL on, schema transcribed from
   `db/migrations/006`, `023`, `024`) and drove the **real committed tool** against it. What that
   does and does not prove is in §COVERAGE.

### Method - how "re-execute, do not read" was honoured

- The repair tool was run **as committed**, unmodified. To reach a local server I put a `neonctl`
  test double first on `PATH` and preloaded a `dns.lookup` patch mapping `*.localtest` → `127.0.0.1`.
  The tool's own code path - arg parsing, both prod guards, target match, role assert, weld query,
  transaction - executed verbatim.
- Every seed edits **product code or data**, never a test, and every seed is followed by
  `git checkout -- .` and a re-run confirming green.
- No production connection of any kind. No writes to any project database. No commit, branch, PR,
  publish flip, or Neon branch operation.

---

## PART 1 - the inventory I was handed

| # | Area | Verdict | Seed applied | Live output |
|---|---|---|---|---|
| 1 | Tranche 0 - no transpiler / no TS on prod path | **VERIFIED** | restored an `execFileSync('npx',['tsx',…])` into `scripts/lib/excerpt-sample-policy.mjs` (on the import graph) | `× production instrument path — static shape > invokes no transpiler` · `Tests 1 failed \| 4 passed` → revert → `5 passed` |
| 2 | Tranche 0.2 - one excerpt formatter (byte-symmetry) | **VERIFIED** | gave the CLI its own `formatExcerptLine` - the 7th-instance defect, re-introduced | `× the production CLI defines no formatter of its own and renders through the shared one` → revert → `13 passed` |
| 3 | Tranche 1 - cohort refused **before DB connect** | **VERIFIED** (trap cleared - see §1a) | `--cohort=publsihed`; then `--cohort` omitted | `STOP: 'publsihed' is not a source status this schema admits…` / `STOP: no status cohort named.` Control with a **valid** cohort reaches `resolveInstrumentConnection` and dies on `NEON_API_KEY is required` |
| 4 | Tranche 2 - publish-flip census fails closed | **VERIFIED** | `censusVerdict()` forced to return `OK` | 6 tests red incl. `§1 published-but-not-admitted STOPS the flip`, `§4 a serving literal count of zero STOPS the flip` → revert → green |
| 5 | Tranche 4 - corpus gates refuse on real corpus | **VERIFIED** | `evaluateCorpusRatchet()` forced to `{ok:true}` | 6 red incl. `an AUTHOR removed from every chapter file — no file count changes at all`, `no previous manifest is a REFUSAL at deploy` → revert → green |
| 6 | Tranche 5 - detector fires on admitted hits | **VERIFIED** | `frontMatterVerdict()` forced to `{apparatus:false}` | 6 red incl. `"Preface to the Gospel of John" keyed at John 1:1 is apparatus` → revert → green |
| 7 | Unit ordinal - 024 perturbations RED on mis-order | **VERIFIED** | ran the two committed perturbations against a **real Postgres** (the committed log could not - see §1b) | both perturbation red-proofs executed and passed; `15 passed` with **zero skips** (baseline had 4 loud skips) |
| 8 | Unit ordinal - uniform offset OK, non-uniform RED | **VERIFIED, with a caveat** | permuted stored `unit_ordinal` on a published work | `× … non-uniform offset: 3 distinct (stored - computed) deltas (-2, 0, 2)` → revert → green. **Caveat in §1c: the "reading order" leg is strictly subsumed and adds nothing.** |
| 9 | Unit ordinal - published leg not vacuous | **VERIFIED** | flipped every source to `staged`, emptying the cohort | `× positive control: zero sources in cohort 'published' — the probe is blind, ABORTING rather than reporting a clean run over nothing` → revert → green |
| 10 | Prod guard - `runtimeDbUrl` refuses `ep-odd-fog` | **VERIFIED** | `PROD_ENDPOINT` in `web/test/helpers/env.ts` repointed to a name production cannot match | 3 red: `REFUSES production, loudly…`, `REFUSES production via APP_DATABASE_URL`, `REFUSES production via DATABASE_URL fallback` → revert → `8 passed` |
| 11 | Gate legs - silent leg → gate refuses | **VERIFIED for a whole-prefix silence; INCAPABLE OF FAILING for the two cases that matter** | renamed all 4 `G6` call sites to `GX`; separately added a `G11` leg | silence → `REPO CHECK: RED missing=[G6]` ✅. New leg → `REPO CHECK: GREEN` while a derived check goes RED ❌. **§D-1** |
| 12 | G10 - honest skip, must not count as discharged | **VERIFIED** | - | `SKIPPED G10 — no published section with unit_ordinal on this fork` is the only branch it has taken; ADR-043 and the Stage 2 README both carry it as **UNDISCHARGED**. Nothing in the tree counts it as discharged. I additionally **discharged the underlying property** locally (§1d). |

### §1a - the Tranche 1 trap: does refusal precede the *connection*, or only the *query*?

It precedes the connection, and precedes the credential mint as well. In
`scripts/unit-ordinal-instrument.mjs` the order is `assertCohort` (line 58, `process.exit(2)` on
failure) → `resolveInstrumentConnection` (64) → `new pg.Client` (77) → `await c.connect()` (83).

Structure alone is not proof, so I ran the control: with a **valid** cohort and the same empty
environment, the process gets past the cohort check and dies at
`Error: NEON_API_KEY is required` inside `resolveInstrumentConnection`. With a bad cohort it never
reaches that line. The door is not opened and then closed - it is never opened.

One scoping note the inventory does not make: this property belongs to the **CLI**, not to the
library. `measureUnitOrdinalForCohort(client, …)` takes an **already-connected** client and calls
`assertCohort` as its first statement. That is correct for what it is (refuse before any *query*),
but any future caller that connects before validating gets no protection from it. Not a defect
today; a shape worth knowing.

Credit where due: the cohort list is **derived** - `sourceStatusCohorts()` parses the `CHECK`
constraint out of `023_sources_status_ingesting.sql`, and the refusal message names its source
("Valid cohorts (from 023_sources_status_ingesting.sql)"). That is exactly the discipline the gate
leg inventory does not follow (§D-1). The repo demonstrably knows the right pattern.

### §1b - what the Tranche 1 log honestly does not claim

`cohort-redproof.log` ends with a **NOT DONE** section stating plainly that the live-on-dev legs
were never run, that the tree had no credentials, and that the three properties were driven through
"a pg-shaped fake client" which "cannot catch a malformed statement that Postgres would reject."
That is a model piece of evidence-writing and I want it on the record as such.

I closed part of that gap: my scratch cluster satisfies `seedOwnerUrl()`'s localhost branch, so the
perturbation and published legs - **loudly skipped in the committed run** - actually executed here
against a real server, with real SQL, and passed. The cohort statements are no longer
"exercised against a real server nowhere in this branch."

### §1c - the order-preservation leg is real but strictly subsumed

`analyzeUnitOrdinalPreservation` pushes `reading order break` and `non-uniform offset` as separate
errors. If the offset is uniform then `stored = computed + k`, so sorting by `(stored, ordinal)` and
`(computed, ordinal)` cannot differ - the order leg cannot fire. Brute force over all 729
stored/computed assignments on 3 rows:

```
cases=729
  reading-order-break WITHOUT non-uniform-offset : 0
  both together                                  : 564
  non-uniform-offset WITHOUT reading-order-break  : 120
```

**The reading-order leg never fires alone.** It is not incapable of failing, but it contributes no
discriminating power: every failure it can report is already reported by the offset leg. The
committed test hides this - `it('genuine mis-order: RED (reading order break)')` asserts
`errors.some(e => e.includes('reading order break') || e.includes('non-uniform offset'))`. The `||`
means that test passes whether or not the leg it is named for ever fires.

This also means the instrument's real invariant is **stricter** than ADR-026's stated rationale. The
doc says consumers group by equality so dense `1..N` is not required - but a grouping-preserving,
order-preserving relabel such as stored `{1,2,5}` for computed `{1,2,3}` is **failed** by the offset
leg. That is fail-closed and therefore safe, but "order preservation, not dense 1..N" is not what
the code enforces. NOT BLOCKING; worth one honest sentence in ADR-026.

### §1d - G10, discharged one level down

G10's gate-leg red-proof remains undischarged and correctly labelled. The *property* underneath it
is not undischarged, and I can now say so from execution: I applied G10's own seed - NULL
`unit_ordinal` on one published section - and measured directly:

```
COHORT_NULLS_SQL rows = [{"nulls":1,"total":8}]
measurePublishedUnitOrdinal:  ok = false   nulls = 1
  errors = [ "cohort 'published': 1 section(s) have NULL unit_ordinal" ]
restore →  ok = true   nulls = 0
```

So the instrument G10 calls does refuse a NULL on a published section. What is still undischarged is
the **gate leg's wiring on a target that can host the seed** - which needs a fork with published
sections, i.e. downstream of the publish flip, exactly as ADR-043 says. ADR-043's ruling stands and
should not be softened by this paragraph.

---

## PART 2 - what the inventory omitted

### §A - the repair, re-executed

I built the weld case the brief specifies, from the migration's own semantics: bare headings key as
`r|` and group by **consecutive run** (024 `islands` CTE), so two separated runs of one heading
become two units - and deleting the rows between them merges them into one.

Seed: `weld-work` with headings `Chapter III. / Chapter III. / Interlude / Chapter III. /
Chapter III.`; applied the real 024 backfill via `backfillSqlFromMigration()` → units `1,1,2,3,3`;
then deleted the `Interlude` row. Stored keeps 2 distinct units; recomputation yields 1.

**A-1 · Weld abort - VERIFIED.** The guard fires and names the work:

```
unit_ordinal repair — DRY RUN
  slugs (1): weld-work
  per-work preview:
    weld-work: stored_units=2 computed_units=1 changed_sections=2 WELD_RISK
STOP: weld detector — computed_units < stored_units (island merge). Refusing apply.
  weld-work: stored=2 computed=1
EXIT=1
```

Re-run with `--apply`: **identical refusal, `EXIT=1`**, and the stored values afterwards are
unchanged (`1,1,3,3`). The abort genuinely precedes the write - it is evaluated before the `--apply`
branch, not inside it. Revert (restore the deleted row, re-run 024) → `nothing to repair - stored
already matches 024 recomputation`, `instrument cohort 'published': ok=true`, `EXIT=0`.

**The repair was guarded, not lucky.** The tool's claim of "0 weld rows" on both endpoints is a
claim a firing detector made, not a claim a dead one made.

**A-2 · Production refusal - VERIFIED, and it keys on the resolved endpoint.** Two independent
layers, and I separated them:

- Caller-passed flag: `--target=ep-odd-fog --apply` → `REFUSING: production (ep-odd-fog) - this
  script WRITES unit_ordinal`, exit 1. This is the flag check.
- **Resolved endpoint:** caller passes `--target=ep-tiny-hat` (an allowed target) but `neonctl`
  mints a prod host → `REFUSING: minted host ep-odd-fog-atnykudm.localtest:55499 is production`,
  exit 1. This is `isProdHost(url)` on the **minted** URL, and it is the layer that matters.
- Positive control that this is a real ordering claim: with the **same closed port** and a non-prod
  host, the tool proceeds past the guard and dies with an uncaught connection error. Prod is refused
  *before* the socket; dev is not. The refusal is not a connection failure wearing a guard's message.
- Third layer: a minted host that is neither prod nor the declared target → `STOP: minted host
  ep-some-other.localtest:55432 (id=ep-some-other) does not match --target=ep-tiny-hat`.

**A-3 · Dry-run default - VERIFIED, and the difference is real, not cosmetic.** Seeded a non-weld
drift (permuted stored units on `clean-work`, `stored_units == computed_units` so the weld guard
does not mask the test):

| invocation | tool output | stored after |
|---|---|---|
| no flag | `dry-run complete — re-run with --apply to write`, exit 0 | `3,2,1` - **unchanged** |
| `--apply` | `UPDATE rowCount=2` · `COMMIT — instrument cohort 'published' ok=true` | `1,2,3` - **repaired** |

**A-4 · Scope - VERIFIED from the SQL, not the docs.** `backfillRepairUpdateSql()` replaces only the
`need` CTE and keeps 024's tail verbatim:

```sql
UPDATE sections s
SET unit_ordinal = n.unit_ordinal
FROM units u JOIN numbered n ON …
WHERE s.id = u.id AND s.unit_ordinal IS DISTINCT FROM n.unit_ordinal;
```

One column in the `SET`. The `IS DISTINCT FROM` predicate also bounds the write to genuinely
changed rows - confirmed empirically: `rowCount=2` for a 3-row work with 2 wrong values. A full
post-apply dump showed `heading` and `body` untouched, and the non-targeted work (`weld-work`)
untouched. **Nothing but `unit_ordinal` moved.**

**A-5 · `tennyson-in-memoriam` - the record does not say; the CI log lets me answer it anyway.**

The repo cannot answer this on its own. `UNIT_ORDINAL_REPAIR.md` lists seven slugs with no per-work
rationale, `STATE_OF_TRUTH.md` §2e repeats the same list, and **no document in the tree names the six
works that failed CI** - so the set difference the brief asks about is not computable from the
committed evidence. That remains a documentation finding.

It *is* computable from the CI log at `6896714` (§B), which names its six works exhaustively:

| | works |
|---|---|
| **Failed CI** (6) | chrysostom-homilies, edwards-works, hodge-systematic, maclaren-expositions, owen-works, watson-works |
| **Repaired** (7) | the same six **+ `tennyson-in-memoriam`** |

**Why tennyson was in scope, from the tool's SQL.** Absent `--slugs`, the tool auto-selects every
published work where *any* section satisfies
`sec.unit_ordinal IS DISTINCT FROM c.computed_unit_ordinal` - **any** difference at all. The
instrument, by contrast, fails only on a NULL, a duplicate `(unit_ordinal, ordinal)` pair, a grouping
break, an order break, or a **non-uniform** offset. A **uniform** per-work offset is deliberately
reported and passed (ADR-026 addendum: consumers group by equality, not dense `1..N`).

So the repair's selector is strictly broader than the instrument's failure condition, and the gap
between them is exactly "works whose drift is a uniform offset."

Since the CI failure list is exhaustive over the published cohort, and `tennyson-in-memoriam` is not
on it, tennyson had none of the failing conditions - yet it had drift, or the tool would not have
selected it. **Therefore tennyson-in-memoriam carried a uniform per-work offset: real drift that the
instrument is designed not to fail on.** That is a deduction from an exhaustive list, not a guess;
the one thing I cannot do is quote tennyson's actual delta, which needs a DB read I have no
credentials for.

This is a good answer, and it makes the documentation gap sharper rather than smaller: the
distinction between *what the repair fixes* and *what the instrument fails on* is the single most
useful fact about this repair, it is knowable, and it is written down nowhere.

The remaining thinness stands: nothing in the evidence records **what the drift was per work** - no
before/after unit counts, no `changed_sections` per slug, only one aggregate `rowCount=61486`
repeated identically for both endpoints. The tool prints a per-work preview on every run; that
preview is the natural receipt for an irreversible action and it was not captured. **NOT BLOCKING,
but it is the weakest documentation in Stage 2.**

### §B - the causal chain is NOT legible (now CONFIRMED from CI, not inferred)

`db-invariants` went from red at `6896714` to green at `ac19935` because **the measured data was
repaired on `ep-tiny-bonus`**, not because code changed. That is legitimate and honest. It is also
not written down anywhere in the form a cold reader needs.

**This is no longer an inference.** Pulled read-only from GitHub Actions (`gh`, account
`thomascfoley-stack`):

| sha | run | `audit` | `db-invariants` |
|---|---|---|---|
| `6896714` | 30613713514 | success | **failure** |
| `ac19935` | 30650159435 | success | **success** |

The failing step at `6896714` is `DB-backed invariants (real DB) — whole directory, no allowlist`,
and it failed on **exactly one test** - `1 failed | 220 passed | 3 skipped (224)` - the published
leg. Every error string is data-shaped, and the six works are named:

```
FAIL test/invariants/unit-ordinal-instrument.test.ts > unit_ordinal instrument — published works
     + digest > passes NULL/order/recompute/digest checks on all published works
AssertionError: cohort 'published': chrysostom-homilies: non-uniform offset: 2 distinct (stored - computed) deltas (16, 17)
             cohort 'published': edwards-works:        non-uniform offset: 2 distinct deltas (0, 1)
             cohort 'published': hodge-systematic:     non-uniform offset: 3 distinct deltas (0, 3, 6)
             cohort 'published': maclaren-expositions: non-uniform offset: 3 distinct deltas (0, 1, 2)
             cohort 'published': owen-works:           non-uniform offset: 5 distinct deltas (0, 1, 2, 3, 4)
             cohort 'published': watson-works:         non-uniform offset: 2 distinct deltas (0, 1)
```

**And the measuring apparatus did not change between the two runs.** `ac19935` does edit
`scripts/lib/unit-ordinal-instrument.mjs` (+56 lines), which is the obvious rival explanation, so I
ruled it out by execution - loading both versions side by side:

```
  diff lines touching analysis/queries : 0
  cohort recompute SQL identical       : true   (2790 chars / 2790 chars)
  analyze fn source identical          : true
  measure fn source identical          : true
```

The `+56` is a pure refactor: the `need`-CTE substitution was extracted into a shared
`replaceNeedCte()` that **throws** if the migration's pattern is missing (strictly stronger than the
silent `.replace()` it replaced), plus a new `scope:'slugs'` branch and `backfillRepairUpdateSql()`
for the repair tool. The test diff at `ac19935` is likewise purely additive - two new cases for the
new SQL builders; the published-leg assertion is untouched.

**Same code, same assertion, same query, different data.** The flip is fully attributable to the
repair. The honest route to green is the one that was taken - and that is exactly why it needs to be
written down, because the diff a future reader sees is a 56-line code change sitting right next to a
red→green transition it did not cause.

What the tree actually says:

- `STATE_OF_TRUTH.md` §2e - names **both** databases and annotates the CI one
  (`ep-tiny-bonus` / `ci-test-20260729` / "CI `APP_DATABASE_URL_TEST`"). This is the closest thing
  to the required sentence and it is genuinely good. But it describes a *repair*; it never says a
  **CI job's colour changed as a result**, and it never mentions `6896714` or `ac19935`.
- Stage 2 README - one row: `repair | UNIT_ORDINAL_REPAIR.md - 024 slug-scoped re-apply on
  ep-tiny-hat + ci-test | DONE 2026-07-31`. No mention of CI going green.
- `UNIT_ORDINAL_REPAIR.md` - tool, guards, counts. No mention of CI at all.

So a reader diffing the two runs sees code changes in `6896714` (a typecheck fix) and would
reasonably attribute the flip to them. **The one sentence that prevents that is missing.** It should
name both endpoints, both shas, and say the data moved rather than the code. This is cheap and it is
the single highest-value doc fix in the stage.

### §C - is the evidence directory honest?

Classification of every log under `docs/evidence/work-order-v2-*`, by reading what each actually
contains (seed markers, revert markers, state transitions):

| Artifact | What it is | Index describes it correctly? |
|---|---|---|
| `tranche0/0.1-0.2-redproof.log` | **RED-PROOF** - SEED A/B/C, STATE 2/3, 6 reverts | not indexed anywhere |
| `tranche0/0.4-second-door-report.md` | **REPORT** - says so ("REPORT ONLY. Nothing in this file was implemented.") | not indexed |
| `tranche1/cohort-redproof.log` | **RED-PROOF** (in-memory/fake-client) + an explicit NOT DONE section | not indexed |
| `tranche2/census-redproof.log` | **RED-PROOF** - SEED 1/2 + reverts | not indexed |
| `tranche4/corpus-identity-redproof.log` | **RED-PROOF** - SEED A/B + reverts | not indexed |
| `tranche5/front-matter-redproof.log` | **RED-PROOF** - seed `MAX_TITLE_CHARS 70→10`, revert | not indexed |
| `tranche5/static-corpus-scan.log` | **PASS LOG / scan output** - no seed, and its name says scan | not indexed |
| `stage2/2.2-prod-unit-ordinal.log` | **RECEIPT** of a refusal (STOP at positive control, 0 published) | ✅ correctly `**HELD**` |
| `stage2/0.4-third-door-runtimeDbUrl.md` | **PROPOSAL** - says "PROPOSE ONLY" | ✅ |
| `stage2/RECOVERY_VERIFICATION.md` | **AUDIT REPORT** with honest "Exercised: NOT YET" rows | ✅ |
| `stage2/TRANCHE5-STASH-EVALUATION.md` | **EVALUATION / recommendation** | ✅ |
| `stage2/TRANCHE8-MEASUREMENT.md` | **MEASUREMENT** (eslint counts) | ✅ |
| `stage2/UNIT_ORDINAL_REPAIR.md` | **RECEIPT** of an irreversible action (thin - §A-5) | ✅ as to kind |

**No artifact is mislabelled.** Nothing calls itself a red-proof that is not one, and the two
things that could have been overclaimed - the 2.2 prod log and G10 - are both explicitly held back.
The Stage 1 defect (nine called red-proofs when five were) **has been fixed**: Stage 1's README now
separates "Red-proofs (seed → red → revert → green)" / "Pass logs (green test output - not
red-proofs)" / "Configuration receipts (no automated guard - known gap)".

**The gap is that Stage 2 did not inherit that structure.** Stage 2's README is a
`Tranche | Artifact | Status` table whose Status column is almost entirely `DONE`; it never
distinguishes a red-proof from a pass log from a receipt. And the five `work-order-v2-tranche*`
directories - which hold five of the six red-proofs this stage rests on - **have no index at all**.
The classification discipline Stage 1 bought with an audit was not carried forward. NOT BLOCKING,
but it is precisely the regression that audit was supposed to prevent.

### §D - the two recurring shapes, swept

**D-1 · Hand-maintained expected set that nothing enforces - CONFIRMED, and it is the eighth.**

`scripts/lib/gate-leg-inventory.mjs` line 5:

```js
export const REQUIRED_GATE_PREFIXES = ['G1','G2','G3','G4','G5','G6','G8','G9','G10'];
```

Typed out. Nothing derives it from the gate. The list happens to be **correct today** - I extracted
the gate's actual `pass()`/`fail()` prefixes and they are exactly G1–G10 - but correctness today is
the property this class of defect always has. Executed proof:

```
### SEED: add a new gate leg G11 to the gate
  in gate, NOT declared : G11
  DERIVED CHECK: RED
  REPO CHECK   : GREEN  missing=[]
### the repo's committed test, with G11 present in the gate
 ✓ test/invariants/gate-leg-inventory.test.ts (3 tests)   Tests 3 passed
```

A gate leg that exists and is never required to report is invisible to the inventory *and* to its
test. The test cannot help: it builds the reported set **from the same constant** it validates
against (`const reported = new Set(REQUIRED_GATE_PREFIXES)`), so it compares the list to itself.

Two further limits on "the one structural finding under most of the others":

- **Prefix granularity.** `recordGateLeg` records `gateName.split(/\s/)[0]` - the family, not the
  leg. The gate has **85** `pass`/`fail` call sites across 10 prefixes (G2 alone has 16). The
  inventory can detect **10** possible silences out of 85, and only when an *entire* family goes
  quiet. A concrete live example: the G5 sub-leg at `cutover-regression-gate.mts:610` is wrapped in
  `if (await hasColumn(c, 'commentary_entries', 'register'))`. On a target without that column that
  check is silent - and G5's other four call sites still report "G5", so the inventory passes.
- What it **does** do, verified: renaming all four `G6` call sites to `GX` yields
  `REPO CHECK: RED missing=[G6]`. A wholly-silent family is caught. That is a real property and
  worth keeping - it is just much narrower than "the gate refuses if a leg is silent."

**D-2 · A fifth copy of the endpoint rule, in the file that names the scar - NEW.**

`web/test/helpers/env.ts` defines its own `PROD_ENDPOINT`, `DEV_ENDPOINTS` and `endpointIdOf`,
duplicating `scripts/lib/target-guard.mjs`'s `PROD_ENDPOINT`, `DEV_ENDPOINTS` and `endpointId`. Its
own comment (lines 44–49) says *"Four copies of one rule is also how the cutover's guards drifted
into two distinct fail-open bugs (scripts/lib/target-guard.mjs)"* - and then it writes the fifth
copy rather than importing. It references `target-guard.mjs` **only in comments**; there is no
import.

The two copies agree byte-for-byte today. Nothing keeps them agreeing - the `src/`↔`web/` byte-sync
guards do not cover `scripts/lib/` ↔ `web/test/helpers/`. Executed proof: I loosened the canonical
regex in `target-guard.mjs` (`(-[a-z0-9]+)+` → `(-[a-z0-9]+)*`, so single-label `ep-foo` now
resolves as an endpoint id) and left `env.ts` untouched:

```
-- root suite --      Test Files  37 passed | 1 skipped (38)   Tests  397 passed | 1 skipped (398)
-- web invariants --  Test Files  28 passed | 14 skipped (42)  Tests  146 passed | 80 skipped (226)
```

**543 tests, all green, with the two copies of a prod-safety rule in disagreement.** As a
side-observation, `test/invariants/target-guard.test.ts` did not catch the loosening of its own
module's regex either.

**D-3 · Verdict computed separately from the report of that verdict - CONFIRMED, in the repair
tool.** `scripts/repair-unit-ordinal.mjs` writes the weld predicate twice, eight lines apart:

```js
const flag = w.computed_units < w.stored_units ? ' WELD_RISK' : '';   // line 165 — the report
…
const welds = weld.filter((w) => w.computed_units < w.stored_units);  // line 172 — the abort
```

Two independent expressions of one predicate. Edit one and the operator reads `WELD_RISK` on a run
that applies, or reads a clean preview on a run that aborts. Low severity - one file, adjacent, and
both are correct today - but this is exactly the named shape, in the one tool that performed the
stage's only irreversible action.

**Clean on this axis (checked, no finding):** `report.ok = result.ok` in the CLI is a single
assignment, not a recomputation. `measureUnitOrdinalForCohort` derives `ok` from `errors.length`
alone. `sourceStatusCohorts()` and `backfillSqlFromMigration()` **read the migrations** instead of
retyping them. And the seventh instance is genuinely fixed *and* guarded:
`test/excerpt-sample-policy.test.ts` asserts the CLI defines no `formatExcerptLine` and renders
through the shared one on both the terminal and `--out` paths - I re-introduced the defect and
watched that test go red.

**D-4 · A third shape, not on the list: a check that repairs the condition it measures - NEW.**

`web/test/invariants/unit-ordinal-instrument.test.ts`'s perturbation suite owns fixture slug
`qa-uoi-seed-<runid>`, but its `runBackfill()` executes the **unscoped** 024 backfill, whose `need`
CTE is `SELECT DISTINCT source_id FROM sections WHERE unit_ordinal IS NULL` - **every** source with
a NULL, not just its own. Executed proof:

```
before: clean-work unit_ordinals = NULL,2,3
### Run ONLY the perturbation suite (its fixture is slug qa-uoi-seed-*)
 Test Files  1 passed (1)   Tests  9 passed | 6 skipped (15)
after:  clean-work unit_ordinals = 1,2,3
```

The suite silently backfilled a source it does not own. I found this by accident: my first G10 seed
appeared to leave the instrument green, and the reason was that the perturbation suite had healed my
NULL before the published leg measured it. On `ep-tiny-hat` and `ep-tiny-bonus` the consequence is
that **running the db-invariants suite can erase the exact NULL drift the published leg exists to
detect**, and can populate `unit_ordinal` on a source that is legitimately mid-ingest. The fix is a
one-line scope: use the slug-scoped `need` selector the repair tool already has.

### §E - the model question

The commit trailers are unambiguous, and they make the correlation nearly vacuous as a
discriminator:

| sha | subject | `Model:` trailer |
|---|---|---|
| `ac19935` | Repair unit_ordinal drift | **Cursor Grok 4.5** |
| `6896714` | Fix typecheck: gate-leg-inventory + d.mts | composer-2.5-fast |
| `630e0de` | Tranche 8: eslint + DEPLOY_PREFLIGHT | composer-2.5-fast |
| `6d6eeff` | **Tranche 7: cutover gate leg inventory** | composer-2.5-fast |
| `3673195` | Tranche 6: RECOVERY verification | composer-2.5-fast |
| `d728ec8` | Tranche 5: front-matter stash evaluation | composer-2.5-fast |
| `e6e357e` | Tranche 4: STATE_OF_TRUTH §2e | composer-2.5-fast |
| `944bf92` | Tranche 3: runtimeDbUrl prod guard | composer-2.5-fast |
| `430954b` | Tranche 2: unit_ordinal instrument | composer-2.5-fast |
| `b4596aa` and earlier | Work Order v2 tranches | *(no Model trailer)* |

**Every Stage 2 tranche is `composer-2.5-fast`.** So "the thin work correlates with the fast model"
is true and tells you almost nothing - there is no within-stage control group. What can be said:

- The two thinnest artifacts I found - the hand-typed `REQUIRED_GATE_PREFIXES` (`6d6eeff`, Tranche
  7) and the sparse `UNIT_ORDINAL_REPAIR.md` - are both from this set, but so are the instrument
  (`430954b`) and the prod guard (`944bf92`), which are the **strongest** work in the stage: derived
  cohort lists, migration-read SQL, a real positive control, red-proofs that fire.
- The single most substantial artifact by contrast - Tranche 1's `cohort-redproof.log` with its
  explicit NOT DONE section - predates the switch and carries **no** Model trailer.
- The repair (`ac19935`, Grok 4.5) is the one commit under a different model, and it is where D-3
  (duplicated weld predicate) and the thin receipt live - while also being where the strongest guard
  in the stage lives (the weld abort, which I confirmed fires).

**Honest conclusion: the model does not discriminate here.** Tranche 7 is thin and Tranche 2 is
strong under the identical model. What discriminates is whether the author derived the expected set
from a source of truth or typed it out - and that varies *within* `composer-2.5-fast`. I would not
attribute any finding in this report to the model switch.

---

### §F - ADDENDUM (added on review of the prior order, at `d946c14`): the weld check is not in CI

*Added after the audit proper, when the order that preceded this one (`AP_WELD_FINDING.md`,
2026-07-31 00:51) was made available. It changes the blocker list, so it belongs in the verdict
rather than in a side note.*

That order's §1, marked **BLOCKING**, required the unit-count check to be added *"to the instrument
the same way Tranche 2 added the offset analysis - it already runs in CI with database access."* It
did not land there. Verified at `d946c14`:

```
stored_units / computed_units           → scripts/repair-unit-ordinal.mjs   ONLY
scripts/lib/unit-ordinal-instrument.mjs → no stored-vs-computed unit-count comparison
tests covering the weld detector        → none
```

So the weld guard runs only on manual invocation. It is absent from `db-invariants`, has no
regression test, and no red-proof of it exists in the repo. §A-1 of this report confirms the guard
is **correct** - I drove the committed tool against a seeded weld case and watched it abort and name
the work - but that proof lives in my scratch directory. **I am currently the only red-proof this
guard has.**

The consequence is forward-looking, which is why it survived the audit unnoticed: the repair is
done, so the guard's remaining job is protecting the *next* post-delete drift. `STATE_OF_TRUTH` §2e
already names that hazard ("Scripts that **delete sections after backfill** silently invalidate
stored `unit_ordinal`… will recur on the next post-backfill delete"). When it recurs, the only thing
distinguishing safe renumbering from a destructive weld is a script no gate calls.

Two further items from the same order, also unmet and both smaller:

- **The chrysostom record is uncorrected.** Its §2 required `STATE_OF_TRUTH` §2e and ADR-029's
  framing to record deltas **(16, 17)** - two deletion points, not a uniform +16. No `docs/*.md`
  mentions a second deletion point.
- **`DEPLOY_PREFLIGHT.md` is still 25 lines**, unchanged since the tranche that order said needed
  redoing.

I note also that the same order's §3 stated the gate-leg property as *"derived from the gate's own
structure"* and offered to accept the existing 30 lines on a seeded red. I ran that seed: a silent
family is caught, a **new leg is not**, and the expected set is typed rather than derived. So **B-2
below is that order's §3, unmet** - independently reached before I had seen it.

---

## The gap between what I audited and what I was handed

**Audited but not listed (5 findings, all from Part 2 or discovered en route):**

1. The repair tool's three guards - the largest and only irreversible action of the stage, absent
   from the inventory entirely. All three verified (§A-1/2/3), plus scope (§A-4).
2. **D-2** - the fifth copy of the endpoint rule in `web/test/helpers/env.ts`, unguarded, in the
   file that names the scar. 543 tests stay green across a seeded divergence.
3. **D-3** - the weld predicate written twice in the repair tool.
4. **D-4** - the perturbation suite writing outside its fixture and erasing the drift the published
   leg detects. Not a shape on the list; found only by executing.
5. **§1c** - the reading-order leg is strictly subsumed (0 of 729 cases fire it alone), and the
   committed test's `||` conceals that.

**Listed but not verifiable by me (3):**

1. **The repair's actual effect on `ep-tiny-hat` and `ep-tiny-bonus`.** I verified the tool, and CI
   now corroborates the *outcome* on `ep-tiny-bonus` (the published leg failed on six named works
   before, passes after - §B). But the **`61,486` figure itself remains UNVERIFIED** on both
   endpoints: no credentials, no per-work receipt, and the identical total on two endpoints is
   asserted by a doc alone. CI proves the drift is gone; it does not prove how many rows moved.
   `ep-tiny-hat` (dev) has no CI corroboration at all - nothing in Actions reads it.
2. **The gate's end-to-end leg wiring.** I proved `validateGateLegInventory` catches a silent family
   and misses a new leg, and I read the wiring diff. I could not run
   `cutover-regression-gate.mts` - it needs a full cutover schema and checkpoint state.
   The tail logic is **UNVERIFIED by execution**.
3. **G10 on a target that can host its seed.** Undischarged by design (ADR-043), still undischarged.

**That gap is itself the finding.** The inventory I was handed listed nine tests and one ADR, and
every one of them passed. It omitted the only action in the stage that changed 61,486 rows of data
in two databases and cannot be undone by `git revert`. Four of my five findings are outside it. An
inventory built from "what did we write a test for" will systematically miss "what did we do."

---

## BLOCKS THE STAGE 2 STOP

**B-1 · Write the causal sentence for the CI flip. (§B) - CONFIRMED FROM CI, not inferred.**

The fact to record, now established from the runs themselves rather than from the commit history:

> `db-invariants` failed at `6896714` (run 30613713514) on exactly one test - the published-work
> `unit_ordinal` leg, naming six works with non-uniform offsets - and passed at `ac19935`
> (run 30650159435). **The measuring code is identical across the two runs** (the cohort recompute
> SQL is byte-for-byte the same, 2790 chars; `analyzeUnitOrdinalPreservation` and
> `measureUnitOrdinalForCohort` are unchanged; the `+56` line diff is a refactor and the test diff is
> additive). It went green because `scripts/repair-unit-ordinal.mjs` rewrote 61,486 sections on
> **`ep-tiny-bonus` / `ci-test-20260729`** (the CI `APP_DATABASE_URL_TEST` branch) and on
> **`ep-tiny-hat`** (dev). **The data moved, not the code.**

That belongs in `STATE_OF_TRUTH.md` §2e and the Stage 2 evidence README, naming both endpoints and
both shas. Add the §A-5 clause with it: the repair's selector is *any* stored≠computed difference,
which is broader than the instrument's failure condition, which is why **seven** works were repaired
and **six** failed CI.

**Why still blocking, now that I have verified it.** Verification by an auditor is not a record - it
lives in this report, not in the repo, and the repo is the shared channel (CLAUDE.md). It also
expires: GitHub Actions logs age out, and when they do, the only surviving artifact is a red→green
transition sitting immediately beside a 56-line change to the very library doing the measuring. That
is the most natural wrong conclusion available, and the diff actively invites it. Ten-minute fix;
it is the whole reason a STOP has an audit.

**B-2 · Derive `REQUIRED_GATE_PREFIXES` from the gate, or state in the file that it is not derived.
(§D-1)**
Blocking not because the list is wrong - it is correct - but because this is the **eighth**
occurrence of a class this repo has now paid for seven times, it was introduced *by this stage*, and
it sits in the component the deep-audit called "the one structural finding under most of the
others." Shipping it as-is makes the next occurrence the ninth. Minimum acceptable fix: a test that
parses `pass()`/`fail()` call sites out of `cutover-regression-gate.mts` and asserts set equality
with `REQUIRED_GATE_PREFIXES ∪ OPTIONAL_GATE_PREFIXES` - my `derived-leg-check.mjs` does exactly
this in 25 lines and goes red on a seeded G11 while the committed check stays green. Also fix the
test, which currently builds its reported set from the constant under test.

**B-3 · Scope the perturbation suite's backfill to its own fixture. (§D-4)**
One line - swap the unscoped 024 `need` selector for the slug-scoped one the repair tool already
provides. Blocking because it runs on the CI branch and on dev, it writes to sources it does not
own, and it can silently destroy the NULL drift the published leg exists to catch. A test that
repairs the defect it measures is the unearned-green failure mode THE_LOOP §6 is named after, and
it is live in the suite that Stage 2's central claim rests on.

**B-4 · Put the weld check where a gate runs it, or say why it belongs only in the tool. (§F)**
Added on review. The unit-count comparison lives solely in `scripts/repair-unit-ordinal.mjs`; it is
not in the instrument, not in `db-invariants`, and has no test. The prior order made this BLOCKING
and specified the red-proof - seed two separated runs of an identical bare heading, delete the rows
between, watch the check report a unit-count decrease. I ran exactly that against the committed tool
and it fires; the repo still has no standing proof of it. Blocking because the `suppress-*`
delete-after-backfill hazard is documented as recurring, and when it recurs this is the only check
that separates safe renumbering from a destructive weld. Deletion is a legitimate remedy here: if
the honest call is that the guard belongs only in a one-shot tool, say so and name who owns the
recurrence hazard instead - today nobody does.

## NOT BLOCKING

- **N-1 (§A-5)** - capture the tool's per-work preview as the repair receipt, and state in
  `UNIT_ORDINAL_REPAIR.md` that the slug list was **auto-selected by drift**, not taken from the CI
  failure list. That one clause answers the `tennyson-in-memoriam` question permanently.
- **N-2 (§D-2)** - have `web/test/helpers/env.ts` import `endpointId`/`PROD_ENDPOINT`/`DEV_ENDPOINTS`
  from `scripts/lib/target-guard.mjs`. Deleting the duplicate is strictly better than syncing it.
- **N-3 (§C)** - give Stage 2's README Stage 1's three-way classification, and add an index to the
  five `work-order-v2-tranche*` directories, which currently have none.
- **N-4 (§1c)** - either drop the subsumed reading-order leg or fix its test's `||` so it asserts
  the leg it is named for; and note in ADR-026 that the enforced invariant is uniform offset, which
  is stricter than "order preservation, not dense 1..N."
- **N-5 (§D-3)** - hoist the weld predicate into one named constant.
- **N-6** - add a `target-guard.test.ts` case pinning the `endpointId` regex against single-label ids.

## COVERAGE - what I did not examine, and what this report therefore does not prove

**Not executed at all:**

- **Any project database.** No prod (correct), and no dev (impossible - no credentials). Every DB
  result here comes from a throwaway local Postgres with a **hand-transcribed subset** of the schema
  (`sources`, `sections`, `section_anchors`; no `embeddings`, no `commentary_entries`, no pgvector,
  no RLS, no `app_runtime` role). SQL that is valid there could still fail on Neon, and vice versa.
- **`npm run audit`** - the repo's definition of green. Not run; full workspace deps not installed.
  I installed only `pg` and `vitest`. Typecheck, lint, knip, deps-audit, coverage: **UNVERIFIED**.
- **`scripts/cutover-regression-gate.mts`** end to end, and `scripts/cutover-gate-redproof.mjs`.
- The `61,486`-row repair itself, on either endpoint (see the note above - CI corroborates the
  outcome on the CI branch, not the row count, and not dev at all).

**Executed after the first draft (`gh`, read-only, account `thomascfoley-stack`):** GitHub Actions
run and job results for `6896714` and `ac19935`, the failing step's log, and a side-by-side load of
the instrument library at both shas. This closed the CI gap and hardened **B-1** from inference to
evidence, and made **§A-5** answerable. I made no writes to GitHub: no comment, no label, no merge,
no re-run. PR #48 is OPEN / MERGEABLE and I left it that way.

**Examined but not exhaustively:** the gate's other 85 legs (I checked the inventory wiring, not
each leg's own falsifiability); Tranches 6 and 8 (read, classified, not re-executed - they are a
verification report and an eslint measurement, neither of which carries a red-proof claim);
`PUBLISH_FLIP.md`; everything outside the Stage 2 diff.

**What a clean report here does not prove:** that the repair did what its doc says it did on the two
real databases; that the gate refuses when a leg is silent *in a real run*; that Stage 2 is green
under the repo's actual gate. It proves that **the checks Stage 2 shipped can fail on the defects
they name**, which is the property THE_LOOP rule 4 asks for and the property the inventory claimed.
Anything above marked UNVERIFIED is unverified, not passed.

---

## Is Stage 2 done?

**No - but it is close, and the remaining work is small.**

The engineering is sound. Every check in the inventory fired on a seeded defect; the repair tool's
weld abort - the guard the whole irreversible action rested on - genuinely fires and names the work;
the production refusal keys on the resolved endpoint and provably precedes the socket; the published
leg is not vacuous; and G10 is carried honestly as undischarged rather than quietly counted. This is
better work than most stages get audited into.

Four things stop me calling it done (the fourth added on review - §F), and none is an engineering
failure. **B-4** is a correct guard parked where no gate runs it. **B-1** is a sentence that
must be written while it is still writable - I have now confirmed the fact from the CI runs
themselves, and confirming it took a job-log pull plus a side-by-side load of the library at two
shas to rule out the 56-line refactor sitting next to the flip. No future reader will do that work,
and once the Actions logs age out they will not be able to. **B-2** is this repo's own recurring
defect, introduced by this stage, in the component meant to catch silence - and the seven previous
instances are the argument for not shipping the eighth. **B-3** is a live test that erases the
evidence it exists to gather.

**What I would do** (corrected 2026-07-31 after §F was added; this line previously named only B-1,
B-2 and B-3 and was never restated once B-4 joined them, which the search-programme order caught as
an open A1-scope question): land **all four** - B-1, B-2, B-3 and B-4 - then merge PR #48 without a
re-audit, since all three are narrow and independently checkable, and I have stated the executable
check for each. I would not hold the stage for anything in NOT BLOCKING. The authorisation is the
owner's, not mine.

---

### Appendix - reproducing this audit

Working copy `…/scratchpad/audit-stage2` @ `ac19935`, clean. Scratch Postgres:
`initdb`-created cluster on `127.0.0.1:55432`, SSL on, role `neondb_owner`, db `neondb`.
Harness files under `…/scratchpad/seed/`: `schema.sql`, `seed-weld.sql`, `apply-024.mjs`,
`seed-battery.sh`, `derived-leg-check.mjs`, `probe-null.mjs`, `subsume.mjs`; shims under
`…/scratchpad/shim/` (`neonctl` double, `dnspatch.cjs`). Final state after all seeds:
`0 modified files at ac19935`, `102 passed` across the six re-executed suites. The builder's tree
`/Users/foley/Projects/ancient-roads-git` was read with `--no-optional-locks` only and ended clean
at `ac19935`.

CI evidence (read-only):

```bash
gh api repos/thomascfoley-stack/ancient-roads/actions/runs/30613713514/jobs \
  --jq '.jobs[] | "\(.name)\t\(.conclusion)"'      # 6896714: audit success, db-invariants failure
gh api repos/thomascfoley-stack/ancient-roads/actions/runs/30650159435/jobs \
  --jq '.jobs[] | "\(.name)\t\(.conclusion)"'      # ac19935: both success
gh run view --repo thomascfoley-stack/ancient-roads --job 91102007524 --log-failed
```

Rival-explanation check (the `+56` refactor did not cause the flip) - load both versions and compare:

```bash
git show 6896714:scripts/lib/unit-ordinal-instrument.mjs > old.mjs
git show ac19935:scripts/lib/unit-ordinal-instrument.mjs > new.mjs
# backfillSelectSql(..., {scope:'cohort'}) identical: true (2790 == 2790)
# analyzeUnitOrdinalPreservation / measureUnitOrdinalForCohort sources identical: true
```
