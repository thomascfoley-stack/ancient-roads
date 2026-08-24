# CO — Consistency & the one-hand test (code-only pass)

Scope: `web/src/components/*.tsx` and `web/src/app/**/*.tsx`, grep + read only. No server, no
browser, no DB. Evidence-first; every claim cites file:line.

---

## CO-001..006 — terminology inventory

### Concept: Ask / Search / Study (verb for "get the app to work for me")

| Term used | Where |
|---|---|
| "Ask" | `components/mobile-nav.tsx:75` nav label; `components/ask-client.tsx:556` placeholder "Ask a question…"; `:663` button "Ask again" |
| "Ancient Paths" | `components/sidebar.tsx:1108` desktop sidebar label for the same `/ask` route |
| "Explore the paths" | `components/ask-client.tsx:338` `<h1>` on `/ask` (default/voices mode); `app/study/[id]/page.tsx:10` CTA label |
| "Voices" | `components/mode-toggle.tsx:47` tab label for default `/ask` mode (`role="group" aria-label="Search mode"`) |
| "Study" / "Studying…" | `components/history-ask.tsx:105-107` submit button text and `aria-label="What do you want to study?"` for the **history** mode of the same `/ask` route |
| "Search" | `app/search/page.tsx:191,211` `<h1>Search</h1>`, placeholder "Search the library…"; `components/ask-client.tsx:156` "Search these" (a sub-label inside `/ask`) |
| "New study" | `components/history-results.tsx:115` link text, but it points at `/ask?mode=history` — a new **Ask** thread, not a new Study (the `/studies` journal feature) |

