# Prod cutover — design of record (the Part 5 script, before it is built)

> **SCOPE CORRECTION (owner, 2026-07-27). The cutover is E0, E1, E2, E4, E5, E6 — there is no E3.**
> Forbidden-provenance deletion is **deferred to its own slice, after a re-ingest exists to refill the
> corpus**. It was approved (ADR-030) on the premise that "the clean NPNF/CCEL re-ingest replaces those
> voices in the same cutover"; the cutover has no ingest step, so E3 would have been a pure subtraction
> — 580 verses below the ≥2-distinct-authors floor and 24 with no served voice at all, measured
> read-only on prod. See the ADR-030 correction. `src/ingest/b2-remove-forbidden-provenance.ts` is kept:
> it is the tool the later slice uses. Two further ordering corrections from the same round:
> **a Neon branch snapshot of the target is created before the first write** (every rollback string
> names it; Neon PITR retention here is 6 h against a ~2 h 20 m run), and **migration 024 runs inside
> E4, after the slice**, because it backfills the sections E4 creates.

**Status: BUILT; PARTLY REHEARSED; NOT RUN ON PROD (2026-07-28).** The script is
[`scripts/cutover.mjs`](../scripts/cutover.mjs) (~650 lines) with the per-chunk gate in
[`scripts/cutover-regression-gate.mts`](../scripts/cutover-regression-gate.mts) and its seeded-defect
proof in [`scripts/cutover-gate-redproof.mjs`](../scripts/cutover-gate-redproof.mjs). E0, E1, E2, E4 and E6
were rehearsed green on a fresh prod fork **at revision `7d5e363`**; **E5 (`deploy.sh`) has never been
run by the script.** Be precise about what that rehearsal covers: it exercised **G1–G7**. The **G8**
(sections↔embeddings), **G9** (constraints reject), **G2 work leg** and **G2 durable floor** legs, the
John 10:11 known-good, and `--e6-only` are all NEWER than it and have **never been through an
end-to-end rehearsal on a prod fork** — only against dev, and via the seeded-defect proof. Do not read
"rehearsed" as covering the battery that would run today. This
doc is the spec those files must satisfy — where doc and script disagree, the script is what runs, so
reconcile the doc to the tree. Remaining gates on an actual prod run: (a) the ship-committee GO and
(b) a working prod credential (`OWNER_ACTIONS.md` §7 — refreshed 2026-07-23), plus the two interactive
owner stops the script itself enforces.

> **This line used to read "DESIGN ONLY. No script exists yet and nothing here runs" while ~620 lines
> of it existed and had already been rehearsed against a prod fork.** Recorded rather than quietly
> deleted: a status line that outlives its own subject is how an operator reads a live cutover script
> as a sketch.

## The shape (from the work order Part 5)

ONE resumable script, not a manual runbook. Every step: **PRECONDITION assert → action →
POSTCONDITION assert → checkpoint.** Hard abort on any failed assertion, printing the failing step
and its stated rollback. Idempotent + resumable — re-running after a failure skips completed steps.
Prints a dry-run plan first. Two owner gates only: before the FIRST prod write, and before
`deploy.sh`. Everything between runs unattended.

## STEP ZERO — prod-credential preflight (NEW, 2026-07-20)

**Why it exists.** A stale prod password (§7) means the script, as the work order first drew it,
would fail auth at E1 *after* some migrations had already applied — a half-applied cutover, the
exact failure the chunked design exists to prevent. STEP ZERO converts "dies mid-migration" into
"refuses to start."

**The blind spot it closes.** `scripts/ingest-preflight.mjs` asserts you are **NOT** on prod (aborts
if `ep-odd-fog` appears anywhere). Nothing asserts you **CAN reach** prod when you intend to. This is
the inverse guard.

