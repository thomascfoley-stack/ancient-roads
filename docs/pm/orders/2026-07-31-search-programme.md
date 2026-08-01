OUTCOME: Lane A A-1..A-4 CLOSED at `03516b6` (gate A1 FIXED-not-certified, awaiting independent audit + owner merge of PR #48). A-4's premise was corrected on measurement — the weld was already detected by the grouping-break leg, so the leg shipped as diagnosis, not detection. NOT DONE: `DEPLOY_PREFLIGHT.md` (still 25 lines), A-5..A-8, and all of Lane B (blocked on owner decisions B1/B2/B3). Filed 2026-07-31.

# ORDER — the search programme

**Status:** ISSUED. Filed per bylaw 1.
**Supersedes:** nothing. **Blocks:** nothing yet — every tranche below names its own gate.
**Model pin:** strongest available. Not auto, not fast. Every commit carries `Model:`.

This order covers what the owner named as the next build: **search, sermon search, filters, hymns.**
It is written after reading the current tree at `94da9fc`, not the pre-consolidation tree.

**Read this section before anything else: none of the four can start cold.** Every one of them is
behind a gate that is open today. This order therefore does two things — it closes the gates that
are closeable without an owner decision, and it sequences the rest so that when a decision lands,
the work behind it is already specified. It does not order a single line of search feature code.

---

## §0 Rails

Unchanged from the Stage 2 rails, and in force for every tranche here:

- **No production connection of any kind.** No reads, no writes. Bylaw 7: any prod connection needs
  the owner's explicit go, per occasion.
- **No writes to any database** except a throwaway local cluster or, once B1 lands, the Neon dev branch.
- **No publish flip. No Neon branch create or delete. No merge.**
- **Re-execute, do not read.** A committed log is not evidence that a check can fail. Seed, watch red,
  revert, verify the revert is clean. Anything you could not execute is **UNVERIFIED, not passed.**
- **Fixer ≠ verifier** (bylaw 4). No tranche below is certified by the agent that built it.
- **Least code** (bylaw 3). A fix must state what it costs to *not* fix it. Deletion is an allowed remedy.
- **A property is not an implementation** (bylaw 5). Where this order states a property, the builder
  chooses the mechanism and red-proves it.

---

## §1 What this order explicitly does NOT do

Recorded so no agent infers scope from silence.

1. **It does not order the Bible text plane into Postgres.** There are no `verses`/`books`/`translations`
   tables; Bible text is static JSON under `web/public/bible/`, fetched client-side. Verse keyword
   search, topical retrieval ("verses about stealing"), real verse counts for the resolver, and
   testament/book facets over Bible text all sit on that missing plane. **Design only this run** — see
   Tranche A-5. Rationale in §3.
2. **It does not order Slice 1 code.** Blocked on B1 (dev branch), B2 (embedding model), B3 (Vercel Pro),
   B4 (translation), and now the uncited-anchor ruling in §2.
3. **It does not file hymns under Lane B.** Per ADR-023 hymns are register-lane work in **Lane A**,
   downstream of A6/A7. Commissioning them under a sermon-search heading would mis-file them.
4. **It does not widen `hybrid_search()`.** Migration 004 restricts both legs to
   `source_type = 'commentary'`, so sermons, hymns and theology are invisible to it. Widening it is a
   retrieval change and triggers the full accuracy re-run under CLAUDE.md. Specified in Tranche A-6,
   not ordered.
5. **It does not merge PR #48.** That is A1's closure condition and an owner call.

---

## §2 Owner decisions

### Already ruled — carry it forward

**Uncited shingle hits stay measurement-only.** The standing WORKLOG rule holds: *"Uncited matches are
used for MEASUREMENT only — never written as anchors (an anchor row is a fact; a shingle hit is a
probability)."* `channel='uncited'` rows may **not** be written into `user_section_anchors`.

**The consequence, stated plainly because it is severe and the ruling may have been made without it.**
The uncited channel is the load-bearing one. Slice 0 measured **90% chapter-level recall** through it;
the explicit channel scored **0%**, because in the whole test corpus *"the only explicit citations …
are the 17 header lines."* So holding the rule removes the input to `traditionGap` — the moat feature —
unless the design changes. Two ways to keep both the rule and the feature:

- **(a) Query-time only.** Shingle hits are computed on read and never persisted. `traditionGap` joins
  against them in-request. Preserves the rule absolutely; costs latency and re-computation.
- **(b) A separate measurement-typed store.** A table that is not `user_section_anchors` and is named so
  no read path can mistake it for fact, carrying `channel` and the `K` that produced it. Every consumer
  must opt in explicitly.

Tranche B-3 designs both and costs them. **If the intent was "uncited hits are fine as long as they're
typed," say so now** — that is a different ruling and it changes Slice 1's data model.

### Outstanding — this order does not make them

| # | Decision | Blocks | Note |
|---|---|---|---|
| B1 | Neon dev branch for Lane B | all Slice 1 code | migration 013 stays `.sql.draft` until it exists |
| B2 | Confirm `BAAI/bge-large-en-v1.5` on DeepInfra | all Lane B | `SERMON_COMPANION.md` §3 still says "Jina v3 (already chosen)" — a stale contradiction this decision must also settle |
| B3 | Vercel Pro | Lane B ingestion queue | hobby cron is daily |
| B4 | Shingle against the user's translation, or all | Slice 1 + K | **the options have never been written down** — the design doc points at a "§ below" that does not exist. Tranche B-2 authors them |
| 4 | Front-matter gating: all admitted hits stop, or strong-only | merge of `origin/wip/front-matter-strength` | this is a *filter* behaviour decision and blocks part of the filters work |
| — | **Instance nine**: a mechanical check, or explicit acceptance | nothing, but MASTER demands a deliberate decision | Tranche A-4 |
| — | **A1 merge scope**: the verdict's "what I would do" names only B-1/B-2/B-3 and never restates the recommendation with B-4 included. MASTER treats all four as blocking. | PR #48 | resolve before merging |

Also still owed by the owner and blocking Cursor's §1: `WORKORDER_V2.md`, `PROGRAM_BRIEF.md`,
`2026-07-31-strategy-two-lanes.md`. The MASTER index currently points at `AP_WORKORDER_V2.md`, which has
never existed. Do not repoint it at another phantom — mark it NOT YET FILED until the real file lands.

---

## §3 Recommendation: the Bible plane is design-only this run

The owner asked for a recommendation. This is it, with the reasoning exposed so it can be overruled.

**Not Tranche 0.** MASTER already says *"nothing in this pipeline has ever run successfully on
production. E5 never ran. Whether `deploy.sh` works end-to-end is an open question."* Adding a full
Bible ingest — a large owner-applied migration plus a bulk data load — in front of a pipeline that has
never completed once puts two irreversible unknowns in flight together. That is bylaw 6 inverted: it
maximises blast radius at the moment of least evidence, and if something breaks you will not know which
one broke it.

**Not out of scope either.** Every downstream design decision depends on the answer. Facet backing,
omnibox intent 2, topical routing, the resolver's verse-count sentinel (*"Chapter-granularity ranges end
at verse 999 (sentinel) until the verses table supplies real counts"*) — all of them are specified
differently depending on whether verses live in Postgres. Leaving it undecided leaves the whole search
programme half-specified and invites a fifth phantom pointer.

**So: design it, cost it, write the migration and its red-first test, apply nothing.** That matches the
repo's own division of labour — *"Agents write migration SQL and its red-first test; the owner applies
it."* It also forces the cheaper question onto paper first: **does the Bible plane need to be in
Postgres at all,** or does a static-JSON-plus-index approach satisfy every named requirement? That
question has never been asked in writing and it may delete the tranche entirely, which is the best
possible outcome under bylaw 3.

## §3b Recommendation: two lanes, and two is the ceiling

Run **A1 closure** and **ungated Lane B prep** as parallel, file-disjoint tracks per BUILD_MODEL §2.
They touch no common files: Lane A is `scripts/lib/*`, `web/test/invariants/*`, `docs/STATE_OF_TRUTH.md`;
Lane B is `docs/SERMON_SEARCH_DESIGN.md`, `docs/SLICE_1_DATA_MODEL.md`, a new eval harness, and new tests.
Their blast radii differ usefully — Lane A is prod-adjacent, Lane B touches no database it does not create.

**Do not open a third lane.** The binding constraint is the owner's review bandwidth, not agent
availability. Two lanes is already at the ceiling for one reviewer who reads every diff.

---

# LANE A — close A1

Four blockers. All are narrow and independently checkable. The verdict estimates B-1 through B-3 at
about an hour.

## Tranche A-1 · B-1 · record the causal sentence

**Property:** the red→green flip of `db-invariants` is recorded in the repo, not only in an audit report,
in a form that survives GitHub Actions log expiry.

The sentence to record, from the verdict: `db-invariants` failed at `6896714` (run 30613713514) on
exactly one test — the published-work `unit_ordinal` leg, naming six works with non-uniform offsets —
and passed at `ac19935` (run 30650159435). **The measuring code is identical across the two runs.** It
went green because `scripts/repair-unit-ordinal.mjs` rewrote 61,486 sections on `ep-tiny-bonus` /
`ci-test-20260729` and on `ep-tiny-hat` (dev). **The data moved, not the code.**

Must also carry the §A-5 clause: the repair's selector is *any* stored≠computed difference, which is
broader than the instrument's failure condition — which is why **seven** works were repaired and **six**
failed CI.

**Lands in:** `docs/STATE_OF_TRUTH.md` §2e and the Stage 2 evidence README, naming both endpoints and
both SHAs.
**Why it blocks:** without it, a red→green transition sits immediately beside a 56-line change to the
library doing the measuring. That is the most natural wrong conclusion available and the diff actively
invites it.
**Carry forward as UNVERIFIED:** the 61,486 figure rests on the tool's own log — the auditor had no dev
credentials. Do not upgrade it to verified without re-execution.

## Tranche A-2 · B-2 · derive the gate legs, or say they are not derived

**Property:** `REQUIRED_GATE_PREFIXES` is derived from the gate, or the file states in terms that a
reader cannot miss that it is not.

Today `scripts/lib/gate-leg-inventory.mjs:5` types the list out, and the test that validates it builds
its reported set *from the same constant* (`const reported = new Set(REQUIRED_GATE_PREFIXES)`) — it
compares the list to itself.

**Minimum acceptable fix, per the verdict:** a test that parses `pass()`/`fail()` call sites out of
`cutover-regression-gate.mts` and asserts set equality with `REQUIRED_GATE_PREFIXES ∪
OPTIONAL_GATE_PREFIXES`. The auditor's `derived-leg-check.mjs` does this in 25 lines. **Also fix the
test itself.**
**Red-proof:** seed a `G11` leg; the derived check goes red while the committed check stays green;
revert; confirm clean.
**Do not silently widen scope:** `recordGateLeg` records `gateName.split(/\s/)[0]`, so the inventory can
detect 10 possible silences out of 85, and only when an entire family goes quiet. That narrowness is a
separate finding — record it, do not fix it here.
**Why it blocks:** this is the eighth occurrence of a class this repo has paid for seven times, and it
was introduced *by this stage*.

## Tranche A-3 · B-3 · scope the perturbation suite's backfill

**Property:** a test writes only to the fixtures it owns.

`web/test/invariants/unit-ordinal-instrument.test.ts` seeds `qa-uoi-seed-<runid>` but its `runBackfill()`
executes the **unscoped** 024 backfill, whose `need` CTE selects *every* source with a NULL
`unit_ordinal`. Demonstrated: `before: clean-work unit_ordinals = NULL,2,3` → `after: 1,2,3`.

**Fix:** one line — swap the unscoped 024 `need` selector for the slug-scoped one the repair tool
already provides.
**Why it blocks:** it runs on the CI branch and on dev, writes to sources it does not own, and can
silently destroy the NULL drift the published leg exists to catch. A test that repairs the defect it
measures is the unearned-green failure mode THE_LOOP §6 is named after. The verdict logs this as a
**new third shape** on the watchlist.

## Tranche A-4 · B-4 · the weld check, and the instance-nine decision

**Property (weld):** the weld guard is where a gate runs it, or it is deleted from the tool and a named
owner holds the recurrence hazard. Both are permitted outcomes; silence is not.

What was ordered: report `stored_units`, `computed_units` and equal-or-not per work, in
`scripts/lib/unit-ordinal-instrument.mjs`, which already runs in CI with database access. What landed:
the comparison exists **only** in `scripts/repair-unit-ordinal.mjs`, with no test and no gate calling it.
The guard itself is correct — it refused a seeded weld with `WELD_RISK` and `EXIT=1` under `--apply` —
but per the verdict, *"I am currently the only red-proof this guard has."*

**Red-proof required:** seed two separated runs of an identical bare heading, delete the rows between
them, confirm a unit-count decrease is reported; revert; watch it report equality.
**Why it blocks:** the hazard is documented as recurring — *"Scripts that delete sections after backfill
silently invalidate stored `unit_ordinal` … will recur on the next post-backfill delete."* When it
recurs, the only thing distinguishing safe renumbering from a destructive weld is a script no gate calls.
**Ride-along (N-5):** the weld predicate is written twice in the repair tool — line 165's report flag and
line 172's abort filter. Hoist it into one named constant.

**Also unmet from the same order, and cheap:** the chrysostom record still shows a uniform +16 where the
truth is **two deletion points, deltas (16, 17)** — no `docs/*.md` mentions the second. And
`DEPLOY_PREFLIGHT.md` is still 25 lines.

**Property (instance nine):** the repo either has a mechanical check for hand-maintained expected sets,
or an explicit, filed acceptance that the class recurs and audits catch it. MASTER is unambiguous:
*"Instance nine is not a strategy."*

The discriminator the verdict isolates is *"whether the author derived the expected set from a source of
truth or typed it out,"* with two positive exemplars already in the tree — `sourceStatusCohorts()`
parsing the `CHECK` constraint out of `023_sources_status_ingesting.sql`, and `backfillSqlFromMigration()`.
Both read the migrations instead of retyping them. The builder proposes the mechanism; do not accept one
that is itself a hand-maintained list of things that must not be hand-maintained.

**Note for the order file:** MASTER counts eight instances; the artefacts it names total ten across two
shapes. The mapping is not reconstructable from the filed documents. State that rather than inventing a
numbering.

## Tranche A-5 · the Bible plane, on paper only

**Property:** a filed design that answers, with costs, whether the Bible text belongs in Postgres — and
if it does, ships the migration SQL and its red-first test, unapplied.

Must answer, each in writing: (1) what breaks today because the plane is missing — verse keyword search,
topical retrieval, testament/book facets, the verse-999 sentinel; (2) whether each of those can be
satisfied without the plane; (3) row counts, index sizes and embedding cost if it is built; (4) the
interaction with ADR-004 (search core on public-domain text only) and with per-translation licensing;
(5) whether Bible text would be embedded, and what that does to the corpus HNSW that already starves at
`ef_search=40`.
**Applies nothing.** Ends with a recommendation the owner can rule on.

## Tranche A-6 · specify, do not build, the corpus-wide search widening

**Property:** a filed specification for making sermons, hymns, theology and poetry reachable by search,
with the eval consequences named up front.

`hybrid_search()` restricts both legs to `source_type = 'commentary'`. ADR-023 requires that widening
respects register lanes with a two-leg wall (register column + work slug) on both the vector and FTS
paths, and that the exegetical pool stays verse-commentary + fathers only.

Must name: the frozen eval set this change would be measured on and why it is not v3 or v4; the
pre-registered bars; the fact that CLAUDE.md requires an accuracy diagnostic recorded in WORKLOG on
every retrieval change. Must also record the two conflicting FTS semantics already in the tree —
migration 004 moved to `plainto_tsquery` (OR) while the catalog design prescribes `websearch_to_tsquery`
(AND) — and pick one, with the reason.
**Blocked from execution behind A1.** Specification only.

## Tranche A-7 · specify the filter substrate

**Property:** a filed specification of every facet, its backing column, and whether an index exists.

Facets designed: scope, tradition, era, source_type, author, century, register/lane, testament/book,
status. Facts from `SCHEMA_AS_BUILT.md`: `sources.tradition`, `.era`, `.author`, `.source_type` and
`.status` have **no indexes**. `register` and `work` appear only inside partial-index *predicates*, not
as queryable indexed columns. Testament/book is real at section grain via `anchors_range_idx` but has no
Bible-text backing.

So every fast facet is a migration, and migrations are owner-applied. Specify them; apply none. Note
that owner decision 4 (front-matter gating: all admitted hits stop, or strong-only) determines filter
behaviour on apparatus hits and is still open.

## Tranche A-8 · hymns — the honest split

**Property:** the trivial part is separated from the new build, and only the trivial part is proposed for
early execution.

- **Trivial (wiring):** the Hymns vs Poetry sub-filter is `source_type IN ('hymn','poetry')` — both are
  already valid `CHECK` values, and `idx_embeddings_vector_song_verse` already exists.
- **New build:** the Hymns & Poetry catalog page itself, its facets, and search within it. All of it is
  downstream of the library catalog work, which is `LIBRARY_READER_DESIGN.md` status *"design (not
  built)"*, which is downstream of A6/A7.
