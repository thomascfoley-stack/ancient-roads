OUTCOME: A1 CLOSED. All four Stage 2 blockers re-executed independently and all four hold (B-1 recorded and the rival explanation ruled out by loading both library versions; B-2, B-3, B-4 red-proved by seeding real product code and watching the check fail). 21/21 commits audited. The 61,486-row repair remains NOT RUN (no dev credentials). Six findings, none blocking: a TENTH instance of the recurring class, live at `test/ask-max-duration-literal.test.ts:26-29`; a factually WRONG correction block at `docs/RECOVERY.md:40-62` (the rollback id is real and is the currently-promoted production deployment `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt`, alias `ancientpaths.app`, sha `24677ba`); `docs/DEPLOY_PREFLIGHT.md` and `docs/pm/MASTER.md` both carry claims their own later commits in this same range falsified; a real red can be laundered into NOT RUN by a subsequent provider blip; the weld leg and the served-asset scan have no test; `94da9fc` carries no `Model:` trailer. `audit=success db-invariants=success` at the pinned sha. PR #48 may merge.

# Independent audit - A1 closure, `ac19935..6ab5779`

**Filed 2026-08-01 by a fresh session that wrote none of this work.** Commissioned by
[`2026-08-01-stop-audit-a1-closure.md`](2026-08-01-stop-audit-a1-closure.md).

---

## 0. The seat check, first

The order's own opening premise is that the verifier did not write the work. The previous attempt at
this audit was correctly declined because that premise was false for that session. So, run before
reading anything else:

```
git log --format='%h  %(trailers:key=Model,valueonly)  %s' ac19935..6ab5779
```

**Of the 21 commits, I wrote ZERO.** This session began with the commissioning prompt; I have no prior
turns in it, and every commit in the range I read for the first time here. Twenty carry
`Model: claude-opus-5` from other sessions, `d946c14` carries `Cursor Grok 4.5`, and `94da9fc`
carries no `Model:` trailer at all (see Part B item 10). Fixer is not verifier
(`docs/BUILD_MODEL.md` §1.4, bylaw 4); I have edited no product code and my working tree ended
clean at the pinned sha.

## 0a. Two errors in the commissioning order's header note

Recorded here rather than fixed, because a verifier does not edit what it audits.

1. **The filing note claims the order as issued carried no `# STOP AUDIT` heading.** It did. The
   heading was lost in transit to the previous session. The filed heading is therefore correct and
   the note explaining it is not.
2. **It references `2026-08-01-stop-audit-a1-closure-DECLINED.md`.** No such file exists, at
   `6ab5779` or at `b2bd2c0`. The note is self-aware about this ("no such file exists yet"), but it
   reads as a pointer and there is nothing to point at.

**And a third fact the order asked me to record: no independent verdict has ever existed in this
repository.** Every file in `docs/pm/orders/` at the pinned sha was written by the session that also
wrote the work it assesses. `2026-07-31-stop-verdict-stage2.md` is an independent audit *report*, but
it was filed into the tree by the session it audited, and the A1 closure it triggered has never been
signed off by anyone but its own author. **This file is the first.**

## 0b. Scope, and what I did not audit

Pinned at `6ab57793bfba4ae5881c04074d3afb03b3494258`. The branch has since moved to `b2bd2c0`, which
adds only my own commissioning document. **I did not audit it.** Verified: `git show b2bd2c0 --stat`
is one file added, `docs/pm/orders/2026-08-01-stop-audit-a1-closure.md`, 157 insertions.

## 0c. Method

Read-only clone at `6ab5779` in a scratch directory, fetched from GitHub, so the tree a worker holds
at `~/Projects/ancient-roads-git` was never written to (it was read once, for §B-3, and only read).
Throwaway PostgreSQL 14 cluster on `127.0.0.1:55433`, SSL on, role `neondb_owner`, schema
hand-transcribed from migrations 006/023/024. **No production connection, read or write. No data
writes to any project database. No merge, no deploy, no migration, no Neon branch touched.**

Every seed below was applied to **real product code**, watched, and reverted, with `git status
--porcelain` empty after each.

---

# PART A - are the four blockers actually closed?

## B-1 - the causal sentence. **CLOSED.**

**Recorded where a reader meets the claim.** Two places, both naming both endpoints and both shas:

* `docs/STATE_OF_TRUTH.md:198-211`, headed "Why CI went from red to green - the data moved, not the
  code", plus the six-work delta table at `:216-224` and the seven-vs-six explanation at `:225-230`.
* `docs/evidence/work-order-v2-stage2/README.md:17-27`, added by `03516b6`.

**The recorded account matches the runs.** Pulled from the API, not from the doc:

| sha | run | `audit` | `db-invariants` |
|---|---|---|---|
| `6896714` | 30613713514 | success | **failure** |
| `ac19935` | 30650159435 | success | success |

**The rival explanation is ruled out - by my own load of both versions, not by trusting that it was.**
I extracted `scripts/lib/unit-ordinal-instrument.mjs` at both shas and compared the measuring
apparatus by execution:

```
backfillSqlFromMigration() identical      : true  (2782 == 2782)
cohort recompute SQL identical            : true  (2790 chars == 2790 chars)
analyzeUnitOrdinalPreservation identical  : true
measureUnitOrdinalForCohort identical     : true
measurePublishedUnitOrdinal identical     : true
COHORT_DIGEST_SQL identical               : true
COHORT_NULL_SQL identical                 : true

same verdict on the (16,17) shape         : true
  old: ok=false errors=["non-uniform offset: 2 distinct (stored - computed) deltas (16, 17)"]
  new: ok=false errors=["non-uniform offset: 2 distinct (stored - computed) deltas (16, 17)"]

exports added by the +56                  : backfillRepairUpdateSql, replaceNeedCte
exports removed                           : (none)
```

The `2790` figure in the record reproduces exactly. The `+56` adds two new exports and changes no
analysis path. **Same code, same assertion, same query, different data.** Independently confirmed.

**The chrysostom (16, 17) correction is filed where the reader meets the wrong version** and its
arithmetic checks out. `docs/DECISIONS.md` ADR-029 addendum carries it (not only
`STATE_OF_TRUTH.md`), and I counted the evidence file it cites:

```
docs/evidence/part2/nonauthorial-matter-suppressed.jsonl
  total rows           : 947
  chrysostom rows      : 6
  distinct unit_ordinal: [275]
  ordinals             : [6608,6609,6610,6611,6612,6613]
  heading              : "Comparative Table of the Works of St. Chrysostom in the American and Migne's Editions."
```

Six rows, one unit, contiguous. The two-deletion-point account is correct.

## B-2 - `REQUIRED_GATE_PREFIXES` derived, not typed. **CLOSED.**

Seeded in real product code, not in memory. Added a genuine `G11` leg beside the G10 pass at
`scripts/cutover-regression-gate.mts:826`:

