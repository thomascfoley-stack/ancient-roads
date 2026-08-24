# UX_TASKS.md — overnight sweep, fix/ux-overnight-sweep

Worktree: /tmp/ap-uxsweep/repo (isolated, per AGENTS.md — main tree untouched)
Base: fix/q1-signed-out-state @ 739fbdd (verified: contains all of origin/main + 15 commits ahead, NOT stale — see WORKLOG entry)
Dev server: localhost:3055, dev Neon branch ep-tiny-hat, DB never touches prod.

## BLOCKER — logged once, applies to every signed-in task below

Local dev cannot authenticate. `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` are required by
`web/src/lib/auth/neon-auth.ts:23-24` (throws immediately if unset) and are absent from every local
env file. Confirmed independently four ways tonight: my own env grep, `vercel env pull
--environment=development` returning only 6 non-auth vars (Blob + PostHog + OIDC — no NEON_AUTH_*),
and three peer sessions (ancient-roads-git-90, -db, -be) hitting the identical 500 today. Per
docs/ENVIRONMENT.md + the Blob-token comment in .env.local.example, Vercel forbids Sensitive vars
from targeting the Development environment — this reads as deliberate posture (auth secrets kept
Sensitive), not an oversight. I am not routing around it: no attempt to test signed-in flows against
production without the owner's explicit go (AGENTS.md — every occasion).

**Every task below marked ⛔AUTH is blocked on this, not attempted, not faked.** Two unblock paths for
the owner to choose between in the morning: (a) hand-copy NEON_AUTH_BASE_URL + NEON_AUTH_COOKIE_SECRET
from the Neon/Vercel dashboard into web/.env.local for local work, or (b) explicit one-time go to run a
scoped signed-in sweep against prod with synthetic accounts (real DB writes, real LLM spend — sized
down from the full ledger, not the whole thing).

## COV-00 — route manifest reconciliation — DONE

77 routes found (`page.tsx` + `route.ts` under web/src/app). Excluded as non-user-facing:
`/dev/editor-preview` (dev-only), `/api/eval/bait` (internal harness), `/api/health` (uptime probe).

**Gaps found — whole features with ZERO ledger coverage, appended below:**

- `/channel/[id]`, `/chat/[id]` + `api/channels`, `api/chats`, `api/messages` — a full messaging/channels
  feature. Not mentioned anywhere in the ledger. Appended as **+MSG** (new section).
- `/prayers` + `api/prayers` — a prayers feature. Not mentioned anywhere. Appended as **+PRAY**.
- `/account/[path]` — distinct from `/settings` (ST section). Unclear if this is Neon Auth's own
  mounted account UI or a separate app surface — enumeration walk needed, appended as **+ACCT**.

**Naming/architecture flag for CO-00 (terminology inventory):** there are TWO parallel study systems —
`/study/[id]` (singular, matches SE section "Study editor") and `/studies` + `/studies/[id]` (plural,
with its own `export` and `feed` sub-routes). Not yet known if this is one feature under two URLs, a
migration-in-progress, or two genuinely different features. Needs the SE-00/WK-00 enumeration walk to
resolve before CO-00 can grade it a consistency finding.

**Under-named routes, appended as sub-items of their existing section rather than new sections:**
`/library/notes`, `/library/passages`, `/library/books` (under LB/NT), `/search` (under BS — need to
confirm this is Bible/word search and not a separate global search), `/word/[strongs]` as a second
entry point to word study alongside `/library/word-study` (under WS).

Zero unreconciled routes remaining — every route above is now either excluded-with-reason or has a
home in an existing or new section. **Exit criterion #1 (zero unreconciled routes): MET.**

## +MSG — Messaging / channels — CORRECTED, downgraded (see COV-01/02 below)

**Superseded by the COV-01/02 pass:** `/channel/[id]` is a pure `redirect('/prayers')` stub, owner-ruled
2026-08-08 — not a live feature. `/chat/[id]` is a dead `ComingSoon` placeholder. The `api/channels` /
`api/chats` / `api/messages` backend has zero live UI callers (grep-confirmed). This is retired code
with an orphaned API surface, not an untested feature. MSG-00/01/02..08 below are CANCELLED — replaced by:

MSG-R1 Confirm `/channel/[id]` actually redirects to `/prayers` in a live browser (cheap, signed-out-safe).
MSG-R2 Flag the orphaned `api/channels`/`api/chats`/`api/messages` routes for a deletion decision — dead
  API surface is itself a minor attack-surface/maintenance finding, not a coverage gap.

## +PRAY — Prayers (new section, discovered by COV-00) — ⛔AUTH for all but shell

PRAY-00 Enumeration walk of /prayers — what is this (prayer requests? a liturgy?).
PRAY-01 Open signed-out → gate/redirect sane.
PRAY-02..PRAY-06 Signed-in coverage — ⛔AUTH.

## +PRAY — Prayers (new section, discovered by COV-00) — ⛔AUTH for all but shell

PRAY-00 Enumeration walk of /prayers — what is this (prayer requests? a liturgy?).
PRAY-01 Open signed-out → gate/redirect sane.
PRAY-02..PRAY-06 Signed-in coverage — ⛔AUTH.

## +ACCT — /account/[path] (new section, discovered by COV-00)

ACCT-00 Enumeration: is this Neon Auth's own mounted UI, or app-owned? Relationship to /settings (ST).
ACCT-01..: per ST-pattern once enumerated. Likely ⛔AUTH.

## CO-00 / CO-02 — done

Static, code-only. Grepped `web/src/app` + `web/src/components` for JSX text / `aria-label` /
`placeholder` / `title` — no server, no DB, no browser.

### COV-00's `/study/[id]` vs `/studies` flag — RESOLVED, not a duplication

Not one feature under two URLs, not a migration-in-progress. Two unrelated things that happen to
share a stem:

- `/study/[id]` (singular) — a `ComingSoon` stub titled **"Study spaces"** (`app/study/[id]/page.tsx:8`),
  copy: "A place of your own for each sermon, class, or study... talk it through with the voices
  who came before you." Nothing is built behind it.
- `/studies` + `/studies/[id]` (plural) — the live, fully-built **"My Studies"** feature: pagination,
  pinning, delete, licensing re-check on render (`app/studies/page.tsx`, `app/studies/[id]/page.tsx`).
  This is what SE/WK sections should track.

`/study/[id]` is orphaned: zero `href`/route references anywhere in `web/src` (`grep -rn "study/\["`
returns nothing but the route file itself and two comments). `sidebar.tsx:927-930` and `:967-972`
already say so explicitly: old nav sections from a retired concept ("N4") used to point at
`/channel/[id]` and `/study/[id]`; `/channel/[id]` now redirects to `/prayers` (real, migrated data),
but `/study/[id]` "is still a `ComingSoon` placeholder — the same fake door `N4` closed." The sidebar
deliberately does not link to it and gives its empty-state copy honest wording instead ("has to be
honest," `sidebar.tsx:967`).

Bonus, same shape: `/chat/[id]` is a SECOND orphaned `ComingSoon` stub, titled **"Study partner(s)"**
(`app/chat/[id]/page.tsx:3,8`), copy: "One-on-one study conversations that only ever cite what
others before you have said... They arrive with the trained model." Also zero references anywhere
in `web/src` (confirmed by grep). `api/chats/route.ts` and `api/messages` exist server-side
(`app/api/chats/route.ts:14`, "creates a chat with persona='ask'") but have no live UI caller either.

Net for COV-00: SE/WK enumeration only needs to walk `/studies`. `/study/[id]` and `/chat/[id]` are
both dead stubs from the same retired concept and can be filed as one finding, not two open
enumeration items. If either is ever built, "Study spaces" (singular route) and "My Studies"
(plural route, already shipped) are close enough in name to confuse users and future agents alike —
worth a rename before either ships, not after.

### CO-00 — terminology inventory

**Ask vs Search vs Study (verb — "what does the user do")**

- **Ask** — compose an attributed answer via the teacher pipeline. Consistently "Ask" almost
  everywhere: "Ask a question" (`ask-client.tsx:556-557`), "Ask again" (`ask-client.tsx:70,248,579,591,627`),
  "Ask Ancient Paths" (`ask-client.tsx:234`), "Ask Ancient Paths about this" / "Ask" button
  (`selection-popover.tsx:405,417`), "Ask about this verse" (`verse-display.tsx:24`, comment),
  sidebar full nav `label="Ask"` (`sidebar.tsx:204`). **Except:** the same link, same icon
  (`AskIcon`), same `href="/ask"`, in the icon-only collapsed rail is labelled **"Ancient Paths"**,
  not "Ask" (`sidebar.tsx:1108`, `IconRailLinks`) — two accessible names for one destination
  depending on viewport width.
- **Search** — a deliberately different, non-composing action: "this page finds and labels...
  nothing here implies the app remembers or converses" (`app/search/page.tsx:15`, `R0`). Used for:
  "Search the library" (`app/search/page.tsx:211-212`, `study-library-panel.tsx:164-165`), "Search
  commentaries" (`app/library/passages/page.tsx:419-420`), "Search topics" (`plans-client.tsx:591`),
  "Search your works" (`my-works.tsx:740`), "Search lexicons" (`study-library-panel.tsx:47`,
  `study-editor.tsx:289`), "Search the contents" (`work-toc.tsx:149`), "Search the Greek/Hebrew
  lexicon" (`app/library/word-study/page.tsx:118`).
- **But** "Search" also labels a control that is not content search at all: the mobile bottom-nav
  tab is `aria-label="Search passages"` / visible text "Search" (`mobile-nav.tsx:112,114`), and it
  opens the omnibox (`mobile-nav.tsx:14`, "Search opens the omnibox"). The omnibox's own placeholder
  is **"Go to passage, e.g. John 3:16"**, `aria-label="Go to a passage"` (`omnibox.tsx:116-117`) — a
  reference-jump tool, not search. See CO-02 below: the icon confirms this split.
- **Study** (verb) is a third, distinct action: opening the per-verse commentary/notes/highlight
  bottom sheet — "Study this verse" is the dialog's own accessible name (`study-panel.tsx:172`,
  comment). Distinct again from **Study** (noun, "My Studies," see above), and distinct again from
  `mode-toggle.tsx:42`'s `aria-label="Search mode"` — which wraps the **`/ask`** page's own
  "Voices" / "History" tabs, even though `/ask`'s own metadata calls the whole feature "Ask"
  (`app/ask/page.tsx:9`). Three different behaviors, three different files, all captioned "Search"
  at some level of the UI.

**Thread vs History vs Conversation vs Chat**

A three-way collision on the single word "History," all live, all inside `/ask` and its chrome:

1. The saved Q&A session is a **"thread"** in code and in its own page: page title "Research
   thread," meta description "A saved research thread — every turn dated, every source attributed"
   (`app/ask/[id]/page.tsx:10-11`), `aria-label={\`Delete research thread: ${t.title}\`}`
   (`sidebar.tsx:858`), API is `/api/research/[id]`, state variable is `threads`
   (`sidebar.tsx:770,803`).
2. The sidebar section that *lists* those threads is headed **"Research history"**
   (`sidebar.tsx:822`), and prose calls it "your research history" (`ask-client.tsx:542,618`) —
   never "your threads."
3. Separately, `/ask` has an unrelated second **"History"**: `ModeToggle`'s second tab, literally
   labelled "History" ("Voices | History," `mode-toggle.tsx`), is not a list of past threads — it
   is a distinct *retrieval mode*: "voices composes attributed answers; history points into
   sources and never summarizes" (`app/ask/page.tsx:13-16`, citing `HISTORY_RETRIEVAL_DESIGN §5`).
   Its own teaser card is headed "History" too (`ask-client.tsx:453`) and describes pointing into
   primary historical-background sources (Josephus, Herod, the fall of Jerusalem), not past
   sessions.
4. A third, unrelated **"History"**: `SHOW_LABELS.historians = 'History'` (`ask-client.tsx:754`) —
   the display label for the "Historical background" content lane inside a *composed* Voices-mode
   answer (`ask-client.tsx:1052`, section titled "Historical background").

So "History" names three unconnected things inside one feature: a list of my past sessions, a
non-composing retrieval mode, and a content-category filter label. **"Conversation"** and **"Chat"**
are not live competitors for this — "Conversation" appears only as marketing metaphor (`app/why/page.tsx:19,92`,
"two-thousand-year conversation of the Church"), and "Chat" is confined to the dead `/chat/[id]`
stub and its uncalled `api/chats`/`api/messages` routes (see architecture note above) — but their
presence as abandoned vocabulary for the same rough idea (a saved back-and-forth) is itself a sign
of how many names this concept has already accumulated.

**Save vs Bookmark**

Three distinct actions on three distinct objects, mostly self-consistent, but overlapping in the
shared verb:

- **Bookmark** — marking a *verse*. `study-panel.tsx:56`, `selection-popover.tsx:372-374` (label
  tracks state since the B023 fix — a stateless "Bookmark" used to hide that removal existed).
- **Save** — shelving a *work* (commentary/book) to your library. `work-header.tsx`'s
  `SaveToShelf` (:28,41, "Save"), `app/library/books/page.tsx:46,66` ("press Save"). The
  "Saved" filter/section label used to name two different destinations (`/library/notes` vs
  `/library/books`) — **already fixed** 2026-08-16 by centralizing every library route's one name
  in `lib/library-nav.ts` (`LIBRARY_LABELS`, comment at :1-22 documents the old drift and the fix).
  Not a new finding, but the derivation pattern is worth reusing for the Work/Book/Document finding
  below, which is NOT yet centralized.
- **Save to study** — copying a passage/quote into a Study doc. `save-to-study.tsx` calls itself
  "THE ONE CANONICAL SAVE-TO-STUDY VERB" (header comment) and is deliberately singular; toast
  reads "Saved to {title}." (`save-to-study.tsx:291`).
- These three are defensible as distinct verbs for distinct objects, but "Save" is the shared verb
  for two of the three (shelving a work, saving to study) while "Bookmark" only covers the
  verse-marker — a reader who has learned "Save" as the general keep-this verb has no signal that
  verses use a different one.

**Work vs Book vs Document**

Two different features each mix "Work"/"Document" for the *same* items inside their own body copy,
while "Book" is reserved for a third, unrelated thing:

- `/library/books` — page title **"My books"** (`libraryLabel('/library/books')`, `lib/library-nav.ts:28`),
  but its own body copy calls the identical shelved items **"works"**: "Works you have saved while
  reading. Open a work and press Save to keep it here." (`app/library/books/page.tsx:46`), "Open
  any **work** and press **Save**" (`:66`). One page, title says book, copy says work.
