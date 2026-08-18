# QA remediation follow-up — hand this to the fixer once the ledger is closed and green

**Companion to `docs/pm/QA_REMEDIATION_LEDGER.md`, not a replacement.** The ledger tracks all 156
original findings from `docs/evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md` (Sheet A, 20
anonymous sessions) and `AUTHENTICATED_QA_REPORT.md` (Sheet B). This doc has three things the
ledger does not, produced by an independent second pass that read the actual current code for
every open/thin item:

1. **Two "Done" ledger rows that are only half-fixed** — re-open these before calling the ledger closed.
2. **Three real findings not yet in the ledger** — the authenticated QA report grew a third batch
   (prayer journal + notes-link-to-verse, successfully re-run after a sign-out incident) after this
   ledger's snapshot was taken. Its Sheet B count is still "53"; the live report has 58.
3. **File/line-level technical briefs for every open item this pass could ground in code** — the
   ledger correctly identifies *what* is open; this fills in *where* and *how*, so a fixer doesn't
   re-derive it from scratch. IDs match the ledger's (`A0xx`/`B0xx`) so the two documents cross-reference.

Every claim below was produced by reading the actual source on disk (branch `fix/q1-signed-out-state`
at the time of writing), not by re-summarizing QA prose. Re-verify against whatever the branch looks
like by the time this is picked up — code moves.

---

## Part 1 — Re-open these two "Done" rows

### A086 — "Ask" nav item duplicates the "Ancient Paths" logo label — INCOMPLETE, not Done

Commit `4ce3146` fixed the primary copy in `web/src/components/sidebar.tsx`'s `SidebarNavContent`
(shared by the desktop rail and the mobile "Open menu" drawer) — the `/ask` link's label there is
now `"Ask"`.

**But a second, independent hardcoded copy was missed**: `Sidebar()`'s collapsed "writing mode" rail
(`railLinks` array, currently around line 479) still has `{ href: '/ask', label: 'Ancient Paths', icon: <AskIcon /> }`.
This rail renders at desktop widths when the reader is composing a prayer (`writing` state, from
`web/src/lib/prayer-writing-mode.ts`, toggled by hover or ⌘\).

**Fix:** change that one label string, `'Ancient Paths'` → `'Ask'`, at line 479. One-line change.
Longer term, both `railLinks` and `SidebarNavContent`'s link array should derive from one shared nav
registry so this class of bug (one label, two hardcoded copies, one fixed) can't recur — it's the
exact pattern this repo's own comments elsewhere call out as a recurring failure mode.

### B028 — "No way to delete a Study" — HALF fixed, not Done

Commit `fcd46a4` added `web/src/components/study-delete-button.tsx` (`DeleteStudyButton`, a
two-step arm/confirm control) and wired it into the `/studies` **list** page
(`web/src/app/studies/page.tsx:89`).

**But the Study editor itself — `web/src/app/studies/[id]/page.tsx` / `web/src/components/study-editor.tsx`
— still has zero delete affordance.** Confirmed by grep: no reference to delete/`DeleteStudyButton`
anywhere in either file. A reader who opens a study to work on it still cannot delete it without
navigating back to `/studies` first — which is the original complaint, just narrower now.

**Fix:** render `<DeleteStudyButton id={study.id} title={study.title} />` in `study-editor.tsx`'s
header row, near the existing Pin/Export controls (currently ~lines 803–855). Use `router.push('/studies')`
on success instead of the list page's `router.refresh()`, since there's no list row to refresh from
the editor.

---

## Part 2 — Three findings not yet in the ledger

The ledger's Sheet B count ("53") predates the authenticated report's third batch (sessions 11–12,
run after a mid-batch accidental sign-out was fixed by a manual re-login). The live report
(`AUTHENTICATED_QA_REPORT.md`) has 58. These three are net-new:

### B054 (new) — Prayer journal CAN attach a verse, but only via one path, with three real gaps

The original finding ("no UI path to attach a verse at all") is **not fully accurate against
current code** — do not build this as "add verse-attach from scratch."

