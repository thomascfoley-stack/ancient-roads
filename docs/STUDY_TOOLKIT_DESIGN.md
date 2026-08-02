# STUDY TOOLKIT — the selection popover as a gathering surface (design doc, 2026-08-02)

**Status: DESIGN — for the owner to react to, NOT approval to build.** Per the design-before-code rail
(`CLAUDE.md` §Engineering values 2): smallest slice, interfaces named, scaling risks named, out-of-scope
explicit. From the owner's sketch and brief, 2026-08-02. Five owner decisions (§9).

**The frame the owner gave, and it is the right one:** *how pastors build sermons and study.* That workflow is
**read to gather to assemble to write**. Today the product does `read` well and nothing else. The sketch is the
`gather` step, and `gather` is worthless unless what you gather lands somewhere, which is why §7 connects it to
Workspace Paths rather than leaving it as a nicer popover.

One note before the design: the sketch shows a single `Copy` where the app has three chips. That is already
done and is in [PR #50](https://github.com/thomascfoley-stack/ancient-roads/pull/50), unmerged at time of
writing.

---

## 1. What the sketch asks for

Read off the drawing:

- The existing swatch row and `Note / Bookmark / Ask` survive, plus a new **Dictionary** action.
- One `Copy`.
- A new **register filter row**: `[x] Commen.  [x] Hymns  [ ] Sermons  [ ] Add`.
- An **expanded results panel** hanging off the toolbar, two columns of cards, scrollable: commentary authors
  on the left (Spurgeon, Lewis, Chesterton), hymns and poems on the right (It Is Well, another poem).

And from the brief: look up Greek and Hebrew from the hovering tool; search commentaries from the Bible; select
which original-language word; the bar expands **without leaving the word**; scroll and read hymns, Greek and
Hebrew in place; add what you find to a personal workspace in the sidebar.

## 2. The blocker, stated first because it changes the design

**Nothing in this repo aligns an English word to a Greek or Hebrew one.** Verified, not assumed:

- Every shipped translation is `{verse, text}` plain strings. No Strong's tags in any of the 18 translations
  under `web/public/bible/` (checked `kjv` and `web` directly; the shape is uniform).
- `web/public/original/{book}/{ch}.json` is keyed by verse and holds original-language tokens in
  **original word order**: `{w, l, tr, s, m, g}` (word, lemma, transliteration, Strong's, morphology, gloss).
  There is no index from an English token to one of these.

So "select the English word *loved* and see its Greek" cannot be answered correctly today. Three ways out:

| Option | Cost | Verdict |
|---|---|---|
| **A. Verse-scoped, reader picks the word** | zero new data | **Recommended.** Selecting anywhere in a verse shows that verse's original-language tokens; the reader taps the one they want |
| B. Ingest a Strong's-tagged translation | a licensing decision plus an ingest slice | The real fix, later. Note `DATA_SOURCES.md` and the edition trap: a PD author with a modern tagged edition is not usable |
| C. Align by gloss/heuristic | cheap | **No.** It would silently show the wrong lemma, which is the one failure a concordance product cannot have |

Option A is also what the brief already describes: *"I should be able to select the Greek and Hebrew one."*
That sentence assumes picking. The constraint and the desire agree, which is lucky, and it means the honest v1
is the one the owner already drew.

## 3. The register row is the register wall, rendered

`web/src/lib/catalog-defs.ts:6-23` states the wall: hymns, poems, sermons and theology "must NEVER be treated
as exegesis — they ride as their own labeled lanes and can never satisfy the >=2-voices exegetical floor," and
a `source_type` in no catalog appears nowhere, fail-closed by construction.

The sketch's checkboxes are that rule turned into a control, which is the strongest thing about the design.
Each checkbox is exactly one existing catalog, and the panel keeps them in **separate labeled columns** rather
than one merged relevance list:

| Checkbox | Catalog | `source_type` |
|---|---|---|
| Commen. | `commentaries` | `commentary`, `father` |
| Hymns | `hymns-poetry` | `hymn`, `poetry` |
| Sermons | `sermons` | `sermon` |
| Add | `historians` today; `theology` and `confession` are deliberately uncatalogued | see `catalog-defs.ts:49-54` |

**A fifth register is landing while this was written.** Uncommitted in the main worktree at time of writing:
`db/migrations/038_devotional_source_type.sql` adds `devotional` to the `source_type` CHECK on both `sources`
and `embeddings`, and `ingest/sources.config.json` gains roughly ten devotional works (Spurgeon's *Morning and
Evening* and *Faith's Checkbook*, à Kempis, Brother Lawrence, Taylor, Baxter, Scougal, Rutherford, Guyon,
Ryle). None of that is authored here and none of it is in this branch.

It matters to this design twice, and the second point was already handled in the same uncommitted work, which
is worth recording accurately rather than shipping the warning I first wrote:

1. **A devotional is a lane, and probably the most-wanted one after commentaries.** It should be a checkbox.
2. The fail-closed default (`catalog-defs.ts:19`: a `source_type` in no catalog "appears in NO catalog") would
   otherwise have published all ten onto no shelf. That same working tree adds a **`devotionals`** catalog, and
   a **`theology`** catalog alongside it, the latter closing a live gap this design had recorded as intended
   behaviour: `calvin-institutes`, `hodge-systematic`, `owen-works` and `schaff-creeds` were published and
   lane-served but unbrowsable, **33,578 sections with no route to them**.

So the register set this toolkit filters over is six, not four: commentaries, sermons, hymns-poetry,
historians, devotionals, theology. Decision 9.12 below is answered by that work rather than by this document.

Note also that migration **038 is now taken** by that work: `STUDY_PLANS_DESIGN.md` §6 proposes 038 for
`verse_coverage` and needs renumbering. It says to re-measure, which is why it will not silently collide.

Two rules this forces, and both are free if the columns stay separate:

- **Never merge the columns into one ranked list.** A Spurgeon sermon ranked next to Gill's commentary reads as
  two commentators. The wall exists precisely to stop that.
- **A metrical psalm keeps its paraphrase badge.** The existing `isSongVerse` treatment carries over unchanged.

"Add" is ambiguous in the sketch: it could mean *more registers* or *add to workspace*. §9.1 asks. This
document assumes **more registers**, and puts add-to-workspace on the cards themselves (§7), because the sketch
already spends a whole row on register toggles and an "add" verb sitting among filters would be the odd one out.

## 4. Layout: what "without leaving the word" can actually mean

This is the hard part, and the sketch does not resolve it. The popover is `position: fixed` with collision-aware
placement (`placePopover`, `selection-popover.tsx:65-86`), sized to its content. A **tall scrollable panel**
anchored to a word two lines from the bottom of the viewport has nowhere to go, and Rule 1 (never evict the
reader from Scripture) and "do not obscure the verse you are describing" start fighting each other the moment
the panel is taller than a few cards.

Proposed resolution, two stages:

- **Collapsed (today's toolbar plus the register row).** Stays anchored to the selection, exactly as now.
- **Expanded (the results panel).** Does *not* grow the anchored card. On **md+** it opens a **right-hand rail**
  beside the reading column; the column keeps its width and its scroll position, and the selected word stays
  visible and stays highlighted. On **<md** it becomes a **bottom sheet with the verse pinned above it**,
  detented at roughly 45% so the verse is never covered, draggable to full height by choice.

That satisfies "without leaving the word" in the sense that matters: no navigation, no route change, no lost
scroll position, no lost selection. It does not try to satisfy it by making a floating card tall, which cannot
work at the bottom of a phone screen.

**This is deliberately the same shape as `/desk`.** The desk already renders up to three panes from URL state
(`lib/desk.ts`). The rail should be the desk's pane component, opened in place, so a reader can promote what
they are reading into a real desk pane without re-fetching or re-finding it. That also gives the reader an
answer to UX-1 (the Bible cannot be reached on the desk) from the other direction.

## 5. Interfaces

```ts
// web/src/lib/toolkit/types.ts
export type ToolkitLane = 'commentaries' | 'hymns-poetry' | 'sermons' | 'historians';

export interface ToolkitQuery {
  verseId: number;           // canonical verse ID; the anchor for every lane
  lanes: ToolkitLane[];      // the checked boxes; order is display order
  translation: string;
}

export interface ToolkitCard {
  lane: ToolkitLane;         // never inferred from position (desk.ts:17-21)
  sectionId: number;
  author: string;
  work: string;
  tradition: string;
  excerpt: string;           // corpus text, never app-authored
  locus: string;             // human-readable, e.g. "Luke 14:1-6"
  isParaphrase: boolean;     // metrical psalters keep their badge
}

/** The verse's original-language tokens. Verse-scoped by necessity (§2). */
export interface OriginalToken {
  index: number;             // position in the verse, the only stable key we have
  w: string; l: string; tr: string; s: string; m: string; g: string;
}
```

One request per selection, not one per lane: `GET /api/toolkit?verse=<id>&lanes=commentaries,hymns-poetry`.
Debounced against the selection, and **cancellable** — a reader dragging across a verse changes the selection
several times a second and every superseded request must be aborted, which the Ask client already gets wrong
today (no `AbortController` anywhere in `ask-client.tsx`).

## 6. Payload, which is the thing most likely to make this feel bad

The reader already downloads too much: up to 869 KB gzip of commentary per chapter, eagerly, before the user
opens anything, with `Cache-Control: max-age=0`. This feature adds lexicon and per-verse lane lookups on top.

Three pieces of work, in order of payoff:

1. **Shard the lexicon.** `web/public/lexicon/greek.json` is 1.1 MB and `hebrew.json` is 1.8 MB, monolithic,
   and today a single Strong's lookup downloads the whole dictionary. The concordance beside them is **already
   sharded into 295 files** keyed by Strong's prefix. Adopt the pattern that is already in the repo; a Dictionary
   button in the popover is otherwise a multi-megabyte tap.
2. **Serve lanes from an index, not from bodies.** A card needs author, work, tradition, locus and a short
   excerpt. Return those; fetch a body only when a card is opened.
3. **Use `verse_coverage`** (proposed in `STUDY_PLANS_DESIGN.md` §6) to render an empty lane instantly and
   without a query. It also removes the wasted embed and four vector queries that `hasPassageCoverage` pays
   today, so it earns its keep twice.

## 7. Where gathered things go: this is Workspace Paths

The brief's last sentence, *"add things from here to your personal work spaces on the sidebar,"* is
`PRODUCT_ARCHITECTURE.md:28-34` mode 2: "assemble sources into saveable, attributed **artifacts** you reuse."
That is the mode `:65` names as the likely first one to build, and it is already designed in
`WORKSPACE_ARTIFACTS_DESIGN.md` ([PR #49](https://github.com/thomascfoley-stack/ancient-roads/pull/49)).

The two documents meet at one line: **every card carries an add-to-workspace affordance, and adding stores the
`section_id`, the verse anchor and the corpus hash — never the excerpt text.** Same rule as saved questions, and
for the same reason: a work withdrawn later must disappear from everything a reader gathered, and a cached
excerpt cannot do that. The sidebar's existing "Study Partners" and "Channels" groups are localStorage seeds
today (`sidebar.tsx:9-11`); workspaces replace them with real rows.

## 8. The cards are whatever the corpus has, never a list

The names on the sketch are placeholders. **No author is named anywhere in this design.** A lane renders the
works actually anchored to the verse in view, resolved at render time against the shipped admission predicates,
in whatever order the lane's ranking gives. There is no curated per-passage author list and there must not be:
`today.ts:10-12` already records why for the daily screen — "no per-passage curation table exists, so 'teaching
by lineup' is structurally impossible" — and a gathering surface that let someone hand-pick which voices appear
on a verse would reintroduce exactly that.

The practical consequence for the build: the panel's contents are a query result, so the interesting cases are
**empty** and **many** (§9.2), not which authors show up.

## 9. Owner decisions

Ordered by how much each changes the build, not by how hard each is to answer.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 9.1 | **Does the toolkit replace the study sheet, or sit beside it?** Clicking a verse currently opens `StudyPanel` (Commentaries / Word study / Notes), which is the same job. Two surfaces for one job is how three copy chips happened | **Replace.** And it fixes a live bug for free: double-click-to-select-a-word is broken *because* the first click opens the sheet (`verse-display.tsx:145-150`). Remove the sheet and the conflict is gone with no timing hack | everything below, and the word highlighter |
| 9.2 | **Strict verse anchoring, or widen to the containing anchor range?** Commentators write on units, not verses. Luke 14:2 may match nothing while a rich entry on Luke 14:1-6 exists. Strict is honest and will read as empty often | Strict first, then widen, and **label which one you got** so a reader knows whether it is about their verse or the passage around it | whether the panel feels full or empty |
| 9.3 | **Does Ask become a lane in the rail instead of navigating away?** `verse-display.tsx:99-105` does `router.push('/ask?q=...')`, a full navigation out of Scripture with no path back to the verse | Yes. It is the clearest live violation of Rule 1, and in a rail it is simply a fourth column | §4, and retires a bug |
| 9.4 | **Which workspace does Add target?** With three workspaces open (this week's sermon, a Romans study, a funeral) every add needs a destination | An **active workspace** in the sidebar: one click adds there, a caret picks another. Otherwise every add costs a modal | §7 |
| 9.5 | **What is the end artifact of a sermon?** A pastor who has gathered 12 attributed quotes still has to write. Is the output drafted in the app, exported, or is the app done once the pile is organised? | No recommendation. This is the biggest scoping question behind mode 2 and it is genuinely yours | whether Workspace Paths needs a writing canvas in v1 |
| 9.6 | **What happens on a multi-verse drag?** `useTextAnnotation`'s `resolveTarget` walks to exactly ONE `data-verse-text` container, so a cross-verse selection is not something the code currently expresses | Decide before building: passage-scoped toolkit, or single-verse as the intended unit | the selection engine |
| 9.7 | **Do the lane checkboxes stick, and where?** A pastor working through a book wants Hymns on all session | Per-account, one column on the user record. Per-device diverges between their desk and their phone | §5 |
| 9.8 | **Does the sketch's "Add" checkbox mean more registers, or add-to-workspace?** This document assumes registers (§3) | Registers, with add-to-workspace living on the cards | the filter row |
| 9.9 | **Verse-scoped original language (§2 option A), or fund a Strong's-tagged translation first (option B)?** | Option A. It needs no new data and it is what the brief already describes | the Dictionary action entirely |
| 9.10 | **Rail on desktop plus detented sheet on mobile (§4), or keep the expanded panel a floating card?** | Rail plus sheet. A floating card cannot be tall at the bottom of a 390px screen | the layout |
| 9.11 | **Should the rail literally be a desk pane**, so gathering and `/desk` are one surface? | Yes, and it answers UX-1 from the other end | §4 |
| 9.12 | Do `theology` and `confession` get a checkbox, or stay deliberately uncatalogued (`catalog-defs.ts:49-54`)? | — | the "Add" contents |

**Taken as decided unless objected to**, because they are reversible and cheap: the original-language strip is
collapsed by default and opens on Dictionary rather than always rendering; and switching translation while the
rail is open keeps the rail and re-anchors it rather than closing it.

Proposed **ADR-047**: "The study toolkit gathers by lane, anchored to a verse; original-language lookup is
verse-scoped until an aligned translation exists; the toolkit supersedes the study sheet."

## 10. Out of scope

- **Word-level original-language alignment.** §2 option B, a separate slice with a licensing decision in front
  of it.
- **Any AI-written summary of a gathered card.** `ROADMAP.md:237-242` re-arms V2 the moment app-voice prose
  expands. Cards show corpus text and attribution, nothing else.
- **Editing or annotating inside the rail.** Gather here, write in the workspace.
- **Sharing a workspace.** `PRODUCT_ARCHITECTURE.md:52`, personal-first.
- **Sermon drafting, outlines, export.** The `write` step. Real, and later.

## 11. Smallest slice, and its red-proofs

1. **Shard the lexicon** (§6.1). Independent of everything else, and it makes the existing Word panel cheaper
   today. Red-proof: a Strong's lookup fetches a shard under 30 KB, not a 1.1 MB file.
2. **The register row, commentaries lane only.** The lane already exists in the study sheet; this moves it to
   the toolbar and proves the layout. Red-proof: a verse with no commentary renders an empty labeled lane, not
   a blank panel or a borrowed one from a neighbouring verse.
3. **Hymns and sermons lanes.** Red-proof: a Spurgeon sermon can never render in the commentary column, seeded
   and watched to fail.
4. **The original-language strip** (§2 option A), verse-scoped, tap a token to open the existing Word panel.
5. **Add-to-workspace on each card**, once `WORKSPACE_ARTIFACTS_DESIGN` §5 ships. Red-proof: add a card, flip
   its work to `staged`, reopen the workspace, and watch the card disappear with a "no longer available" note.

Step 1 is worth doing whatever is decided about the rest.