- **Absent entirely:** metre, tune, first-line, hymnal number. No such columns exist anywhere. If hymn
  search is meant to include them — and for pastors choosing hymns, first-line and metre are the two
  fields that matter — that is a corpus metadata project, not a search project. **Name it or drop it.**

Corpus constraint that applies the moment hymn files change: the Tranche 4 gates fire on *"an AUTHOR
removed from every chapter file — no file count changes at all"* and *"no previous manifest is a REFUSAL
at deploy."* Any hymn corpus change must carry a manifest.

---

# LANE B — ungated prep only

Every tranche here is executable **today**, with no owner decision and no database the agent does not
create itself. Precedent for the last point: the Stage 2 auditor ran a throwaway PostgreSQL 15 cluster
on port 55432 with the schema transcribed from migrations 006, 023 and 024.

## Tranche B-1 · re-validate K on a fresh held-out set

**Property:** the shingle threshold K is chosen on data it was not read off.

This is the design doc's own stated condition: *"K was read off *this* held-out set — the K choice itself
should be validated on a further held-out set before it ships (recommend K=3)."* Until it is met, the
90% / CI [74, 96] result cannot carry a ship decision.

The new set must break the monoculture of the first. Slice 0 was 30 Spurgeon sermons from New Park
Street / MTP Volumes 10 and 13 — one author, one register, one translation, one century, clean PD text.
The new set must vary at least author and register, and should include at least one document type the
design claims to serve but has never tested: `paper`, `notes`, or `book`.

