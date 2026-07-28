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

**Status: DESIGN ONLY. No script exists yet and nothing here runs.** The cutover is gated behind
(a) the ship-committee GO and (b) a working prod credential (`OWNER_ACTIONS.md` §7 — refreshed
2026-07-23). The prod census ran 2026-07-23 and **confirmed BUILD** (see §Census below). This doc
captures the requirements so they are not lost between now and the build. It is the spec the Part 5
script must satisfy; the owner approves the plan before it is written, and again before the first
prod write.

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
- **Live user data (tiny but real):** 34 highlights (6 users), 2 notes (1 user), 1 chat (1 user).
  Migrations MUST preserve these. No bookmarks/reading_progress/library_items tables exist yet.
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
  proceeding. Census confirms prod is pre-016, so they apply fresh. **Live user data exists (34
  highlights / 6 users — only 24 ACTIVE — 2 notes, 1 chat).** The invariant asserted across every
  migration is a **per-table md5 digest over ordered rows** (id, owner, anchors, tombstone, body
  hash) plus the **active count** and the **owner distribution** — not `count(*)`, which passed three
  seeded corruptions green.
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
- **E6** — smoke + regression gate.

## Regression gates — after EVERY chunk, not just at the end

`/ask` still answers with ≥2 distinct voices; Bible reader renders + tap-verse opens commentaries;
existing highlights/notes load AND write (E1 changes the annotation schema; `upsertNote` hard-depends
on 025); register wall holds. Any pre-existing surface regresses → ABORT and roll back that chunk; do
not fix forward mid-cutover.

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