A working path already exists: `web/src/components/study-panel.tsx` (~lines 155–162) renders a
"Pray over this verse" link when signed in with a known `verseId`, going to `/prayers?verse=<id>`.
`web/src/app/prayers/page.tsx` reads `?verse=`, and `web/src/components/prayer-journal.tsx` starts
the composer pre-attached to that verse, including it in the `POST /api/prayers` body. This is real
and functional — the QA session that reported "no UI path" tested the tabs and the bare composer
and missed the CTA below the tab content.

**What's genuinely still missing** (this is the real scope):
1. `web/src/components/selection-popover.tsx` (the drag-select-verse-text popover) has no "Pray"
   action at all — no entry point from the most natural place a reader would start.
2. `/prayers`' own direct "Write a prayer" button (`prayer-journal.tsx` ~420–426) never sets
   `initialVerseId` — starting from the journal itself offers no passage picker.
3. Editing an **existing** entry has no verse picker at all (`prayer-journal.tsx` ~359–395) — a
   verse-less entry stays verse-less forever, which is why real production rows show `verse_id: null`.

**Fix:** (a) add an `onPray` handler + button to `selection-popover.tsx`'s action row, same pattern
as `onAsk`/`onAddNote`; (b) add a lightweight reference-input field to the direct composer; (c) add
a verse picker to the edit view. All three are additive, no schema change (the `verse_id` column
already exists and works).

### B055 (new) — Note-link visual marker exists but fades before most readers see it

The original finding ("target verse has no visual marker at all") is also not fully accurate —
**a marker exists, it's just short and can be eaten by page-load timing.**

`web/src/app/read/[book]/[chapter]/page.tsx` (~lines 176–208) reads a `#v<n>` URL hash, scrolls the
verse into view, sets `flashVerse` state, and clears it after a hardcoded **2200ms**
(`setTimeout`). `web/src/components/verse-display.tsx` (~line 235) applies a visible ring
(`ring-2 ring-flame/70`) only while that verse matches `flashVerse`. On a slower real load — the
same page also kicks off annotations and original-language fetches — the 2200ms window can close
before a reader's eyes reach the screen, or before a QA session's own multi-step inspection catches it.

**Fix:** either lengthen the window well past typical load jitter (4–5s), or — better — clear
`flashVerse` on the reader's first scroll/click/keypress instead of a fixed timer, so a slow load
can never eat the whole window.

### B056 (new) — Manual cleanup: 2 duplicate highlight rows on John 1:4, not 1

Not a code fix — an account-cleanup task, distinct from ledger row B045. A direct API check
(`GET /api/annotations/all`) during the third-batch retest found **two** identical yellow highlight
rows on John 1:4 ("In him was life; and the life"), same span, same translation — a duplicate row
from the original accidental-sign-out incident, not the single row B045 assumed. Sign in, open
`/read/jhn/1`, remove both.

---

## Part 3 — Re-verify before building (code contradicts the QA framing)

### A075 — "Open the Bible" desk CTA — likely not a real bug as filed

The ledger lists this under "missing affordances" (something to build). Reading
`web/src/app/desk/page.tsx` (~lines 84–90) shows the button's `onClick` is `() => setPickingBible(true)`
— it opens the exact same in-place `BookPicker` already used by the populated-desk state (~lines
132–147), driven by the same `addScripture` handler that correctly adds a pane via
`router.replace(deskHref(...))`. Nothing in this code path navigates away. **Recommend re-testing
against a live session before spending any engineering time here** — this looks like a QA
misobservation (possibly conflated with the adjacent "Browse the library" link, which *does*
navigate away, at ~line 91–96). If a real defect turns up on retest, look at `BookPicker`'s own
`onPick` wiring, not `desk/page.tsx`.

### A052 — "Amazing Grace" has no scripture heading — probably not a source-edition limitation

