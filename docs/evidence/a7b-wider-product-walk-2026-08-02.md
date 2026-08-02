# A7b - the wider product walk, results

Walked against the live `ancientpaths.app` through the already-authenticated browser session, driven
by the Claude-in-Chrome tools. Journey list and its provenance:
[`docs/pm/orders/2026-08-02-a7b-wider-product-walk.md`](../pm/orders/2026-08-02-a7b-wider-product-walk.md).

**14 PASS · 1 PARTIAL · 2 NOT RUN.** Three defects filed, none of them a licensing, attribution or
interpretation breach. One finding is larger than any single journey: **A7's cross-cutting X1 check
("no uncaught console error") was an unearned green** - production throws a React hydration
exception on essentially every reader page load, and it has been doing so all along.

## What was actually being served

`data-dpl-id` on the server HTML: **`dpl_CgPUJ9s7u5NFtr3FW6K4FoCkE1wp`** - *not*
`dpl_3pbnsm9c3CKi5rKhsTNzVbnCprtR`, which is the id the A6 row of `MASTER.md` records and which the
order above assumed. The newer id is consistent with A7 having deployed its `/read/john/1` fix after
A6. Recorded because two documents now name different deployments as "the live one", and the one
this walk measured is the one above.

The session was signed in as a real user throughout: `GET /api/annotations/all` returned **200**
(that route is `requireUser()`-gated and 401s otherwise, `web/src/app/api/annotations/all/route.ts:8`),
and the sidebar rendered **Sign out**. That is what made the write-path journeys possible without
touching a credential.

## Journeys