**Assertions, all before any write:**
1. Connect with the prod credential.
2. `current_user` is the expected owner role (migrations run as owner, not `app_runtime`).
3. The endpoint host contains `ep-odd-fog` — this IS the prod branch, not dev or a stale copy.
4. WRITE capability proven by a no-op: `BEGIN; CREATE TEMP TABLE _cutover_preflight(x int); ROLLBACK;`
   — a real write that leaves nothing behind. A read-only or lapsed credential fails here.
5. ABORT with a clear message if any assertion fails. Do not proceed to E1.

## CONFIRMED: the cutover is a BUILD, not a repair (census 2026-07-23)

The prod census ran read-only on 2026-07-23 (`docs/evidence/census/prod-census-2026-07-23.txt`)
and confirmed every assumption:

- **Zero work keys.** All 190,635 flat embeddings have `metadata->>'work' IS NULL` (100%). The
  register ingest never ran on prod.
- **Zero migrations past 015.** No history anchors (016), no work column (019), no unit_ordinal
  (024), no library_items (027), no ingesting CHECK (023), no register source_type CHECK (017).
  Prod is on the original schema.
- **Zero suppression-class defects.** Chrysostom prolegomena, tennyson, traherne, word indexes,
  publisher ads -- none exist on prod. Dev-only artifacts that never need cleanup here.
- **Forbidden provenance IS present:** 15,707 BibleHub + 56,177 HCF = 71,884 rows. Real work, but
  **not this cutover's** — deferred to the post-re-ingest slice (scope correction above). The gate
  holds a monotone ratchet on the count instead of demanding zero.
- **Sections model:** only Barnes pilot (2 sources, 5,510 sections). Everything else gets built.
- **Live user data: CLEARED 2026-07-28 (owner decision) — this row is now historical.**
  The census measured 34 highlights (6 users), 2 notes (1 user), 1 chat (1 user), and this
  doc required migrations to preserve them. On 2026-07-28 the owner ruled it all disposable
  test data and it was deleted from prod in one verified transaction. What it actually was,
  read before deleting:
    - **5 of the 6 "users" were never people.** They were `qa-hl-a-<epoch>` synthetic IDs
      from the Phase-1 highlight suite, one soft-deleted row each — the residue class the
      025 header already names (the suite soft-deletes, never hard-deletes). It had reached
      PROD: `scripts/check-test-residue.mjs` had only ever been pointed at dev. The
      CAPABILITY to see that now exists — the script can inspect an explicitly declared
      non-dev target and matches the `__cutover_*__` prefixes (§"Test residue" below) — but
      **no standing gate exercises it**: `scripts/audit.sh` still invokes it against dev
      only, so the prod leg runs when an operator asks for it and not otherwise.
    - **The 6th was the owner** (a single uuid): 24 live highlights + 5 he had deleted
      himself, 2 notes (both the string "love this", on John 1:3 and 1:8), and 1 chat
      titled "test" with zero messages. `user_profiles` was EMPTY — no early-access user
      ever completed a profile, so no third party's work was in the database.
  Deleted: highlights 34, notes 2, chats 1. Also zeroed (already empty): messages,
  chat_memories, reading_history, user_library, study_guides, user_profiles,
  user_integrations. `api_rate_limit` (41 rows) deliberately KEPT — operational, not user
  content. The owner's own auth/user row was NOT deleted; only the content rows above were.
  A JSON receipt of every deleted row was taken first.
  > **UNVERIFIED IN THIS REPO.** Everything in this bullet is prose: no receipt, no
  > post-delete read-only artifact, and no `41` appear anywhere under `docs/evidence/`. The
  > newest committed prod reading, `docs/evidence/cutover-2026-07-28/23-prod-readonly-AFTER.txt`
  > (2026-07-28T06:45:54Z), still ends `highlights=34r/24a/6u/0542059b notes=2r/2a/1u chats=1r/1a/1u`
  > — i.e. it PREDATES the deletion and contradicts this paragraph. The repo's own rule is that
  > a green check is not proof; the single largest factual change on this page currently rests
  > on nothing checkable. **Needs Thomas:** commit the receipt and a post-delete read-only
  > census, or correct this bullet. Until then E1's assertions must be read as unproven at
  > `0 == 0`, not as verified.