The ledger files this as "may be a re-source decision." The underlying data actually has a real
verse anchor: `web/public/commentaries/1ch/17.json` carries `work: "olney-hymns"`, `verseStart: 16`,
`verseEnd: 16` — this hymn IS correctly linked to 1 Chronicles 17:16 via the source's own `<scripRef>`
markup (`src/ingest/adapter-ccel.ts`), which the ingest adapter deliberately strips from the
*displayed* body text as typographic debris. So the metadata anchor is real; only the visible text
lacks a printed citation line. Separately, this hymn can never surface via the search box regardless,
because A048 (below) excludes the whole hymn/poetry register from full-text search by design.
**Re-verify by browsing `/read/1ch/17` directly (not searching) before concluding this is a corpus
limitation** — the actual gap may be A048, or a display-only issue, not missing data.

---

## Part 4 — Technical briefs for ledger items still open (file/line detail, one section per ledger bucket)

### §4b Real bugs

**B015 — "Suggested readings" never completes for an uploaded document.**
`web/src/app/api/user-corpus/documents/[id]/readings/route.ts` (~line 69) schedules the job via
`after(async () => { await runReadingsJob(...) })`. The job itself
(`web/src/lib/user-corpus/readings-job.ts`) is real, working code — not a stub — and has completed
successfully in the past per `WORKLOG.md`'s 2026-08-06 entry. `runReadingsJob` always ends by writing
`running`/`ready`/`failed`; it can never leave a row on `pending`/0% once it actually starts. The QA
transcript shows exactly that — stuck at `pending`/0% for 25+ seconds — which means the most likely
explanation is that the `after()` callback **never ran at all**. `after()` depends on the Vercel
deployment keeping the function instance alive past the response (`waitUntil`/Fluid Compute); no
`fluidCompute` setting exists in `web/vercel.json`. **First step: confirm Fluid Compute /
background-function support is actually enabled for this Vercel project**, and add a diagnostic log
at the very top of `runReadingsJob` (before any `await`) to check whether it fires at all in
production on a hung search. If it never fires, move this off `after()` onto the existing Postgres
`FOR UPDATE SKIP LOCKED` queue pattern already used for ingestion (`web/src/lib/user-corpus/queue.ts`).

**B013 — 4 persistent console errors on every desk page (two 401s, one 403, one `ERR_BLOCKED_BY_CLIENT`).**
Strongest lead: `web/src/components/sidebar.tsx` fires `fetch('/api/studies')` (~line 563) and
`fetch('/api/research?limit=...')` (~line 668) on every page, gated behind `mounted && session?.user`.
Both routes call `requireUser()` → 401 on failure. If `authClient.useSession()` (Better Auth)
resolves a stale/expired client-side session (session object present, server cookie/token invalid),
both would 401 identically on every page — matches "present identically on every page of the desk
session" exactly. No route in the codebase returns 403 (`grep -rln "status: 403" src/app/api` is
empty), so that one and the `ERR_BLOCKED_BY_CLIENT` (a browser-extension signature, not a server
response) need a live Network-tab capture to localize — can't be found from source alone. **Fix
approach once confirmed:** if it's the stale-session race, add a session-freshness check before
firing these two fetches, or accept the 401 as expected-and-swallowed (both already handle 401 as
"empty list" in app logic) and just suppress the console noise for that specific expected case.

**B016 — Uploaded file size shows "0 KB" for a ~130-byte file.**
Root cause fully confirmed, trivial fix. `web/src/components/my-works.tsx` line 39:
```ts
const fmtBytes = (n) => (n == null ? '' : n < 1024*1024 ? `${Math.round(n/1024)} KB` : ...);
```
`Math.round(130/1024)` = `Math.round(0.127)` = `0`. Add a bytes-scale branch:
`n < 1024 ? `${n} B` : n < 1024*1024 ? `${Math.max(1, Math.round(n/1024))} KB` : ...`.

**A084 — Malformed chapter routes fire wasted `NaN` backend fetches.**
`web/src/app/read/[book]/[chapter]/page.tsx`: the main chapter-fetch effect (~lines 139–158)
correctly guards on `isNaN(chapterNum)`, but two sibling effects don't — commentary prefetch
(~211–217) and original-language prefetch (~219–225, guards only `if (!book) return`) both fire
regardless, building URLs like `/commentaries/jhn/NaN.json`. **Fix:** hoist one
`validChapter = !isNaN(chapterNum) && chapterNum >= 1 && chapterNum <= (book?.chapterCount ?? 0)`
and add `if (!validChapter) return` to both.

