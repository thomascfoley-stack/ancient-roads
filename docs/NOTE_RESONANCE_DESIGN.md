# NOTE RESONANCE: the reader's own note as a probe into the tradition (design doc, 2026-08-06)

**Status: DESIGN - for the owner to react to, NOT approval to build.** No feature code exists. Per the
design-before-code rail (`CLAUDE.md` §Engineering values 2): smallest slice, interfaces named, scaling risks
named, out-of-scope explicit. Owner decisions in §14. Measured against the tree at
`feat/served-column-derives-publish` @ `ec4a07c`, not against any document's narrative.

---

## 1. What was asked for, read back

A reader is in Scripture. They write a note on a verse. That note opens in a side panel, and the panel answers
one question:

> **Has anyone said this before, and who?**

Compared against six registers: a commentary, a sermon, a hymn, a poem, a historian, a theological work. Closest
resemblance **if any**. The purpose stated: the reader is edified, feels connected to history, and finds through
the Church Fathers that the thought they just had is not new.

The framing behind it is the one this whole product already rests on: nobody has time to read 400 commentaries,
and the point is not to replace them but to give the reader a door into them. **The tool does not summarise the
tradition. It points at it, by name, in the tradition's own words.**

## 2. The architectural answer, in one line

**The note is the QUERY, not the index.**

That sentence decides most of this design, and it is what makes the feature far cheaper than it looks. The
existing personal-corpus design (`SERMON_SEARCH_DESIGN.md`) is about searching *the user's own writing*: it needs
per-user vector storage, a brute-force-vs-HNSW-partition tripwire (§5), type-aware chunking (§4), an upload
queue, and Vercel Pro (§12). None of that is needed here, because here we are searching **the church's corpus
with the user's note as the probe**. One vector in, six labelled result sets out.

Everything the read path touches already exists and is already indexed. What is new is: one vector per note, one
retrieval lane that does not exist yet, and a relevance floor that does not exist anywhere.

## 3. What exists today (verified in the tree, not recalled)

| Piece | Where | State |
|---|---|---|
| Verse-anchored notes, RLS, upsert, soft-delete | `web/src/lib/annotations.ts:106-124` | **BUILT**, and exercised end-to-end in the A7b product walk (write, reload, delete) |
| The reusable register-lane primitive: on-range first, semantic fill behind, fail-soft | `web/src/lib/teacher/retrieve.ts:100-133` | **BUILT**. Parameterised by `corpusFilter`; sermon and theology are two callers of one function |
| The song/verse lane (hymn + poetry), with the paraphrase badge | `retrieve.ts:61-86`, `routing.ts:292-309` | **BUILT** |
| The exegetical pool (commentary + father) with rerank, floor, diversity | `retrieve.ts:135-196` | **BUILT** |
| `embeddings.served` as the materialised serving switch, one writer (`publish-flip.mjs`) | migration `044`, `routing.ts:179-211` | **BUILT**, live on prod (A9) |
| Partial HNSW index per register | `044` / `045` | **BUILT** |
| `verse_coverage` rollup (verse_id, author_count, section_count), rebuilt on every publish flip | migration `039` | **BUILT** |
| The register wall, encoded in four places (catalogs, routing filters, FTS exclusion, pane labels) | `catalog-defs.ts:6-24`, `routing.ts:165-190`, `desk.ts:162-183` | **BUILT** and test-enforced |
| `source_type = 'note'` already legal on `embeddings` | migration `040:26-34` | **BUILT** (unused) |
| The desk pane model, URL-as-state, 3-pane cap, every pane labelled by register | `lib/desk.ts` | **BUILT** |
| The study toolkit rail (lane checkboxes hanging off the selection popover) | `STUDY_TOOLKIT_DESIGN.md` | **DESIGN**, not built |
| Workspaces / saved questions ("store citations, never answers") | `WORKSPACE_ARTIFACTS_DESIGN.md` | **DESIGN**, not built |
| "Study Partners" and "Channels" in the sidebar | `components/sidebar.tsx:24-27` | **localStorage seeds only.** No table, no backing store, child pages render `ComingSoon` |