**Finding (P2, terminology).** The single `/ask` route alone is named four different ways depending
on which chrome you're looking at: "Ask" (mobile nav + verbs), "Ancient Paths" (desktop sidebar),
"Explore the paths" (page h1), "Voices" (in-page mode tab). Its own submit verb changes per mode:
"Ask" in voices mode (`ask-client.tsx:556`) vs "Study" in history mode
(`history-ask.tsx:105-107`) for functionally the same act (type a question, get results). And
`history-results.tsx:115` labels a link to `/ask?mode=history` as **"New study"**, which collides
head-on with the real Study feature (`/studies`, `components/study-editor.tsx:1113` also says "New
study" for creating an actual study). Two different destinations share the exact string "New
study."

### Concept: Save / Bookmark / Shelf

| Term | Where |
|---|---|
| "Save" / "Saved" / "Save to study" | `components/save-to-study.tsx:277` button "Save to study"; `app/library/books/page.tsx:66` "press **Save**"; `app/library/notes/page.tsx:49` `<h1>Saved</h1>`; `app/settings/settings-form.tsx:173` "Your saved work" |
| "Save to My books" / "Remove from My books" (title) vs "Save"/"Saved" (visible label) | `components/work-header.tsx:72-75` — the same button's `title` attribute says "My books" while its rendered text says "Save"/"Saved" |
| "Bookmark" / "Remove bookmark" | `components/selection-popover.tsx:383,386`; `components/study-panel.tsx:412` |
| internal state name `shelf` | `components/work-header.tsx:29-68` (`useState<string|null>`, `shelf`/`setShelf`), `tier="shelf"` prop in `components/sidebar.tsx:390,401,410,419,433` |

**Finding (P3, internal-only).** The underlying concept is called `shelf` in code/props
(`sidebar.tsx` `tier="shelf"`, `work-header.tsx`'s `shelf` state) but never surfaces that word to
users — visible UI says "Save"/"Saved"/"Bookmark" depending on surface. Not user-visible drift, but
worth noting the state var name is a fourth synonym that could leak into a future string.

**Finding (P2, terminology — the real cross-route collision).** `web/src/lib/library-nav.ts:1-34`
already documents and fixed a WORSE prior version of this (three hand-typed labels per route
disagreeing with each other) via one label map. But the three resulting per-route names still use
three different words for the same underlying "things I collected" concept:
- `/library/notes` → **"Saved"** (`lib/library-nav.ts:30`)
- `/library/books` → **"My books"** (`lib/library-nav.ts:31`, echoed in `work-header.tsx:73` button title)
- `/library/uploads` → **"My Works"** (`lib/library-nav.ts:32`, deliberately per `components/my-works.tsx:13` — "Never 'Sermons'")

Each is now internally consistent (one string per route, enforced by
`test/invariants/library-nav-labels.test.ts` per the comment), but a reader bookmarking a verse
("Save" → lands in "My books"), saving a note ("Saved"), and uploading a sermon ("My Works") sees
three unrelated nouns for what reads as one family of "your stuff" features.

### Concept: Thread / History / Chat / Conversation

| Term | Where |
|---|---|
| "Research history" | sidebar section heading, `components/sidebar.tsx:822` |
| "research thread" | `components/sidebar.tsx:835` (comment), `aria-label` at `:858` "Delete research thread: …" |
| "Research thread" | page `<title>`/metadata, `app/ask/[id]/page.tsx:10-11` |
| "Study history" | sr-only `<h1>` on the history-mode `/ask` surface, `components/history-ask.tsx:113` |
| "thread" (bare) | `components/ask-client.tsx:46,292` (`stage: 'thread'`), `components/my-works.tsx:971` comment |
| "conversation" | `components/sidebar.tsx:14` comment: "the real feature (saved work, **conversation**)" |

**Finding (P2, terminology).** "Research history" (sidebar section) / "research thread" (delete
control + comments) / "Research thread" (page title) are all consistent with each other, but the
history-mode `/ask` surface's own accessible `<h1>` calls the same feature **"Study history"**
(`history-ask.tsx:113`) — a fourth term for a concept that already has three synonyms elsewhere.

### Concept: Work / Book / Document / Source

| Term | Where |
|---|---|
| "Work(s)" | `components/my-works.tsx:13,600,615,636` ("My Works"); type names throughout (`WorkSource`, `work-header.tsx`, `work-reader.tsx`) |
| "Book(s)" | `components/work-header.tsx:73` "My books"; `components/mobile-nav.tsx:74` nav label "Bible" points at reading, but `LibraryIcon`/`BookIcon` both render literal book glyphs (see icon section) |
| "Document" | `components/work-beside-tradition.tsx:53` prop `documentId`; internal only, not surfaced |
| "item(s)" | Per `CLAUDE.md`/UX spec: "The counted noun changed from `works` to `items` everywhere" (user-visible strings only) — confirmed live at `components/sidebar.tsx:370` "All **items**" label for `/library`. |

**Finding (P3).** "items" (the locked, generic noun for `/library`'s hub) and "Works"/"books" (the
specific per-shelf nouns) coexist by design per the naming lock in `CLAUDE.md` §"Naming is locked
in section 2" — this is intentional hierarchy (generic collective noun at the hub, specific noun
per shelf), not drift. Flagging only for completeness; no action implied.

### Concept: Voices / Commentary / Sources

| Term | Where |
|---|---|
| "Commentaries" (plural, tab label) | `components/study-panel.tsx:23` `{ id: 'commentaries', label: 'Commentaries' }` |
| "Commentary" (singular, filter chip) | `components/ask-client.tsx:750` `SHOW_LABELS.commentary = 'Commentary'` — same register, different surface |
| "Voices" (mode tab) | `components/mode-toggle.tsx:47` |
| "The tradition" (section heading) | `components/work-beside-tradition.tsx:184` `<h2 id="voices-heading">The tradition</h2>` — note the `id` says "voices" but the visible text says "tradition" |
| internal type `Voice` | `components/my-works.tsx:32`, `components/work-beside-tradition.tsx:22` — never surfaced verbatim to users |

**Finding (P3).** Singular/plural drift for the same register concept: verse-study tab says
"Commentaries" (`study-panel.tsx:23`), the `/ask` results filter for the identical register says
"Commentary" (`ask-client.tsx:750`). Minor, but it's the kind of thing CO-006 exists to catch —
same underlying register, two different nouns depending on which panel you're in.

---

## CO-007 — toggle-state table

No icon library ships (`web/package.json` has no lucide/heroicons/etc — see CO-008), and no
`aria-checked` usage exists anywhere in `components/` or `app/`. Every stateful toggle in this repo
is `aria-pressed` or nothing.

| Control | State var | `aria-pressed`/`aria-checked`? | Where |
|---|---|---|---|
| Highlight mode | `highlightMode` | ✅ `aria-pressed` | `components/reader-header.tsx:73` |
| Interlinear toggle | `interlinear` | ✅ `aria-pressed` | `components/reader-header.tsx:88` |
| Plan day pick | `on` (picked) | ✅ `aria-pressed` | `components/plans-client.tsx:615` |
| History-results entity filter chip | (derived) | ✅ `aria-pressed` | `components/history-results.tsx:126` |
| History-results bucket filter | `bucket === c` | ✅ `aria-pressed` | `components/history-results.tsx:151` |
| Highlight color swatch | `annotation.color === c.id` | ✅ `aria-pressed` | `components/study-panel.tsx:380` |
| Ask "Show" filter chip | `on` | ✅ `aria-pressed` | `components/ask-client.tsx:174,782` |
| Study pin | `pinned` | ✅ `aria-pressed` | `components/study-editor.tsx:806` |
| "Save"/bookmark-to-books toggle | `shelf`/`saved` | ✅ `aria-pressed` | `components/work-header.tsx:72` |
| Light/dark quick toggle (reader) | `dark` | ✅ `aria-pressed` (both states) | `components/reader-settings.tsx:62,69` |
| Dark mode setting | `dark === v` | ✅ `aria-pressed` | `app/settings/settings-form.tsx:56` |
| Translation picker | `translation === t.id` | ✅ `aria-pressed` | `app/settings/settings-form.tsx:134` |
| Word-study language toggle | `lang === l` | ✅ `aria-pressed` | `app/library/word-study/page.tsx:106` |
| Catalog filter chips | (link, `role=link`) | ❌ intentionally — uses `aria-current` instead, with a comment explaining why | `app/library/[catalog]/page.tsx:122-123` (documented: these are anchors, `aria-pressed` is invalid on role `link`) |

### Toggles found WITHOUT any state attribute (accessibility gaps)

1. **Sidebar collapse/expand button** — `components/sidebar.tsx:623-628` (expand, in collapsed
   rail) and `:651-656` (collapse, in expanded rail). Persistent binary UI state (`collapsed`,
   `sidebar.tsx:516`), toggled by a chevron button. Has `aria-label`/`title` (bound together,
   `sidebar.tsx:588`) but **no `aria-pressed` or `aria-expanded`**. Compare with
   `components/mobile-nav.tsx:131` — the mobile hamburger menu button, which is the *same shape of
   control* (reveals/hides a nav panel) and correctly carries `aria-expanded={menuOpen}` +
   `aria-haspopup="dialog"`. Two controls doing the same job, one instrumented, one not.
2. **Reader-header inline SVG icon toggles** were checked and are fine (`aria-pressed` present,
   see table above) — listed for completeness, not a gap.

No other `useState<boolean>` names read as an unlabeled toggle control on inspection —
`open`/`expanded`/`active` occurrences in `work-toc.tsx`, `plans-client.tsx`, `prayer-journal.tsx`,
`my-works.tsx` are disclosure/navigation state, not press-toggle state, and the disclosure ones
correctly use `aria-expanded` (e.g. `work-toc.tsx:199` `aria-expanded={open}`).

---

## CO-008 — icon inventory

`web/package.json` ships **no icon library** (no lucide-react, heroicons, react-icons, etc. in
`dependencies`/`devDependencies`). Every icon in the app is a hand-rolled inline `<svg>`. 14 files
contain `<svg>` markup; the two largest concentrations are `components/sidebar.tsx` (24 icon
components + `CATALOG_ICON` map) and `components/mobile-nav.tsx` (6 icon components), which
**independently redefine the same glyphs** rather than sharing a module — e.g. `HomeIcon`,
`BookIcon`, `AskIcon` exist as separately-declared, byte-identical-path components in both
`sidebar.tsx:1187-1220` and `mobile-nav.tsx:186-203`. Not a user-visible defect (paths match, so
the rendered glyph is the same), but it is exactly the "hand-maintained copy that can drift"
pattern this repo's own comments elsewhere warn about (e.g. `sidebar.tsx:1093-1098`).

### Icon → meaning map (same icon used for more than one destination/meaning)

| Icon | Used for | Where |
|---|---|---|
| `BookStackIcon` | "All items" (`/library` hub) | `sidebar.tsx:370` |
| `BookStackIcon` | "Saved" notes (`/library/notes`) | `sidebar.tsx:408` |
| `BookStackIcon` | "My Works" (`/library/uploads`) | `sidebar.tsx:432` |
| `BookStackIcon` | "All studies" (`/studies`) | `sidebar.tsx:743` |

**Finding (P2, icon reuse).** `BookStackIcon` is the glyph for four *different* destinations:
the whole library hub, the notes/saved shelf, My Works, and the studies list. A reader cannot use
the icon to distinguish "go to my saved highlights" from "go to my uploaded sermons" from "go to my
studies" — all four nav rows show the identical stack-of-books mark. This directly compounds the
CO-003/005 terminology collision above (Saved / My books / My Works / studies already use unrelated
words; the icon then fails to disambiguate them visually either).

| Icon | Used for | Where |
|---|---|---|
| `QuoteIcon` | Commentaries catalog | `CATALOG_ICON.commentaries`, `sidebar.tsx:472` |
| `QuoteIcon` | Passage search (`/library/passages`) | `sidebar.tsx:399` |
| `QuoteIcon` | fallback/default for any unmapped catalog | `sidebar.tsx:386` (`CATALOG_ICON[id] ?? <QuoteIcon />`) |

**Finding (P3).** `QuoteIcon` is both a specific catalog's mark (Commentaries) and the generic
fallback for any catalog without its own icon, and is separately reused for Passage search. Lower
severity than `BookStackIcon` above because the module's own comment
(`sidebar.tsx:459-460,462-469`) explicitly documents this design choice ("ONE ICON PER SHELF" /
"an orphaned shelf is a real bug and a generic glyph is not") — it's a deliberate fallback, but it
still means QuoteIcon carries three meanings on screen simultaneously.

### Same action, different icon across surfaces

`BookIcon` (open-book path) is used for "Bible" nav in both `sidebar.tsx:195,1107` and
`mobile-nav.tsx:74`. `LibraryIcon` in `mobile-nav.tsx:79` renders the *same path data* as
`BookStackIcon` in `sidebar.tsx` for the "Library" destination — consistent glyph, inconsistent
label (mobile nav says "Library", `mobile-nav.tsx:79`; desktop sidebar says "All items",
`sidebar.tsx:370` — see CO-005 note above on the locked "items" noun; mobile nav was not updated to
match).

No other cross-surface "same action, two different icons" case was found in this pass — the
sidebar's icon set (`LecternIcon`, `NoteIcon`, `PrayerIcon`, `ScrollIcon`, `SunriseIcon`,
`TabletIcon`, `LanguagesIcon`, `DeskIcon`, etc., `sidebar.tsx:1160-1290`) is well-documented with
per-icon rationale comments and appears to be a deliberately curated, non-overlapping set for
distinct shelves/registers.