| # | Surface | Result | Evidence |
|---|---|---|---|
| W1 | `/library/notes` - "My library" | **PASS** | Empty state, populated state and empty-again state all rendered, at desktop (1054px viewport) and mobile. Reference link exercised: tapping "John 3:1" on a note navigated to `/read/jhn/3`. Could have failed: `verseRef` (`library/notes/page.tsx:14-18`) maps a `verse_id` through `BOOK_BY_NUM` and falls back to `href="#"` on a miss - the link resolved, so the mapping is right |
| W2 | **Write:** highlight a verse | **PASS** | Tapped John 3:1 in the reader, chose the sky swatch. Server row created (`verse_id 43003001`, `color "sky"`, `span_start/end null`, `translation "web"`). **After a full reload** the verse re-rendered wrapped in `bg-sky-200/70`. Second write via the selection popover on John 3:3 produced a **sub-verse** span (`span_start 0`, `span_end 42`) that re-rendered character-exact after reload - the offset mapping is correct, not merely present |
| W3 | **Write:** add a note | **PASS** | Typed a note in the study panel's Notes tab, saved. Row persisted (`verse_id 43003001`); after a full reload the verse carried the ✎ note glyph, and `/library/notes` listed "NOTES (1) · John 3:1" with the body |
| W4 | **Write:** bookmark a verse | **NOT RUN - the feature is not wired** | The selection popover renders a Bookmark button **only when an `onBookmark` handler is passed** (`selection-popover.tsx:171`), and `onBookmark` has **zero call sites** in the whole app. Confirmed live: the popover opened on John 3:3 showing swatches, Note, Ask, commentaries and three copy chips, and **no Bookmark button**. The `bookmarks` table exists (migration 026, `web/test/invariants/annotation-tables.test.ts:89-104`); the UI does not. See D4 |
| W5 | **Write:** delete the highlight and the note | **PASS** | Both removed through the shipped UI ("clear" on the highlight row, "Delete" in the Notes tab), for both the whole-verse and the sub-verse span. `/api/annotations/all` returned `{highlights:[],notes:[]}` and `/library/notes` was back to "Nothing saved yet." after a full page load. **Production is left as it was found** |
| W6 | `/desk?p=work:<slug>` | **PASS** | `matthew-henry` and `jfb` panes both loaded, each with its register chip (**COMMENTARY**) and attribution subtitle ("Matthew Henry · nonconformist", "Jamieson, Fausset & Brown · presbyterian"). `?p=scripture:john/1` (the natural book name A7 filed as a defect) resolved to "John 1" in the desk pane, so A7's fix reaches this caller too |
| W7 | "Read more" paging | **PASS** | Counted `article` nodes before and after a real click: **25 → 50**, exactly `PAGE_LIMIT`, and the button stayed for further paging. A no-op button would have left the count at 25 |
| W8 | Per-pane close | **PASS** | Closed the JFB pane; it disappeared, the layout re-flowed to two columns, and the URL was rewritten to exactly `?p=scripture:john/1&p=work:matthew-henry`. The surviving Matthew Henry pane kept its scroll position and its already-paged 50 sections |
| W9 | Three panes, and the cap | **PASS** | Requested **four** `?p=` values; exactly three panes rendered and the fourth (`work:john-gill`) was dropped - `MAX_PANES` is enforced in the parser against user-editable input, as `desk.ts` claims |
| W10 | Independent per-pane scrolling | **PASS - after a false positive I corrected before filing** | See "The finding I did not file" below |
| W11 | A deliberately bad pane spec | **PASS** | `?p=scripture:notabook/1` rendered `Unknown book "notabook".` in a `role="alert"` box; the page did not crash and the neighbouring John 1 pane rendered normally. Bonus: `?p=work:no-such-work` rendered `No published work "no-such-work".` and its register chip read **UNLABELLED** rather than a plausible-sounding default - `paneRegisterLabel`'s stated rule, observed live |
| W12 | `/settings` | **PASS as a page; it is not a settings screen** | Renders a centred placeholder ("Preferences for your default translation, reading theme, and account will live here") with a single "Go to the reader" link and **no controls at all** - `web/src/app/settings/page.tsx` is a `ComingSoon` stub. No overflow, no error. See D5 |
| W13 | Translation picker | **PASS, and the strongest check of the walk** | Picker listed 11+ translations, all public domain (WEB, BSB, KJV, ASV, YLT, DBY, BBE, LSV, GNV, TYN, Webster) - **no ESV/NIV/NASB/NLT/CSB**, consistent with the licensing rule. Selecting KJV re-rendered the chapter in genuine KJV text and persisted across a reload. **The check that could have failed:** the John 3:3 sub-verse highlight, made in WEB at offsets 0–42, did **not** paint KJV text at those offsets - it degraded to a small verse-level colour dot, exactly the translation pin `verse-display.tsx:104-113` describes |
| W14 | Reading settings ("Aa") | **PARTIAL - text size PASSES, theme FAILS** | Text size: A+ moved the rendered `.reading-scale` from 18px to 22.4px, wrote `reader-size: 1.4rem`, and **survived a reload** at 22.4px. Theme: see **D2** |
| W15 | Interlinear toggle | **PASS** | Toggling אα replaced the whole verse view with a Greek interlinear - Greek word, transliteration and gloss per token (`Ἦν / eimí / I exist`, `Φαρισαίων / Pharisaîos / a separatist`), headed "Greek interlinear", the toggle visibly active. `[data-verse]` nodes went 36 → 0 and Greek text appeared, so the branch genuinely swapped. No overflow at 390 |
| W16 | `/auth/sign-in` as a page | **PASS. No credential entered** | Renders Email + Password fields, a Login button, "Forgot your password?", Google and GitHub sign-in, and a Sign Up link. No horizontal overflow at either width, no console error. Nothing was typed into any field and nothing was submitted. See D6 for what the page does when you are already signed in |
| W17 | Sign-out flow | **NOT RUN, by design (stated in the order before the walk)** | Firing it would destroy the only authenticated session this walk has, and restoring it needs a credential, which is forbidden. Verified without firing: the control exists in the sidebar (`sidebar.tsx:115-124`) and POSTs to `/api/auth/sign-out`; that route exists and is **POST-only** - a `GET` probe returned **405**, and the session was still valid immediately afterwards (`/api/annotations/all` still 200), so the probe proved the route without ending the session |

### Cross-cutting

| | Result |
|---|---|
| **X1** no uncaught console error | **FAIL - see D1.** 14 uncaught `React #418` hydration exceptions across the session, reproduced deliberately on `/read/jhn/3` after clearing the console |
| **X2** 390px and desktop, no overflow/overlap | **PASS on every surface reached.** Method note below |

**Method note on the 390px check.** This harness would not drive the viewport below **406 CSS px**
(`resize_window` to 390, 374 and 200 all produced `innerWidth === 406`; `outerWidth` stayed 792).
Rather than report 406 as 390, every mobile check was run twice: once at the achievable 406px, and
once by constraining `documentElement` to exactly `390px` and measuring `document.body.scrollWidth`
plus every non-`position:fixed` element wider than 391px. `bodyScrollWidth` came back **390 with
zero offenders** on `/library/notes` (empty and populated), `/desk` (three panes stacked),
`/settings`, `/read/jhn/3` (plain and interlinear) and `/auth/sign-in`. Both widths are below the
`sm:`/`md:` breakpoints, so the media-query branch is identical and the narrower box is a real test
of the layout rather than a different one.

## D1 - every reader page load throws an uncaught React hydration error (MEDIUM)

**What.** `Minified React error #418 … args[]=text` - "hydration failed, the server rendered *text*
did not match the client" - thrown as an uncaught exception. 14 occurrences over the session,
roughly one per page load. Reproduced on demand: cleared the console, loaded `/read/jhn/3`, one
error.