The read half of this feature is therefore about 80% already shipped. That is the finding.

## 4. The six registers, mapped

The owner named six targets. Five of them are already retrievable lanes. One is not.

| Asked for | `source_type` | Mechanism today | Gap |
|---|---|---|---|
| a commentary | `commentary`, `father` | `retrieveCommentary` (the exegetical pool) | reuse, **without compose** (§10) |
| a sermon | `sermon` | `retrieveSermonLane` | none |
| a hymn | `hymn` | `retrieveSongVerse`, split by `register` | none |
| a poem | `poetry` | `retrieveSongVerse`, split by `register` | none |
| a theological work | `theology`, `confession` | `retrieveTheologyLane` | none |
| **a historian** | `historian` | **nothing** | **a whole lane, and it is the expensive item** |

**The historian gap is not an oversight and it is not one line.** `routing.ts:126-129` states it deliberately:
historians have a catalog shelf and a Book Reader path but no retrieval lane, so they are *served-as-shelf and
unserved-as-retrieval*, and that distinction is filed as an open A8 owner decision. Measured against the tree:
the manifest carries **41 `historian` works** (Schaff's *History of the Christian Church* in eight volumes, Bede,
Gibbon, Josephus, Knox, Edersheim, Renan, Bangs, van Braght), and **zero of them appear in the 88-work
`serve-88.json` payload** - i.e. none is currently served by anything.

So "compare my note to a historian" requires, in order: publish the historian works (⚑ owner flip), confirm their
rows carry vectors, add `HISTORIAN_CORPUS_FILTER`, add `SERVED_HISTORIAN_WORKS` to `SERVED_WORK_LISTS` (which is
enforced, not conventional - `publish-admission-covers-served-lists.test.ts` derives the list set from the
module's own source), add the partial HNSW twin, and run the flip. That is a migration plus a production write
plus an owner gate. **It is the single largest cost in this feature and it should be priced separately from the
rest**, because the other five lanes ship without it.

Note also: `devotional` (migration `038`, ~10 works incl. Spurgeon's *Morning and Evening*, à Kempis, Brother
Lawrence) has the same shape as historians - a shelf, no lane. It was not asked for. It is arguably the
most-wanted seventh lane for exactly this feature's audience, and closing the historian gap closes it too, since
it is the same machinery.

## 5. Do we need to reconfigure what exists? No. Three additive changes.

The direct answer to the question asked. Nothing in the current architecture has to be undone.

1. **A historian retrieval lane** (§4). Additive; closes an already-open decision.
2. **A user-vector plane** - one small table (§6). This is the **first time user text is embedded in this
   product**, which is a genuine first, and it is where the design needs the most care.
3. **A relevance floor** (§9). New. It also fixes a documented existing defect that today affects `/ask`.

And one thing that is not architecture but will hurt if ignored:

4. **A surface collision.** Three separate designs now claim the same right-hand space: this one, the study
   toolkit rail (`STUDY_TOOLKIT_DESIGN.md` §4), and workspaces replacing the sidebar seeds
   (`WORKSPACE_ARTIFACTS_DESIGN.md` §7). Building a fourth panel here is how the three-copy-chips bug happened.
   **Recommendation: this is a LANE IN THE TOOLKIT RAIL, not a new panel** (§11).

## 6. Data model

Next free migration number is **046** (`043` was skipped in the /plans renumber; `044`/`045` are the served
cutover). Re-measure before writing it.

```sql
-- migration 046 (re-measure the free number)
CREATE TABLE note_embeddings (
  note_id     UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  model_slug  TEXT NOT NULL,            -- parity guard, §7. Never nullable, never defaulted.
  body_hash   TEXT NOT NULL,            -- sha256 of the normalised note body
  embedding   vector(1024) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_embeddings_user ON note_embeddings(user_id);
-- NO HNSW INDEX, deliberately. This table is never searched: its rows are QUERIES, not a
-- corpus. One row is read by primary key per panel open. An index here would be pure cost.
```

Standard user-table block: `ENABLE ROW LEVEL SECURITY`, cmd=ALL policy on
`current_setting('app.current_user_id', true)` in both `USING` and `WITH CHECK`, all access via `runAsUser`, an
explicit `WHERE user_id = ...` belt in every query, and classification in `USER_TABLE_SPEC` or
`test/invariants/user-data-invariant.test.ts` goes red.

### 6.1 Why a separate table and not `embeddings` with `source_type = 'note'`

`embeddings` would appear to be free: migration `040:26-34` already permits `'note'`, migration `022` already
permits a user-scoped INSERT, and `served` defaults false with a backfill scoped to `user_id IS NULL`
(`044:90-110`), so a note row could never enter any corpus pool. Structurally safe.

It is still the wrong table, for one concrete reason: **`embeddings` has no UPDATE and no DELETE policy**
(`SCHEMA_AS_BUILT.md` §2.2 - "There are no UPDATE/DELETE policies, so RLS denies both for `app_runtime`"). A note
is upserted on every edit and soft-deleted on removal, so this feature would need both. Widening the write
surface on the table that holds the entire licensed corpus, in order to store a personal note vector, trades a
large blast radius for a small convenience. A dedicated table gets the same isolation with none of that.

Second reason, smaller but real: the deploy licensing gate reads only `public/` files and `user_id IS NULL` rows
(`PHASE_A_CLOSE.md` §4 / `gate-ugc-blindness.test.ts`). A separate table is structurally outside the gate's
reach rather than inside it and excluded by predicate.

### 6.2 `body_hash` is the whole caching story

Recompute the hash on save. If it matches the stored one, the note text did not change and the vector is reused:
**no embed call, no cost, no latency.** This is the project's standing rule (store derived values rather than
computing per request) applied at the only place it matters here.