**Also required, and previously unowned:** gold labels here are mechanical — *"the body contains an
≥8-word verbatim run of the verse"* — so precision is a lower bound and recall is measured against the
sermon's *stated* text, not every passage engaged. Say so in the result. Do not report a bare number.
**Freeze the harness before looking at the data. Pre-register the bars. Run once.**

## Tranche B-2 · author the B4 options paper

**Property:** the translation decision is written down well enough that the owner can rule on it.

Today it cannot be ruled on, because it has never been written. `SERMON_SEARCH_DESIGN.md` line 275 points
at *"the translation decision (§ below)"* and the document ends at line 276. All that exists is the
finding: against **WEB** the same run scored **65%**; against **KJV** — what Spurgeon actually quotes —
**82%**. *"A verbatim 6-word run doesn't survive a translation swap."*

The paper must cost both options honestly:
- **User's translation.** Requires a per-user setting or detection. Mis-detection costs ~17 points of
  recall *silently*. What detects it, and what happens when it is wrong?
- **All translations.** 18 hosted translations means more index and more cross-translation collisions —
  and collisions are exactly what K exists to suppress, so **K must be re-validated under all-translation
  shingling.** That interaction is measured nowhere.

Ends with a recommendation and the re-validation cost of each. Does not decide.

## Tranche B-3 · revise the Slice 1 data model under the uncited ruling