```
baseline                     -> 10 passed
SEED: pass('G11 seeded leg') -> 1 failed | 9 passed
   FAIL  gate-leg-inventory.test.ts > the declared set IS the gate's set
   AssertionError: legs the gate runs that no list requires: expected [ 'G11' ] to deeply equal []
revert                       -> 10 passed, git status clean
```

The property holds. The test no longer builds its reported set from the constant it validates
(`web/test/invariants/gate-leg-inventory.test.ts:34` derives `legsInGate` from the gate's source),
and the family-granularity limit is pinned by its own test at `:116-123` rather than left to be
rediscovered.

**Residual, NOT blocking (`scripts/lib/gate-leg-inventory.mjs:63`).** The scannability guard counts
`pass(`/`fail(` call sites; it is keyed to the *syntactic form*, not to the property "a leg name that
is not a literal". An **aliased** call site escapes both the derivation and the guard, silently:

```
SEED: const legReport = pass; legReport('G11 aliased leg', ...)  -> 10 passed  (guard does NOT fire)
```

This is narrower than the case that matters (all 85 code call sites are direct), and the file is
honest that it is a source scan. But the guard's stated job is that under-reading becomes loud, and
in this shape it does not.

## B-3 - the perturbation suite writes only to its own fixture. **CLOSED.**

Re-executed against a real Postgres, in both directions. Bystander source `clean-work`, published,
seeded with the exact drift the published leg exists to detect (`unit_ordinal = NULL,2,3`):

```
                                    bystander after     published leg
at 6ab5779 (fix present)            NULL,2,3            1 failed | 14 passed   <- correctly RED
revert to unscoped 024 need CTE     1,2,3               15 passed              <- UNEARNED GREEN
re-apply the fix                    NULL,2,3            1 failed | 14 passed
```

This is the cleanest proof in the range. The middle row *is* the defect: with the fix reverted, the
harness healed a source it does not own and the published leg then reported green on data that was
broken when the run started. The check erased its own evidence. With the fix, it does not.

## B-4 - the weld check where a gate runs it. **CLOSED as to the ordered property.**

The leg now lives in `scripts/lib/unit-ordinal-instrument.mjs:237-250` (`cohortWeldSql`) and
`:379-387`, inside `measureUnitOrdinalForCohort` - which is what the `db-invariants` published leg and
the cutover gate's G10 both call. I drove the committed instrument against the exact seed the order
specified (two separated runs of an identical bare heading, rows between them deleted):

```
STATE 1  rows 1:Chapter III.:1  2:Interlude:2  3:Chapter III.:3
         stored_units=3 computed_units=3   welds=0   ok=true

STATE 2  SEEDED (ordinal 2 deleted)
         rows 1:Chapter III.:1  3:Chapter III.:3
         stored_units=2 computed_units=1   welds=1   ok=false
         ERROR: cohort 'published': qa-weld-work: WELD ... recomputation MERGES units
                (stored_units=2 -> computed_units=1). Re-running the 024 backfill on this
                work would destroy a distinction that exists in the data today.

STATE 3  REVERTED -> stored_units=3 computed_units=3  welds=0  ok=true

RED-PROOF: PASS
```

The verdict §F's three complaints were "not in the instrument, not in CI, no test". **Two of three are
closed.** The third is not, and it is a real residual (§C-3): nothing tests the weld leg. Gutting
`isWeld` to `return false` changes no test's colour anywhere in the repo, and the leg is documented as
unable to fail alone. The builder red-proved it once; I have red-proved it again; **there is still no
standing proof.** The verdict's own sentence, "I am currently the only red-proof this guard has",
remains structurally true with a different name in it.

I record the honest-scope note at `:225-235` as **correct and verified**: my STATE 2 shows the
grouping-break and non-uniform-offset legs firing alongside the WELD line, exactly as documented. The
leg adds diagnosis, not detection, and says so.

## The 61,486-row repair execution. **NOT RUN.**

No dev credentials on this machine: no `web/.env.local` in any clone, `NEON_API_KEY` /
`DATABASE_URL` / `APP_DATABASE_URL` all unset. `gh secret list` confirms `APP_DATABASE_URL_TEST`,
`NEON_API_KEY` and `DEEPINFRA_API_KEY` exist as Actions secrets, whose values are correctly
unreadable. **I could not re-measure the row count on `ep-tiny-hat` or `ep-tiny-bonus` and I am not
softening that.** CI corroborates the drift is gone on the CI branch; it does not corroborate how many
rows moved, and nothing in Actions reads dev at all. The repo labels this UNVERIFIED in three places
(`STATE_OF_TRUTH.md:242-245`, the evidence README, and the A-1 tranche); that labelling is correct and
should stay.

---

# PART B - the 21 commits

## 1. `c1e359d` + `fed8b32` - the build fix. **VERIFIED.**

Four states, both legs, re-executed:

```
baseline                       next build EXIT=0    guard 3 passed
SEED 3b: restore the identifier export in BOTH routes (real product code)
                               next build EXIT=1    guard 2 of 3 FAILED
   "Invalid segment configuration export detected."
   "web/src/app/api/ask/route.ts: maxDuration must be a numeric literal, not an identifier"
   "web/src/app/api/ask/route.ts: maxDuration literal != ASK_MAX_DURATION_SEC: expected NaN to be 300"
revert                         guard 3 passed, git status clean
```

**The `fed8b32` regression, established from the API rather than from its commit message.** The claim
is "it was green at `d1576fe` and has failed on every commit since `c1e359d`". Measured:

| sha | `audit` | `db-invariants` |
|---|---|---|
| `d1576fe` | success | success |
| `c1e359d` | **failure** | success |
| `bf34b21` | **failure** | success |
| `f462114` | **failure** | success |
| `68b14ad` | **failure** | success |
| `fed8b32` | success | success |

Exactly as stated: four consecutive reds, self-reported accurately and unflatteringly. The regression
was `web/test/teach-budget.test.ts` asserting the *opposite* property (bind to the identifier), which
Next 16 makes unbuildable. It was **deleted, not mirrored**, and the stronger property survives in
`test/ask-max-duration-literal.test.ts`. That is bylaw 3 applied correctly.

**Does anything of that class remain?** The class is "a green test enforcing a property that makes the
product unbuildable, kept green because CI does not build". It is closed structurally by `19798ec`.
I re-derived the population it could hide in: three route-segment `maxDuration` exports exist
(`web/src/app/api/ask/route.ts:15`, `.../ask/stream/route.ts:15`, `.../eval/bait/route.ts:12`), all
literals, all `300`, all build-compatible. No survivor. **But see §C - the guard's own route list is
the tenth instance.**

## 2. `19798ec` - CI builds the app. **VERIFIED**, and the required-check question **ADJUDICATED**.

`.github/workflows/audit.yml:55-65`.

* **Blocking?** Yes. No `continue-on-error` and no `if:` anywhere in the file (grepped, zero hits).
  `set -o pipefail` is present, which is load-bearing: without it `npx next build | tee` would return
  `tee`'s status and the failure would be swallowed. `exit 1` propagates.
* **In the job the merge gate reads?** It is step 7 of the `audit` job, and it genuinely executed at
  the pinned sha:
  `7  success  build - next build (the product must compile)` (run 30675045383).
* **Does the second annotation fire on the class it claims to catch?** Yes. It greps
  `Invalid segment configuration`; my seeded build at §B-1 above produced that exact string, once.
* **Is `audit` a required check?** **No.** Adjudicated independently, not inherited:

  ```
  GET /repos/thomascfoley-stack/ancient-roads/branches/main
    {"name":"main","protected":false,
     "protection":{"enabled":false,
       "required_status_checks":{"checks":[],"contexts":[],"enforcement_level":"off"}}}

  GET /repos/thomascfoley-stack/ancient-roads/rulesets
    403 "Upgrade to GitHub Pro or make this repository public to enable this feature."
  ```

  `main` is unprotected with zero required contexts, and rulesets are **unavailable on this plan for a
  private repo**, so no ruleset can be silently enforcing either. **The PM's reading is correct.**
  What this means concretely: the build gate is real *within* the job, and the job is real *within*
  the workflow, but **nothing mechanically prevents merging a commit whose `audit` is red.** Green is
  advisory here; the gate is the owner. That is worth knowing before A6, because "CI green" and "may
  not merge red" are different guarantees and this repo only has the first.

## 3. `b9ad463` - the derived served-asset set. **VERIFIED, with a named under-read.**

**State 3 reproduced as ordered** - a newly served directory, in `web/src` only, no list touched:

```
baseline           serves: bible, commentaries, concordance, devotional, lexicon, original
SEED  fetch(`/harmony/${id}.json`) in one new file
                   serves: bible, commentaries, concordance, devotional, harmony, lexicon, original
                   PRE-DEPLOY GATE FAILED ... absent from web/public: ... harmony ...
revert             clean
```

The gate names it. The derivation works, and the six directories it finds match the record.

**The restoration is real, measured on the deploying machine** (read-only):
`concordance 295 files, lexicon 2, original 1189, bible 22590, commentaries 1213` - exactly the counts
`b9ad463` claims and exactly what `DEPLOY_PREFLIGHT.md` §3 tabulates for the two it lists.

**Does `assertServedAssetsScannable()` actually refuse, and does it under-read silently elsewhere?**
Both. I probed five shapes:

| case | scannability | derived set |
|---|---|---|
| `fetch(\`/${dir}/x.json\`)` - the claimed case | **REFUSES, loud** | (gate stops) |
| `const u = \`/${dir}/x.json\`; fetch(u)` | does NOT refuse | omits it silently |
| `useSWR(\`/${dir}/x.json\`)` | does NOT refuse | omits it silently |
| `fetch(BASE + dir + "/x.json")` | does NOT refuse | omits it silently |
| `fetch(new URL(\`/${dir}/x.json\`, o))` | does NOT refuse | omits it silently |

In all four silent cases the gate then prints **"every served asset directory is present"** - the
precise failure the file's own header says it exists to prevent. `DYNAMIC_ROOT_PATH` at
`scripts/lib/served-assets.mjs:35` is `/fetch\(\s*`\/\$\{/g`: it matches one syntactic form, not the
semantic property.

**This is not hypothetical in this codebase.** `web/src/lib/original.ts:100` and `:107` already reach
static JSON through a wrapper, `fetchJson(\`/concordance/${bucketKey}.json\`)`, not through a bare
`fetch(`. The first segment is a literal today so the derivation succeeds - but the idiom the guard
cannot see is already the house style in the very file the ninth instance was found in. NOT BLOCKING;
worth one line of widening.

**The typed `COMMENTARIES_DIR` and the `public/bible/` licence check: deliberate belt-and-braces, not
a residual instance.** They are not competing expected sets. `missingServedAssetDirs()` checks
*directory presence*; `COMMENTARIES_DIR` at `scripts/predeploy-gate.ts:90, 169, 210` gates
*content-level* properties (licensing ratchet, forbidden-provenance count, corpus identity, verse-key
distribution) and `blockedBibleTranslations()` at `:140-160` gates *per-work licence records*. Neither
claims to enumerate everything, which is what makes the recurring class a defect. The genuine gap is
narrower and worth recording: **a newly served corpus directory gets a presence check and no licensing
or provenance check at all.** `harmony/` in my seed would have shipped unlicensed.

## 4. `f462114` - a provider outage is NOT RUN. **VERIFIED both directions, with one real laundering path.**

The taxonomy behaves correctly on every case that matters in production:

```
NOT RUN   429 engine_overloaded          RED   401 Unauthorized
NOT RUN   HTTP 500                       RED   400 Bad Request: input too long
NOT RUN   HTTP 503                       RED   403 Forbidden
NOT RUN   connect ETIMEDOUT              RED   SyntaxError: Unexpected token < in JSON  (malformed 200)
NOT RUN   TypeError: fetch failed        RED   embedQuery returned 768 dims, expected 1024
```

and the retry semantics hold: a genuine failure re-throws out of `probeProvider` immediately
(`rejects.toThrow('401')`), a persistent 429 resolves `{present:false, attempts:3}` and reaches
`announceSkip` as NOT RUN, and a transient that clears on attempt 3 resolves `{present:true}` - a
**pass**, not a skip. **Nothing is ever reported as PASS when the provider was unavailable.**

The wiring is right in the way that matters most: `isProviderUnavailable` is applied **only** to errors
thrown out of `embedQuery`, never to assertion failures, so a wrong vector cannot be reclassified.

**Can it launder a real failure? Yes, by one specific route - and it is the mid-run handler, not the
classifier.** `web/test/invariants/section-vector-pairing.test.ts:134-146` returns early on a
mid-run provider error. `failures[]` is asserted only after the loop, at `:165`. So:

> if samples 1..4 genuinely fail the pairing invariant and sample 5 hits a 429, the suite returns
> NOT RUN and **the four real failures are discarded.**

That is a red converted to a skip by a subsequent transient. It requires a real failure plus a blip,
which is not contrived in a suite whose entire existence is owed to how common 429s are here. The fix
is one line: assert `failures` before returning, and announce NOT RUN only for the unmeasured
remainder. NOT BLOCKING, but it is the exact shape the commit set out to avoid, one level up from
where it looked.

Secondary, smaller: `isProviderUnavailable` is a substring test over free-form provider text, and
`UNAVAILABLE_NETWORK` includes `/network/i` and `/timeout/i`. A genuine **non-4xx** failure whose
message merely contains such a word is classified NOT RUN. I confirmed three:
`Model bge-network-v2 does not exist`, `expected 500 sections, got 499`, `invalid field: timeout must
be a number`. **The builder found the 4xx half of this and guarded it**
(`provider-availability.test.ts:52`, "a 4xx that MENTIONS a network word is still a genuine failure");
the non-4xx half has no early return and no test. So on the order's question - was the case that
finally proved the guard the case that matters? - the honest answer is **half of it**. The commit is
candid that its first state 3 stayed green and that it went looking for a load-bearing case; it found
one, and stopped one case short.

## 5. `bf34b21` - `DEPLOY_PREFLIGHT.md`. **VERIFIED as to method, STALE as to four claims.**

Spot-verified as instructed.

**Gate sequence: exact.** Every row of §1 checks out against `deploy.sh`: `set -e` (line 2), clean-tree
via `git status --porcelain` (18), `npx` present (36), Bible count **warns** (46), commentary count
**warns** (52), `DEPLOYING=1 npx tsx scripts/predeploy-gate.ts` (71), `npx next build` (76),
`npx vercel --prod --archive=tgz` (84). Order and refusal semantics both correct, including the
important point that steps 3 and 4 are warnings and not gates.

**"What is uploaded that is not in git": correct**, and the file counts match what I measured on the
deploying machine.

**§8's honesty is confirmed by accident.** It records that `next build` rewrites two **tracked** files.
I hit exactly that: my own baseline build dirtied `web/tsconfig.json` (reformatted, `jsx` changed
`preserve` to `react-jsx`) and `web/next-env.d.ts`. Worth flagging to the owner separately: the
commissioning order's rail 6 asserts these commands "write only gitignored build output", which is
false, and `deploy.sh` step 1 will refuse after any local test build.

**But four claims are stale at the pinned sha, falsified by this range's own later commits.** This is
the document the owner holds during Deploy A:

| line | claim | falsified by |
|---|---|---|
| `:21` | "**Nothing in CI builds the app.**" | `19798ec` |
| `:26-28` | "CI still does not build ... the highest-value follow-up in this document" | `19798ec` |
| `:92-93` | "What it does NOT check: ... that `concordance/`, `lexicon/` and `original/` exist" | `b9ad463` |
| `:106-108`, `:127-158`, `:214-216` | the three dirs are **ABSENT**; checklist item 5 asks the owner to decide about them | `b9ad463` restored all three |

`DEPLOY_PREFLIGHT.md` was written at `bf34b21` and never touched again in the range. NOT BLOCKING - no
claim is *wrong about the world*, they are right about the commit that wrote them - but a preflight
checklist that asks the owner to make a decision that was already made two commits later is the
recurring third shape wearing its clothes backwards: the fix landed and the document the reader
reaches did not move.

## 6. `bf34b21` / `6ab5779` - the rollback target. **The repo is consistent. The claim inside it is FALSE.**

**First, what was asked.** The id appears in exactly five places and **every one is a correction or a
warning**; none uses it as an operative instruction:

```
docs/DEPLOY_PREFLIGHT.md:164-170            "The rollback target id is not established"
docs/RECOVERY.md:34                         "that id does not appear in this repo; use dashboard truth"
docs/RECOVERY.md:40-62                      the BLOCKED block + the dashboard procedure
docs/evidence/.../RECOVERY_VERIFICATION.md:20  the same, as a verification note
```

So on the letter of the order: **VERIFIED.** The correction is where a reader meets the id, and the
id drives nothing.

**Second, and much more important: the correction is factually wrong, and I can settle it.** The block
added at `6ab5779` states the id "appears in **no** Vercel listing" and should be "treated as
unverified". Via this session's Vercel connection, authenticated to the team that actually owns the
project:

```
team   home-network-hardening  (team_TQ3BYCSyzQ3m0yatlkKmUzM0)
project web                    (prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR)

dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt
  state        READY          target production
  alias        ancientpaths.app, www.ancientpaths.app, web-home-network-hardening.vercel.app, ...
  gitCommitSha 24677ba2f706c44d6c9065974f7e2c1b883931fd
  created      2026-07-19 16:57 UTC     ready 2026-07-19 16:59 UTC
  source       cli            action redeploy of dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM (2026-07-18)
```

**The id is real, and it is the deployment currently serving `ancientpaths.app`.** It is not a
phantom, it is not a rollback target, it is the *live production deployment*, and it points at
`24677ba` - the exact sha `STATE_OF_TRUTH.md:278` already names as the live site of record.

The builder's *diagnosis* was right and careful: their local `vercel` CLI is authenticated as
`thomas-5672` against scopes that do not contain this project, and they said so precisely. The
*inference* went one step too far - from "my account cannot see it" to "it appears in no Vercel
listing" - which is a conclusion wider than the evidence, in the commit that is otherwise most
careful about that. Rail 8, in the file about rails.

**What this changes for the owner, concretely:**

* `DEPLOY_PREFLIGHT.md` §7 checklist item 7 ("Record the current live deployment id") is answerable
  now: `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt`.
* The genuine rollback candidates, all `READY`/production/`isRollbackCandidate:true`:
  `dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM` (same sha `24677ba`, 2026-07-18 22:32 UTC) and
  `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` (`654f028`, 2026-07-17 01:32 UTC, i.e. 2026-07-16 local - the
  date `RECOVERY.md` gives).
* "Rolling back to `dpl_DwoW...`" is a **no-op**, because it is where production already is.
* The `RECOVERY.md:40-62` block should be replaced, not amended: its central factual assertion is
  false and it currently tells a reader to distrust the one id that is true.

I made **no** Vercel write: no deploy, no promotion, no alias change, no project setting. Three
read-only calls: `list_teams`, `list_projects`, `list_deployments`/`get_deployment`.

## 7. `f5dd867` - the model-conflict correction. **Architecture VERIFIED. One supporting claim FALSE.**

**The architectural finding is right on all three rows**, checked against the sources it cites:

| row | table says | actually pinned | authority, verified |
|---|---|---|---|
| Embeddings | Jina v3 "(already chosen)" | `BAAI/bge-large-en-v1.5`, 1024-dim | `docs/DECISIONS.md:20` ADR-005, and it explicitly **rejects** "mixing embedding models (breaks comparability)" |
| Reranker | BGE-reranker-v2-m3 / Jina v2 | `Qwen/Qwen3-Reranker-0.6B` | `docs/DECISIONS.md:47` ADR-014, "a **core, non-removable stage**"; shipped at `web/src/lib/teacher/routing.ts:18` |
| Compose | Qwen3 32B | `Qwen/Qwen3.5-35B-A3B` | `docs/DECISIONS.md:20` ADR-005 |

`db/migrations/006` confirms `embedding VECTOR(1024)` with `model_slug` commented
`'bge-large-en-v1.5' (ADR-005, pinned)`. The correction is also filed in the right place - inside
`SERMON_COMPANION.md` §3, above the wrong table, which is the third-shape rule applied correctly.

**The false claim** (`docs/SERMON_COMPANION.md:74-75`): *"the string `jina` appears in **this file and
nowhere else** - no code, no ADR, no migration, no other document."* Measured at the commit that wrote
it, `f5dd867`, and unchanged at `6ab5779`:

```
git grep -li "jina" f5dd867
  docs/SERMON_COMPANION.md
  docs/SLICE1_TRANSLATION_DECISION.md          (written earlier in this range, 0f33fe8)
  docs/pm/MASTER.md
  docs/pm/orders/2026-07-31-search-programme.md (written earlier in this range, f10df90)
```

**Four files, not one, and it was already four when the sentence was written.** The load-bearing half
survives intact - none of the other three is code, an ADR or a migration, and all three are documents
discussing this very contradiction - so nothing downstream is wrong. But "this file and nowhere else"
is an absolute claim that was false at authorship, inside a correction block whose entire purpose is
to be more careful than the thing it corrects.

Second, minor: *"`bge-large` appears in **21 files** of shipped code"* does not reproduce. At
`6ab5779` I count **25** files matching `*.ts|tsx|mts|mjs|sql|json` and **61** files overall. The
number understates rather than overstates, so the argument is unaffected.

Third: *"Jina v3 is also 1024-dim"* is an external fact I cannot check from this tree. **NOT RUN.** It
is load-bearing for the "no error to catch" argument, so it is worth a citation rather than an
assertion.

## 8. `42b2dd7` / `37f3be2` / `ca53457` - B-1 pre-registration. **Numbers VERIFIED exactly. One claim establishable, one not.**

**Which I can establish, and which I cannot - plainly, as asked:**

* **Parser unchanged: ESTABLISHED, from git.** `scripts/slice0-precision.mts` is untouched in the
  range (`git log ac19935..6ab5779 --` returns nothing); its only commit is `56b2967`, long before the
  base. The marker regex at `:42` is **byte-identical** to what `RESULT.md` §1 quotes. The harness was
  not widened to rescue the run, exactly as `PRE-REGISTRATION.md` §2 forbade.
* **Pre-registration before data: NOT ESTABLISHABLE.** Commit times are `42b2dd7` 16:12:50,
  `37f3be2` 16:22:39, `ca53457` 16:25:51. That proves the order of *commits*, not the order of
  *fetches*. It rests on the commit message's attestation and nothing in the repo can corroborate it.
  I note, without accusing, that §3a's third branch anticipates the eventual finding with unusual
  precision ("the eligibility rule ... keys on a stated-text epigraph ... a 19th-century publishing
  convention, not a property of sermons") three minutes before the result landed. Genuine foresight
  and post-hoc framing are indistinguishable from here. The structural fix, if this matters again, is
  to commit a hash of the fetched corpus in the pre-registration commit.

**The numbers verify exactly.** I re-fetched all five CCEL sources live and re-ran the regex, reading
it out of the shipped harness rather than retyping it, so this cannot pass by comparing the doc to a
copy of itself:

```
source                                 lines(mine)  hits(mine)   lines(doc)  hits(doc)   match
Spurgeon vol 10 (positive control)           38791          20        38791         20   YES
Spurgeon vol 13 (positive control)           39864          43        39864         43   YES
Wesley                                       66942           0        66942          0   YES
Edwards                                      18246           1        18246          1   YES
Whitefield                                   30974           0        30974          0   YES

Spurgeon total : 78655 lines -> 63 matches   (doc claims 78,655 -> 63)
Everyone else  : 116162 lines -> 1 matches   (doc claims 116,162 -> 1)
```

Every figure, including the positive control that makes this a finding rather than a broken
instrument. `PRE-REGISTRATION.md` carried the `n=20` floor and the run-is-void rule in its **first**
commit (`42b2dd7:60` and `:33`), and `RESULT.md` invokes both correctly. **This is the strongest piece
of work in the range** - a pre-registered run that failed, reported as a failure, with the tempting fix
explicitly refused.

## 9. `68b14ad` - `METRIC-PROPOSAL.md`. **VERIFIED on all three questions asked.**

* **Does it state what it can and cannot establish?** Yes, in a section headed exactly that (§5), and
  §3 bounds the proposal before §4 defines it.
* **Is its proposed ground truth non-circular?** **No - and the paper says so itself**, which is the
  right answer. §3: both gold and system are "substring-overlap tests on the same text, differing only
  in n and threshold", so "the metric will systematically miss the failure mode it most needs to
  detect: paraphrase." §8 then argues the strongest case *against its own recommendation*. A paper
  that names its own circularity and keeps the old metric as the one non-overlap ground truth (§6) is
  not presenting circular gold as clean.
* **Does it anywhere present an argument as a measurement?** **No.** It opens "A paper, not a run" and
  closes "**Nothing here was measured.** Every number quoted is from Slice 0 or from B-1's
  `RESULT.md`." I traced the quoted figures: the 63-vs-1 pair I re-measured myself above, and the
  82%/65% KJV-vs-WEB swing is at `docs/SERMON_SEARCH_DESIGN.md:212-213`. Correctly attributed.

It also correctly refuses to rule ("Recommended next step - as a proposal, not a decision") and
routes the call to the owner, which is bylaw 5 and the ADR discipline.

## 10. The governance and paper commits - light pass. **VERIFIED with three exceptions.**

The property asked was: no document in this range claims a status its evidence does not carry.

Holding: `d946c14`, `d44c65e`, `ccf7f3c` (its title is literally "four blockers fixed at `03516b6`,
**not yet certified**"), `f10df90`, `3e7f93c` (verified against its evidence file above), `0f33fe8`.
`03516b6`'s own body closes "Per bylaw 4 this does not certify itself ... A1 needs a fresh pair of
eyes before it is declared closed", which is exactly right and is why this file exists.

The three exceptions are §D-1 (MASTER), §B-5 (DEPLOY_PREFLIGHT) and §B-6 (RECOVERY), all above.
Additionally:

* **`94da9fc` carries no `Model:` trailer.** Bylaw 8 and the order's rail 7 require one on every
  commit. Twenty of twenty-one comply; this one does not. It carries
  `Co-Authored-By: Claude Opus 5` and a `Claude-Session:` line, so the model is recoverable, but the
  trailer the bylaw names is absent. Trivial to fix, exact as a finding.
* **`WORKLOG.md` was not touched by any of the 21 commits.** `AGENTS.md:25-26` says "every working
  session appends an entry, newest on top, including a NOT DONE / UNVERIFIED section". The newest
  entry is 2026-07-30; this range spans 2026-07-31 and 2026-08-01. The information is not lost - it is
  unusually well recorded in commit bodies and in `docs/pm/` - but the record of session-level NOT
  DONE now lives in nine places instead of one, and `AGENTS.md` still points a cold agent at
  `WORKLOG.md`.
* **The `OUTCOME:` banners on the two earlier orders are stale.**
  `2026-07-31-weld-finding-and-order.md:1` still says §1 and §2 are NOT DONE (both landed at
  `03516b6` and `3e7f93c`), and `2026-07-31-search-programme.md:1` still says
  "NOT DONE: `DEPLOY_PREFLIGHT.md` (still 25 lines)". Both **understate** what was achieved, so
  neither is a false claim of status in the dangerous direction. Recorded for completeness.

---

# PART C - the standing question: is there a tenth?

**Yes. One, and it is live at the pinned sha, not hypothetical.**

## C-1. THE TENTH INSTANCE - `test/ask-max-duration-literal.test.ts:26-29`

```ts
const ROUTES = [
  'web/src/app/api/ask/route.ts',
  'web/src/app/api/ask/stream/route.ts',
];
```

A hand-maintained expected set, introduced by `c1e359d`, in a file whose own header (`:9-13`) names
this exact defect class: *"The fix inlines `300`, which duplicates a constant - the exact shape this
repo has paid for nine times."* It guards the duplication and does not guard the list.

**It is already incomplete at the commit that introduced it.** A third route segment carries the same
literal and is absent from `ROUTES`:

```
web/src/app/api/ask/route.ts:15         export const maxDuration = 300;   <- in ROUTES
web/src/app/api/ask/stream/route.ts:15  export const maxDuration = 300;   <- in ROUTES
web/src/app/api/eval/bait/route.ts:12   export const maxDuration = 300;   <- NOT in ROUTES
```

`eval/bait/route.ts` is not a stub. Its own header: *"PERMANENT faithfulness (`interpretation_bait`)
harness endpoint ... Runs the REAL `teach()`"*. So the guard's stated rationale - *"`maxDuration` is
the Vercel function ceiling and `ASK_MAX_DURATION_SEC` is the in-process budget ... they are one number
with two consumers"* - applies to it identically, and nothing holds it.

**Live consequence, not a style point.** Change `ASK_MAX_DURATION_SEC` from 300 to, say, 240:
`next build` stays green (all three are literals), the guard stays green (it looks at two files), and
`eval/bait` silently keeps a 300-second Vercel ceiling against a 240-second budget. That is precisely
the drift the test was written to prevent, in a route that runs the real pipeline.

**Red-proved.** I added a fourth ask route exporting `maxDuration = ASK_MAX_DURATION_SEC`:

```
guard test with a third/fourth route present -> Test Files 1 passed | Tests 3 passed
```

The guard does not notice. Reverted; tree clean.

**Derivable in the same idiom the same tranche already used.** Glob `web/src/app/**/route.ts`, take
every file containing `export const maxDuration`, assert each is a numeric literal equal to
`ASK_MAX_DURATION_SEC` - which is `servedAssetDirs()`'s discipline applied to routes instead of asset
directories. Deletion is not available here (the property is real), so derivation is the remedy.

## C-2. What else I searched, and found clean

* **Every literal array/Set added in the range**, extracted mechanically from the diff. Besides
  `ROUTES`, the only additions are local working sets inside functions
  (`gate-leg-inventory.mjs:63-64` counters, `:76` the union under test, `served-assets.mjs:38,66`
  accumulators, `loud-skip.ts` the concatenation of three already-typed groups). None is an expected
  set standing in for a source of truth.
* **`REQUIRED_GATE_PREFIXES` remains typed** at `gate-leg-inventory.mjs:6` - deliberately, and now
  compared against a derivation with a red-proof either way. Not an instance; the closure.
* **Mirrored predicates: none introduced.** `codeOnly` was moved into `scripts/lib/source-scan.mjs`
  and is genuinely **imported** by both consumers (`gate-leg-inventory.mjs:3`,
  `test/prod-path-no-transpiler.test.ts:25`) - the opposite of the class. `isWeld` was hoisted from
  two copies in the repair tool into one exported function that both call. Both are the discipline
  working.
* **Corrections filed where the reader will not reach them: none.** `3e7f93c` put the chrysostom
  correction in the ADR-029 addendum where the "+16" story lives; `f5dd867` put the model correction
  above the wrong table; `6ab5779` put the rollback correction at all four places the id appears.
  This range is notably good at the third shape. Its failures are the *converse* - fixes landed
  without updating documents that describe the old state (§B-5, §D-1).

**One near-miss, recorded and dismissed.** `web/test/invariants/wallet.test.ts:11` defines its own
`codeOnly`, while `source-scan.mjs:3` claims "ONE definition". They are **different rules**
(whole-line stripping versus block-plus-trailing with a `://` guard), deliberately so, and
`wallet.test.ts` predates this range. Not a copy, but the name collision will mislead someone, and
"ONE definition" is an overclaim.

## C-3. Two checks with no check on them

Not one of the three named shapes, so not counted as an instance - but the same disease:

* **The weld leg has no test.** `grep -rn "isWeld|cohortWeldSql|weldRows|WELD" web/test test` returns
  nothing. I gutted `isWeld` to `return false` and the unit-ordinal suite's result was unchanged
  (`1 failed | 14 passed`, that one failure being my own bystander seed), and the preflight suite
  stayed `9 passed`. Because the leg is documented as unable to fail alone, a silent regression in it
  would never change any gate's colour.
* **`scripts/lib/served-assets.mjs` has no test either**, and `predeploy-gate.ts` runs only in
  `deploy.sh:71` and `.githooks/pre-commit:51` - never in CI. A regression in `SERVED_JSON` or
  `DYNAMIC_ROOT_PATH` surfaces for the first time during a deploy.

Both are new load-bearing code shipped in this range with a one-time red-proof and no standing one.

---

# PART D - the disputed claims, adjudicated independently

## D-1. Is `docs/pm/MASTER.md` currently accurate? **No, on all four points.**

MASTER was last edited in this range by `68b14ad`, four commits before the tip.

| MASTER says | truth at `6ab5779` | verdict |
|---|---|---|
| `:6` working branch @ `ac19935` | tip is `6ab5779`; PR #48's head is `b2bd2c0` | **stale by 21 commits** |
| `:61-62` "`DEPLOY_PREFLIGHT.md` is still 25 lines (NOT DONE, carried)" | **241 lines**, rewritten at `bf34b21` | **false when last written**, not merely stale - `bf34b21` precedes `68b14ad` |
| `:115-119` "`next build` is not in CI ... the highest-value open follow-up in this repo" | in CI since `19798ec`, and it executed at the pinned sha | **stale** (true when written) |
| `:97` "Eight instances so far" | `b9ad463` declares itself the **ninth**; and §C-1 above is a tenth | **stale** |

Two further points on the instance count, since the order asks specifically:

* **MASTER is not reconcilable with itself.** `:99-103` names **ten** artefacts across the two shapes
  (7 + 3) against a stated count of eight. The search-programme order already caught this and said so
  rather than inventing a numbering, which was the right call; the discrepancy is still there.
* **`:40` and `:61-62` contradict each other about the same file** - "Preflight now measured, not
  guessed" pointing at `DEPLOY_PREFLIGHT.md`, twenty lines above "still 25 lines (NOT DONE)".

This matters more than ordinary doc drift because `AGENTS.md:22-23` and MASTER's own line 3 tell every
agent to read it first, every session. **A gate board that is stale about its own gates is the
failure mode the board exists to prevent.**

## D-2. Can `STATE_OF_TRUTH.md:284` and `SERMON_SEARCH_DESIGN.md:3` both be true? **Only on a reading nothing in the tree supports.**

```
STATE_OF_TRUTH.md:284     "docs/SERMON_SEARCH_DESIGN.md is the approved design"
SERMON_SEARCH_DESIGN.md:3 "Status: DESIGN - for the owner to react to, NOT approval to build."
```

They are reconcilable only if "approved" means "the design of record" rather than "approved to build".
**Nothing states that reading, and the surrounding evidence cuts against it:** there is no ADR
approving sermon search (`grep "^## ADR" docs/DECISIONS.md` finds ADR-004 and ADR-023 on adjacent
topics, neither an approval), and MASTER's own Lane B board still lists B1, B2 and B3 as **OPEN owner
decisions** gating the build.

`AGENTS.md:24` tells agents "Trust it over any doc's narrative", pointing at `STATE_OF_TRUTH.md` -
which on this one point is **the less accurate of the two**. An agent obeying the instruction reaches
the wrong conclusion. NOT BLOCKING and **not introduced by this range** (both lines predate `ac19935`),
so it is a standing defect these commits did not create and did not fix. One word - "approved" to
"design of record" - settles it.

## D-3. Does the `SERMON_COMPANION.md:63-101` block contain any claim that is itself false? **Yes, one.**

The "`jina` ... appears in this file and nowhere else" sentence, false at the commit that wrote it -
four files, measured above at §B-7. The architectural finding it supports is correct and unaffected;
the absolute is not.

## D-4. Does `docs/pm/orders/` contain anything readable as a post-fix certification? **No.**

I read all five files in the directory at the pinned sha. The only text that comes close is the
`OUTCOME:` banner on `2026-07-31-search-programme.md:1`, which opens **"Lane A A-1..A-4 CLOSED at
`03516b6`"**. Those are the first six words a reader sees. But the same sentence qualifies itself
before its own closing bracket: *"(gate A1 FIXED-not-certified, awaiting independent audit + owner
merge of PR #48)"*. `ccf7f3c`'s commit subject does the same work ("four blockers fixed at `03516b6`,
**not yet certified**"), MASTER `:60-62` says A1 stays OPEN under bylaw 4, and `03516b6`'s own body
says it does not certify itself.

**So: no certification exists, and the record is unusually careful to say so.** My answer to this
sub-question does not change the answer to the order. I note only that these banners are written by
the session that did the work and are the first line of the file, so "CLOSED" carries further than its
parenthesis on a skim.

---

# COVERAGE - what I did not touch, could not reach, and what this report therefore does not prove

**Not executed at all:**

* **Any project database.** No production, correctly and by rail. No dev, because it is unreachable:
  no `.env.local` in any clone, `NEON_API_KEY` unset locally. Every DB result here comes from a
  throwaway local PostgreSQL **14** with a hand-transcribed subset of the schema - `sources`,
  `sections`, `section_anchors` only; no pgvector, no `embeddings`, no `commentary_entries`, no RLS,
  no `app_runtime` role. SQL valid there can still fail on Neon.
* **The 61,486-row repair**, on either endpoint. Stated above as NOT RUN.
* **`scripts/cutover-regression-gate.mts` end to end**, and `scripts/cutover-gate-redproof.mjs`. I
  proved the leg inventory's declaration property against the real gate source and seeded a real leg
  into it, but I did not run the gate, which needs a full cutover schema and checkpoint state. The
  tail logic is UNVERIFIED by execution - the same gap the previous auditor recorded.
* **The live `/api/ask` path, G4 and G7.** Untouched, as they have always been.
* **`vercel --prod`.** No deploy, no promotion. My Vercel calls were four read-only listings.

**Executed, and green:** `npm run audit` at the pinned sha, **EXIT=0, "AUDIT PASSED - all gates
green"** - which the previous auditor could not run (deps not installed). Plus `cd web && npx next
build` EXIT=0, the full root suite (400 passed | 1 skipped), and the web invariants suite.

**Examined but not exhaustively:** the gate's other 80-odd legs individually; Tranches 6 and 8; the
`SLICE1_TRANSLATION_DECISION.md` paper (read, not adjudicated - it is a B4 options paper for the owner
and this order did not ask me to rule on it); `CONSOLIDATION.md`; everything outside the 21-commit
diff.

**What a clean report here does not prove:** that the repair did what its doc says on the two real
databases; that the cutover gate refuses in a real run; that Deploy A succeeds. It proves that the
four blockers' fixes **can fail on the defects they name**, re-executed by someone who did not write
them, and that the 21 commits' factual claims hold except where named above.

**Credentials that would have closed the gaps:** a read-only `app_runtime` URL on `ep-tiny-hat` (the
61,486 figure), and a cutover checkpoint fixture (the gate's tail logic). Nothing else was blocked by
authorization.

---

# Is A1 closed, and may PR #48 merge?

**Yes: A1 is closed and PR #48 may merge - the four blockers hold under independent re-execution, and
nothing I found is worth holding the merge for.**

---

# The receipt

```
HEAD:        6ab57793bfba4ae5881c04074d3afb03b3494258   (audited)
             b2bd2c0392faa6df743603067f8272569106e87b   (branch tip; adds only this audit's own
                                                         commissioning order - out of scope, unaudited)
CI:          audit=success  db-invariants=success       (run 30675045383, push, 2026-08-01T00:14:40Z,
                                                         `gh run view`, both jobs by name)
             audit=success                              (run 30676588980, at b2bd2c0)
             main is UNPROTECTED: required_status_checks.contexts=[], enforcement_level=off;
             /rulesets 403s on this plan. Neither job is a required check.

RED-PROOFS:  scripts/cutover-regression-gate.mts   -> seeded a real `pass('G11 seeded leg')`
                                                   -> 1 failed | 9 passed -> reverted -> 10 passed
             scripts/cutover-regression-gate.mts   -> seeded an ALIASED leg (const legReport = pass)
                                                   -> 10 passed (guard does NOT fire; residual)
             web/test/invariants/unit-ordinal-instrument.test.ts
                                                   -> bystander `clean-work` NULL,2,3; at 6ab5779 the
                                                      leg is RED and the bystander is untouched;
                                                      revert the scoping -> bystander healed to 1,2,3
                                                      and the leg goes GREEN (unearned) -> re-applied
             scripts/lib/unit-ordinal-instrument.mjs (weld leg, via measurePublishedUnitOrdinal)
                                                   -> seeded two runs of one bare heading, deleted the
                                                      rows between -> stored_units=2 computed_units=1,
                                                      welds=1, ok=false, "WELD ... MERGES units"
                                                   -> reverted -> 3/3, welds=0, ok=true
             scripts/lib/unit-ordinal-instrument.mjs -> isWeld gutted to `return false`
                                                   -> NO test anywhere changes colour (residual)
             web/src/app/api/ask/{route,stream/route}.ts
                                                   -> restored the identifier export
                                                   -> next build EXIT=1 "Invalid segment configuration"
                                                      AND guard 2 of 3 FAILED -> reverted -> EXIT=0, 3 passed
             web/src/lib/<new file>                -> fetch(`/harmony/${id}.json`), no list touched
                                                   -> predeploy-gate NAMES `harmony` -> reverted
             web/src/lib/<new file> x4             -> variable-first-segment paths via a variable, useSWR,
                                                      concatenation, new URL()
                                                   -> assertServedAssetsScannable does NOT refuse (residual)
             web/src/app/api/ask/summary/route.ts  -> a third/fourth maxDuration route
                                                   -> guard stays 3 passed (THE TENTH INSTANCE) -> reverted

RE-MEASURED (not seeded):
             both versions of scripts/lib/unit-ordinal-instrument.mjs loaded side by side at 6896714
               and ac19935: cohort recompute SQL identical, 2790 == 2790; analysis fns identical
             all five CCEL sources re-fetched live, regex read from scripts/slice0-precision.mts:42:
               every count in RESULT.md reproduces, including the 63-match positive control
             docs/evidence/part2/nonauthorial-matter-suppressed.jsonl: 6 chrysostom rows, all
               unit_ordinal=275, ordinals 6608-6613
             ~/Projects/ancient-roads-git/web/public (read-only): concordance 295, lexicon 2,
               original 1189, bible 22590, commentaries 1213
             Vercel, read-only: dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt is READY/production, aliased to
               ancientpaths.app, sha 24677ba, created 2026-07-19 16:57 UTC

LOCAL GATES: npm run audit            EXIT=0   "AUDIT PASSED - all gates green"
             cd web && npx next build EXIT=0
             root suite               400 passed | 1 skipped
             (note: next build rewrote TRACKED web/tsconfig.json + web/next-env.d.ts; reverted.
              The order's rail 6 is wrong that these write only gitignored output.
              DEPLOY_PREFLIGHT.md:234-236 already records this.)

EVIDENCE:    docs/pm/orders/2026-08-01-stop-verdict-a1-closure.md   (this file, the only path committed)

MODEL:       claude-opus-5

DIRTY:       (empty)
```

---

# Three questions, in my own words

**1. What did you change that you were not asked for?**

Nothing in the repository except this file. No product code, no document, no fix - including the ones
that are a single character, because rail 4 says name them and let the record show the builder closed
them. Every seed I applied went into a scratch clone and was reverted, with `git status --porcelain`
empty after each; the builder's working tree at `~/Projects/ancient-roads-git` was read once and never
written. Outside the repo I created a throwaway PostgreSQL cluster in a scratch directory, which I am
leaving running in case any of the above needs reproducing, and I made four read-only Vercel API calls
and one read of the CCEL public-domain texts. No Vercel write, no GitHub write beyond pushing this
file, no database anywhere but the throwaway one.

**2. What did you find that is not in this order, and that the owner would want to know?**

Three things, in the order I would want them.

**The rollback id is not a phantom - it is your live site.** `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` is
READY, production, and currently aliased to `ancientpaths.app`, deployed 2026-07-19 from `24677ba`.
The repo now carries a prominent block telling a reader to distrust it. That block is wrong, and it is
wrong in the most expensive direction: it tells the owner the one true id is folklore, three documents
deep, right before a deploy. The builder's reasoning was sound and their tool genuinely could not see
it - the `vercel` CLI on that machine is on a different account - but "my account cannot see it" became
"it appears in no Vercel listing", and that is a conclusion wider than the evidence. Your real rollback
candidates are `dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM` (2026-07-18, same sha) and
`dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` (`654f028`). Also: `DEPLOY_PREFLIGHT.md` §7 item 7 is now
answerable, and "roll back to `dpl_DwoW...`" would be a no-op.

**`main` has no protection at all, and I would not have guessed it from the repo.** Enormous care has
gone into making CI honest - fail-closed on a missing secret, a skip ceiling, loud NOT RUN, and now a
build step - and none of it can stop a red commit reaching `main`. That is a legitimate choice for a
one-owner repo, but it means every "nothing merges red" sentence in `BUILD_MODEL.md` §4 is a statement
about discipline, not about mechanism, and the discipline is the thing that failed on 2026-07-28 when
five commits sat on a branch having triggered zero workflows. Rulesets are unavailable on this plan;
classic branch protection on a private repo is not. One toggle.

**The document you will be holding during Deploy A describes a world two commits old.**
`DEPLOY_PREFLIGHT.md` still says nothing in CI builds the app (fixed at `19798ec`), still says the
gate does not check for `concordance`/`lexicon`/`original` (fixed at `b9ad463`), and still asks you, at
checklist item 5, to decide what to do about three directories that `b9ad463` restored. `MASTER.md` is
worse in one respect: at the moment it was last edited, `DEPLOY_PREFLIGHT.md` had already been 241
lines for two commits, and it still says "still 25 lines (NOT DONE, carried)" twenty lines below its
own "Preflight now measured, not guessed". None of this is dangerous on its own. All of it is the
recurring class in its least-examined direction: the repo is disciplined about putting *corrections*
where the reader meets the wrong version, and much weaker at updating the *description* when the fix
lands somewhere else.

Smaller, but I would still want to know: a real red in the section/vector pairing suite can be
converted to NOT RUN by a provider blip that happens after it
(`section-vector-pairing.test.ts:134-146` returns before asserting `failures`). And `WORKLOG.md` has
had no entry since 2026-07-30, across two days and 21 commits, while `AGENTS.md` still sends every
cold agent there first.

**3. Where were you tempted to assert a property rather than prove it?**

Four places, and I want them on the record because in three of them the temptation was strong.

**B-4, hardest.** The weld leg is well-written, thoroughly commented, and honest about its own limits,
and the commit body describes a red-proof in enough detail that re-running it felt like ceremony. That
is exactly the reasoning THE_LOOP rule 4 exists to refuse, so I built the fixture and drove the
committed instrument. It fired. But building it is also what surfaced §C-3 - that nothing tests the
leg - which I would not have found by reading, because reading a good file tells you it is good, not
that it is unguarded.

**B-3.** The one-line diff is visibly correct, and the comment above it explains the defect better than
I would have. I nearly recorded it as verified-by-inspection. Standing up a real Postgres to watch a
bystander source heal took most of an hour and produced the single most convincing artifact in this
report - the middle row of that table is the unearned green, reproduced.

**The B-1 rival explanation.** The previous auditor had already ruled it out and published the numbers;
the order specifically told me not to trust that, and I can see why. Loading both versions cost five
minutes and turned an inherited conclusion into my own. The `2790 == 2790` reproducing exactly is worth
more than a citation of it.

**The one I did not resist, and should name.** For `f5dd867`'s claim that Jina v3 is 1024-dimensional,
I have no way to check it from this tree and I have marked it NOT RUN rather than nodding it through -
but I notice I was inclined to nod, because it is the sort of fact that sounds right and the argument
around it is otherwise sound. It is load-bearing for the "there is no error to catch" reasoning, so it
deserves a citation rather than an assertion. I have left it unresolved rather than pretend either way.
