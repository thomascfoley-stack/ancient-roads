OUTCOME: A8 build item **B2 is DONE and red-proofed**. Everything else in A8 remains blocked on
owner decisions. This document records what was built, what was found while building it, and
reduces the DRAFT order's sixteen ⚑ items to the ones that actually gate the next step.

# A8/B2 — the publish admission set, and the decisions that remain

**Written 2026-08-02** against `main`. Companion to
[the DRAFT A8 order](2026-08-02-a8-register-ingest-DRAFT.md), which is still a draft and is still
not executable as issued. Nothing here authorises a production connection, and none was made.

## Why this was the one piece of A8 available to build

A8 is "register ingest slice → Deploy B → publish registers". Its first three legs all need an
owner ruling before a line of code is worth writing:

* **B1** (the guarded prod ingest writer) cannot be sized until someone answers *which stores A8
  fills on prod* — flat `embeddings` only, or the 006 sections model too. That answer decides
  whether B1 is one tool or three (DRAFT §B1).
* **B3** (the register flip list) is emitted *from* a post-ingest census that does not exist yet.
* **B4** is conditional on a served-list change that has not been decided.
* **B5** is a decision, not a build.

**B2 is the exception**: it is a defect in code that is already merged, its correctness does not
depend on any pending ruling, and it is a hard blocker on A8's final step. So it was built.

## The defect

Both tools that answer the A3 admission question — *"will anything actually serve this work?"* —
composed their admission set by hand:

| file | before |
|---|---|
| `scripts/publish-flip-census.mts:62` | `[...SERVED_PROSE_WORKS, ...SERVED_LANE_WORKS]` |
| `scripts/publish-flip-adjudicate.mts:109` | `new Set([...SERVED_PROSE_WORKS, ...laneWorks])` |

`web/src/lib/teacher/routing.ts` exports **four** served work lists. That union covers three.
The fourth, `SERVED_SONG_VERSE_WORKS`, is 15 hymn and poetry works — and
`SONG_VERSE_CORPUS_FILTER` (`routing.ts`) serves exactly them. Two consequences, both silent:

1. **A published hymn STOPS the flip** with `PUBLISHED BUT NOT ADMITTED — served by nothing`.
   That sentence is false. It is served.
2. **No hymn or poem can ever reach a flip list.** The adjudicator emits `admitted && staged`;
   with song/verse never admitted, A8's publish step would have quietly narrowed to
   sermons and theology with nobody deciding that. This is the quieter half and no exit code
   reports it.

**The test that existed to catch this certified it instead.** `test/publish-flip-census.test.ts`
asserted the runner mentions `SERVED_PROSE_WORKS` and `SERVED_LANE_WORKS` — the same incomplete
pair, hand-typed a third time. Eleventh instance of the watchlist's first artefact (a
hand-maintained expected set that nothing enforces), and this one had a test standing guard over
it that was built from the same wrong list.

### A second defect, found while fixing the first

`publish-flip-adjudicate.mts` reached `SERVED_LANE_WORKS` through a **dynamic import typed
optional, falling back to `[]`** — "fall back rather than crash". For a rule whose whole job is to
STOP the flip, that is the wrong trade: rename the export and admission narrows by 10 works, every
lane work false-STOPs, and the only trace is `servedLaneWorks: 0` inside the output JSON. Mean-
while the census imported the same constant **statically** and would have kept admitting them.
One question, two tools, two answers, one of them silent — the watchlist's second shape.

## The fix

`SERVED_WORK_LISTS` (a record of every served list) and `ALL_SERVED_WORKS` (its derived union) now
live in `routing.ts`, and both consumers read the union. The adjudicator's dynamic import is gone;
a missing export is now an import error, loud, before anything is adjudicated. The census log line
names every list consulted and its size, so a future narrowing leaves a trace in the log — the
omission this line exists to expose left none at all.

`test/invariants/publish-admission-covers-served-lists.test.ts` **derives** the list set from
`routing.ts`'s own source and asserts (a) every declared list is inside `ALL_SERVED_WORKS` and
(b) neither consumer references an individual list. A fifth list added tomorrow and not wired in
turns it red. It names no list except in its anti-vacuity floor.

## Red-proof

Four seeds, four reds, full transcript at
[`evidence/a8-b2-redproof-2026-08-02.log`](../../evidence/a8-b2-redproof-2026-08-02.log).

| seed | check that had to catch it | result |
|---|---|---|
| drop `songVerse` from `SERVED_WORK_LISTS` (the defect exactly as it shipped) | derived invariant | **RED** — named all 15 orphaned slugs |
| same seed | the adjudicator, driven | **RED** — published hymn exits 1, staged hymn drops out of the flip list |
| add a fifth `SERVED_HISTORIAN_WORKS` and do not wire it | derived invariant | **RED** — the class is closed, not just the instance |
| put `[...PROSE, ...LANE]` back in the census | consumers-derive invariant | **RED** |