## 7. Model parity is not optional, and it is already forced

The note must be embedded by `BAAI/bge-large-en-v1.5` via DeepInfra - the same model, same provider, that
embedded the corpus (ADR-005). A note vector from any other model lands in a different space and the comparison
**returns garbage with no error, forever**. `SERMON_SEARCH_DESIGN.md` §6 calls this "the quiet bug that would
make the moat feature wrong in a way no test notices unless you assert it," and it is right.

Two things follow, and both are cheap:

- `model_slug` is stored on every row and **checked at query time**, not assumed. A mismatch refuses the lane
  and says so; it does not fall back to a comparison it cannot trust.
- Lane B's open gate **B2** ("confirm bge-large for *user-corpus* embedding") is answered by construction for
  notes: the only embedder in `web/` is `embedQuery` in `lib/teacher/deepinfra.ts:23`, it is already pinned to
  bge-large, and this feature reuses it. That is one fewer owner gate in the way.

**A defect this surfaced, and it is pre-existing:** `embedQuery` silently truncates its input at
`MAX_INPUT_CHARS = 1800` (`deepinfra.ts:14`), and the annotations route applies **no length cap to a note body
at all** (`app/api/annotations/route.ts:49-51` trims and rejects empty, nothing more - while the bookmark label
directly below it *does* have a cap, added by the API-hardening pass). So a 4,000-character note would be
embedded from its first 1,800 characters, and the reader would be told what the tradition says about the first
half of their thought. Fix before shipping: either cap the note body at the edge, or chunk long notes into
multiple vectors and take the best hit per lane. §14 asks which.

## 8. The read path