### §4c Missing affordances / dead ends

**A027 — No next/previous-verse control in the study panel.**
`web/src/components/study-panel.tsx` header (~lines 100–117) has no adjacency-aware props. The
caller, `web/src/app/read/[book]/[chapter]/page.tsx` (`study` state, ~126–166), already has
everything needed (`data.verses`, `study.verse`). **Fix:** add `onPrevVerse`/`onNextVerse` props to
`StudyPanel`, render two header buttons, wire the page to `setStudy(s => ({...s, verse: s.verse±1}))`
— the verse-text/word/entry fetches are already `useMemo`'d off `study.verse` so this falls out for
free. At chapter boundaries, reuse `prevChapter`/`nextChapter` from `web/src/lib/bible.ts`.

**A028 — Adjacent verse click closes the panel instead of switching.**
`study-panel.tsx`'s backdrop (~lines 84–89, `fixed inset-0 z-50` with an `onClick` that closes on
any click whose target is the backdrop itself) sits over the verse column rendered underneath, and
swallows clicks on verse numbers before they ever reach `verse-display.tsx`'s own
`onClick={() => openVerse(v.verse)}` handler — the number is visible through the translucent scrim
but not clickable. **Fix:** pair with A027 — forward a click on any `[data-verse]`/verse-number
element to the same prev/next-verse switch logic instead of closing, rather than closing-then-requiring-reopen.

**A042 — Standalone `/library/word-study` is a strictly thinner tool than the reader's interlinear lexicon.**
Standalone (`web/src/app/library/word-study/page.tsx`, `EntrySheet`) renders only
Definition/Derivation/KJV usage from a bare lexicon hit — no morphology, no cross-verse occurrence
list, no commentary link. Reader path (`web/src/components/word-panel.tsx`) additionally calls
`fetchConcordance()` for an occurrence list and a "Read commentaries" CTA, and decodes morphology
because it has the actual verse-context word object. This is a **product-scope question, not a pure
bug** — flag for a decision: give the standalone page the same occurrence-list/commentary-link
treatment, or make it explicitly a pure dictionary lookup with a link into the reader for the fuller tool.

**A035 — Out-of-range chapter routes are a dead end with no recovery.**
`web/src/app/read/[book]/[chapter]/page.tsx`, the bounds-check error render (~lines 275–281) is a
bare centered `<p>`, same branch handles both out-of-range and unknown-book. **Fix:** add a link back
to the book's chapter 1 (`bookUrl(book, 1)` from `web/src/lib/bible.ts`) when the book resolved but
the chapter didn't, and/or surface the existing `BookPicker` (already used by `ReaderHeader`) so the
reader can pick a valid chapter without editing the URL bar.