**Mechanism, verified rather than guessed.** Fetching the server HTML for `/read/jhn/3` and
comparing it with the hydrated DOM gives two concrete mismatching text nodes:

| | server HTML | hydrated DOM |
|---|---|---|
| sidebar auth label | `Sign in` present, `Sign out` absent | `Sign out` |
| translation chip | `>WEB<` present, `>KJV<` absent | `KJV` |

- `web/src/components/sidebar.tsx:114-134` renders `session?.user ? "Sign out" : "Sign in"`, and the
  session is resolved client-side only, so the server always emits the signed-out label.
- `web/src/components/reader-header.tsx:68` renders `{translation.abbr}` from state seeded on the
  client from `localStorage`, which the server cannot see, so it always emits the default `WEB`.

`web/src/app/layout.tsx:58` carries `suppressHydrationWarning` on `<html>`, which covers the
attribute the no-flash script writes - it does not cover text nodes in the tree below.

**Cost of not fixing.** React discards and re-renders the mismatching subtree on every load; users
see a flash of the wrong auth state and the wrong translation label; and, more corrosively, an
uncaught error on every page load is exactly the noise that hides a real one. It also means
**A7's X1 PASS was unearned** in the sense `docs/THE_LOOP.md` §6 names: the console tool prints
"console tracking starts when this tool is first called … you may need to refresh the page", and a
check performed without that refresh could not have caught a load-time error. Not A7's carelessness
so much as a check that could not fail.

**Not fixed here** (a walk files, it does not patch). The standard remedies are to resolve the
session server-side, or to render a stable placeholder until mounted for both the auth label and the
translation chip.

## D2 - the reading theme control mis-states itself, and "Light" does not survive a reload (MEDIUM)

Two observations, one cause.

**(a) The control shows the wrong theme.** On a fresh load with no stored preference and an OS that
prefers dark, the reader renders **dark** while the Aa panel highlights **Light** as the selected
segment. Verified by computed style, not by eye: `html.classList.contains('dark') === true` while
the Light button carried `bg-white text-stone-800 shadow-sm` (`backgroundColor rgb(255,255,255)`)
and Dark carried no background - i.e. React's `dark` state was `false`.

**(b) A stored "Light" is silently discarded.** Clicking **Light** works in the moment: the class is
removed, the page goes light, and `reader-theme: "light"` is written. Reload with that value stored
and the page comes back **dark** (`html.classList.contains('dark') === true`, body background at
lab lightness 2.9) with `reader-theme` still `"light"`. The user's explicit choice is overridden on
every load.

**Mechanism.** Two theme systems own the same `dark` class and neither knows about the other.

- `web/src/app/layout.tsx:70-74` - the no-flash script **only adds** `dark`, and only when
  `localStorage['reader-theme'] === 'dark'`. There is no branch that forces light.
- `web/src/app/layout.tsx:77` - `NeonAuthUIProvider` (from `@neondatabase/auth/react`) mounts a
  bundled `next-themes`-shaped provider. Proven, not assumed: the served chunk `3ziup6n5k5ucr.js`
  contains `defaultTheme`, `forcedTheme`, `disableTransitionOnChange`, `storageKey`, `system` and
  `prefers-color-scheme`; the class is accompanied by `style="color-scheme: dark"` on `<html>`,
  which the app's own script never writes; and the **server HTML contains no class on `<html>`**, so
  it is applied client-side by page JS, not by a browser extension.
- `web/src/components/reader-settings.tsx:18-23` reads `classList.contains('dark')` **once on
  mount**, before the provider's write, which is why (a) happens. `:32-35` (`applyDark`) then writes
  only `reader-theme` and the class, telling the other provider nothing.

The asymmetry is visible inside the same script: **text size persists correctly** (`reader-size` is
applied unconditionally, and W14 confirmed 22.4px survives a reload) because nothing else competes
for it. Only the theme has a second owner.

**Cost of not fixing.** The reading theme is the one setting a reading app is expected to have, and
it appears to work and then reverts on every reload for every user whose OS prefers dark. There is
no second place to fix it from: `/settings` is a stub whose own copy promises that "reading theme …
will live here" (D5).

## D3 - "jump back to it" jumps to the chapter, not the verse (LOW)

`/library/notes` tells the reader "Tap any reference to jump back to **it** in the reader." The link
resolves to the chapter only: `web/src/app/library/notes/page.tsx:17` builds
`` `/read/${b.slug}/${chapter}` `` with no verse component.

This is not a one-line omission - there is nothing to link to. `web/src/app/read/[book]/[chapter]/page.tsx`
takes only `useParams<{book, chapter}>` (`:49-52`); it has no `useSearchParams`, no hash handling and
no `scrollIntoView` anywhere in the file, and the study panel's verse state is set only from a click
(`:232`). So a verse deep link does not exist as a capability.