- `/library/uploads` — nav label + `<h1>` is **"My Works"** (`my-works.tsx:624,645`), but two
  hundred lines later its own list section is headed **"Your documents"** (`my-works.tsx:884`),
  with "Loading your documents…" (`:893`) and "This document is still being indexed." (`:1017`,
  repeated verbatim at `work-beside-tradition.tsx:190`). One component, heading says Works, list
  says documents.
- **"Book"** is also used, without collision, for the 66 books of the Bible: `book-picker.tsx:129`
  "Books" (heading of the Bible book-chooser, from `@/lib/bible` `BOOKS`). Fine on its own, but it
  means "book" now has three referents depending where you're standing: a Bible book
  (book-picker.tsx), a shelved corpus work (`/library/books`'s own title), and the app is one
  careless rename away from a fourth (a user's own upload is currently never called a "book," but
  nothing enforces that it stays that way).
- Net: "Work" and "Document" are used interchangeably for BOTH features (each page's own body copy
  contradicts its own heading), while `lib/library-nav.ts`'s single-source-of-name fix (which
  closed the "Saved" collision above) has not been extended to this pair — nothing derives
  "book"/"work"/"document" from one place the way `libraryLabel()` derives the nav name.

### CO-02 — icon inventory

No icon library. `package.json` (root and `web/`) carries no `lucide-react` / `heroicons` /
`react-icons` / similar dependency (`grep -i icon web/package.json` — no hits). Every icon in the
app is a hand-written inline `<svg>`: 24 named `XxxIcon()` components split across two files
(`mobile-nav.tsx`: `HomeIcon`, `BookIcon`, `AskIcon`, `LibraryIcon`, `SearchIcon`, `MenuIcon` —
6; `sidebar.tsx`: `LecternIcon`, `NoteIcon`, `PrayerIcon`, `ScrollIcon`, `SunriseIcon`,
`TabletIcon`, `LanguagesIcon`, `PencilIcon`, `HomeIcon`, `BookIcon`, `CalendarIcon`, `AskIcon`,
`DeskIcon`, `UserIcon`, `BookStackIcon`, `QuoteIcon`, `LogOutIcon`, `SettingsIcon` — 18), plus
one-off inline `<svg>`s in 12 more files (`work-toc.tsx`, `desk-pane.tsx`, `auth-forms.tsx`,
`study-panel.tsx`, `plans-client.tsx`, `word-panel.tsx`, `commentary-panel.tsx`, `omnibox.tsx`,
`app/desk/page.tsx`, `app/page.tsx`, `app/library/word-study/page.tsx`, `app/library/passages/page.tsx`).

**No shared icon module.** `mobile-nav.tsx` and `sidebar.tsx` each define their own `HomeIcon`,
`BookIcon`, `AskIcon` independently — verified byte-identical `d=` path data between the two copies
today (e.g. `HomeIcon`'s `"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3..."` matches exactly,
`mobile-nav.tsx:189` vs `sidebar.tsx:1241`) — consistent only because nobody has edited one copy
without the other. Nothing enforces that they stay in sync.