```
note saved ──► normalise + hash ──► hash unchanged? ──yes──► done, no call
                                          │no
                                          ▼
                                    embedQuery (bge-large)  ← the ONLY external call, on the WRITE path
                                          │
                                          ▼
                                   upsert note_embeddings

panel opened ──► read note vector by PK ──► verse_coverage lookup (empty lanes short-circuit, 0 queries)
                                              │
                                              ▼
                         6 lanes in parallel (Promise.all, the teach.ts:115-119 pattern)
                                              │
                                              ▼
                    per lane: on-range first (laneOnRangeSql) ──► semantic fill ABOVE THE FLOOR
                                              │
                                              ▼
                          6 labelled columns, corpus text + attribution only
```

**No external call on the read path at all.** Embedding happens on save. Composition does not happen (§10).
Whether the cross-encoder reranker is used is a measured question, not a default: the note is a long, rich probe
(hundreds of words) rather than a five-word question, so the reranker's usual lift is smaller, and skipping it
keeps the read path free of network calls. Measure both; ship the cheaper one unless the measurement says
otherwise.

This is strictly better than `/ask`, which embeds on the request path today (`teach.ts:112`) and then reranks and
composes on top of it.

## 9. "If any" is a mechanism, not a hope

This is the part most likely to be got wrong, and getting it wrong would damage precisely the trust the feature
exists to build.

**Retrieval in this codebase has no relevance floor.** That is not speculation; it is recorded.
`STATE_OF_TRUTH.md` §1 caveat 3, verified 2026-07-19 and filed as ADR-028: a Song of Solomon query returns **six
non-SoS sources** (Barnes and Wesley on the New Testament, Chrysostom on Matthew/John/Acts) scoring as low as
**0.005**, because top-K is taken with no threshold. Today the reader is protected only because the **verifier**
rejects the composed result downstream.

**This feature has no verifier downstream**, because it composes nothing. So the floor has to be the mechanism.

Without one, a reader writes a private note on Obadiah, the panel shows a Spurgeon sermon on Romans as "the
closest resemblance," and the reader - who was told this surface connects them to the historical church - reads
that adjacency as confirmation. That is the worst failure this product can have, and it is worse here than in
`/ask` because the user brought their own words to it.

The design requirement:

- **A per-lane cosine floor, pre-registered before measuring**, below which the lane renders **"nothing close"**
  and shows no card. Per-lane, not global: a hymn resembling a note is a looser relationship than a commentary
  on the same verse, and one number will not serve both.
- **Anchor-first.** The note already carries `verse_id` / `verse_end`, so `laneOnRangeSql` runs against a known
  range with no intent parsing at all. On-range hits are shown as **"on this passage"**; semantic hits are shown
  as **"elsewhere, similar"**. The two are never mixed in one list, for the same reason the register columns are
  never merged.
- **`verse_coverage` first.** `author_count = 0` on the anchor verse renders an empty lane instantly with zero
  queries, and removes the wasted work `hasPassageCoverage` pays today.
- **Never show a best-of-a-bad-pool row.** "Nothing close" is a correct, dignified, and frequent answer. The
  product already knows how to say this: the `/ask` empty state exists for the same reason.

### The red-proof, and it is the one that justifies the whole design

**A note written on Song of Solomon must return "nothing close" in every one of the six lanes** - and that test
must be *watched go red* against a floorless implementation before the floor is trusted. The repo already knows
SoS is the hole where retrieval confidently returns unrelated content, which makes it the perfect negative
control, already documented, requiring no new fixture.

### Calibrating the floor honestly

There is no held-out set of real notes and one cannot be synthesised from the corpus without circularity (a note
generated from a commentary will of course match that commentary). Per the `quality-slice` methodology:

1. A dogfood cohort writes **n ≈ 50** real notes across known-covered and known-uncovered passages.
2. Bars pre-registered **before** measuring: per-lane precision on the top card **≥ 80%** ("would a reader call
   this genuinely related?"), and **100%** "nothing close" on the deliberately uncovered passages.
3. Run once, no tuning to the set. If a lane cannot clear its bar at any floor, **that lane does not ship** -
   five honest lanes beat six where one lies.

## 10. What this must never do

Six constraints, each already written down somewhere in this repo. They cost nothing here; they are recorded so
a later slice cannot quietly relax them.

1. **No composition, in any lane, including commentary.** This surface is retrieve-and-quote end to end. It
   therefore adds no verifier surface, no contract surface, and no compose latency or cost. `retrieveCommentary`
   is reused for its retrieval only; `teach()` is never called.
2. **No AI-written summary of a card, and no sentence about the relationship.** `STUDY_TOOLKIT_DESIGN.md` §10
   already forbids this, and `ROADMAP.md:258-259` ("V2 classifier verifier - HARD RE-GATE TRIGGER",
   owner-locked 2026-07-11) makes V2 a **required** gate again the moment the app-voice surface grows. There
   is no "your note echoes Augustine's thought that…". That sentence would be the product interpreting Scripture
   *and* narrating the reader's spiritual state, which is the one thing the guarantee forbids absolutely. **The
   juxtaposition is the entire payload**: the reader sees Chrysostom's own words beside their own and draws
   their own conclusion. That is the edification asked for, and it is stronger unnarrated.
3. **The user's words never become a voice.** Never counted toward the ≥2-voices exegetical floor, never
   rendered as an attributed historical voice, never served to another account, never used to answer another
   user's query, never training data (`SERMON_SEARCH_DESIGN.md` §7, §14).
4. **Columns are never merged into one ranked list.** A Spurgeon sermon ranked beside Gill's commentary reads as
   two commentators; the register wall exists to stop exactly that (`STUDY_TOOLKIT_DESIGN.md` §3). Six labelled
   columns, each headed by its register, `paneRegisterLabel` (`desk.ts:162-183`) as the single naming authority.
5. **Metrical psalters keep the paraphrase badge.** Unchanged from the existing `isSongVerse` treatment.
6. **Cards store citations, not text.** Anything the reader saves from this panel stores `section_id` + verse
   anchor + `corpus_hash`, never the excerpt (`WORKSPACE_ARTIFACTS_DESIGN.md` §2). A work withdrawn later must
   disappear from everything a reader gathered.

## 11. Where it lands in the UI

The owner named "Study Partners" and "Channels." Those are `localStorage` seeds with no backing store
(`sidebar.tsx:24-27`) and `ComingSoon` child pages, and two other designs already plan to replace them. Adding a
third claimant is the mistake to avoid.

**Recommendation: the resonance lanes are columns in the study toolkit rail**, not a new panel. The rail is
already designed as a right-hand rail on md+ and a detented bottom sheet on mobile
(`STUDY_TOOLKIT_DESIGN.md` §4), already renders exactly these registers as labelled columns, and is already
proposed to be a desk pane. This feature adds one thing to it: **the note is the query**, where today the query
is the selection.

That makes the two designs one surface with two entry points:

- select a verse ➝ lanes anchored to the verse (the toolkit);
- open your note ➝ the same lanes, probed by what you wrote (this doc).

If the rail is not being built yet, there is a cheap interim that proves the retrieval half with zero new
layout: **render the lanes inside the existing `StudyPanel` "Notes" tab** (`components/study-panel.tsx:18-25`,
which already has Commentaries / Word study / Notes tabs and already fetches commentary entries). Caveat, stated
rather than discovered later: `STUDY_TOOLKIT_DESIGN.md` decision 9.1 recommends the toolkit **replace**
`StudyPanel`, so that interim is knowingly throwaway UI. It is small, and it buys a real measurement of §9's
floor before any layout work. §14 asks which.

## 12. Privacy: the note leaves the building

**This is new and it deserves an explicit owner ruling rather than an assumption.**

Today the only user text that reaches a third party is an `/ask` query. This feature sends **the reader's
private note body to DeepInfra** to be embedded. The owner's own framing for this feature - reading, notes, and
prayer - means these notes will not be neutral study observations. Some of them will be confessions.

What the design already gets right: the vector is not reversible to the text, nothing is stored at the provider
by the request shape used, and the note never leaves the user's own account inside the product. What it does not
yet have: a disclosure, and a decision.

Named, not decided (§14): whether the reader is told, whether a note can be marked private-and-unindexed (a
per-note opt-out is trivial - no row in `note_embeddings`, no lanes, no call), and whether that opt-out is the
default. A self-hosted embedder removes the question entirely and is a real option later; it is out of scope
here.

## 13. Scaling

Against the 1M-users-by-Dec-2026 target, per note:

| Cost | Amount | When |
|---|---|---|
| Embed call | 1, ~150ms, fractions of a cent | on save, only when `body_hash` changes |
| Storage | one 1024-dim vector, ~4 KB | once per note |
| Read path | ≤6 pgvector queries, all index-backed, no external call | on panel open |

The read path is the only thing that scales with usage, and three existing mechanisms already bound it:
`verse_coverage` short-circuits empty lanes with zero queries; each lane hits its own partial HNSW index rather
than the full table; and every lane is `LIMIT`-capped (`LANE_LIMIT = 3`).

**One legitimate cache, and the distinction matters.** Lane results may be cached on
`(note_id, body_hash, corpus_hash)`, because neither the note nor the corpus changes between opens. This does
**not** violate "never cache answers from a pipeline below the accuracy bar" - `WORKSPACE_ARTIFACTS_DESIGN.md`
§7 draws exactly this line: corpus search results are retrieval, not generated, so storing them breaks no rule;
Ask history is the thing governed by the accuracy bar. The cache stores `section_id`s and is keyed on
`corpus_hash`, so **a quarantine ruling invalidates it** rather than being served from it forever. Cache the
citation, re-read the section, exactly as saved questions do.

Named risk, not hand-waved: if the corpus is ever re-embedded on a different model, **every note vector is
stale**. The `model_slug` check (§7) must fail loud and trigger a per-user background re-embed, never a silent
mismatch.

## 14. Owner decisions

Ordered by how much each changes the build.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 14.1 | **Does the historian lane ship in v1, or does v1 ship five lanes?** It is a publish flip, a migration, an HNSW twin and a production write - and no historian work is served today | **Five lanes first.** Ship the five that are already retrievable, prove the floor, then price the historian lane on its own. It is a whole slice, not a sixth checkbox | scope, and the ⚑ gate count |
| 14.2 | **Rail lane, or interim inside the `StudyPanel` Notes tab?** (§11) | **Interim, knowingly throwaway**, if the rail is not imminent - it buys the §9 floor measurement now. If the rail is next up, wait and build it there once | all UI work |
| 14.3 | **Is the reader told their note is sent to DeepInfra to be embedded, and can a note opt out?** (§12) | **Tell them, and make the opt-out per-note.** A prayer journal is not a search box | ship, and the privacy policy |
| 14.4 | **Long notes: cap the body at the edge, or chunk into multiple vectors?** Today there is no cap and `embedQuery` truncates at 1,800 chars silently (§7) | **Cap at the edge for v1** (say 2,000 chars, with a visible counter), chunk later. A silent half-embedding is the worse failure | the write path |
| 14.5 | **Per-lane floors, and who signs off the pre-registered bars?** (§9) | The bars are pre-registered by the owner before the n≈50 run, per `quality-slice`. A lane that cannot clear its bar does not ship | whether the feature is honest |
| 14.6 | **Does a note's own scripture quotations become extra anchors?** Slice 0 proved the mechanism: shingling uncited quotes against KJV hit **90% chapter recall on a held-out n=30** at the frozen harness (K=1), and the precision run's trade curve clears both bars at K=2 (82% recall / 68% precision) and K=3 (75% / 96%) - `SERMON_SEARCH_DESIGN.md`, Slice 0. So a note quoting Isaiah while sitting on Romans could probe both | **Not in v1.** Real and measured, but it multiplies the lanes, K itself still wants one more held-out validation, and it needs the translation decision (gate B4) first | v2 scope |
| 14.7 | **The user-facing name.** "Resonance" is this document's internal word | Whatever it is, it must not promise agreement or confirmation. "Where this has been said" describes the mechanism; "the Spirit confirms" is a claim the product cannot make and must not imply | copy |
| 14.8 | **Devotionals as a seventh lane?** Same gap shape as historians, same machinery, arguably the most-wanted lane for this audience | Fold into 14.1: if the historian lane is built, build both | scope |

Proposed **ADR-049** (048 is the last recorded; re-measure): "A reader's note is embedded once, on save, by the
corpus's pinned embedder, and used as a retrieval probe into labelled register lanes. Nothing is composed, no
relationship is narrated, and every lane is floored - a lane with no genuinely close match reports nothing close
rather than its nearest row."

## 15. Out of scope

- **The personal-corpus upload pipeline.** Parse, type-aware chunking, the queue, per-user HNSW partitions,
  Vercel Pro. That is `SERMON_SEARCH_DESIGN.md` Slices 1-3 and this feature does not need any of it (§2).
- **The `traditionGap` join** ("voices you did *not* engage"). The inverse of this feature and a natural
  successor, but it needs the user's *documents*, not one note.
- **Any generated text, framing sentence, summary, or relationship claim.** §10.2, under any flag, for any
  reason.
- **Searching across the reader's own notes** ("what have I written about grace?"). Different question,
  different index, genuinely needs Lane B.
- **Sharing a note or a resonance result.** Personal-first (`PRODUCT_ARCHITECTURE.md:56`; note that several
  docs cite this as `:52`, which is where the line used to be).
- **Multi-verse and passage-scoped notes.** The note model is one verse today; widening it is decision 9.6 in
  `STUDY_TOOLKIT_DESIGN.md` and belongs there.

## 16. Smallest slice, and its red-proofs

Each step is independently useful and independently falsifiable.

1. **`note_embeddings` + RLS, no UI, no lanes.** Embed on save, hash-skip on unchanged.
   *Red-proof:* two real accounts through the HTTP routes (not the data layer) - B cannot read, write or delete
   A's note vector. And: save a note twice unchanged, watch the second save make **zero** provider calls.
2. **One lane, commentary only, floored.**
   *Red-proof, and it is the one that matters:* a note on **Song of Solomon returns "nothing close"** - watched
   go **red** first against a floorless implementation that returns Chrysostom on Matthew (§9).
3. **The remaining four lanes** (sermon, hymn, poem, theology), each in its own labelled column.
   *Red-proof:* a Spurgeon sermon can never render in the commentary column, seeded and watched to fail. A
   metrical psalm renders with its paraphrase badge.
4. **The floor calibration run** (n≈50 real notes, bars pre-registered, run once, no tuning). Lanes that miss
   their bar are removed, not tuned.
5. **The historian lane**, if 14.1 says yes: publish flip, `SERVED_HISTORIAN_WORKS` in `SERVED_WORK_LISTS`,
   partial HNSW twin, served backfill.
   *Red-proof:* the admission invariant test goes red if the new list is added to routing but not to
   `SERVED_WORK_LISTS`.
6. **Save-to-workspace on a card**, once `WORKSPACE_ARTIFACTS_DESIGN` §5 ships.
   *Red-proof:* save a card, flip its work to `staged`, reopen, watch it disappear with "no longer available."

Step 1 is worth doing whatever is decided about the rest: it is the first user-embedding surface in the product,
and every later personal-corpus slice inherits its parity guard and its isolation proof.