- **Consequence for E1:** the preserve-these-rows assertions are NOT relaxed and must stay.
  They now hold trivially (0 == 0). Do not weaken them to match this state — the guard is
  what protects the FIRST real user, and the next cutover may run against one.
- No bookmarks/reading_progress/library_items tables exist yet.
- **Compute params:** Neon did not expose SHOW for compute_size/max_connections/shared_buffers/
  work_mem. Plan conservatively on the 121-190 s/10k slice rate measured on dev.

Design for BUILD:

- **E2/E4 build the corpus against a live prod DB from scratch** -- they do not repair existing rows.
- **Every "assert counts match dev" step RE-MEASURES prod's actual flat pool at runtime.** Do NOT
  hardcode dev counts into prod assertions. The assertion is "prod's rebuilt sections equal prod's
  own flat-pool count for that work," never "prod equals a literal from a doc."

## The suppression lesson, carried from ADR-029 addendum 2

Any step that removes rows across BOTH stores (`sections` and the flat `embeddings`) must express its
target in **each store's own key** and assert **1:1 per work** afterward. On dev, an ordinal range
that was correct for `sections` matched the wrong rows in the flat store (chunked sections spend
multiple ordinals per source section) — it cost 3 rows of real Tennyson verse before the 1:1 check
caught it. The prod script inherits that check as a postcondition, not a hope.

## Steps (per the work order, to be built against this spec)

- **E0** — prod-credential preflight (above). STOP-on-fail.
- **SNAPSHOT** — first action after STEP ZERO passes and before anything writes: a Neon branch off
  the target (`neonctl branches create --parent <target branch>`), asserted to exist, its id recorded
  in the checkpoint and quoted in every rollback string. Abort if creation fails. Neon PITR retention
  on this project is 21,600 s (6 h) against a ~2 h 20 m run, so PITR is not a restore plan.
- **E1** — migrations 016–023 and 025–030 in order; assert each index `indisvalid=t` before
  proceeding. Census confirms prod is pre-016, so they apply fresh. **Prod user data is EMPTY as of
  2026-07-28** (owner cleared it — see the census row above; the 2026-07-23 figures of 34 highlights /
  6 users / 2 notes / 1 chat are historical and must not be read as a current precondition). The
  preserve-these-rows assertions **stay exactly as written** and now hold at `0 == 0`; they are what
  protects the first real user, and the next run of this script may face one. The invariant asserted
  across every migration is a **per-table md5 digest over ordered rows** (id, owner, anchors,
  tombstone, body hash) plus the **active count** and the **owner distribution** — not `count(*)`,
  which passed three seeded corruptions green. Note the digest-based invariant is *stronger* than a
  count on an empty table but is **vacuous while the tables are empty**: it can only prove nothing
  moved, not that anything was preserved. That is a real limit of today's target, not of the check.
- **E2** — register-label prod's flat embeddings (dev got this from the 33-work sweep; prod never
  has). Assert label coverage against prod's own re-measured shape.
- **E4** — slice works into sections on prod, reusing vectors 1:1; assert per-register counts against
  prod's own flat pool. **Then apply 024** and assert `sections.unit_ordinal` is POPULATED. 024
  backfills the rows E4 creates, so running it in E1 left 71,563 of 72,863 sections NULL while the
  1:1 count check still read green. Nothing errors on a NULL: `work-reader.ts` makes each such row
  its own reading unit (one unit per retrieval chunk instead of per chapter) and
  `search-sections.ts` falls back to `COALESCE(unit_ordinal, -ordinal)`, which turns its
  dedup-by-unit into dedup-by-row. Silent degradation is why the old postcondition passed.