The behavioural cases drive the **real adjudicator as a subprocess** over a fixture census, with
census rows deliberately carrying no measured `admitted` field — that is what forces the tool to
decide admission from its own set, which is the code path B2 fixes. A row carrying `admitted`
would route around the defect and prove nothing.

**Green after restore:** root suite 516 tests / 50 files, `tsc --noEmit` clean, `eslint src test`
0 errors, `web` eslint clean.

## The lock on the door B2 widened

B2 widened the admission set from 14 works to 29. Admission is the front of this chain:

```
SERVED_*_WORKS → ALL_SERVED_WORKS → admission → `admitted && staged` → flip list → published
```

So a quarantined slug typed into a served list is published content. **Nothing checked that.** Rail
6 of the DRAFT order says "quarantine is law"; it was law by coincidence — the four quality
quarantines simply had not been typed in. That was a smaller risk at 14 works, and the 15 added are
song/verse, which is exactly where the quarantine rulings live (`bramley-carols`,
`donne-divine-poems`, `herrick-noble-numbers` were all quarantined *out* of that register).
Widening a door and leaving the lock unenforced is the wrong half of the job.

`test/invariants/served-lists-respect-the-manifest.test.ts` pins both directions against
`ingest/sources.config.json`: no `serve:false` work appears in any served list, and every served
slug has a manifest entry. **Measured: 60 manifest entries, 8 withheld, 29 served, 0 breaches, 0
missing** — green on arrival, which is the point. It pins something true and unprotected rather
than reporting a bug. Red-proofed both ways: `whitefield-works` typed into `SERVED_SERMON_WORKS`
→ RED naming the slug and the list it entered through; a slug the manifest has never heard of
→ RED.

One thing the flag cannot express, recorded rather than resolved: `serve:false` conflates
*quarantined for quality/licensing* with *staged because no read path exists yet* (the three
historians, `thayers-lexicon`). Both mean "not served", so the guard is correct either way — but
if a historian is later meant to serve, the manifest entry is what changes, and it changes
deliberately. That is the same decision as the historian question below.

## What this did NOT fix, and it is not a bug

Two more works would STOP the flip today. Neither is a defect; each is a decision, and they are
**different decisions**, which is why they are not bundled:

**`spurgeon-talks-to-farmers`** (`source_type: sermon`, clean config entry, not quarantined) is
absent from `SERVED_SERMON_WORKS`. Nothing retrieves it, so NOT-ADMITTED is *correct*. The
question is whether the omission was intended.
→ **⚑ Serve it or hold it, and record why.**

**The historians — and this one blocks an owner ruling that already exists.**
`josephus-whiston` (`source_type: historian`) is in no served list, because there is no historian
retrieval lane. But `CATALOGS.historians` exists (`web/src/lib/catalog-defs.ts`, added by owner
decision 2026-08-01) and its queries are published-only, and the Book Reader reads published
sections. `DECISIONS.md` §"Owner editorial calls" already rules: *excise §4113–4124, then publish
the remainder (~4,112 sections) to the historian register for the Book Reader.*

**That ruling is mechanically unexecutable today.** Publishing josephus-whiston makes the census
and the adjudicator exit non-zero with "served by nothing" — and the A3 rule's stated rationale is
*"the library lists it, the reader links to it, and every retrieval path drops it. The visitor
sees a work that answers nothing."* For a historian that premise is **false**: the Book Reader
does serve it. The reader gets a real book. The rule mis-classifies a work that is
**shelf-served and lane-unserved**, a category that did not exist when the rule was written.

I did not invent a `SERVED_HISTORIAN_WORKS` to make this go away. That would have made a retrieval
list say something about shelf serving and put a false statement in the file that decides what
`/ask` returns.
→ **⚑ Decide what admission means now that shelf-serving exists** — one of:
  (a) admission = *any* serving surface, and the A3 rule's sentence gets corrected;
  (b) historians are an explicit, named exception with the reason recorded; or
  (c) the josephus ruling is withdrawn or deferred until a history read path exists.

## OWNER RULINGS, 2026-08-02 — and what decision 5 actually cost

All five decisions below the fold were answered. Recorded here so bylaw 1 covers them:

1. **Scope: both stores.** Everything searchable AND readable in full. Not flat-store-only.
2. **X1-HAZARD: (b).** Batch, with approval per batch as the go-live moment. The status-aware
   lane gate gets built later, not as a precondition.