**A034 — "Bible" bottom-nav tab always hardlinks to John 1.**
`web/src/components/mobile-nav.tsx` line 50: `{ href: '/read/jhn/1', ... }` — a literal, not derived
from any stored position. **Fix:** persist the last-visited `/read/[book]/[chapter]` to `localStorage`
from the reader page (read only inside a `useEffect`, per this codebase's hydration-safety
convention — see the note on A041/#418 below), have the tab prefer it when present.

**A044 / A045 — Word-study occurrence links jump to chapter top (not verse), and drop interlinear mode.**
Both trace to `web/src/components/word-panel.tsx`'s occurrence link (~lines 149–157):
`href={`/read/${slug}/${chapter}`}` — no verse anchor appended, and it's a plain `<a>` causing a
full page navigation, which resets the reader's local `interlinear` state
(`useState(false)` in `read/[book]/[chapter]/page.tsx` line ~101 — plain component state, not
persisted). **Fix A044:** append `#v${verse}` (the verse number is available from the same
`decodeVerseId` call already in scope) — reuses the existing `#v<n>` deep-link handling. **Fix A045:**
either carry interlinear mode as a query param the link can set, or persist it to `localStorage`
(same hydration-safety pattern as A034).

**A054 — Hymnal ToC cannot browse or filter by scripture reference.**
`web/src/lib/work-reader.ts`, `tocGroups()` (~lines 98–141): its `keyOf` switch handles
`'devotional'`, `'lexicon'`, `'commentary'` (grouping by Bible book via `decodeVerseId`), but
**`'hymn'`/`'poetry'` aren't in the switch**, so it returns `null` for every hymnal — no grouping at
all — even though hymn ToC units carry the same `verseStart`/`verseEnd` fields the commentary branch
already uses (confirmed real per A047/A052 above). **Fix:** add `sourceType === 'hymn' || 'poetry'`
to the same branch already written for `'commentary'`. Optionally extend `filterTocUnits()` to also
match against the formatted verse range, not just heading text.

**B043 — Desk has no nav entry point (desktop or mobile).**
Already **owner-authorized** — `docs/pm/orders/2026-08-17-three-ux-rulings.md` (ruling R1, "ok do
it") names this the first, cheapest fix to ship. `web/src/components/sidebar.tsx`'s
`SidebarNavContent` is shared by both the desktop rail and the mobile "Open menu" drawer
(`mobile-nav.tsx` line 134) — one `<SidebarLink href="/desk" .../>` addition there closes both
surfaces at once. *(Note: at the time this brief was written, an in-progress uncommitted edit to
`desk/page.tsx`/`desk-pane.tsx`/`desk.ts` suggested this may already be underway — check current
state before starting.)*

### §4d Copy, labels, a11y, layout

**B044 — Unlabeled Menu button silently signs out (BLOCKER).**
`web/src/components/sidebar.tsx`, the sign-out control is a `SidebarButton` (~lines 952–972)
instantiated at ~204–229, positioned between "Ask"/"Reading plans" and "Prayer journal" — exactly
where a reader reaching for something else could mis-tap it. `SidebarButton` has no explicit
`aria-label` (name-from-content should compute "Sign out" by spec, but don't rely on that). **Fix,
two parts:** (1) add `aria-label={label}` explicitly to the `<button>` in `SidebarButton`; (2)
replace the immediate `authClient.signOut()` call (~lines 212–228) with the same two-step
arm/confirm pattern already used elsewhere in this exact file for research-thread delete
(~641–643/723–735) — every other destructive control in this codebase already confirms before
acting; this is the one that doesn't.

**A033 — Background verse buttons stay in the a11y tree while the study dialog is open.**
`web/src/lib/use-dialog.ts` (`useDialog`, ~lines 51–99) traps `Tab` via a keydown listener but never
applies `aria-hidden`/`inert` to sibling content — a screen reader's browse-mode navigation isn't
gated by JS keydown handling at all. **Fix:** apply `inert` (or `aria-hidden="true"`) to the reading
page's other top-level content on dialog mount, remove on unmount — centralize via an optional
`backgroundRef` param on the shared `useDialog` hook rather than per-caller.

**A040 — Bible reading position doesn't persist, unlike Library works.**
Same underlying mechanism as A034 — no persistence exists for the plain Bible reader's position at
all. Same fix location and hydration-safety caveat.

**A066 — Catalog row's "open work" link has no accessible name.**
`web/src/app/library/[catalog]/page.tsx` (~lines 189–206): the link does contain visible text
children (title/author/type spans) which should compute a real accessible name by spec — no
`aria-hidden` trick found. Likely either a QA-tooling reading, or the name reads ambiguously rather
than literally empty. **Fix regardless (cheap and removes ambiguity):** add an explicit
`aria-label={`Open ${w.title}${w.author ? `, ${w.author}` : ''}`}`, matching the pattern already
used on the adjacent "+ add to desk" link on the same row.

### §4e Needs a small decision first

**B038 — Two "settings" surfaces (`/settings` vs `/account/settings`).**
Correction to the ledger's framing: `web/src/app/settings/settings-form.tsx` (~lines 162–170)
**already links to `/account/settings`** (added in commit `e196e4b`, specifically to fix this same
orphaned-surface complaint once before) — so it's not undiscoverable, just one extra hop, buried
under a small "Email and password →" link among four other sections. **Cheapest fix:** add a direct
`SidebarLink` for `/account/settings` in the main nav (`sidebar.tsx`, right after the existing
`/settings` link), rather than merging the two pages — they have genuinely different concerns
(device-local reading prefs, static, vs. server-rendered/auth-gated account state).

**B030 — "+ Add to study" inserts the whole chapter, not the matched excerpt.**
`web/src/lib/studies.ts`, `insertClippingFromSection` (~lines 524–563) snapshots the entire
`sections.body` row into the new block — there's no use of the `ts_headline`-generated excerpt the
search UI already displays for preview. The per-block "Trim" control only operates after the fact.
**Suggested fix (smaller than it looks):** at insert time, default `trim_start`/`trim_end` to the
matched excerpt's byte offsets within `s.body` — the search engine already knows the matched span
for `ts_headline`; thread it through from `library-search` → the POST body → the INSERT, validated
server-side the same way `trimBlock` already validates trims. The block displays trimmed by default;
the full quote stays safely stored underneath.

### §6 Corpus & retrieval lane (all carry the accuracy diagnostic + held-out eval per CLAUDE.md — do not ship without it)

**A047 — Watts's "When I Survey the Wondrous Cross" not linked to Galatians 6:14.**
Root cause fully confirmed, and it's a one-line allowlist gap, not a corpus problem — the data is
already correct. `web/public/commentaries/gal/6.json` has the entry, correctly anchored, with
`work: "watts-psalmshymns"`. But `web/src/lib/teacher/routing.ts` (~lines 138–146),
`SERVED_SONG_VERSE_WORKS`, lists `watts-hymns`/`watts-psalms` (older Gutenberg-sourced slugs) — not
`watts-psalmshymns` (a later, separate CCEL edition). This single constant gates *both* the static
JSON commentary files and the DB search index, so the whole CCEL Watts edition is silently
unserved everywhere, not just this one hymn. **Fix:** add `'watts-psalmshymns'` to
`SERVED_SONG_VERSE_WORKS`. Run the accuracy diagnostic before shipping — this changes what's retrieved.

**A048 — Passage search omits the Hymns & Sacred Poetry lane entirely.**
Deliberate design, confirmed in code: `web/src/lib/teacher/routing.ts`'s `EXEGETICAL_FTS_EXCLUSION`
(~line 257) unconditionally excludes `register IN ('hymn','poetry','sermon','theology','confession','historian')`
from the full-text search index — to keep the "register wall" (these must never present as
exegetical commentary or count toward the ≥2-voices floor). The side effect: there is **no way to
full-text-search hymns/poetry at all**, only chapter-by-chapter browsing reaches them. **Fix:** add a
second, separately-labeled query path (a lane-aware branch in `web/src/lib/commentary-search.ts`)
that searches `register IN ('hymn','poetry')` and renders in its own section, never merged into the
exegetical result list. This is real retrieval work — carries the eval.

**B031 — Historical Background lane returns irrelevant Josephus excerpts.**
Root cause confirmed: `web/src/lib/teacher/retrieve.ts`, `retrieveRegisterLane()` tries an
on-passage-range query first; the entire historian lane is one work
(`SERVED_HISTORIAN_WORKS = ['josephus-whiston']`, `routing.ts` ~121–123) with nothing tied to most
NT verses, so on-range returns 0 rows. It then unconditionally falls back to `lanePoolSql`
(`routing.ts` ~404–409) — a bare top-3 nearest-neighbor search over the whole corpus with **no
minimum similarity threshold**, always returning exactly 3 rows regardless of match quality. **Fix:**
add a minimum-score floor to the fallback, or skip the historian lane entirely when on-range is
empty rather than backfilling with an unrelated top-K — this lane is labeled-context-only (never fed
to the composer), so silently omitting weak matches is safe.

**A036 — θεός (G2316) gloss shows "figuratively" instead of a meaning.**
Reclassify: this is mostly a **UI rendering gap, not a corpus/lexicon defect** — the correct primary
sense ("a deity... the supreme Divinity") is already present in the same lexicon entry's
`derivation` field; `def` genuinely is Strong's secondary/figurative-usage note for many
theologically dense headwords in the source dictionary. `web/src/components/study-panel.tsx`,
`WordRow` (~lines 336–358) renders only `entry.def`/`entry.kjv` — `entry.derivation` is never shown
in the *reader's* study panel, though `word-panel.tsx` (the interlinear path) already renders both.
**Fix (cheap, UI-only, no eval needed):** render `entry.derivation` before `entry.def` in
`study-panel.tsx`'s `WordRow`, matching `word-panel.tsx`'s existing order. A separate, lower-priority
data-cleaning pass over `greek.json`/the Hebrew equivalent (where `def` doesn't stand alone) is real
corpus work if pursued later — don't conflate the two.

**A055 — Greek-text scholarly commentary on James filed under Hymns & Poetry.**
Exact location confirmed: `ingest/sources.config.json`, entry `hort-james1909` (~line 19789),
`"source_type": "poetry"` — should be `"commentary"` (neighbors in the file are tagged
`"theology"`/`"historian"`, so this reads as a one-off mistagging, not a batch error). **Fix:**
correct the field, propagate to the `sources` table / re-run the register step. Pure metadata,
no eval needed.

**A064 / A065 / A053 — same batch as A055, pure metadata, no eval needed:**
- **A064** (Hymns tradition filter fragmented by capitalization): `web/src/lib/catalog.ts`,
  `catalogTraditions()` groups by raw stored string with no normalization. Only lowercase
  `"anglican"` exists in tracked ingest config — capitalized variants live only in the live DB.
  Enumerate live variants (`SELECT DISTINCT tradition FROM sources WHERE source_type IN ('hymn','poetry')`),
  normalize once via migration, and add `LOWER(TRIM(...))` inside the `GROUP BY` so it can't refragment.
- **A065** (Manton's set split by title prefix): `ingest/sources.config.json` — 3 of 9 Manton
  volumes (VI, VII, XX) are titled `"Works of..."` instead of `"Complete Works of..."` like the
  other 6, splitting the alphabetical sort. Edit the 3 entries to match, re-publish.
- **A053** (OCR artifact "Col. 9. 16" in a Watts hymn heading): confirmed dead cosmetic text in the
  source transcription — does not affect the actual verse anchor (`epigraphAnchor()` only uses the
  *first* reference found in the heading, which is correct). Low-priority source-text correction, not blocking anything.

**A050 — "Ignatius" search ranks Loyola above Ignatius of Antioch.**
Not a ranking bug — a corpus gap. Confirmed: `ingest/sources.config.json` has exactly two
Ignatius-authored works, both Ignatius of Loyola (`ignatius-exercises`, `ignatius-autobiography`).
**There is no primary-source work for Ignatius of Antioch at all.** The search
(`web/src/lib/search-sections.ts`) ranks by plain `ts_rank_cd` with no entity disambiguation —
correctly favoring the two dense, dedicated Loyola works over sparse incidental mentions of Antioch
elsewhere. **Durable fix:** ingest real Ignatius-of-Antioch primary text (the seven authentic
letters, public domain via ANF vol. 1 or Lightfoot's *Apostolic Fathers*) — a coverage fix, not a
ranking patch. A ranking-side mitigation (boosting dedicated-work hits) is a larger feature; don't
attempt as a quick patch.

---

## What this doc does not cover

Everything in the ledger's **§5 Open — owner** (gate password needed, deploy timing, the desk
persistence design question, ADR-047's tap-target ruling, latency-vs-copy call) is unchanged by this
pass — those are still yours, not the fixer's. This doc also does not re-litigate anything the
ledger already marked "Not reproduced" or "No action" — only the two corrections in Part 1 override
a prior disposition.