**Property:** Slice 1's data model honours the rule that a shingle hit is not a fact, without silently
deleting the feature that depends on shingle hits.

Design and cost both options in §2 — query-time-only, and a separately-named measurement store. State
which one `traditionGap` can actually be built on, and what each costs in latency and in schema. If
neither preserves the feature, **say that**, and return the question to the owner rather than shipping a
join that quietly treats a probability as a fact.

Updates `docs/SLICE_1_DATA_MODEL.md`. Applies no migration — 013 stays `.sql.draft` until B1.

## Tranche B-4 · the three invariant tests, red-first, against a throwaway cluster

**Property:** each of Slice 1's three named invariants has a test that has been *watched go red*.

1. **Two-account tenancy** — user A cannot read user B's documents, sections, embeddings or anchors.
2. **No-HNSW brute-force recall** — the deliberate absence of a shared HNSW index yields 100% recall.
   Rationale on the record: *"A shared HNSW index starves exactly the way the corpus index just did."*
3. **Model parity** — seed a user embedding row with a wrong `model_slug`; `traditionGap` excludes it or
   throws. Every embedding row carries `model_slug`; refuse to join user vectors whose slug ≠ the
   corpus's.

Parity matters most because it fails silently: cosine between two 1024-dim vectors from different models
is a well-formed float, nothing throws, and the moat feature returns plausible, wrong results forever.