---

## CO-009 / CO-010 — button hierarchy verdict

No shared button component or variant system exists. Searched for `buttonVariants`, `cva(`,
`class-variance-authority` across `components/`, `app/`, `lib/` — zero hits — and there is no
`class-variance-authority` dependency in `web/package.json`. There is no `Button` component either
(`find . -iname "*button*"` under `web/src` returns only `study-delete-button.tsx`, a
single-purpose delete control, not a generic button primitive). Every interactive element hand-rolls
its own Tailwind class string per call site. In practice this has landed on a *de facto* convention
— most primary actions repeat `min-h-[44px] border border-stone-900 px-5 font-sans text-sm
font-semibold ... hover:bg-stone-900 hover:text-stone-50` (e.g. `app/library/books/page.tsx`,
`components/study-editor.tsx`) and most secondary/toolbar buttons repeat `min-h-[44px] border edge
bg-transparent px-3 ... hover:bg-stone-100` (e.g. `components/work-header.tsx:72-75`,
`components/reader-settings.tsx`) — but nothing enforces this beyond copy-paste discipline, and
destructive actions (`study-delete-button.tsx:48,70`, sidebar's research-thread delete at
`sidebar.tsx:858-869`) style their red state independently in each of the two places it appears,
matching by convention rather than by shared code. Verdict: hand-rolled-but-consistent-by-habit,
not a system — a new component author has nothing forcing them onto the existing scale, and the two
destructive-delete implementations above happen to agree today (two-step confirm, `×` → "Delete?")
but nothing guards that agreement going forward.