- **E5** — `deploy.sh` (clean-tree → licensing ratchet → build → `vercel --prod`).
- **E6** — smoke counts + the full regression battery, one more time, after the deploy.
  Runnable standalone as `node scripts/cutover.mjs --e6-only`, which runs STEP ZERO and the
  battery and **nothing else** — no snapshot, no migrations, no `deploy.sh`, and
  deliberately **no checkpoint write**: recording `E6` from a standalone run would make a
  later real cutover deploy and then skip its own E6 on the strength of a rehearsal.

## Regression gates — after EVERY chunk, not just at the end

`/ask` still answers with ≥2 distinct voices; Bible reader renders + tap-verse opens commentaries;
existing highlights/notes load AND write (E1 changes the annotation schema; `upsertNote` hard-depends
on 025); register wall holds. Any pre-existing surface regresses → ABORT and roll back that chunk; do
not fix forward mid-cutover.

The battery as built (`scripts/cutover-regression-gate.mts`): **G1** user-data invariant (md5 digest
+ active count + owner distribution, not `count(*)`) · **G2** the ≥2-distinct-authors floor,
corpus-wide, *plus* the same floor measured **excluding forbidden provenance** — the number that
will still be true after the deferred cleanup slice, and the one whose absence let ADR-030 approve a
deletion that would have dropped 580 verses below the floor · **G3** reader static corpus + FTS ·
**G4** annotation load + write round-trip (rolled back) · **G5** register wall · **G6** forbidden
ratchet, monotone · **G7** live `/ask` (opt-in) · **G8** `sections` ↔ `section_embeddings` · **G9**
the constraints actually reject what they forbid.

Two properties the gate must have, both earned the hard way:

- **The ≥2-voices leg is CORPUS-WIDE**, not a sample — one `GROUP BY` over the served pool counting
  verses that meet the ≥2-**distinct-authors** floor and verses with any voice at all, baselined at E0
  and compared thereafter (an absolute threshold is not enough; what must not happen is a *decrease*).
  The previous version sampled 3 verses of 22,794 and its own comment said they had been chosen to be
  immune to the step it guarded.
- **The gate is DATABASE-ONLY unless `CUTOVER_ASK_URL` is set.** It says so out loud: an explicit
  `LIVE PROBE NOT RUN` line prints beside the passes and the verdict line is stamped `DB-ONLY`. The
  live probe stays opt-in because E6 also runs on rehearsal forks that have no deployed app, and
  because a required probe immediately after `vercel --prod` would order a production rollback off a
  single HTTP read.