**Do not hardcode the model slug.** B2 is unresolved and `SERMON_COMPANION.md` §3 still names Jina v3.
Read the slug from one named constant with a `TODO(B2)` and no default that would silently pass.

**Ride-along, gated:** `REVOKE INSERT, UPDATE, DELETE ON embeddings FROM app_runtime` — per
`SLICE_1_DATA_MODEL.md` this rides *with* Slice 1 rather than waiting for it, but only after confirming
the ingestion path does not connect as `app_runtime`. Confirm first. Bylaw 7 applies to the apply.

---

## §4 STOP conditions

Stop and return to the owner, do not work around, if any of these is true:

1. A tranche requires a production connection, a Neon branch create/delete, or a publish flip.
2. A1's blockers cannot be closed without changing the measuring code — that is the exact confusion B-1
   exists to prevent.
3. Tranche B-1's re-validation puts K outside the range Slice 0 reported, or recall falls below the 70%
   bar on the new set. That is a design finding, not a tuning opportunity. **Do not tune to the new set.**
4. Any tranche's honest answer is "this cannot be built under the current ruling." Say so.
5. The uncited-anchor ruling turns out to delete `traditionGap`. Return it; do not redesign the feature
   silently.

## §5 Evidence obligations

Per tranche: what was executed, on what target, with the command; the red-proof, with the seed and the
revert; what was **not** executed, marked UNVERIFIED. Filed under `docs/evidence/`. WORKLOG entry with a
NOT DONE / UNVERIFIED section. Gate board updated in `docs/pm/MASTER.md`. ADR in `docs/DECISIONS.md` for
anything irreversible or architectural — at minimum the uncited-anchor ruling, the instance-nine
decision, and whatever A-5 concludes about the Bible plane.

Independent audit before A1 is declared closed. The agent that closes a blocker does not certify it.

## §6 Sequencing

```
Lane A:  A-1 ─┬─ A-2 ─┬─ A-3 ─┬─ A-4 ──▶ [⚑ owner: merge PR #48] ──▶ A-5 · A-6 · A-7 ─▶ A-8
              └───────┴───────┘  (independent, any order)

Lane B:  B-1 ──▶ B-2 ──▶ B-3          (paper + measurement, no gate)
         B-4 ──────────────────▶ [⚑ owner: B1·B2·B3·B4] ──▶ Slice 1
```

Lane A and Lane B run in parallel and are file-disjoint. **No third lane.**

The four things the owner asked for land in this order, and not before: **sermon search** after B1–B4;
**filters** after A-7's migrations are applied; **hymns** after A-8's split, with the metadata question
answered; **search** — the corpus-wide widening after A-6, and verse/topical search only if A-5
concludes the Bible plane is worth building.

## §7 Standing caveat

CI green on `94da9fc` means the docs commit broke nothing. It is not evidence about any of the four A1
blockers, all of which remain open.