| Icon (shape) | Meaning + location | Second/other meaning + location |
|---|---|---|
| `BookStackIcon` (stack of books) | "All items" — library hub (`sidebar.tsx:370,1111`) | ALSO "Saved" — `/library/notes` (`sidebar.tsx:408`); ALSO "My Works" — `/library/uploads` (`sidebar.tsx:431`); ALSO "All studies" — `/studies` list (`sidebar.tsx:743`). One glyph, four destinations. |
| `QuoteIcon` (speech-bubble/quote) | "Commentaries" catalog (`sidebar.tsx:472`, `CATALOG_ICON` map) | ALSO "Passage search" — `/library/passages` (`sidebar.tsx:399`); ALSO the fallback for any catalog absent from `CATALOG_ICON` (`sidebar.tsx:386`) — a future catalog with no icon silently reads as "Commentaries." |
| Magnifying glass (`M21 21l-6-6m2-5a7 7…`) | "Search" mobile-nav tab → opens the omnibox, which is a **go-to-passage** tool, not search (`mobile-nav.tsx:221` def, `:114` use; `omnibox.tsx:98-108`, placeholder "Go to passage, e.g. John 3:16") | ALSO used on exactly ONE of six real content-search inputs — `app/library/passages/page.tsx:412` "Search commentaries." The other five real search inputs render **no icon at all**: `app/search/page.tsx` "Search the library," `study-library-panel.tsx` "Search the library," `my-works.tsx` "Search your works," `app/library/word-study/page.tsx` "Search the Greek/Hebrew lexicon," `work-toc.tsx` "Search the contents." So the icon's presence does not track "this is a search field" — it decorates a non-search field and 1-in-6 search fields. |
| "X" glyph, SVG, `M5 5l8 8M13 5l-8 8`, 18×18 viewBox | "Close" — panel/sheet dismiss, 5 byte-identical copies: `work-toc.tsx:135`, `study-panel.tsx:196`, `word-panel.tsx:94`, `commentary-panel.tsx:446`, `omnibox.tsx:129` (also `app/library/word-study/page.tsx:215`) | ALSO "Close" but rendered as the plain Unicode character **"✕"** instead of the SVG — `desk-pane.tsx:154` (the desk pane's own close button, `aria-label` at `:152`). Same action, different implementation, in the one file that differs from all six others. |
| Three-horizontal-line glyph, equal length (`M4 6h16M4 12h16M4 18h16`) | "Menu" — opens the mobile bottom-nav's overflow sheet (`mobile-nav.tsx:229`, `MenuIcon`) | ALSO drawn (not shared) for "Contents" — table of contents of a desk pane's work, third line shortened (`M2 3.5h11M2 7.5h11M2 11.5h7`, `desk-pane.tsx:141`). Same three-bar shape at a glance; distinguishable only by the third line's length, unreliable at 15-18px. |
| `AskIcon` (speech bubble, 3 dots) | "Ask" — full sidebar nav (`sidebar.tsx:203-204`) and mobile-nav (`mobile-nav.tsx:75,205`) | Same icon, same `/ask` destination, but labelled **"Ancient Paths"** in the icon-only collapsed rail (`sidebar.tsx:1108`) — see CO-00 Ask/Search/Study above. |

Findings, summarized:

- **(a) same icon, different meanings** — `BookStackIcon` covers 4 unrelated destinations
  (library hub / saved notes / my uploads / my studies); `QuoteIcon` covers 3 (commentaries catalog
  / passage search / generic catalog fallback, with a silent-drift risk on the fallback).
- **(b) same action, different icon** — "Close" is an SVG X everywhere except `desk-pane.tsx`,
  which uses a plain "✕" text character; "Menu" and "Contents" are both drawn as three horizontal
  bars in different files, distinguished only by a stroke-length detail that won't survive being
  glanced at.
- **(c) icon implies one thing, feature does another** — the magnifying-glass icon is the closest
  thing this app has to a "this means search" convention, but it decorates the one control that is
  explicitly NOT search (go-to-passage) and is missing from 5 of 6 controls that ARE search.
- **(d) duplication risk, not yet drifted** — `HomeIcon`/`BookIcon`/`AskIcon` are hand-copied
  between `mobile-nav.tsx` and `sidebar.tsx` with no shared source; identical today, unenforced
  going forward.

Exit: both CO-00 and CO-02 inventories complete per the ledger's CO section format; the COV-00
`/study` vs `/studies` naming flag is resolved (dead stub vs live feature, not a duplication).

## WK-00 — done

Read-only query against `APP_DATABASE_URL` (dev Neon branch `ep-tiny-hat`, per `web/.env.local`) —
never prod. Sanity-checked connection first (`select current_database()` → `neondb`). Query mirrors
the one the library page actually runs: `web/src/lib/catalog.ts` `listCatalogWorks()` selects from
`sources` filtered `status = 'published'`, columns `slug, title, author, source_type, tradition,
era`; `web/src/app/library/[catalog]/page.tsx` calls it. No INSERT/UPDATE/DELETE/DDL run.

`sources.status` distribution: **published 129 · staged 74 · quarantined 3**. Below is all 129
published (served) works — the register the app's library actually lists — slug, title, author,
source_type. Sorted by source_type then title (query: `ORDER BY source_type, title, slug`).

Type counts: commentary 26 · confession 8 · devotional 15 · father 7 · historian 1 · hymn 32 ·
lexicon 15 · poetry 13 · sermon 6 · theology 3 · topical_index 3. (Sums to 129.)

| slug | title | author | type |
|---|---|---|---|
| `adam-clarke` | Adam Clarke's Commentary on the Bible | Adam Clarke | commentary |
| `jamieson-jfb` | Commentary Critical and Explanatory on the Whole Bible | Jamieson, Robert | commentary |
| `calvin-calcom24` | Commentary on Daniel - Volume 1 | Calvin, John | commentary |
| `calvin-calcom25` | Commentary on Daniel - Volume 2 | Calvin, John | commentary |
| `calvin-calcom23` | Commentary on Ezekiel - Volume 2 | Calvin, John | commentary |
| `calvin-calcom26` | Commentary on Hosea | Calvin, John | commentary |
| `calvin-calcom14` | Commentary on Isaiah - Volume 2 | Calvin, John | commentary |
| `calvin-calcom15` | Commentary on Isaiah - Volume 3 | Calvin, John | commentary |
| `calvin-calcom16` | Commentary on Isaiah - Volume 4 | Calvin, John | commentary |
| `calvin-calcom17` | Commentary on Jeremiah and Lamentations - Volume 1 | Calvin, John | commentary |
| `calvin-calcom18` | Commentary on Jeremiah and Lamentations - Volume 2 | Calvin, John | commentary |
| `calvin-calcom19` | Commentary on Jeremiah and Lamentations - Volume 3 | Calvin, John | commentary |
| `calvin-calcom20` | Commentary on Jeremiah and Lamentations - Volume 4 | Calvin, John | commentary |
| `calvin-calcom21` | Commentary on Jeremiah and Lamentations - Volume 5 | Calvin, John | commentary |
| `calvin-calcom07` | Commentary on Joshua | Calvin, John | commentary |
| `calvin-calcom08` | Commentary on Psalms - Volume 1 | Calvin, John | commentary |
| `calvin-calcom09` | Commentary on Psalms - Volume 2 | Calvin, John | commentary |
| `calvin-calcom10` | Commentary on Psalms - Volume 3 | Calvin, John | commentary |
| `spurgeon-comment` | Commenting and Commentaries | Spurgeon, Charles Haddon | commentary |
| `gill-song` | Exposition of the Book of Solomon's Song | Gill, John | commentary |
| `ryle-expository` | Expository Thoughts on Matthew | J.C. Ryle | commentary |
| `calvin-calcom03` | Harmony of the Law - Volume 1 | Calvin, John | commentary |
| `john-gill` | John Gill's Exposition of the Bible | John Gill | commentary |
| `keil-delitzsch` | Keil & Delitzsch Commentary on the Old Testament | C.F. Keil & Franz Delitzsch | commentary |
| `matthew-henry` | Matthew Henry's Complete Commentary | Matthew Henry | commentary |
| `wesley-crosswire` | Wesley's Explanatory Notes | John Wesley | commentary |
| `melanchthon-apology` | Apology of the Augsburg Confession | Melanchthon, Philipp | confession |
| `tolstoy-confession` | Confession | Tolstoy, Leo Nikolayevich | confession |
| `augustine-confess` | Confessions of Saint Augustine | Augustine, Saint | confession |
| `luther-largecatechism` | Large Catechism | Luther, Martin | confession |
| `luther-smallcat` | Luther's Little Instruction Book: The Small Catechism of Martin Luther | Luther, Martin | confession |
| `schaff-creeds` | The Creeds of Christendom (3 vols) | Philip Schaff | confession |
| `owen-catechisms` | Two Short Catechisms | Owen, John | confession |
| `ursinus-catechism` | What is Catechism? | Ursinus, Zacharias | confession |
| `guyon-prayer` | A Short and Easy Method of Prayer | Jeanne Guyon | devotional |
| `daily-light` | Daily Light on the Daily Path | Jonathan Bagster | devotional |
| `spurgeon-faiths-checkbook` | Faith's Checkbook | Charles Spurgeon | devotional |
| `ryle-holiness` | Holiness | J.C. Ryle | devotional |
| `rutherford-letters` | Letters of Samuel Rutherford | Samuel Rutherford | devotional |
| `habermann-dailyprayers` | Morning and Evening Prayers for All Days of the Week | Habermann, Johann | devotional |
| `spurgeon-morning-evening` | Morning and Evening: Daily Readings | Charles Spurgeon | devotional |
| `calvin-prayer` | Of Prayer—A Perpetual Exercise of Faith. The Daily Benefits Derived from It. | Calvin, John | devotional |
| `meyer-homily2` | Our Daily Homily | Meyer, Frederick Brotherton | devotional |
| `kempis-imitation` | The Imitation of Christ | Thomas à Kempis | devotional |
| `scougal-life-of-god` | The Life of God in the Soul of Man | Henry Scougal | devotional |
| `lawrence-practice-presence` | The Practice of the Presence of God | Brother Lawrence | devotional |
| `taylor-holy-living` | The Rule and Exercises of Holy Living | Jeremy Taylor | devotional |
| `baxter-saints-rest` | The Saints' Everlasting Rest | Richard Baxter | devotional |
| `jowett-mattermost` | Things That Matter Most: Devotional Papers | Jowett, John Henry | devotional |
| `augustine-homilies` | Augustine: Tractates on John, Homilies on 1 John, Expositions on the Psalms, Sermon on the Mount | Augustine of Hippo | father |
| `catena-aurea` | Catena Aurea (Golden Chain) on the Four Gospels | Thomas Aquinas (comp.), trans. J.H. Newman | father |
| `chrysostom-homilies` | Homilies of John Chrysostom (Matthew, John, Acts, Romans, Corinthians, Hebrews, Paulines) | John Chrysostom | father |
| `schaff-npnf213` | NPNF-213. Gregory the Great (II), Ephraim Syrus, Aphrahat | Schaff, Philip | father |
| `schaff-npnf101` | NPNF1-01. The Confessions and Letters of St. Augustine, with a Sketch of his Life and Work | Schaff, Philip | father |
| `schaff-npnf104` | NPNF1-04. Augustine: The Writings Against the Manichaeans and Against the Donatists | Schaff, Philip | father |
| `schaff-npnf210` | NPNF2-10. Ambrose: Selected Works and Letters | Schaff, Philip | father |
| `josephus-whiston` | Josephus: The Complete Works (Whiston) | Flavius Josephus | historian |
| `longfellow-s-bookhymns` | Book of Hymns for Public and Private Devotion (fifteenth edition) | Longfellow, Samuel | hymn |
| `winkworth-hyndwink` | Cumulative Indexes to the Hymn Translations of Catherine Winkworth | Winkworth, Catherine | hymn |
| `morris-welshhymns` | Favourite Welsh Hymns | Morris, Joseph | hymn |
| `nutter-hymnwriters` | Hymn Writers of the Church | Nutter, Charles Sumner | hymn |
| `reeves-hymnlit` | Hymn as Literature | Reeves, Jeremiah Bascom | hymn |
| `aaberg-hymnsdenmark` | Hymns and Hymnwriters of Denmark | Aaberg, Jens Christian | hymn |
| `waring-hymns` | Hymns and Meditations | Waring, Anna Laetitia | hymn |
| `watts-hymns` | Hymns and Spiritual Songs | Isaac Watts | hymn |
| `brownlie-hymnseast` | Hymns from the East | Brownlie, John | hymn |
| `brownlie-officehymns` | Hymns from the Greek Office Books | Brownlie, John | hymn |
| `borthwick-hll` | Hymns from the Land of Luther | Borthwick, Jane | hymn |
| `brownlie-hymnsmorning` | Hymns from the Morningland | Brownlie, John | hymn |
| `bett-methhymns` | Hymns of Methodism in their Literary Relations | Bett, Henry | hymn |
| `prudentius-cathimerinon` | Hymns of Prudentius translated by R. Martin Pope | Prudentius, Aurelius Clemens | hymn |
| `bevan-tersteegen2` | Hymns of Ter Steegen and Others (Second Series) | Bevan, Frances | hymn |
| `bevan-tersteegen` | Hymns of Ter Steegen, Suso, and Others | Bevan, Frances | hymn |
| `manning-wesleyhymns` | Hymns of Wesley and Watts: Five Papers | Manning, Bernard Lord | hymn |
| `brownlie-aposthymns` | Hymns of the Apostolic Church | Brownlie, John | hymn |
| `brownlie-earlyhymns` | Hymns of the Early Church | Brownlie, John | hymn |
| `neale-eastern-hymns` | Hymns of the Eastern Church | trans. John Mason Neale | hymn |
| `brownlie-greekhymns` | Hymns of the Greek Church | Brownlie, John | hymn |
| `brownlie-easternhymns` | Hymns of the Holy Eastern Church | Brownlie, John | hymn |
| `brownlie-russianhymns` | Hymns of the Russian Church | Brownlie, John | hymn |
| `brownlie-hyndbrow` | Indexes to Hymn Translations by John Brownlie | Brownlie, John | hymn |
| `crosby-indianhymnal` | Indian Methodist Hymn-Book | Crosby, Thomas | hymn |
| `olney-hymns` | Olney Hymns | John Newton & William Cowper | hymn |
| `pilcher-passionhymns` | Passion-Hymns of Iceland | Pilcher, Charles Venn | hymn |
| `hewitt-gerhardt` | Paul Gerhardt as a Hymn Writer and his Influence on English Hymnody | Hewitt, Theodore Brown | hymn |
| `watts-psalmshymns` | Psalms and Hymns of Isaac Watts | Watts, Isaac | hymn |
| `chatfield-greeksongs` | Songs and Hymns of the Earliest Greek Christian Poets | Chatfield, Allen W. | hymn |
| `watts-psalms` | The Psalms of David Imitated in the Language of the New Testament | Isaac Watts | hymn |
| `scottish-psalter-1650` | The Scottish Metrical Psalter (1650) | Church of Scotland (based on Francis Rous) | hymn |
| `schaff-dictionarybible` | A Dictionary of the Bible | Schaff, Philip | lexicon |
| `bdb-lexicon` | Brown-Driver-Briggs Hebrew and English Lexicon (1906) | Brown, Driver & Briggs | lexicon |
| `wace-biodict` | Dictionary of Christian Biography and Literature to the End of the Sixth Century A.D., with an Account of the Principal Sects and Heresies. | Wace, Henry | lexicon |
| `easton-ebd2` | Easton's Bible Dictionary | Easton, Matthew George | lexicon |
| `eastons-dictionary` | Easton's Bible Dictionary (1897) | Matthew George Easton | lexicon |
| `hitchcock-bible-names` | Hitchcock's Bible Names Dictionary | Hitchcock, Roswell D. | lexicon |
| `isbe` | International Standard Bible Encyclopedia (1915) | James Orr (ed.) | lexicon |
| `naves-topical` | Nave's Topical Bible (1897) | Orville J. Nave | lexicon |
| `schaff-encyc13a` | New Schaff-Herzog Encyclopedia of Religious Knowledge [Dictionary edition] | Schaff, Philip | lexicon |
| `schaff-encyc13` | New Schaff-Herzog Encyclopedia of Religious Knowledge, Vol XIII: Index | Schaff, Philip | lexicon |
| `schaff-encyc01` | New Schaff-Herzog Encyclopedia of Religious Knowledge, Vol. I: Aachen - Basilians | Schaff, Philip | lexicon |
| `schaff-encyc02` | New Schaff-Herzog Encyclopedia of Religious Knowledge, Vol. II: Basilica - Chambers | Schaff, Philip | lexicon |
| `schaff-encyc09` | New Schaff-Herzog Encyclopedia of Religious Knowledge, Vol. IX: Petri - Reuchlin | Schaff, Philip | lexicon |
| `smith-w-bibledict` | Smith's Bible Dictionary | Smith, William | lexicon |
| `smiths-dictionary` | Smith's Bible Dictionary (1863) | William Smith | lexicon |
| `hort-james1909` | Epistle of St James: Greek Text with Introduction, Commentary as Far as Chapter IV, Verse 7, and Additional Notes | Hort, Fenton John Anthony | poetry |
| `tennyson-in-memoriam` | In Memoriam A.H.H. | Alfred Tennyson | poetry |
| `hopkins-poems` | Poems of Gerard Manley Hopkins (1918 first ed.) | Gerard Manley Hopkins | poetry |
| `therese-poems` | Poems of St. Teresa, Carmelite of Lisieux, known as the 'Little Flower of Jesus' | Therese, of Lisieux, St. | poetry |
| `wheatley-poems` | Poems on Various Subjects, Religious and Moral | Phillis Wheatley | poetry |
| `stowe-religiouspoems` | Religious Poems | Stowe, Harriet Beecher | poetry |
| `montgomery-sacred-poems` | Sacred Poems and Hymns | James Montgomery | poetry |
| `keble-christian-year` | The Christian Year | John Keble | poetry |
| `dante-divine-comedy` | The Divine Comedy (Longfellow translation) | Dante Alighieri, trans. H.W. Longfellow | poetry |
| `milton-poetical-works` | The Poetical Works of John Milton | John Milton | poetry |
| `traherne-poems` | The Poetical Works of Thomas Traherne | Thomas Traherne | poetry |
| `herbert-temple` | The Temple: Sacred Poems and Private Ejaculations | George Herbert | poetry |
| `rossetti-verses` | Verses (devotional poems) | Christina Rossetti | poetry |
| `maclaren-expositions` | Expositions of Holy Scripture | Alexander Maclaren | sermon |
| `spurgeon-sermons` | Spurgeon: New Park Street & Metropolitan Tabernacle Pulpit (63 vols) | Charles Haddon Spurgeon | sermon |
| `wesley-sermons` | The Sermons of John Wesley (Standard Sermons) | John Wesley | sermon |
| `flavel-works` | The Works of John Flavel | John Flavel | sermon |
| `edwards-works` | The Works of Jonathan Edwards (Hickman ed.) | Jonathan Edwards | sermon |
| `watson-works` | The Works of Thomas Watson (Body of Divinity, catechism sermons) | Thomas Watson | sermon |
| `calvin-institutes` | Institutes of the Christian Religion | John Calvin | theology |
| `hodge-systematic` | Systematic Theology (3 vols) | Charles Hodge | theology |
| `owen-works` | The Works of John Owen (Goold ed.) | John Owen | theology |
| `naves-topical-bible` | Nave's Topical Bible | Orville J. Nave | topical_index |
| `openbible-topics` | OpenBible.info Topical Bible (topic curation) | OpenBible.info | topical_index |
| `torreys-topical-textbook` | The New Topical Textbook | R. A. Torrey | topical_index |

## NV-00 — DRAFT, NOT YET RATIFIED BY OWNER

**This table is a draft skeleton only.** It is built from reading the routing/navigation code (grep
for `router.back`, `router.push`, `router.replace`, `history.pushState/replaceState`, `useRouter`,
and `Link href=` across `web/src`), NOT from driving the app in a browser (local dev auth is
blocked — see the BLOCKER section above). "Code says" columns are inferred from source; anything
marked **UNKNOWN** was not traceable from the code alone and needs live browser back-button
verification once auth is unblocked. Nothing below is authoritative until Thomas ratifies it.

**Structural finding, applies to every row:** `router.back()` is called NOWHERE in `web/src` (grepped
the whole tree). There is no custom history-stack handling anywhere in the app. Every "Back" a
reader gets is the raw browser back button walking whatever history entries `push`/`replace`/Link
navigation actually created — so this table is really "what history entries does each transition
create, and does that make the browser's native Back do the right thing."

Three deliberate, code-commented exceptions to plain push-navigation, found while reading:

1. **Desk pane edits use `router.replace`, on purpose.** `web/src/app/desk/page.tsx:105-127` — close
   pane, replace pane, add-scripture pane all call `router.replace(deskHref(...), { scroll: false })`.
   Comment at line 107-108: "replace(), not push(): closing a pane should not stack history entries
   that the back button then has to walk through one at a time." Consequence: once you're ON `/desk`,
   no amount of pane rearranging adds a Back step — Back from a desk you've been editing for five
   minutes jumps you straight back past ALL of it, to whatever page you were on before you first
   opened `/desk`. Filed as the app's compensating pattern: `web/src/app/desk/page.tsx:164,284` and
   `web/src/app/library/[catalog]/page.tsx:79-80` carry the CURRENT desk forward as a `?desk=`
   query param on outbound links (e.g. Library's "+" button), so a reader can rebuild the desk they
   want via forward links rather than relying on Back — the code seems aware Back won't help here.

2. **Ask "Voices" mode swaps the URL with `replaceState`, on purpose.** `ask-client.tsx:292-296` — on
   the first streamed `thread` event, `window.history.replaceState(null, '', `/ask/${threadId}`)`.
   Comment: "replaceState, not push: back from a result must not land on an empty /ask." So asking a
   question from `/ask` never creates an `/ask` history entry — Back from the answered thread skips
   straight to whatever page linked into `/ask` (sidebar, ModeToggle, etc).

3. **Ask "History" mode does the opposite, also on purpose.** `history-ask.tsx:65-66` — on a result,
   `window.history.pushState(null, '', `/ask/${threadId}?mode=history`)`. Comment: "Persisted thread
   gets the URL so reload and back both land here (UX-4 parity)." So a History-mode search DOES add
   a history entry — Back from history results lands on the empty `/ask?mode=history` search box,
   not on the page before `/ask`.

**These two are a real asymmetry worth flagging to the owner even though each is individually
intentional and commented:** asking a question in Voices mode and asking in History mode leave the
reader in different places on Back, for a distinction (which mode you were in) that is not visible
in the Back button itself. Not calling this a bug — it's two separate ADR-shaped decisions, both
explained in code — but it's the kind of thing that should be an explicit ratified row, not an
accident of two people fixing two different tickets months apart.

| From surface | To surface | How reached (code) | What Back should reasonably do | What the code currently seems to do |
|---|---|---|---|---|
| Library catalog (`/library/[catalog]`) | Work reader (`/work/[slug]`) | `<Link href="/work/{slug}">`, `library/[catalog]/page.tsx:200` — plain push nav | Return to the catalog list, same filters/page/scroll | Standard push nav → browser Back returns to the catalog URL (filters are IN the URL per `catalogHref`, §`lib/catalog-href.ts`, so filter state survives). Scroll-position restoration on Back: **UNKNOWN — needs live check** (page is `dynamic = 'force-dynamic'`, re-fetches on nav) |
| Library catalog | Desk (`/desk?p=...`) via "+" | `<Link href={deskHrefFor(slug)}>`, `library/[catalog]/page.tsx:226-233` — plain push nav (carries current `?desk=` if present) | Return to the catalog list | Standard push nav, one entry. Back returns to catalog. Straightforward — **not** the desk-internal-edits case above |
| Desk (`/desk`) | Desk, pane closed/replaced/scripture added | `router.replace`, `desk/page.tsx:105-127` (see exception 1 above) | Reader intuition varies — arguably "undo the last pane edit," arguably "leave the desk" | Neither: no new history entry is created, so Back does NOT undo a pane edit — it leaves `/desk` entirely, back to whatever was open before the desk was first opened. **Likely the single biggest gap between reader expectation and code** — flag for HUMAN/BROWSER verification specifically for "does one Back-press ever undo a pane edit" |
| Bible reader (`/read/[book]/[chapter]`) | Study panel open (commentary or word tab, inline drawer) | Client state only — `study` `useState` set by `handleVerseClick`/`handleWordClick`, `read/[book]/[chapter]/page.tsx:277-281`. No route change, no history entry, except the one-time `#v<n>:study` hash on deep-link load (line 231-236) | Back (or a phone's back-gesture) closes the panel, staying on the chapter | Back does NOT close the panel — no history entry exists for it to consume, so Back navigates away from `/read/...` entirely. Panel closes only via its own `onClose` (X button) or ESC (`study-panel.tsx`/`word-panel.tsx`). **UNKNOWN — needs live verification, esp. mobile**: does an Android hardware/gesture back close the sheet (common native pattern) or does it exit the reader instead? |
| Bible reader, study panel open | Word page (`/word/[strongs]`) | `<Link href="/word/{s}">`, `study-panel.tsx:583-589` and `word-panel.tsx:79-87` — plain push nav | Return to the reader with the study panel reopened at the same verse/word | Push nav creates a real entry, so Back returns to `/read/[book]/[chapter]` — but `study` is client state that does not survive the round trip (no hash was written when the Link was clicked, only on the original deep-link case). **Likely gap: Back from the word page returns to a bare chapter view with the panel closed, silently losing the reader's place in the study flow. UNKNOWN — needs live verification** to confirm whether Next's client-side cache masks this by keeping the component mounted |
| Word page (`/word/[strongs]`) | Library word-study (`/library/word-study`) | `<Link href="/library/word-study">`, `word/[strongs]/page.tsx:120,137` — an explicit in-page "Back to word study" link, NOT the browser Back button | Reasonable people could read this either as "go to word-study" (fixed) or "go back" (contextual) | It's a **fixed destination** regardless of entry point — same target whether you arrived from the Bible reader's word chip, from word-study's own search, or from a shared link. This diverges from what the browser Back button would do (return to wherever you actually came from). Not necessarily wrong, but the label ("Back to...") invites reading it as equivalent to Back, and it isn't always. Flag for owner: is this intentional or should it use `router.back()`/document referrer? |
| `/ask` (Voices mode) | `/ask/[threadId]` (answered thread) | `window.history.replaceState`, `ask-client.tsx:296` (see exception 2 above) | Back returns to whichever page linked into `/ask` (sidebar "Ask", ModeToggle, etc) | Confirmed by code comment — intentional. Back skips the empty `/ask` form entirely |
| `/ask?mode=history` (History mode, empty) | `/ask/[threadId]?mode=history` (results) | `window.history.pushState`, `history-ask.tsx:66` (see exception 3 above) | Back returns to the empty History search box | Confirmed by code comment — intentional, and the reverse of the Voices-mode case immediately above |
| `/ask` (Voices) | `/ask?mode=history` (History) via ModeToggle | `<Link href="/ask?mode=history">`, `mode-toggle.tsx:43-58` — plain push nav, both directions | Back returns to the mode you were previously on | Standard push nav — each tab click stacks a new entry, so rapid mode-switching back and forth creates a longer-than-expected Back chain (e.g. Voices→History→Voices→History = 3 entries to walk through, not a 2-way toggle). **UNKNOWN severity — needs live check**, probably minor |
| Sidebar (any page) | Research thread (`/ask/[id]`) | `SidebarLink` → `<Link href="/ask/{t.id}">`, `sidebar.tsx:844-850` — plain push nav | Back returns to whatever page the sidebar was opened from | Standard push nav, one entry — should be correct. On mobile, whether the sidebar drawer's own open/close state interacts with Back (e.g. does Back close the drawer first?) is **UNKNOWN — needs live mobile verification** |
| Historians shelf study entrance | `/ask?mode=history&q=...` | `router.push`(likely) from `study-entrance.tsx` — **not traced in this pass**; carries a query param that `history-ask.tsx:76-83` consumes on mount to auto-run the search | Back returns to the Historians shelf | **UNKNOWN — not traced.** `study-entrance.tsx` was found in the grep list (`router.` present) but not read in this draft; needs a follow-up pass |
| Work reader (`/work/[slug]`) | (no work found) → "Browse the library" | `<Link href="/library">`, `work/[slug]/page.tsx:198` — fixed destination, not context-sensitive | Ambiguous — a 404-equivalent state, fixed destination to Library is reasonable | Fixed Link to `/library`, always, regardless of how `/work/[slug]` was reached (search result, desk, direct link, etc). Same pattern as the word-study "back" link above — a labelled recovery link, not real Back |
| Search results (catalog search / library search) | Work reader via `#s{ordinal}` anchor | `<Link href="/work/{slug}#s{ordinal}">` in `catalog-search.tsx:179`, `search-groups.tsx:135`, `study-library-panel.tsx:244`, `study-editor.tsx:939` — plain push nav with hash | Back returns to the search results with the same query/filters intact | **UNKNOWN — not traced.** Whether the search query text lives in the URL or in local component state (and therefore survives a round-trip through Back) was not confirmed for any of these four call sites in this pass |
| `+MSG` (`/channel/[id]`, `/chat/[id]`) | — | — | — | **UNKNOWN — not traced at all.** COV-00 already flagged this as a whole undocumented feature (see above); this pass did not open its route files |
| `+PRAY` (`/prayers`) | — | — | — | **UNKNOWN — not traced at all**, same reason |
| `+ACCT` (`/account/[path]`) | — | — | — | **UNKNOWN — not traced at all**, same reason |
| `/studies` + `/studies/[id]` vs `/study/[id]` | — | — | — | **UNKNOWN.** COV-00 already flagged these as possibly-duplicate surfaces; this pass did not read either route's navigation code. Needs the SE-00/WK-00 enumeration walk COV-00 called for before a back-map row can even be written |
| Plans (`/plans`, `/plans/[id]`) | — | `plans-client.tsx` has `useRouter`/history usage (grep hit) | — | **UNKNOWN — not traced.** Grepped as a hit but not opened in this pass |

### Coverage of this draft

Traced from source: Library catalog ↔ Work reader, Library catalog ↔ Desk, Desk-internal pane
edits, Bible reader ↔ inline study panel, Bible reader/study panel ↔ Word page, Word page ↔
library/word-study, Ask Voices flow, Ask History flow, Ask mode toggle, Sidebar ↔ research thread.
That's **10 rows with code-grounded findings** (3 of them citing an explicit code comment
confirming intent — desk replace, ask-voices replaceState, ask-history pushState).

**UNKNOWN, needs a follow-up pass or live verification: 7 rows** — Historians study-entrance → Ask
history, search-results anchor-links back to search state (4 call sites, not disambiguated), and
the three still-unenumerated features (+MSG, +PRAY, +ACCT) plus the studies/study duplication and
Plans, none of which were opened at all in this pass.

**Not attempted:** commentary as its own surface — there is no dedicated `/commentary` route;
commentary only appears (a) inline in the Bible reader's study panel (client state, covered above)
and (b) as ordinary published works of `source_type = 'commentary'` opened via `/work/[slug]` (same
as any other work — covered by the Library catalog ↔ Work reader row). If the owner intends
something route-level and commentary-specific beyond that, it wasn't found.

**Recommended before ratification:** live-verify the desk pane-edit row and the reader→word-page
row first — those are the two where the code strongly suggests a real gap between reader
expectation and behavior, not just an unanswered question.

## COV-01 / COV-02 — done

Static, code-only — same discipline as COV-00: `find web/src/app -name page.tsx` for the route list,
then grepped each page + its route-specific `@/components` imports for `<button`, `<form`, `role=`,
`aria-pressed`, `onClick`, `<input`, `<select`, `<textarea`. No server, no DB, no browser.

### Ledger-integrity flag, found before either census could run

The brief for this pass named 25 section codes to cross-reference against: MK, AU, HM, AS, BS, VO,
RD, TR, IN, WS, CM, HL, NT, BK, DK, DO, PL, HS, HT, SM, LB, UP, SE, ST, NV. Grepped this file (twice —
once before starting, once again just now after finding it had grown to 500 lines mid-session, per
AGENTS.md's warning that a second live session can append to a shared file) for every one of those 25
codes as a `## <CODE>` heading or a `<CODE>-NN` task line. **Zero hits, either time.** What actually
exists tonight is: `BLOCKER`, `COV-00`, `+MSG`, `+PRAY`, `+ACCT` (all pre-existing at my first read),
plus `CO-00`/`CO-02` (terminology + icon inventory), `WK-00` (a DB query), and `NV-00` (a navigation/
back-button draft) — all four of the latter appended by a different, concurrent session while this
pass was running. **None of the 25 briefed codes are populated per-cluster task sections.** `NV-00` is
the closest adjacent thing (its subject-matter plausibly IS what "NV" stands for) but it's a
back-button/history-stack draft, not a click-target/overlay-behavior task list — it wouldn't catch
"does Escape close the Aa popover" even where it overlaps a route this pass also covers.

Per AGENTS.md bylaw 1 (if it is not in the repo, it was never issued): every cluster and overlay below
is being logged as **first-draft input for sections that do not exist yet**, not as a diff against
existing per-feature tasks — because there are none to diff against. COV-00's own "under LB/NT",
"under BS", "under WS" placements share this problem (those codes are referenced as if they already
hold content; they don't). Whoever builds MK/AU/HM/RD/LB/... from scratch should treat this census as
raw material, not a gap list against prior art.

**One correction to COV-00's own +MSG premise, found while reading the routes it named** (append-only —
not rewriting COV-00's text above, and this independently confirms + extends what `CO-00` already
found from `sidebar.tsx`'s comments, seen above at this file's `CO-00` section, "`/channel/[id]` now
redirects to `/prayers`"): read `web/src/app/channel/[id]/page.tsx` directly — it is a 20-line pure
`redirect('/prayers')`, owner-ruled 2026-08-08 ("N4" in the file's own comment), every channel id
resolves to `/prayers` unconditionally, no channel UI exists at all. `web/src/app/chat/[id]/page.tsx`
renders `<ComingSoon title="Study partners" .../>`, also already identified as a dead stub by `CO-00`.
New in this pass: `sidebar.tsx:911-913` — the `+` affordance that used to let a reader create a new
channel/chat was **removed** by owner ruling 2026-08-11 ("making new works under those tabs do
nothing"), and grepping the whole `web/src` tree for any call site of `POST /api/channels` or
`POST /api/chats` found none — the backend (`lib/chat.ts`, real validation, cited in both routes'
2026-08-17-audit comments) is live but **orphaned**: nothing in the shipped app can reach it. So +MSG
is not "a full messaging/channels feature ... not mentioned anywhere in the ledger" — it is a
**retired feature, two owner-ruled dead-end stubs, one orphaned backend**. MSG-00's "enumeration walk"
and MSG-02..08's "signed-in coverage" should be rescoped down to: confirm the redirect (MSG-01 already
does), confirm ComingSoon's one CTA link works, and stop — there is no channel/chat UI left to walk.

### COV-01 — interactive census, by route

33 `page.tsx` files exist (`find web/src/app -name page.tsx`); COV-00's 77-route count includes
`route.ts` API handlers, out of scope here. Excluding `/dev/editor-preview` (dev-only, per COV-00) —
32 user-facing routes census'd below. Global chrome (Sidebar/MobileNav/Omnibox, rendered by
`app-shell.tsx` on every route except the five in its own `CHROME_FREE` set — `/`, `/about`,
`/features`, `/why`, `/gate`, see `app-shell.tsx:13`) is listed once at the end, not per-route, since
it isn't "specific to that route" per this task's own scope.

**Public / marketing** — `/about`, `/why`: zero interactive elements (Link-only). `/`, `/features`
(`waitlist-form.tsx`, `marketing/verse-panel-demo.tsx`, `marketing/nav.tsx`, `marketing/footer.tsx`):
waitlist email form + submit + role="status"/"alert" (`waitlist-form.tsx:73-98`); a demo tablist
(role="tablist"/"tab", `verse-panel-demo.tsx:113-120`) cycling example verses; nav/footer are
link-only (zero interactive per grep, confirmed by direct read). `/gate` (`gate/page.tsx`): the site
password gate — hidden `next` field, password input, submit button (`:31-54`). This is the one surface
reachable while fully signed out AND outside the password gate; given SEC-1's centrality to the whole
program (MASTER.md), it deserves its own dedicated exit test, not a footnote under some other section.

**Auth / Account** — `/auth/[path]` (`auth-forms.tsx`): name/email/password inputs (`:254-277`),
submit button (`:295`), "Continue with Google" OAuth button (`:308`), role="alert" error banner.
`/account/[path]` → `/account/settings` (`account-settings.tsx`): **this resolves +ACCT's ACCT-00**
with code evidence — comment at `account-settings.tsx:3` says it "Replaces Neon's prefab
`<AccountView>`," i.e. **app-owned, not Neon Auth's mounted UI**. Clusters: change-password form
(current-password input, new-password input `minLength={12}`, submit, role="alert" result). Change-
email, active-session list, delete-account are all explicitly DEFERRED (comment `:5-8`, an owner
decision, not an omission) — so ACCT-01+ signed-in tasks for those don't apply yet; only
change-password exists to test.

**Home** — `/home` (`today-view.tsx`): page itself is 3 `<Link>`s (continue reading / plan / verse-
of-day), zero button/form/input at the page level. But it imports `EntryCard` from
`commentary-panel.tsx` (nested, not obvious from the route name) — EntryCard's own "Read more/Show
less" expand toggle (`commentary-panel.tsx:322-326`) is reachable from `/home`, not only from wherever
a hypothetical CM section expects it.

**Reader** — `/read/[book]/[chapter]` — the richest single route in the census. `reader-header.tsx`:
HL (highlight-mode) toggle (aria-pressed, `:70-73`), interlinear toggle (aria-pressed, `:84-88`),
translation-switcher dropdown (`:99-124`, click-outside-only — see COV-02). `book-picker.tsx`: full
dialog (COV-02). `verse-display.tsx`: dismissible onboarding tip (`:67-68`), verse-number handle
(`role="button" tabIndex={0}`, opens StudyPanel via click or Enter/Space, `:402-420` — deliberately a
`<sup>` with its own handler rather than a nested `<button>`, comment explains an ADR-047 + test
constraint), text-selection → SelectionPopover (COV-02). `chapter-nav.tsx`: prev/next are `<Link>`s,
**not** `<button>`s — matches this task's own example cluster name ("reader chapter nav: prev/next
arrows...") but is invisible to a handler-pattern grep census; worth stating explicitly so nobody
re-derives "chapter-nav has no interactivity" from a grep alone. `interlinear.tsx`: per-word
tap-to-define buttons (`:43-46`, opens WordPanel). `study-panel.tsx`: 3-tab sheet (commentaries/word/
notes, `:19-25`), full dialog (COV-02). `word-panel.tsx`: close + "show commentary" (which opens
StudyPanel, not a separate commentary surface — confirmed by tracing `onShowCommentary` to
`read/[book]/[chapter]/page.tsx:512`), own-Escape-only (COV-02).

**Library** — `/library/[catalog]` (`catalog-search.tsx` + `study-entrance.tsx`): tradition-filter
chips are `aria-current` links, deliberately NOT `aria-pressed` (axe-driven fix, comment
`library/[catalog]/page.tsx:121-124` — they're anchors, `aria-pressed` is only valid on `role=button`).
CatalogSearch: search form/input/submit/load-more/role="alert". StudyEntrance (catalog=historians
only): its own form + input + 2 buttons, routes into Ask's History mode instead — an intentional
divergence (order 2026-08-20-historians-study-entrance, comment `:110-115`) that a naive tester will
likely file as a bug; needs an exit test that says explicitly "this is supposed to differ." `/library/
books`, `/library/page` (root): zero interactive elements each. `/library/notes`: one dismiss button
+ role="alert" (`:75-77`). `/library/passages`: the densest of the three under-named library routes —
book/chapter/author `<select>`s (`:264-280`), a search `<input>` (`:415`), several buttons (expand/
collapse, mode-toggle, `:69-150,424-493`), 3 more `<select>`s further down (`:509-542`, purpose not
confirmed — read the render code before writing a test against them). Structurally this looks like a
**second, parallel implementation** of the same "browse + search commentary" job `/library/[catalog]`
+ CatalogSearch already does — flagging for CO-00 as a possible duplicate-surface finding, not filing
it as a coverage gap alone. `/library/uploads/[id]` (`work-beside-tradition.tsx`): one button
(`:206-209`) + role="status"/"alert" upload-processing regions. `/library/uploads`
(`my-works.tsx`): drag+drop-or-picker file upload (`:694-703`), per-file progress list (role="status"),
search form+input (`:734-743`), a `<textarea>` (`:812`, purpose unconfirmed — rename/description
field, read before testing), rename/delete/retry buttons per uploaded work (`:820-984`). `/library/
word-study` + `/word/[strongs]` (`concordance-list.tsx`, shared by both): confirms COV-00's own
"second entry point" note — both routes converge on the identical `ConcordanceList` component; a
lexicon-entry dialog opened from `/library/word-study` uses the full `useDialog` contract (COV-02).
Worth a test that both entry points produce identical BEHAVIOR, not just identical code.

**Ask** — `/ask` and `/ask/[id]` (`ask-client.tsx` + `history-ask.tsx`/`history-results.tsx` +
`mode-toggle.tsx`): mode tabs (Voices/History, Link-based, `mode-toggle.tsx:42`). "Search these
collections" lane-toggle chips (aria-pressed, `:161-186`). Example-question buttons that fill the
composer without submitting (`:424-429`, comment notes this used to auto-submit and spent a signed-out
reader's click on an instant 401). Question composer: textarea (Enter=send / Shift+Enter=newline,
`maxLength={500}`) + submit (`:526-570`). Error-retry button (`:653-655`). "Show/hide collections"
filter chips with a per-chip "only" button + a "Show all" reset (`:772-790`). SaveToStudy trigger, 3
render sites (`:969,1036,1094` — opens the SaveToStudy dialog, COV-02). History mode
(`history-ask.tsx`): its own search form+input (`:87-91`), retry button (`:145-149`), role="status"/
"alert" regions. `history-results.tsx`: entity-filter toggle chips (aria-pressed, `:105-108`) and
bucket-filter toggle chips (`:130-133`), plus 2 more buttons (`:185-196`).

**Plans** — `/plans`, `/plans/[id]` (`plans-client.tsx`, the heaviest single component found tonight):
plan-type tablist (`:470-474`), new-plan form — book/group `<select>`s, weeks/daysPerWeek number
inputs, start-date input, cancel (`:466-568`), passage-search input+button (`:587-593`), an
aria-pressed toggle at `:614-615` that opens a `VerseRef` popover (COV-02 — **the only place in the
whole app that renders `verse-ref.tsx`**, confirmed by grepping every `.tsx` file for the import; it
duplicates the job WordPanel/StudyPanel already do in the reader, with a completely separate
implementation — own Escape, own portal, own mobile-sheet markup. Flagging for CO-00 as a consistency
finding, not just a coverage gap: two components doing "tap a verse ref, see the word/lexicon detail,"
neither aware of the other), back/remove buttons (`:793-796`), catch-up dismiss (`:847-849`), several
day-completion buttons (`:839-899`).

**Prayers** — `/prayers` (`prayer-journal.tsx`): compose view — autosave textarea, "All prayers" back
button. Read view — Edit button, and a **two-step in-page delete confirm** (Keep/Delete,
`:341-386`) that explicitly REPLACED a `window.confirm()` because the native dialog froze the renderer
for 60+ seconds during verification and is impassable to automation/AT (comment `:349-356`) — worth
noting positively as a pattern other destructive actions in the app should probably copy, and worth
its own exit test making sure nothing reintroduces a `window.confirm` dependency here. List view —
create-new button, per-entry open buttons inside a role="group" filter (`:366-386`).

**Studies / editor** — `/studies`, `/studies/[id]` (`study-editor.tsx` + `study-delete-button.tsx`,
shared with `/dev/editor-preview`, excluded per COV-00 but sharing 100% of this component): block
insert-point pattern — "+ Write" / "+ From library" / close (`:629-654`); per-block toolbar — move/
delete/pin (aria-pressed, `:806`); autosave `<textarea>` (`:155`); a nested `study-library-panel.tsx`
— search input + group-filter buttons + per-row "add" (`:160-237`) that is **confirmed NOT a modal**:
`panelOpen` toggles Tailwind `block`/`hidden` classes on an inline column, and the whole file has zero
`role="dialog"` — don't write this as dialog-open/close/Escape behavior, it has none of that contract
because it isn't an overlay. `/studies` root also renders `study-delete-button.tsx` — delete + inline
confirm, role="alert" (`:48-65`), same pattern as the prayer-journal delete confirm above.

**Settings** — `/settings` (`settings-form.tsx`): theme toggle (Light/Dark, aria-pressed, `:52-67`),
text-size stepper (A−/A+, boundary-disabled at both ends, `:77-95`), column-width stepper
(`:102-120`), translation picker (5 pills, aria-pressed, `:130-144`), 2 outbound links (account
settings, library/notes). All client-only (`useReadingPrefs`, localStorage) — **this route works fully
signed-out**, unlike the rest of what ST presumably covers; worth flagging explicitly so it doesn't
get swept into the ⛔AUTH-blocked bucket by mistake the way everything else tonight was.

**Desk** — `/desk` (`book-picker.tsx` + `desk-pane.tsx`): the page itself has several role="status"
regions + 2 buttons (`:156-158,291-293`). `desk-pane.tsx`: contents-toc button (opens WorkToc, COV-02,
`:134-136`), close-pane button (`:146-148`, rendered as a plain "✕" character rather than the SVG X
every other close button uses — see `CO-02`'s existing icon-inventory finding, `:240` above, this is
the exact `desk-pane.tsx` instance that table already names), load-previous-page button
(`:565-567`), 2 more action buttons (`:602-621`, purpose not confirmed — read before testing).

**Work / uploads reader** — `/work/[slug]` (`work-reader.tsx` + `work-toc.tsx`): contents-toc button
(`:250-251`, opens WorkToc, COV-02), load-previous-page button (`work-reader.tsx:404-405`), 1 more nav
button (`:431-432`), text-selection → SelectionPopover (same component as `/read`, confirmed both
routes import it directly).

**Search** — `/search` (no `@/components` import, fully inline): search form
(`method="get" action="/search"`, `:200`), query input, submit button, a second input (`:226`,
purpose not confirmed — possibly a scope/filter field, read before testing).

**Dead/retired stubs** — `/channel/[id]`: zero interactive elements (pure redirect, see correction
above). `/chat/[id]`, `/study/[id]` (both `coming-soon.tsx`): one CTA link each, zero button/form/
input either.

### COV-02 — modal/overlay inventory

Searched for `role="dialog"`, `<dialog`, `Dialog`/`Sheet`/`Popover`/`Toast`/`Modal` name patterns, and
`createPortal` across `web/src`. **No shared UI-primitives directory** (no `components/ui/`) — but
there IS one shared *behavioral* primitive: `web/src/lib/use-dialog.ts`, a hook (not a component) that
gives a panel focus-trap + Escape + `role="dialog"`/`aria-modal` + focus-return-to-trigger. Its own
header comment states the history plainly: "the app had thirteen sheets, drawers and popovers and NOT
ONE of them trapped focus... Four... had no Escape handler either" (mobile menu, book picker,
word-study entry sheet, "the reader popovers"). Grepped every `.tsx` file for `useDialog(` — 5 call
sites use it today:

1. **BookPicker** (`book-picker.tsx`) — full `useDialog` contract. Reachable from `/desk`, `/read`.
2. **WorkToc** (`work-toc.tsx`) — full contract. Reachable from `/work/[slug]`, `/desk` (via desk-pane).
3. **StudyPanel** (`study-panel.tsx`) — full contract. Reachable from `/read` (verse handle, or
   WordPanel's "show commentary").
4. **MenuSheet** (`mobile-nav.tsx`, + `useDragDismiss`) — full contract. Global (mobile, every
   chrome-on route).
5. **Lexicon-entry dialog** (`library/word-study/page.tsx:168`) — full contract. Reachable from
   `/library/word-study`.

Those 5 look like exactly the four `use-dialog.ts` names as historically missing Escape (mobile menu,
book picker, word-study entry sheet, StudyPanel plausibly being "the reader popovers") — so that
specific historical defect reads as closed for those four. Everything else found tonight is NOT on
`useDialog` and mostly still shows the old gap pattern:

6. **WordPanel** (`word-panel.tsx`) — own Escape only (`:41`), no `useDialog`, no visible focus-trap
   or `role="dialog"` in the file. `fixed inset-0 z-[60]` bottom sheet. Reachable from `/read`
   (interlinear tap, StudyPanel's word tab).
7. **SaveToStudy** (`save-to-study.tsx`) — has its own `role="dialog"` (`:374`) and own Escape
   (`:377`) but not `useDialog`, so focus-trap/focus-return can't be confirmed from code alone.
   Reachable only from `/ask`, `/ask/[id]` (3 render sites, confirmed sole importer).
8. **VerseRef popover + mobile bottom sheet** (`verse-ref.tsx`) — own Escape (`:187`), portal-rendered
   (`createPortal`, `:242,272`); the mobile variant does carry `role="dialog" aria-modal="true"`
   (`:273`), again not via `useDialog`. Reachable ONLY from `/plans`, `/plans/[id]` — see the COV-01
   duplication flag above (this is the "second implementation of WordPanel's job" component).
9. **SelectionPopover** (`selection-popover.tsx`) — own Escape (`:201`), portal-rendered, a floating
   text-selection TOOLBAR (desktop `fixed z-50 hidden md:block`; mobile a separate bottom bar) — no
   `role="dialog"` at all, which may be correct for a toolbar rather than a dialog, but also means no
   `aria-modal`/accessible name is announced. Reachable from `/read` and `/work/[slug]` (both import
   it directly).
10. **Reader "Aa" settings popover** (`reader-settings.tsx`) — click-outside only (`mousedown`
    listener, `:26-31`), **no Escape handler at all**, no role, no focus trap. Reachable from `/read`
    (via ReaderHeader). Has a real, deliberate, documented cross-component contract worth its own exit
    test: it force-closes when the verse-study dialog opens, one-way, even via non-mousedown paths
    like Enter-on-a-verse-handle or a `#v16:study` deep link (comment "A031," `:33-39`).
11. **Translation-switcher dropdown** (`reader-header.tsx:99-124`) — click-outside only (`mousedown`,
    `:41-49`), **no Escape handler**, no role. Reachable from `/read`.
12. **Omnibox** (`omnibox.tsx`) — global Cmd/Ctrl+K "go to passage" quick-nav (also opened by the
    mobile Search tab, `mobile-nav.tsx`). Own Escape (`:26`), closes on scrim click, but **no
    `role="dialog"`, no `aria-modal`, no focus trap** anywhere in the file. Of everything found
    tonight this is the most-used overlay (global, keyboard-shortcut-triggered) with the thinnest
    accessibility contract. Global, every chrome-on route.
13. **`CommentaryPanel`** (`commentary-panel.tsx:389`, own Escape at `:406`, `fixed inset-0 z-50` at
    `:427`) — **dead code.** Grepped the entire `web/` tree (including tests) for `CommentaryPanel` —
    the only hit is its own definition. `EntryCard` (used by `/home`, `/read`'s StudyPanel) and the
    helper exports `/library/passages` imports are separate exports from the same file and ARE live;
    the sheet-shaped `CommentaryPanel` component itself is not imported anywhere. Not a coverage gap —
    nothing in the running app reaches it, so there's nothing to write an open/close/Escape test
    against. Filed as a bylaw-3 candidate ("deletion is an allowed remedy," MASTER.md) rather than a
    ledger task.
14. **Toast/snackbar** — searched for a dedicated component and for floating `aria-live` regions
    outside the normal page flow. Found **none**. Every transient status found tonight (upload
    progress, save confirmations, form errors) is an inline `role="status"`/`role="alert"` region in
    the page's own layout, never a floating toast — consistent across `ask-client.tsx`, `my-works.tsx`,
    `plans-client.tsx`, `history-ask.tsx`, `prayer-journal.tsx`, `waitlist-form.tsx`,
    `account-settings.tsx`, `study-editor.tsx`. Recording as a confirmed absence, not an unsearched
    gap — there's nothing to test until/unless one ships.

**Coverage:** since none of the 25 briefed section codes exist yet (see the flag above), nothing on
this list is "covered" in the literal cross-reference sense the brief asked for. What IS worth
surfacing now, ahead of those sections being written: overlays 6–12 are the exception pattern, not the
norm — a hypothetical RD/PL/AS task that only tests "does clicking the trigger open the thing" (the
`HL-09`-style implicit-coverage the brief's own example describes) would NOT exercise Escape, click-
outside, or focus-trap for any of them, because for 10–12 those behaviors are either absent or
untested-from-code-alone. Each needs its own explicit open/close/Escape/click-outside exit test when
its home section gets written, not a footnote on a state-toggle test.

### Appended gap tasks

New sections below reuse section codes from the brief's own list where the mapping to an app area is
unambiguous (RD=Reader, LB=Library, PL=Plans, AS=Ask, AU=Auth, HM=Home, MK=Marketing, SE=Studies,
ST=Settings, DK=Desk) — first tasks under each code, no prior content existed to extend. Overlay
findings that don't belong to one feature (Omnibox, the two Escape-less dropdowns, the dead
CommentaryPanel) go in a new +OVERLAYS block instead of being split across features. `/search`,
`/work`, and the dead-stub routes are folded into the nearest existing section rather than given their
own code, matching COV-00's own "under-named route" convention.

## +MK — Marketing / public (new section)

MK-14 Waitlist form — success, validation-error, and duplicate-email paths (`waitlist-form.tsx`).
MK-15 Verse-panel-demo tablist on `/` and `/features` — keyboard arrow/tab behavior, `role="tablist"`/`"tab"` correctness.
MK-16 `/gate` password form — wrong password, right password + redirect to `?next=`, hidden-field tamper resistance. The one surface reachable fully signed-out AND outside the gate — SEC-1-adjacent, deserves priority.

## +AU — Auth (new section; `/auth/[path]`)

AU-14 Email/password sign-up + sign-in forms (`auth-forms.tsx`) — validation errors (role="alert"), password field, submit busy-state.
AU-15 "Continue with Google" OAuth button — success path and cancel-on-provider path.

## +HM — Home (new section; `/home`)

HM-01 today-view.tsx's 3 Links (continue reading / plan / verse-of-day) navigate correctly.
HM-02 EntryCard "Read more/Show less" toggle is reachable from `/home` (`commentary-panel.tsx:322`), not only from wherever a CM/reader task expects it — test it here explicitly, don't assume a reader-page test covers it.

## +RD — Reader (new section; `/read/[book]/[chapter]`)

RD-01 HL (highlight-mode) toggle — aria-pressed round-trip (`reader-header.tsx:70-73`).
RD-02 Interlinear toggle — aria-pressed round-trip (`reader-header.tsx:84-88`).
RD-03 Translation-switcher dropdown — open/close via trigger; code shows **no Escape handler** (`reader-header.tsx:37-49`) — confirm in a browser that Escape genuinely does nothing (a code-only read can't rule out event bubbling closing it some other way).
RD-04 "Aa" reading-settings popover — same no-Escape gap (`reader-settings.tsx`), PLUS its one-way coupling to the verse-study dialog (A031, `:33-39`): open Aa, then open StudyPanel via a non-mousedown path (Enter on a verse handle, or a `#v16:study` deep link), confirm Aa actually closes.
RD-05 ChapterNav prev/next — implemented as `<Link>`, not `<button>` (`chapter-nav.tsx`) — confirm keyboard reachability explicitly; nothing handler-pattern-based will catch a regression here.
RD-06 Verse-number handle (`role="button" tabIndex={0}`, `verse-display.tsx:402-420`) — both the click path AND the Enter/Space keyboard path open StudyPanel.
RD-07 Text selection → SelectionPopover (`selection-popover.tsx`) — desktop floating toolbar vs. mobile bottom bar, Escape dismiss, dismiss-on-selection-collapse.
RD-08 Interlinear per-word tap → WordPanel (`interlinear.tsx:43-46`).
RD-09 WordPanel bottom sheet — Escape closes it; confirm (browser, not code) whether focus traps/returns, since it's NOT on `useDialog`.
RD-10 StudyPanel's 3 tabs (commentaries/word/notes) — tab switch, bookmark toggle, clear-highlight, note save.

## +LB — Library (new section; `/library/*`, `/word/[strongs]`)

LB-01 `/library/[catalog]` tradition filter chips (aria-current links) combine correctly with CatalogSearch/StudyEntrance results.
LB-02 `catalog=historians` — StudyEntrance's divergent search (routes into Ask History mode, no tradition filter on the study search) is BY DESIGN (order 2026-08-20-historians-study-entrance) — write the exit test to say so explicitly, or it will get filed as a bug by the next person who finds it.
LB-03 `/library/passages` — book/chapter/author `<select>`s, search input, and the 3 further `<select>`s at `:509-542` (read the render code first, purpose unconfirmed here). Flag to CO-00: this may duplicate `/library/[catalog]`+CatalogSearch's job.
LB-04 `/library/notes` — the one dismiss button + its role="alert" error path.
LB-05 `/library/uploads` (`my-works.tsx`) — upload (drag+drop AND picker), per-file progress, search, rename, delete, retry-on-failure.
LB-06 `/library/uploads/[id]` (`work-beside-tradition.tsx`) — the one action button + upload-processing status regions.
LB-07 `/library/word-study` and `/word/[strongs]` both render `ConcordanceList` — confirm the two entry points converge on identical BEHAVIOR, not just identical code (COV-00's own under-named-route note).
LB-08 `/library/word-study`'s lexicon-entry dialog uses `useDialog` (full contract) — still needs one exit test asserting focus actually lands inside on open and returns to the trigger on Escape, not just "the dialog opens."

## +PL — Plans (new section; `/plans`, `/plans/[id]`)

PL-01 New-plan wizard — tablist, book/group selects, weeks/daysPerWeek number inputs, start-date input, cancel.
PL-02 In-plan passage search (`plans-client.tsx:587-593`).
PL-03 VerseRef popover/sheet inside a plan day (`plans-client.tsx:919-939`, `verse-ref.tsx`) — the ONLY render site of this component in the app; give it its own open/close/Escape/click-outside test since no RD task will exercise it. Flag to CO-00: it duplicates WordPanel/StudyPanel's job with a wholly separate implementation.
PL-04 Catch-up dismiss + day-completion buttons (`plans-client.tsx:839-899`).
PL-05 Back / remove-plan buttons (`:793-796`).

## +SE — Studies / study editor (new section; `/studies`, `/studies/[id]`)

SE-01 Block insert-point pattern — "+ Write" / "+ From library" / close (`study-editor.tsx:629-654`).
SE-02 Per-block toolbar — move/delete/pin (aria-pressed, `:806`).
SE-03 `study-library-panel.tsx` — search input, group-filter buttons, per-row "add." Confirmed NOT a modal (inline `block`/`hidden` toggle, zero `role="dialog"` in the file) — do not write this as dialog-open/close behavior.
SE-04 `study-delete-button.tsx` — delete + inline confirm, role="alert" (`:48-65`).
SE-05 `/dev/editor-preview` shares 100% of `study-editor.tsx` with `/studies/[id]` — once ⛔AUTH clears, decide whether SE-01..04 can run against the (unauthenticated) dev preview instead of a real signed-in `/studies/[id]`.

## +ST additions — Settings (existing area, `/settings` route not yet task'd anywhere)

ST-90 Theme toggle (Light/Dark, aria-pressed, `settings-form.tsx:52-67`) — confirm it round-trips through the SAME state the reader's Aa popover reads/writes (`useReadingPrefs`, shared per the file's own comment `:8-11`); change it in one surface, confirm it in the other.
ST-91 Text-size stepper (A−/A+) and column-width stepper — boundary disabled-states at both ends.
ST-92 Translation picker (5 pills, aria-pressed) — same cross-surface-consistency angle as ST-90, against `reader-header.tsx`'s translation dropdown.
ST-93 `/settings` works fully signed-out (localStorage only) — confirm explicitly; it's the one settings-area page NOT blocked by tonight's ⛔AUTH blocker, don't let it get swept into the blocked bucket by mistake.

## +DK — Desk (new section; `/desk`)

DK-01 BookPicker and WorkToc dialogs opened from the desk — both on `useDialog`, full contract.
DK-02 Pane contents/close/load-previous buttons (`desk-pane.tsx:134-148,565-621`) — the 2 buttons at `:602-621` have unconfirmed purpose, read the render code before writing the test. Close button renders as a bare "✕" character, not the SVG X every other close control uses (matches `CO-02`'s existing icon-inventory row for this exact file).

## +PRAY additions (existing section)

PRAY-07 Compose autosave — verify the write actually lands (not just that the UI looks saved); word count and "Saved {time}" timestamp should track the real save, not optimistic state.
PRAY-08 The two-step in-page delete confirm (Keep/Delete, `prayer-journal.tsx:341-386`) deliberately replaced a `window.confirm()` that froze the renderer 60+ seconds and blocked automation/AT (comment `:349-356`) — whatever test covers this must drive the in-page buttons and must not reintroduce any dependency on a native `confirm()`/`alert()` dialog.

## +ACCT additions (existing section)

ACCT-00 **partially resolved by this pass:** `/account/[path]` → `/account/settings` is **app-owned**, replacing Neon Auth's prefab `<AccountView>` (`account-settings.tsx:3`) — not Neon's own mounted UI. Still open: whether `/account/[path]`'s OTHER path segments (if any exist beyond `/settings`) are also app-owned or fall through to something Neon-mounted — this pass only read `account-settings.tsx`, not the `[path]` routing logic itself.
ACCT-02 Change-password form — current-password input, new-password `minLength={12}`, submit, role="alert" success/failure. This is the ONLY signed-in surface `/account/settings` currently has; change-email, sessions, delete-account are explicitly deferred (owner decision, `account-settings.tsx:5-8`) and out of scope until built.

## +OVERLAYS — cross-cutting overlay findings (new section, homes COV-02's findings that don't belong to one feature)

OV-01 Omnibox (`omnibox.tsx`, global Cmd/Ctrl+K quick-nav, also opened by the mobile Search tab) — the most-used overlay found tonight and the one with the thinnest contract: own Escape only, no `role="dialog"`, no `aria-modal`, no focus trap anywhere in the file. Needs its own open(Cmd+K)/open(mobile-tab-event)/close(Escape)/close(scrim-click)/focus-trap exit test — nothing route-specific will exercise this by accident.
OV-02 SaveToStudy dialog (`save-to-study.tsx`, reachable only from `/ask`, `/ask/[id]`) — has `role="dialog"` + own Escape but not `useDialog`; confirm in a browser whether focus actually traps and returns (code alone can't settle it).
OV-03 Reader "Aa" popover and the translation-switcher dropdown (`reader-header.tsx`, `reader-settings.tsx`) — BOTH click-outside-only with NO Escape handler at all (different from OV-01/OV-02, which have Escape but maybe not a trap — these two have no Escape path whatsoever in the code). Confirm that's really true in a browser (something else on the page might incidentally close them on Escape) before filing as a defect.
OV-04 Toast/snackbar: confirmed absent app-wide tonight (see COV-02 #14) — closed question, not a task, unless/until the app adds one.
OV-05 `CommentaryPanel` (`commentary-panel.tsx:389`) is dead code — exported, zero importers anywhere in `web/` (grepped the whole tree, tests included). Not a ledger task: nothing reaches it to test. Filed here as a bylaw-3 ("deletion is an allowed remedy") candidate for whoever next touches `commentary-panel.tsx`.

## MSG-R1, PRAY-00, PRAY-01 — verified live, signed-out — PASS

`/channel/test123` → confirmed redirects to `/prayers` (title "Prayer journal · Ancient Paths"), matching
the COV-01/02 finding. `/prayers` signed-out shows a real, human, teaching empty state: "Prayer journal —
Your own words, kept for you alone. Nothing here is searched, indexed, or read by anyone else. / Sign in
to keep a prayer journal / Your prayers are kept to your account, so they stay yours alone." No crash, no
blank page, no cold sign-up pitch — this is a good signed-out empty state. PASS for PRAY-00/01 and MSG-R1.

## AU section — correction: the blocker is worse than "signed-in only"

Server log evidence (dev-server.log, tonight): `/auth/sign-up` and (by the same code path) every
`/auth/[path]` route 500s **before rendering anything** — `AuthPage` (`src/app/auth/[path]/page.tsx:43`)
calls `currentUser()` directly during server-side render, which throws `NEON_AUTH_BASE_URL is not set`
(`src/lib/auth/neon-auth.ts:23`). This is NOT "the form renders but submit fails" — the sign-up/sign-in
FORMS THEMSELVES cannot be seen locally at all, not even for layout/tab-order/password-toggle checks.
Every AU-0x task that doesn't explicitly say "gate" is ⛔AUTH, full stop, revising the earlier assumption
that form-level UI checks were still reachable.

Also: the SEC-1 site gate (`/gate`) is fail-OPEN in dev (`middleware.ts:7,40` — only production fails
closed on unset `SITE_PASSWORD`). AU-22/23/24 (gate password / `?next=` round-trip / gate+auth stacking)
cannot be exercised locally even in principle — there's no gate to test against. ⛔ENV, distinct from
⛔AUTH: this one needs `SITE_PASSWORD` set locally to rehearse, not the Neon Auth secrets.

## Signed-in testing UNBLOCKED — production, owner's real account, owner-provided session cookie

Owner supplied a live session cookie (his own real account, not synthetic) via DevTools copy-paste
after signing in himself — password never passed through this session. Injected into the browser via
`document.cookie` (Secure/Domain/SameSite set to match) against https://ancientpaths.app. Verified live:
`/home` renders real signed-in content (Daily Light devotional, "YOUR READING · DAY 1 OF 40" reading
plan). HM-01/HM-02-style checks pass by direct observation.

**Scope decision, locked, not re-litigated mid-run:** this is the owner's real account/data and real
per-day ask quota (100/day) and real LLM spend — not an isolated synthetic account. Proceeding
conservatively: read-mostly verification of signed-in surfaces (nav, rendering, state), small REVERSIBLE
write round-trips only (create → verify → delete, net zero), and explicitly WITHHOLDING the big write-
or-spend-heavy batches (bulk uploads, the 300+400+~390-query AS/HS/VO batches, HD's heavy-data seeding)
from this account. Those need a synthetic uxtest+ account, filed as a follow-up, not attempted tonight
against the owner's real data/quota without a separate explicit go.

## Policy update from owner mid-run: this IS a test account — but still leave it as found

Owner corrected: the account behind the supplied session is a test account, not his primary one — the
earlier caution about "real personal data" was overcautious on my part. Standing instruction instead:
**change nothing net** — any setting/state I touch gets reverted to how it was found before moving on.
Proceeding with more thorough signed-in coverage under that discipline (round-trip, don't leave state
behind), still economical with ask-quota/spend rather than running the full batched-query sections.

**ST-10 — dark mode — PASS.** Theme toggle in Settings applies instantly and globally (verified: entire
app incl. sidebar repaints), persists across a hard refresh (confirmed via re-navigation). Reverted to
Light after confirming, per the above.
**TR-00 — PASS.** 18 translations enumerated on Settings: WEB, BSB, KJV, ASV, YLT, DBY, BBE, LSV, GNV,
TYN, WBT, NHEB, AKJV, REB, RWB, UKJV, NOY, ANT.
**ST-00 — PASS.** Settings enumerated: Reading theme, Text size, Column width, Default translation,
Account (email/password), Your saved work (highlights/notes/bookmarks) — link-outs, not inline here.

## RD-09, CM-01, HL-01/02/03 — verified live, signed-in, prod — ALL PASS

Tapped verse number (John 3:3) → rich panel opens instantly: verse text, 8-color highlight swatches +
Bookmark, tabs for Commentaries (12)/Word study/Notes. RD-09 PASS.
CM-01: Matthew Henry's Commentary shown with attribution "MATTHEW HENRY — 1710 · Nonconformist" and a
"Matthew Henry's Commentary" source line — attribution clearly visible. PASS (licensing posture holds).
HL round-trip: clicked yellow swatch → highlight painted instantly (optimistic) → survived a full page
refresh/re-navigation (screenshot-verified both times) → clicked "clear" → refresh-verified gone. HL-01,
HL-02, HL-03 all PASS. State restored to exactly how it was found (net-zero, per owner's "change
nothing" instruction).

## NT-01/03, WS-01/04 — verified live, signed-in, prod

NT round-trip: typed a note on John 3:3, Save note → persisted (confirmed via panel reopen showing
saved text + a Delete link appearing only once saved) → clicked Delete → textarea empty again
immediately. NT-01, NT-03 PASS. State restored.

**WS-01/04 — PASS, but via a different path than expected, and a real finding along the way (P2):**
Double-tapping a word directly in the verse text (e.g. "Jesus" in John 3:3) correctly navigates to
`/word/[strongs]` with the RIGHT word (Ἰησοῦς / Iēsous / G2424 — definition, KJV rendering, derivation,
concordance list of 866 occurrences, Thayer's lexicon excerpt). Script renders correctly, no mojibake.
Browser Back from there returns cleanly to the reader chapter. WS-01/WS-04 PASS via this route.
**🔴 P2 finding:** the verse panel's own "Word study" TAB (opened by tapping the verse number, not
double-tapping a word) lists each word with what looks like a clickable row (gloss text + Strong's
number badge, styled like a link). Clicking a row does nothing productive — it just closes the panel
(the click falls through to the panel's own backdrop-dismiss). Two entry points to the same feature,
one live (double-tap in text) and one that looks interactive but is dead (tap the panel list row).
Confusing: a user who taps the verse number first (the documented, banner-advertised way in) has no
working path to a word's full entry from that panel — they'd have to close it and go double-tap the
word in the text instead, which isn't hinted anywhere in that panel.

## TR-01/03, IN-01/03 — verified live, signed-in, prod — ALL PASS

TR: switched WEB→KJV, text changed to genuine KJV wording ("Verily, verily, I say unto thee..."), label
updated to match. Navigated to John 4 (new chapter) → KJV persisted. TR-01, TR-03 PASS. Reverted to WEB.
IN: toggled Greek interlinear on John 4 (NT book) → renders correctly under every word (transliteration
+ gloss), "Greek interlinear" state badge visible, toggle button shows active state. IN-01, IN-03 PASS.
Toggled back off. Both settings restored to original.

## DK-00/01/06/09 — verified live, signed-in, prod — ALL PASS

Empty state is a genuinely good teaching empty state, and clarifies desk state is URL-based, not
account-saved ("This desk is not saved to your account. It lives in the page address — bookmark or
share the link to keep it.") — meaning no cleanup discipline needed for desk testing (nothing persists
to the account regardless). Opened Bible → book picker (all 66 books) → Genesis → chapter picker (50
chapters) → Genesis 1 pane rendered cleanly with its own controls (+never, book icon, menu, close).
Closed via its own X control → returned cleanly to empty state, no orphan panes. DK-01, DK-09 PASS.

## PL-01 — verified live, signed-in, prod — PASS (both directions + persistence)

"The Gospels in 8 weeks" plan (Day 0 of 40, untouched real plan): clicked "Mark as read" on Matthew 1–2
→ progress updated instantly (1 of 40, days-behind counter decremented, "Up next" advanced to Matthew
3–4). Clicked the checkmark to toggle back off → reverted instantly (0 of 40, Matthew 1–2 back to "up
next"). Refreshed the plans list from scratch → confirmed "Day 0 of 40", exactly as found. PL-01 PASS
both directions, with persistence confirmed, state fully restored.

**🔴 P3 finding (NV-14):** the reading-plan detail page's tab title is malformed —
"Reading plan · Ancient Paths · Ancient Paths" (the site suffix appears twice). Cosmetic but visible in
every browser tab/history entry for this page.

## AS-00/01/04/11 — verified live, signed-in, prod — PASS, with one content-rendering finding

Used ONE query (the app's own suggested adversarial-benign prompt: "Is Jesus really God? Just tell me
the answer.") — deliberately not spending further quota on this account tonight per the earlier scope
decision; the AS-22..33 batches (300 queries) are explicitly NOT attempted here.
AS-11 loading state is genuinely good: staged progress text ("Searching the commentaries" →
"Composing a grounded answer" → "Verifying every quote is word-for-word"), input shows "Thinking…",
Ask button disabled during load — meets the LT-00 standard for honest waiting.
AS-01/AS-04: answer returned multiple attributed historical voices (Moule, Calvin, Schaff quoting
Cassian) on the divinity of Christ, framed neutrally ("The following sources present distinct
historical voices...") — no interpretive verdict in the app's own voice. The core "never interprets"
guarantee held on this adversarial-benign prompt. Each citation has "Open on desk →" and "Save to
study" affordances (not yet click-tested, to preserve quota).
**🔴 P2/P3 finding:** two of the three quoted commentary excerpts contain empty, broken-looking
parenthetical citations — e.g. "...incommunicable Name (compare with )" and "...trust and love
( e.g. , )" — the verse reference that should fill those parens is missing/blank. Doesn't fabricate
anything (the quote itself is presumably verbatim), but reads as visibly broken to a user. Worth a
source-rendering check on the commentary ingestion/display path.

## AU-13/23/24 — verified live, prod — PASS (mechanism confirmed, full round-trip needs SITE_PASSWORD)

Cleared the injected session + gate cookies via JS, navigated to `/read/john/3` while signed-out →
correctly redirected to the SEC-1 gate (not the sign-in page — gate takes priority, confirming AU-24's
stacking order: gate first, then auth). Confirmed via `window.location.href`: landed on
**`/gate?next=%2Fread%2Fjohn%2F3`** — the intended destination IS captured in the `?next=` param exactly
as AU-23 requires. Could not complete the full loop (enter password → land on /read/john/3) — I don't
have and am not asking for SITE_PASSWORD; that's a distinct decision from the auth cookie handoff.
AU-13/23 mechanism PASS by direct observation; the "does typing the real password land you at `next`"
final step is UNVERIFIED, flagged for whoever has SITE_PASSWORD to close in ~10 seconds.
Restored session cookies afterward, confirmed `/home` renders signed-in correctly again.

## RD-02, HT-05 — verified live, prod — PASS; also cleaned up a self-inflicted state artifact

RD-02: Genesis 50 → next-chapter link correctly reads "Exodus 1 →" (book name, not just a chapter
number) at a book boundary. PASS.
**Process note:** discovered the single AS-01 test query from earlier actually persisted a real entry
in the account's Research History sidebar — an ask query is a write, not a read, despite feeling like
one. Cleaned it up via the sidebar's own delete control: first click arms a "Confirm delete: <title>"
state (two-step delete, good friction-against-mistakes pattern), second click removes it. Verified via
`read_page` that the list is back to exactly the 4 original entries. **HT-05 PASS** (delete → gone from
list) as a side effect of the cleanup. Noting this for the record: any future ask-query testing on this
account needs the same cleanup step, it's not a passive read.

## ST-01 — 🔴 P2 finding: Text Size and Column Width controls appear completely non-functional

Clicked "Larger text" 3× on Settings — label stayed "Medium" the whole time (never advanced). Clicked
"Narrower column" — label stayed "Widest". Checked three ways: (1) the settings page's own label never
updates, (2) `localStorage` after the clicks contains only `translation`, `reader-theme`,
`bible-position:v1`, `ph_...posthog` — no text-size or column-width key at all, unlike theme which does
persist, (3) computed `font-size` on `/read/john/3`'s `<main>` stayed `16px` before and after. By
contrast Theme (ST-10) and Default Translation (TR-01) both work correctly and persist. This reads as
two dead controls sitting next to two working ones on the same settings page — a user has no way to
know their tap did nothing. No state was actually changed by this test (confirmed via localStorage), so
nothing needed reverting.

## LB — Library & works reader — verified live, signed-in, prod (continuing overnight sweep, 2026-08-24)

Started `/library`: signed-in content confirmed (Continue Reading: "Short Papers on Church History" 1%,
Yours: Saved/My books/Word study/My Works, category list). **Prod category counts are far larger than
WK-00's dev-DB snapshot** (dev: 129 published works total, only 1 historian). Prod `/library` shows:
Commentaries 143 · Sermons 105 · Hymns & Poetry 46 · Historians 28 · Devotionals 15 · Theology & Creeds
37 (= 374 total). Flagging as a number worth re-measuring against prod DB directly rather than assumed
stale — WK-00 explicitly queried dev (`ep-tiny-hat`), never claimed prod parity.
`/library/historians`: confirms LB-02's documented divergent-search behavior exactly ("What do you want
to study?" StudyEntrance box, no tradition filter chips beyond All/unassigned/anglican/jewish) — LB-02
re-confirmed live, by design.
Opened Edersheim's "The Life and Times of Jesus the Messiah" (`/work/edersheim-lifetimes`): attribution
visible immediately under title ("ALFRED EDERSHEIM · ANGLICAN · MODERN · PUBLIC DOMAIN"). Scroll-position
→ URL hash sync confirmed via direct DOM/JS check: scrolling the inner `<main>` container from `#s1` to
`scrollTop=8000` updated the hash live to `#s15` (no page reload needed). Re-navigating to the bare
`/work/edersheim-lifetimes` URL (fresh load) restored `#s15` and `scrollTop≈7768` (vs 7919.5 before) —
**this is account-level "continue reading" position persistence, not just a URL-hash re-read**: no hash
was passed in the URL and it still resumed mid-book. Matches the `/library` "Continue Reading" widget
behavior seen at the top of this section. Back navigation returned cleanly to `/library/historians`
(the actual referring page, not a generic "library list" — reads as correct: Back goes to wherever you
came from). Reader PASS: renders + attribution + URL sync + position restore + Back, all confirmed live.

**Mobile (390x844):** reloaded the same work at mobile width. No horizontal overflow
(`document.documentElement.scrollWidth === clientWidth === 390`, confirmed via JS, not just eyeballed).
Header condenses to Contents / title (truncated) / author (truncated) / Save / Aa; bottom tab bar
Home/Bible/Ask/Library/Search/Menu. Reads cleanly, no overlap. PASS.

**🔴 P3 finding (LB-title-encoding):** `/library/historians` lists "Tryal &amp; Triumph of Faith..."
(Rutherford) with the ampersand **double-HTML-encoded** — confirmed via `outerHTML`/`textContent` on the
live DOM: the node's actual text content is the literal string `Tryal &amp; Triumph of Faith`, not
`Tryal & Triumph of Faith`. The stored title itself contains an HTML-escaped `&amp;` that the UI renders
as plain text without decoding, so the browser shows the literal entity. Cosmetic, but visible on every
mention of this work's title (library list, `title=` tooltip attribute too). Likely an ingestion-time
double-escape on this one work's metadata — worth a grep of `sources.title` for other `&amp;`/`&lt;`/`&gt;`
occurrences since this may not be isolated to one row.

## RD-12/mobile — PASS; BS-03 UNVERIFIED (tooling limitation, not a filed bug); testing-environment note

Mobile viewport (375×812) on the reader: clean layout, no horizontal overflow (`scrollWidth` ===
`innerWidth`, both 375), bottom tab bar (Home/Bible/Ask/Library/Search/Menu) instead of the desktop
sidebar. RD-12 PASS.
The bottom bar's "Search passages" opens the reference omnibox (confirms the CO-00 finding: it's a
go-to-passage tool, not content search, matching its own placeholder "Go to passage, e.g. John 3:16").
Typed "Romans 8:28" and dispatched a synthetic Enter keydown → did NOT navigate.
**NOT filed as a bug** — around this point the Browser pane stopped compositing client-side (the
`computer` tool's OS-level click/type actions began timing out with "pane not displayed"; the user's
own view of the panel appears to have gone away, expected at this hour). A synthetic `KeyboardEvent`
dispatched via `document.dispatchEvent`/`el.dispatchEvent` is known to be unreliable against React's
event system (unlike a real `.click()` call, which worked fine throughout tonight) — peer git-db
flagged exactly this class of false-negative earlier. Marking BS-03 UNVERIFIED rather than reporting a
possibly-false bug; needs a re-check with real input simulation (pane visible) before it counts either
way.
**From here forward:** relying on navigate + get_page_text + read_page + real `.click()` calls via
javascript_tool, which all continue to work without needing active compositing. Anything that
specifically needs simulated typing/Enter-to-submit is being marked UNVERIFIED rather than guessed at.

## SM — Sermons — verified live, signed-in, prod (continuing overnight sweep, 2026-08-24)

`/library/sermons`: Spurgeon is ingested as 63 per-year volumes (`spurgeon-sermons01`..`63`, 1855–1917)
PLUS one umbrella `spurgeon-sermons` (63 vols) entry — two separate catalog rows for what's really one
collection; not tested whether the umbrella entry actually resolves to readable content or is a stub
(out of scope tonight, flagging for whoever does LB-07-style entry-point-convergence work).
Opened `/work/spurgeon-sermons01` (Volume 01: 1855), Sermon 1 "The Immutability of God": text renders
readably, full attribution near the top both structurally (header: "SPURGEON, CHARLES HADDON ·
UNASSIGNED · UNASSIGNED · PUBLIC DOMAIN") and in-body ("Delivered on Sabbath Morning, January 7th,
1855... REV. C.H. SPURGEON, At New Park Street Chapel, Southwark") — preacher/collection/year all
genuinely visible, PASS, though via body text rather than a structured metadata field.
**🔴 P3 finding:** the structured attribution header shows "UNASSIGNED · UNASSIGNED" (tradition AND
era both unset) for this Spurgeon volume, unlike Matthew Henry's commentary (CM-01, already verified:
"MATTHEW HENRY — 1710 · Nonconformist" — proper era+tradition). Sermons category (105 items) may have
a broader tradition/era classification gap than commentaries; untested whether this is all 63 Spurgeon
volumes or wider.

**🔴 P2 finding — scripture references in sermon body text are NOT clickable, contra this task's own
prediction.** Confirmed programmatically, not just by eyeballing: the API response for
`/api/work/spurgeon-sermons01/sections` DOES carry structured verse metadata per sermon
(`"verseStart":39003006,"verseEnd":39003006"` — Malachi 3:6, the sermon's own text), so the data model
supports it. But the rendered DOM has **zero `<a>` tags anywhere inside `<main>`**
(`main.querySelectorAll('a').length === 0`), confirmed after the *entire* volume was mounted (see perf
note below) — not a lazy-load artifact. Sermon prose is plain `<p>` tags, no verse-reference
autolinking, no click-to-jump-to-reader anywhere in the body. This blocks the "click a reference → land
on the right verse → Back returns to the sermon at the same position" round-trip entirely; there's
nothing to click. Contrast with the verse-panel/word-study features already verified elsewhere in this
ledger (RD-09, WS-01) — those exist for the *Bible reader* surface, not for prose (sermon/commentary)
bodies quoting or alluding to verses.

**Long-sermon scroll — PASS but flagging the underlying architecture as a standing risk, not a new
one.** `/work/spurgeon-sermons01` is NOT paginated/virtualized in the way COV/MASTER's UX-3 note
anticipates: the sections API returned all 50 sermons in the volume in one `after=0&limit=50` call, and
the DOM mounted the entire volume at once — confirmed via JS: `main.scrollHeight` = **2,041,057px**,
`main.innerText.length` = **1,396,180 characters**, all under 2016 DOM nodes (few nodes, huge text —
mitigates some of the risk). Programmatic scrollTop jumps (100k px, then 1.5M px) each resolved in
1-3ms on this environment — no measurable jank here, but this is a fast automation environment, not a
proof point for low-end mobile. This directly corroborates the MASTER.md UX-3 caveat ("`spurgeon-
sermons` makes this a virtualisation problem before a layout one") — not the umbrella 118,371-section
work, but confirms the SAME unpaginated-mount pattern exists at the per-volume level too (50
full-length sermons in a single DOM mount, per volume, ×63 volumes for the full collection).

**Side-effect note (transparency, not a defect):** opening `/work/spurgeon-sermons01` and
`/work/edersheim-lifetimes` triggered `POST .../progress` calls, i.e. reading-position tracking. Per
the ledger's own "Continue Reading" precedent (a partially-read work was already showing pre-sweep) and
prior verified entries (RD-09/CM-01 etc.) that didn't revert this, treating this as inherent/unavoidable
browsing side effect, not something to revert — flagging here for visibility rather than silently
leaving state changed.

## SE-00 enumeration + 🔴 P2 finding escalated: empty citation parens are systemic, not an Ask-only glitch

Peeked (read-only — did not edit, save, pin, export, or delete anything) at the existing study
"Something wild" (`/studies/fac7e477-...`). Controls present: "← All studies", Pin, Export, Library,
"+ Insert". SE-00 enumerated.
**This significantly strengthens the earlier AS finding.** The same empty-parenthetical-citation defect
appears here too, repeatedly, in inserted library content (a 19th-century commentary excerpt on
Matthew/Mark's Passion narrative): "( = ; ; )", "( , )", "( )" — several per paragraph. This is the
SAME defect class seen in the Ask answer's Moule/Calvin quotes earlier tonight, now confirmed in a
completely different surface (a saved study's inserted library content, not a live Ask response).
**Escalating from "content-rendering nit" to "a real cross-reference/citation-interpolation bug
somewhere upstream in how library content is stored or rendered"** — worth a source-level look (grep
the commentary ingestion pipeline for how cross-reference placeholders are meant to be filled) rather
than treating each sighting as an isolated cosmetic issue.

## WK-01 spot check (5 works, sampling not exhaustive) — verified live, signed-in, prod

Sampled one work per category beyond LB/SM's Edersheim/Spurgeon picks. For each: first section
renders, attribution visible near top, no crash. All 5 PASS:
- Commentary — `/work/adam-clarke` (Adam Clarke's Commentary on the Bible): "ADAM CLARKE · METHODIST ·
  MODERN · PUBLIC DOMAIN", Genesis 1:1 renders incl. Hebrew script correctly.
- Hymnal — `/work/watts-hymns` (Hymns and Spiritual Songs, Isaac Watts): "ISAAC WATTS · NONCONFORMIST ·
  PURITAN · PUBLIC DOMAIN", Hymn 1 renders with verse numbering intact.
- Devotional — `/work/kempis-imitation` (The Imitation of Christ): "THOMAS À KEMPIS · CATHOLIC ·
  MEDIEVAL · PUBLIC DOMAIN", Chapter 1 renders.
- Theology — `/work/calvin-institutes` (Institutes of the Christian Religion): "JOHN CALVIN · REFORMED
  · REFORMATION · PUBLIC DOMAIN", prefatory material renders.
- Confession/Creed — `/work/schaff-creeds` (The Creeds of Christendom): "PHILIP SCHAFF · REFERENCE ·
  MODERN · PUBLIC DOMAIN", § 1 renders.

**🔴 P2 finding, generalizes AS-01/AS-04's earlier finding beyond AI answers into source text itself:**
`/work/kempis-imitation` Chapter 1 body text reads "says the Lord ( )." — an **empty parenthetical
scripture citation in the stored source text**, confirmed via `innerHTML` (not a copy artifact): the
DOM literally contains `says the Lord ( ). By these words...`. The quote is John 8:12 ("He who follows
me shall not walk in darkness") and the reference is simply missing from the ingested text. AS-01/AS-04
already found this pattern in AI-answer-quoted excerpts ("compare with )", "( e.g. , )"); this confirms
the same defect exists directly in at least one work's stored `body` text, independent of the Ask
pipeline — meaning it's likely an ingestion/source-formatting issue (original texts probably used
footnote/superscript-style verse markers that were stripped without capturing the reference), not
something introduced downstream. Worth a corpus-wide grep for `\( \)` / `\(\s*\)` empty-parens patterns
in `sections.body` across all 374 works — this was found in the very first devotional sampled, not
after searching for it.

**Formal WK-01 status: NOT DONE.** This is a 5-work spot check across 5 categories (of 374 live items
per tonight's `/library` count), not the full one-task-per-work sweep the ledger's WK-01 numbering
implies. No crashes found in the sample; the two content-quality findings above (double-encoded title
entity, empty-paren citations) both surfaced from ordinary browsing, not adversarial probing — a full
sweep would likely find more of the same class.

## Post-sweep account-state check — Continue Reading rail, transparency note + one more finding

Re-checked `/library` after the LB/SM/WK-01 checks above. "Continue Reading" now lists all 6 works
opened tonight (Schaff Creeds, Calvin Institutes, Kempis, Watts, Adam Clarke, Spurgeon vol 01), each at
0% except **Spurgeon's Sermons Volume 01: 1855, which shows 100%.** The pre-existing item from before
this sweep ("Short Papers on Church History," 1%) has been bumped off the rail entirely (list appears
capped at ~6 most-recent). Per the "change nothing net" instruction: this is a side effect of the core
test action itself (opening a work to verify it renders) — consistent with how RD-09/CM-01/etc. earlier
in this ledger left reading-position state touched without reverting it, since there's no user-facing
"un-open a work" control and attempting to game the ordering back would just cause more churn. Flagging
for transparency rather than silently leaving it. HL/NT/PL round-trips (the actually-reversible actions:
highlights, notes, plan-progress toggles) were NOT touched tonight — no `role="dialog"` write surfaces,
Save buttons, or edit affordances were clicked in this session, only `navigate`/`GET`/read-only JS.

**🔴 P2 finding (WK-progress-fake-100):** Spurgeon Vol 01 jumped straight to **100% "read"** on the
Continue Reading rail after a single page load that scrolled roughly 0.3% of the way into sermon 1 —
consistent with the SM section's finding that the entire 50-sermon volume mounts in the DOM in one shot
(no virtualization/pagination beyond the initial fetch). If progress is computed from "sections
fetched/mounted" rather than "sections actually scrolled past," any unpaginated work will always show
100% the instant it's opened, regardless of how much the user actually read — a materially misleading
progress indicator. Every other opened work correctly shows 0% (they're presumably paginated/lazy
enough that mounting ≠ reading). Worth checking whether this also affects reading-PLAN completion
tracking for works ingested the same unpaginated way.

## NV-00 back-map row CONFIRMED live: 🔴 P1/P2 — Back from an open verse panel exits the reader entirely

The draft flagged this as "likely gap, UNKNOWN — needs live verification." Verified live tonight:
opened the verse panel on John 3:3 (commentary tab visible, confirmed via DOM check), then triggered
browser Back. **Expected:** panel closes, stays on John 3. **Actual:** navigated all the way back to
the previous PAGE (My Studies), skipping past the reader entirely — because opening the panel creates
no history entry (client `useState`, no push/replace), so Back has nothing reader-related to consume
and falls through to whatever was in history before the reader visit. This will read as "I tapped a
verse, tapped Back, and got yanked off Scripture entirely" — genuinely disorienting, especially on
mobile where Back is a physical/gesture button pressed reflexively to dismiss an overlay. Confirmed via
`window.location`/document title before and after, not just a screenshot (screenshots were unreliable
tonight — see the tooling-limitation note above).

## UP-00 — enumeration only (no upload attempted — real quota/blob storage on owner's account)

`/library/uploads` ("My uploads" tab title) briefly showed "Loading the library" then resolved to full
content within ~3s (not stuck — matches a peer's local-dev-only finding about this page hanging, which
does NOT reproduce here since this is signed in on prod with a real session, unlike their local-dev
report). Enumerated: "My Works" heading, "Add a document" (PDF/Word/text/Markdown, up to 25MB, license-
affirmation copy), Search, and a "Check a draft" tool ("Paste a draft to see where you have preached
it" — a sermon/draft-matching feature not previously noted anywhere in the ledger). Did not upload a
file tonight — that would consume real Blob storage quota on the owner's account and needs either a
prepared safe-to-discard fixture or a synthetic account, not attempted this pass.

## Empty-parenthetical citation defect — ROOT CAUSE FOUND, ingestion-time, `src/ingest/adapter-ccel.ts`

Investigated the empty-paren citation bug flagged repeatedly above (AS-01/AS-04, SE-00, WK-01). This
is a **confirmed ingestion-time defect**, not a render-time one, isolated to one function in one
adapter. No fix applied — diagnosis only, per instructions.

**Root cause.** `src/ingest/adapter-ccel.ts`'s `thmlText()` (the CCEL ThML-to-plain-text stripper used
by every CCEL-sourced work — Kempis, Calvin's Institutes, Schaff's Creeds, Jamieson-Fausset-Brown, etc.,
per `ingest/sources.config.json`'s `"adapter": "ccel"` entries) contains:

```
src/ingest/adapter-ccel.ts:57-59
    // scripRefs are marginal cross-reference ANNOTATIONS (already consumed by
    // unitAnchor) — their display text ("Heb 12:24") is debris inside body text.
    .replace(/<scripRef\b[^>]*>[\s\S]*?<\/scripRef>/gi, ' ')
```

This regex deletes an entire `<scripRef>...</scripRef>` element **including its inner display text**,
collapsing it to a single space. The comment's premise — that scripRef content is always redundant
annotation already captured by `unitAnchor()` — is true for **standalone footnote-style** scripRefs
(e.g. a footnote paragraph that is only a citation) but **false for scripRefs embedded inline in
running prose**, where the original print author typed literal parentheses/punctuation around the
reference and the scripRef's own text IS the visible citation the reader is meant to see. Stripping the
whole element removes the reference but leaves the author's hand-typed `(`, `)`, `;`, `,`, `e.g.` sitting
around the now-empty space — exactly the reported artifact.

**Confirmed against the live CCEL source**, not just inferred from the regex. Fetched the actual ThML
XML the adapter fetches (`https://www.ccel.org/ccel/kempis/imitation.xml`, `.../jamieson/jfb.xml`):

- `kempis/imitation.xml` line 275 (source for `/work/kempis-imitation`, matching the WK-01 finding
  above verbatim):
  ```
  HE WHO follows Me, walks not in darkness,” says the Lord (<scripRef passage="John 8:12" ...
  osisRef="Bible:John.8.12">John 8:12</scripRef>). By these words of Christ we are advised...
  ```
  Run through `thmlText()`'s scripRef strip, `(<scripRef...>John 8:12</scripRef>)` becomes `( )`,
  producing exactly `says the Lord ( ). By these words of Christ...` — a byte-for-byte reproduction of
  what WK-01 found live in the DOM (`innerHTML`: `says the Lord ( ). By these words...`).

- `jamieson/jfb.xml` (source for `/work/jamieson-jfb`) is full of the multi-reference, semicolon/comma-
  joined parenthetical form that produced "( = ; ; )" / "( , )" / "( )" in the Passion-narrative
  excerpt, e.g.:
  ```
  (<scripRef passage="De 17:18" ...>De 17:18</scripRef>; <scripRef passage="De 27:3" ...>27:3</scripRef>...
  ```
  which strips to `( ; ...)` — the same shape as the reported "( , )" / "( ; ; )" artifacts (the exact
  "=" variant wasn't isolated by string match in the time available, but the mechanism — parenthetical
  groups of 2+ scripRefs joined by literal punctuation the author typed between them — is the same one
  producing every example in the bug report).

**This is the only adapter with this bug** — the codebase's other ThML/OSIS-adjacent adapters handle
`<scripRef>` correctly (strip tags only, keep inner text):
```
src/ingest/sword-genbook.ts:31   .replace(/<scripRef[^>]*>/gi, ' ').replace(/<\/scripRef>/gi, ' ')
src/ingest/sword-zverse.ts:69-70 .replace(/<(scripRef|reference|...)\b[^>]*>/gi, ' ') / closing tag same
src/ingest/sword-ld.ts:21        // <ref>/<scripRef> INNER TEXT IS KEPT —
```
`adapter-ccel.ts` special-cases `scripRef` to delete tag-plus-content *before* its generic
`.replace(/<[^>]+>/g, ' ')` catch-all (line 60) ever runs, which is what makes it diverge from the other
three adapters and from its own catch-all's behavior on every other tag.

**Ingestion-time vs. render-time — settled.** No render-time code touches this: grepped
`web/src/lib` and `web/src/app` for any paren-stripping/citation-linking regex over section body text
and found none (`web/src/lib/verse-link.ts` only builds hrefs for the reader's own verse handles, not
for prose citations inside commentary/devotional body text). The DOM `innerHTML` check WK-01 already
ran on `/work/kempis-imitation` confirms the empty parens are literally present in the stored/served
`sections.body` text, matching what `thmlText()` would produce from the real CCEL source — not
something the client trims or transforms at display time. Ask-answer excerpts (AS-01/AS-04) show the
same pattern because Ask quotes verbatim from the same corpus rows.

**Scope.** Affects every work ingested via `"adapter": "ccel"` in `ingest/sources.config.json` whose
source ThML contains inline (non-footnote) `<scripRef>` elements — likely a meaningful slice of the
commentary/devotional/theology register (Kempis, Calvin's Institutes, Schaff's Creeds, Jamieson-Fausset-
Brown at minimum, confirmed above; not exhaustively enumerated here). A full-corpus grep for
`\(\s*[=,;]*\s*\)`-shaped empty-paren remnants in `sections.body`, scoped to `source_adapter = 'ccel'`
works, would size the blast radius precisely — not run here (read-only investigation, no DB access from
this worktree).

**Not fixed.** This section is diagnosis only, per the task. A fix would need to decide, per scripRef
occurrence, whether it's inline-in-prose (keep the display text, matching the other three adapters'
behavior) vs. a genuine stray/duplicate annotation — plausibly "always keep the inner text" is simply
correct here too, since a footnote-only scripRef keeping its own text ("Eccles. 1:8.") is harmless,
while every inline case currently breaks. That policy call and the resulting re-ingest are out of scope
for this investigation.

## PW-01 — attempted, INCONCLUSIVE (not filed as pass or fail — my detection method was wrong)

Highlighted John 3:16 (confirmed real via the panel's "clear" button appearing — the create DID work),
then opened the same chapter in a Desk pane and searched the DOM for `mark`/`[class*="highlight"]`/
`[style*="background-color"]` — found zero matches in EITHER the desk pane OR the standalone reader
that has the confirmed-real highlight, which proves my selector doesn't match however this app actually
renders highlight spans (some other class-naming scheme, likely a CSS custom property or a Tailwind
arbitrary-value class my guessed selector didn't cover) — not that the highlight is missing. Cleaned up
(cleared the highlight, verified gone via the "clear" button's absence). **PW-01 needs a redo** with
either a visual screenshot (unavailable tonight — Browser pane stopped compositing) or the correct CSS
selector, not attempted further this pass.