**Cost of not fixing.** Benign for John 3:1, which is at the top. For a note on a verse late in a
long chapter the reader lands at the top of the chapter with nothing selected and has to hunt. The
cost grows with the size of the user's library, which is the thing the page exists to grow.

## D4 - the bookmark write path does not exist in the UI (LOW, and it is why W4 could not run)

`onBookmark` is declared (`selection-popover.tsx:42`), rendered conditionally (`:171`), and **never
passed by anyone**. Both readers say so in comments: `verse-display.tsx:166` ("No onBookmark yet  - 
Phase 3 wires it") and `work-reader.tsx:431`. The `bookmarks` table is already migrated and has
invariant tests over it. So the gap is UI-only and deliberate.

Filed rather than waved through because the A7b order named bookmarks as a journey, and "we meant to"
is not the same as "it works". **Cost of not fixing:** none today; the cost is that a schema is being
maintained and tested for a feature no user can reach.

## D5 - `/settings` is a placeholder behind a first-class nav entry (LOW)

`web/src/app/settings/page.tsx` returns `<ComingSoon>`. The sidebar gives it a gear icon and the
bottom slot, i.e. the shape of a real destination. A reader who wants to change anything must know
that the controls live behind an unlabelled "Aa" chip in the reader header instead. Compounds D2:
the copy promises the reading theme will live here, and the theme is currently the one control that
does not stick.

## D6 - `/auth/sign-in` serves a full login form to an already signed-in user (LOW)

No redirect, no "you are already signed in" state. The page rendered the complete email/password
form while the sidebar in the same viewport offered **Sign out**. Recorded, not chased: it is one
line of intent (redirect signed-in users) and it costs a confused reader, not data.

## The finding I did not file - W10, and why

Driving the harness's scroll over the middle desk pane moved **the middle pane and the right-hand
pane together**, by exactly the same amount, twice in a row. It looked like coupled panes.

It is not. Before writing it up:

- `web/src/app/desk/page.tsx` (97 lines) contains no scroll handler and no scroll state - every
  `scroll` hit is a comment or the `{ scroll: false }` option on `router.replace`.
- `web/src/components/desk-pane.tsx` (read in full) contains no scroll handler either.
- The observed pattern was **the targeted pane plus its immediate next sibling**: pane 1 moved 1+2,
  pane 2 moved 2+3, pane 3 moved only 3. No CSS or DOM mechanism produces "and also the next
  sibling"; two independent `overflow-y-auto` boxes cannot be scrolled by one wheel event.
- Direct test, bypassing the harness: dispatching a wheel event and setting `scrollTop` on pane 2
  moved **only** pane 2 (`[0,0,0] → [0,400,0]`).

So the panes are independent and W10 passes; the coupling was the automation's scroll dispatch. This
is the same trap A7 recorded on the mobile bottom bar, and it is written down for the same reason:
**a false finding that is not written down is a false finding nobody learns from.**

A second harness artefact, also not filed: the first synthetic click after a page load was sometimes
swallowed (the Aa panel and the catalog "+" both needed a second click, while the same clicks worked
first time later in a sequence). It could not be reproduced deterministically, the same controls
work through a direct DOM click, and the confounders are the harness's own (stale accessibility
tree, `document.visibilityState === "hidden"`, screenshot-to-CSS coordinate scaling). Unresolved,
attributed to the environment, **not** reported as a product defect.

## What this walk did NOT cover

- **Sign-out and sign-in as executed flows** (W17, and authenticating at all) - forbidden by the
  standing constraint on credentials.
- **A second account.** Nothing here says anything about RLS or cross-user isolation; every write
  was the owner's own row. `docs/SECURITY.md`'s "verify with two accounts" is untouched.
- **Bookmarks end-to-end** (W4) - no UI exists to exercise.
- **The registers** (sermons, hymns/poetry, historians) as populated surfaces - they are empty until
  A8 publishes them, so the desk was only ever exercised with `commentary` panes. `paneRegisterLabel`'s
  other branches (Sermon, Hymn, Poetry, History, Theology, Confession) are **unexercised in
  production**; only `Commentary` and the `Unlabelled` fallback were observed.
- **`/ask`, `/home`, `/library/passages`, `/library/word-study`, `/library/commentaries` as journeys**  - 
  A7 covered them; this walk only passed through them.
- **`/study`, `/chat`, `/channel`, `/account`, `/library/books`, `/library/uploads`** - routes that
  exist in `web/src/app/` and were reached by neither walk. The two derived lists together still do
  not cover the shipped route surface.
- **Any browser other than the one Chrome profile used here**, and any OS whose
  `prefers-color-scheme` is light - D2's second half is specific to an OS that prefers dark, and the
  mirror case (a stored `dark` on a light-preferring OS) was not testable from here.