- **NOTHING IS MIRRORED.** The gate `import`s `LEGAL_CORPUS_FILTER`, `PROSE_TYPE_SQL`,
  `EXEGETICAL_FTS_EXCLUSION` and the `SERVED_*` slug lists from
  `web/src/lib/teacher/routing.ts` itself (it runs under `npx tsx`, so it can). It does **not**
  hand-copy them. This is not a style preference: a hand-mirrored copy of the filter, in a
  DIFFERENT and now-superseded attempt at this gate ([PR #28](https://github.com/thomascfoley-stack/ancient-roads/pull/28),
  branch `fix/e6-smoke-battery-2026-07-28`), had already drifted **27.8%** from production — 91,992
  rows admitted vs 127,467 — by dropping the `metadata->>'work'` leg, *the leg E2 populates*, which
  made that gate structurally blind to the step directly upstream of it. **Those figures are the PR
  #28 reviewer's measurement and are not reproducible from this tree**; they are recorded as the
  reason for the rule, not as this gate's own history. This gate has imported the constant since its
  first commit (`360386c`). A gate that re-implements the predicate it is checking is measuring
  a look-alike. `scripts/cutover-gate-redproof.mjs` seeds defects against the same
  predicates, obtained from the gate via `--print-predicates` rather than retyped.
  **One exception, named rather than glossed:** G3's `commentary_entries` predicate is still
  hand-built in the gate, including the Chrysostom/Augustine book lists, while
  `web/src/lib/legal-corpus.ts` exports the canonical form. That is pre-existing and is the same
  drift class this rule forbids — tracked as its own fix, not claimed as done.
- **A green line must not be able to mean two things.** Every leg that can be satisfied by an
  *absent* population says which case it is in: the register wall prints its denominator and fails
  outright if it is zero from E2 onward; section integrity fails on zero sections; and the final
  verdict is stamped `NO E0 BASELINE … (survey, not regression gate)` whenever the ratcheted legs
  had nothing to compare against. Roughly half the battery is a ratchet, and with no baseline those
  legs cannot go red at all — a run without one is a measurement, and it now says so.

### The two halves of a constraint check

`G4` proves the shipped annotation write path still **works**. `G9` proves the schema still
**refuses** what 025/030 exist to refuse — a migration that silently failed to add a CHECK leaves
G4 perfectly green. Every rejection is verified by SQLSTATE `23514` **and** the constraint name; a
bare `catch` counts a dropped connection or a missing column as proof the CHECK fired.

One honest limit, measured rather than assumed: the `*_target_kind_chk` whitelists (030c) **cannot**
be proven behaviourally. All three tables also carry an anchor-XOR whose every disjunct pins
`target_kind` to `'verse'` or `'section'`, so a row with a third value already violates the XOR and
is rejected whether or not 030 ever landed. Verified on dev 2026-07-28 and recorded in
`docs/evidence/e6-2026-07-28/02-g9-falsifiability-proof.log`: `target_kind='bogus'` is rejected by
`highlights_anchor_xor`, not by `highlights_target_kind_chk`. The same artifact shows the
030-discriminating probe rejected under the 030 body and **accepted** under the 025 body. For those three the only
sound assertion is a **catalog** one (the constraint exists, by name, with the expected body). What
*is* behaviourally reachable is 030's tightening of `highlights_anchor_xor` — a section highlight
with a NULL `source_content_hash` passes 025's version and is refused by 030's — and that single
probe is what distinguishes "030 applied" from "030 silently did not".

## Test residue

`scripts/check-test-residue.mjs` is the standing guard that no test- or probe-seeded row survives.
It was **dev-only** until 2026-07-28, which is why `qa-hl-a-<epoch>` rows from the Phase-1 highlight
suite sat on **production** long enough to be mistaken for five real users in the census. It now
also inspects an explicitly-declared second target (`CUTOVER_DATABASE_URL` + `CUTOVER_EXPECT_HOST`,
which must name the endpoint id exactly), sweeps the `__cutover_probe__` / `__cutover_e6_probe__` /
`__redproof__` prefixes the cutover's own probes use, escapes `_` in its LIKE patterns (they were
wildcards before, so the list was looser than it read), skips absent tables **visibly**, and treats
a target where nothing was checkable as UNVERIFIED rather than clean. It is read-only: it reports
residue, it never deletes it. Fix the teardown, not the data.

**What it still does not cover, stated so nobody reads it wider than it is.** It scans `user_id` and
`sources.slug`. The seeded-defect harness also mutates the CORPUS — `metadata.author`,
`metadata.work`, `metadata.sourceUrl` (including a biblehub URL) on real `embeddings` rows, and it
drops/weakens constraints. A crash mid-proof leaves that class of residue **invisible** to this
guard. The harness restores every break from a value captured immediately beforehand and the fork is
disposable, but there is no sweep for corpus-level residue. Tracked, not closed.

**Inspecting a second target is opt-in on BOTH `CUTOVER_DATABASE_URL` and `CUTOVER_EXPECT_HOST.**
`.env.prod` carries the URL and not the host, and the documented cutover workflow sources it into
the shell — so keying off the URL alone made `npm run audit` red for reasons unrelated to the tree,
at the moment an operator most needs a trustworthy green. A missing declaration is a visible skip.