3. **Cost: a non-issue below ~$200, a problem at $500.** Options to be presented (below).
4. **Readability is the goal for every register**, lexicons and historians included. The
   multi-pane reader (multiple windows, chapters, page numbers) is **its own project, not A8**.
   A8's job is to get the content into the database.
5. **`spurgeon-talks-to-farmers`: add it, so all sermons are live.**

### Decision 5 was one line and three files, and that is the interesting part

`spurgeon-talks-to-farmers` was the only clean, unquarantined sermon-type work absent from
`SERVED_SERMON_WORKS`. Adding it turned **two** lockstep guards red, which is the system working:

* `legal-hnsw-index-sync.test.ts` — "sermon lane index missing spurgeon-talks-to-farmers".
  The lane's partial HNSW index predicate hardcodes the slug list; if the filter names a work the
  index does not, the planner drops to the full-table index and the base pool starves silently.
  That is how migration 009 died.
* `fts-legal-index-sync.test.ts` — the FTS index predicate is compared **byte-exact** against
  `LEGAL_COMMENTARY_ENTRIES_PREDICATE`, which carries the lane slugs too. The hnsw guard's own
  FTS case only checks prose + song/verse slugs and stayed green. **Two guards over the same
  file and only the stricter one saw it.**

`db/migrations/037_sermon_index_add_talks_to_farmers.sql` rebuilds both, zero-window
(new name → VALID → drop old → rename), in one file so a partial application cannot leave
half-lockstep. **NOT APPLIED anywhere** — not prod, not dev. It is a committed migration awaiting
its occasion. Production carries zero register rows today, so on prod both rebuilds are over an
empty predicate and effectively instant.

**`whitefield-works` stays out**, and this is the one place "all sermons" does not mean all.
It is `serve:false` for a quality reason on the record (Project Gutenberg vol 1 of 6, no clean
sermon boundaries), not an oversight. Reaching it means revisiting that ruling.

### A guard fixed on the way

The FTS lockstep guard extracted `CREATE INDEX[\s\S]*?WHERE …` — the **first** CREATE INDEX in
the file, whichever index that built. Every fts-legal migration so far built exactly one index,
so it never mattered; 037 builds two and the guard compared the HNSW predicate while reporting it
as the FTS one. Now anchored on the index name, and it asserts there is exactly one such CREATE.

The false-green this closes is narrow and worth stating exactly rather than inflating: it needs a
migration whose first CREATE INDEX predicate *does* equal `LEGAL_COMMENTARY_ENTRIES_PREDICATE`
while the fts-legal rebuild later in the same file has drifted. A second index over the same legal
population (a btree for sorting) is an ordinary thing to want and has exactly that shape.
Red-proofed by drifting only the second half of 037 and watching the anchored guard name the FTS
predicate.

## The DRAFT's sixteen ⚑ items, reduced

Only these gate the **next** step. The rest are real but are not on the critical path until the
one above them is answered.

| # | Decision | Why it is next |
|---|---|---|
| 1 | **Scope: flat store only, or the 006 sections model too?** | Decides whether B1 is one tool or three. Nothing about B1 can be built before this. The josephus ruling implies sections-too, which is why it is entangled with the historian question above. |
| 2 | **X1-HAZARD: (a), (b) or (c)?** | On prod today the flat-store wall is code-side only, and Deploy A already shipped the served lists. **A staged ingest of a served-list work begins serving in the lanes the moment its rows land — before any flip.** So "ingest to staged" is not a safe rehearsal; for served works it *is* the go-live. |
| 3 | **Method + cost: fresh re-ingest, re-embedding every chunk through DeepInfra.** | The only documented path. No register-scale cost projection exists anywhere in the repo. |
| 4 | **Admission after shelf-serving** (the historian question above) | Blocks an owner ruling that is already on the books. |
| 5 | **`spurgeon-talks-to-farmers`: serve or hold.** | One line, and B3 cannot emit a clean sermon flip list without it. |

Also outstanding and cheap: the A8 row on the board carries **no ⚑ marker** despite containing at
least three ⚑-class acts, and the standing register-ingest HOLD has not been lifted in writing.

## What I changed that was not asked for

One line beyond the fix: `STOP` was an unused import in `publish-flip-adjudicate.mts` and is
removed. It was **already** unused before this change — it never fired because `scripts/` is
typechecked but **not linted**: `scripts/audit.sh` lints `src test` and `web`, not `scripts`.
That gap is recorded here and not fixed tonight; it is not on A8's path.

## What was NOT done

No production connection, read or write. No Neon branch. No ingest, no deploy, no flip. B1, B3,
B4 NOT BUILT; B5 is a decision and remains open. The DRAFT order is still a draft.
