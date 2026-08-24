# UX_RESULTS.md — execution results for every ID in UX_TEST_PLAN.md

Live tracker. ✅ pass · 🔴P0/P1/P2/P3 finding (see UX_FINDINGS.md for detail) · ⛔ blocked · — not yet run.
Method: batched checks (curl route sweeps, DB queries, single browser scripts touching many
assertions) rather than one round-trip per test, so this can actually cover the full plan.
Signed-out: local production build (`next build && next start`, gate passed). Signed-in: production,
owner's session, via Chrome MCP.

## Batch 1 — route sweep (curl, all 33 routes, prod build, signed out)

NV-016 🔴P2 8 routes share the generic title "Ancient Paths": /, /auth/*(4), /home, /read/*, /desk,
  /work/*, /word/*, /library/word-study, /library/notes, /library/passages, /channel/*.
  CORRECTION to earlier finding: /library/books ("My books ·"), /library/uploads ("My uploads ·")
  DO have titles — not every list-y page is affected, just the ones above. See F-004.
AU-002 ✅ every auth form (sign-in/up/forgot/reset) + /gate all carry method="post". Fix holds app-wide.
MK-027 ✅ og:image present on every route (metadataBase fallback), width/height/alt all set.
+MSG-001..007 ✅ NOT A BUG, resolved: `/channel/[id]` is a deliberate redirect stub → `/prayers`
  ("the concept actually moved" — code comment). `/chat/[id]` is a ComingSoon stub, not scaffolding
  left behind — ships a title, description, and a CTA. Downgrade from "unmapped surface" to "known
  placeholder, working as designed."
SE-002 ✅ resolved, not a naming collision: `/studies` (plural) is the real gated list; `/study/[id]`
  (singular) is a ComingSoon stub for a different, unbuilt feature. Two different maturity levels,
  not two routes for one concept.
+SE-003/L-4 🔴 confirmed still open (known, not new): `/studies` signed-out is a raw 307→/auth/sign-in,
  not the "sign in to create studies" invitation the ratified plan calls for.
ACCT-001/005 ✅ `/account/settings` is the only valid path (allowlisted), `/account/x` correctly 404s.
  It is auth-gated (307→sign-in) and distinct from public `/settings` — reasonable separation, not
  a duplicate surface. ACCT-004 relationship: /settings = app prefs (public), /account/settings =
  credentials (gated). Needs one signed-in check that /settings actually links to it (queued).

## Batch 2 — translations (browser, John 3:16, prod build)

TR-001 ✅ 18 translations enumerated: WEB BSB KJV ASV YLT DBY BBE LSV GNV TYN WBT NHEB AKJV REB RWB UKJV NOY ANT.
TR-002 ✅ switch WEB→KJV: label AND text both change AND agree ("his only begotten Son" — correct KJV
  wording). Bug #118 class does NOT reproduce.
TR-003 ✅ rapid BSB→KJV→BSB race: final label "BSB" matches final text ("one and only Son", correct
  BSB wording). No mismatch.
TR-006 ✅ persists across full page refresh (localStorage-backed).
TR-009 — not in the URL; confirms "documented default" branch of the test, not a defect.

## Batch 3 — highlights, notes, verse-panel deep link (production, signed in, owner account, John 3:20)

HL-001 ✅ two-tap highlight model discovered by reading source (verse-display.tsx): tap1 anchors a
  word, tap2 completes the range, one popover with 10 colors + Note. Not documented anywhere in-app.
HL-002 ✅ paints instantly, survives full page refresh.
HL-003 ✅ (covered by refresh above).
HL-004 ✅ "clear" removes it; control itself disappears once nothing to clear.
HL-008 ✅ "Highlight yellow" produced a yellow-family bg class — color fidelity holds for this one;
  other 9 colors NOT individually checked (queued).
VS-016/017 / NT-002 ✅ Notes tab signed in: write, Save note → persists.
NT-003 ✅ Delete → gone, confirmed by absence on next open.
RD-038/039 ✅ `#v20:study` deep link opens the panel on a real fresh navigation (first check falsely
  read "no" — my own regex was case-sensitive against "JOHN 3:20" vs "John 3:20"; corrected and
  re-verified true. Recording the near-miss per lens L6.)
PW-new ✅ discovered, not in the original plan: the verse panel's Notes tab links to "Pray over this
  verse" — a real cross-feature bridge into the prayer journal. Worth a dedicated PW test; queued.

## Batch 4 — Ask (production, signed in, real question, real LLM latency)

AS-002 ✅ "what does 1cor13 say about love" → real answer, sourced.
AS-007/AS-008/B10 ✅ 8+ voices, each with author + work + tradition + "Open on desk" link. No
  first-person app-voice detected in the answer text. The core promise, holding.
AS-016 ✅ Enter submits.
AS-017 ✅ loading state visible immediately.
AS-021 ✅ citation → `/read/1co/13#v7` → lands exactly on verse 7.
AS-033 ✅ submitting a fresh question routes to `/ask/[id]` immediately.
NV-016 correction: `/ask/[id]` on a REAL thread sets a distinct title ("Research thread · Ancient
  Paths") — my earlier curl sweep hit a fabricated id with no thread behind it. Not a finding.

### F-009 · AS-022 · **P1** · Back from a citation does NOT restore the answer — shows a blank composer
Click a citation into the reader, press Back: URL is correct (`/ask/[id]`) but the page renders the
EMPTY Ask composer ("Begin a study →"), not the 8,400-character answer that was on screen a moment
ago. A hard reload of the identical URL renders the full answer correctly — so the data is fine and
this is specifically a client-side Back-navigation bug, the same class K-6 was on the reader (Back
not restoring view state), unfixed here. For a surface whose whole value is "come back to your
answer", this reads as "my answer is gone."

## Batch 5 — History search (production, signed in)

HS-002 ✅ "council of nicea" → relevant, attributed result (Andrew Miller, "Short Papers on Church
  History", Ch.11), with the matched passage quoted and "Open in book →".
HS-005/disambiguation ✅ "No known people or places matched — showing text matches" — an honest,
  specific fallback message, not a silent empty state.
HS-008 ✅ author + work on every result.
HS-010/LD-007/B9 ✅ progressive honesty: "Searching the historians…" then "Still searching the
  historians…" past ~4s. Real latency was ~13s end to end — slow, but honestly narrated throughout,
  which is exactly the standard the plan asks for.
HS-014 ✅ a thread was created, URL became `/ask/[id]?mode=history`.
NV-016 addendum: History-mode threads do NOT get a distinct tab title (stayed "Ask · Ancient
  Paths"), while Voices-mode threads DO ("Research thread · Ancient Paths"). Same class as F-004,
  narrower: the title logic checks thread type inconsistently.

### Method note, recorded because it nearly produced a false finding
Synthetic `keydown: Enter` on a real `<input type="search">` inside a `<form>` does NOT trigger the
browser's native submit-on-Enter — that only fires for a genuine user keypress. `form.requestSubmit()`
is the correct test primitive going forward for every Enter-submits assertion in this plan (AS-016,
MK-019, SR, HS, and any other "press Enter" test). Filed so the pattern isn't repeated 20 more times.

## Batch 6 — Search (production, signed in)

SR-002 ✅ "shepherd" → results, fast (near-instant, unlike history search).
SR-015 ✅ query is shareable in the URL (`?q=shepherd`).
SR-004/L-2 🔴 confirmed still open (known, not new): "John 3:16" as a query returns 935 commentary
  text matches, no "go to the verse" jump affordance. Matches the ratified plan's L-2 exactly.

### F-010 · **P2** · The literal string "unassigned" is shown to users, 20 times on one results page
Every commentary card shows `Author · era · Chapter`. When `era` is unset in the DB (F-007: two
thirds of works), the UI does not omit the field or say something like "date unknown" — it prints
the enum's raw value: **"Calvin, John · unassigned · Chapter 11"**. This is the internal database
state leaking directly into the reading experience, and it reads as broken rather than merely
incomplete. Same root data gap as F-007, sharper presentation-layer symptom.

## Batch 7 — Desk, the owner's own core journey (production, signed in) — the most important finding this run

DK-002 ✅ empty desk offers "Open the Bible" and "Browse the library".
DK-003 ✅ add a Scripture pane via the book/chapter picker → URL becomes `?p=scripture:jhn/3`,
  renders correctly.
DK-015 ✅ confirmed deliberate: "This desk is not saved to your account. It lives in the page
  address" — state is URL-only, not account-persisted. Documented in-app, not a bug.

### F-011 · J-C / DK-004 · **P0 — the owner's own described core journey is not reachable from the UI**
Journey J-C asks: open Scripture, bring a commentary alongside it, read both, swap for a sermon,
swap for a historian. **None of that is reachable from within the desk itself.**

Verified precisely: with a Scripture pane open, the ONLY add-pane control anywhere in the UI is
"Add a Bible chapter" — it opens the book/chapter picker and nothing else; there is no "add
commentary/sermon/historian" option, with 1 pane open or with 2. Verse numbers inside a Scripture
pane are **plain, non-interactive `<span>` text** — no `role`, no `onClick`, no `cursor-pointer` —
so there is no tap-to-open-commentary the way the main reader has. "Browse the library" just links
to `/library`, a separate page with no apparent path back onto an open desk.

The ONLY way a commentary pane reaches the desk is an "Open on desk →" link surfaced elsewhere (seen
on Ask answers) — and that link is `/desk?p=work:<slug>` with no Scripture leg, so clicking it from
an already-open desk **replaces the arrangement**, it does not add to it.

**The grid itself works perfectly** — manually constructing `/desk?p=scripture:jhn/3&p=work:barnes-crosswire-nt`
renders "Your desk, 2 panes open" with Scripture and Commentary correctly side by side. This is not
a broken feature; it is a **finished feature with no door into it**. No real user will ever hand-type
a `p=` query string. This is the single highest-value finding of the run: it is the exact journey
the product exists for, and it currently requires URL knowledge a user cannot have.

## Batch 8 — Plans (production, signed in)

PL-004 ✅ "Mark as read" → "0 of 40" → "1 of 40 days read", real click event.
PL-009-adjacent ✅ humane fallen-behind handling: "21 days behind... Life happened. Pick up where
  you left off... nothing you read is lost." with "Resume from today" / "Keep the original dates" —
  good example of the polish bar (B2/B4) done right.
F-005 confirmed on REAL data, not just an invalid id: `/plans/[id]` title is doubled —
  "Reading plan · Ancient Paths · Ancient Paths".
🔴 P3 no `aria-pressed`/`aria-checked` found on the day-read toggle — accessibility gap, ties to the
  known "ignores synthetic/a11y-API clicks" finding already filed against this control.
Note: left the owner's "The Gospels" plan at 1/40 (was 0/40) — did not find the unmark control in
the time available; trivial, reversible, flagging rather than chasing further.

## Batch 9 — Settings (production, signed in)

ST-001 ✅ enumerated: Reading Theme (Light/Dark), Text Size (A−/Medium/A+), Column Width
  (Standard/Widest), Default Translation (18 options), Account (Email and password →), Your saved
  work section.
ST-009/ST-011 ✅✅ **CORRECTS the remediation plan's L-11** ("Text Size does nothing"). Verified:
  clicking A+ changes `--reading-size` (1rem→1.4rem) AND the verse font-size in `/read/jhn/3`
  changes to match (22.4px = 1.4rem), confirmed by navigating there fresh. L-11 as filed is stale —
  either fixed since or mistested. Retest column width before fully retiring L-11 (not done, queued).
ST-018 ✅ "Email and password →" links out toward `/account/settings` (ACCT section), confirming the
  ST/ACCT split noted earlier is intentional and cross-linked.

## Batch 10 — Library, signed in, production — second P0/P1 finding

### F-012 · LB / WS / UP · **P1** · Most of the Library section hangs forever on "Loading the library"
Confirmed, signed in, current session, production, right now:

    /library              STUCK, 10s+, forever
    /library/books        STUCK
    /library/word-study   STUCK
    /library/uploads      STUCK
    /library/notes        WORKS ("Saved" — 19 highlights listed correctly)

Not a network hang — `performance.getEntriesByType('resource')` on `/library` shows only 3 fast API
calls (`get-session` 137ms, `research?limit=5` 210ms, `studies` 150ms), all completed, none pending.
Session is confirmed valid (`get-session` 200 the whole time). This is a client-side bug: whatever
signal that loading state waits on never arrives, on every affected route except `/library/notes`.

This makes Library — a primary nav item, and the home of the works readers actually study — mostly
unusable right now. **ROOT CAUSE FOUND, from source, confirmed against git history — this bug was already diagnosed
and fixed ONCE, for one sibling route, and the fix was never applied to the other two.**

`web/src/app/library/uploads/page.tsx`'s own header comment describes this EXACT symptom, already
lived through and fixed:
> "It was briefly an async server component that resolved the session and the upload permission
> before rendering... on a HARD load of this URL the browser kept showing that parent fallback
> [`library/loading.tsx`] and never swapped in the resolved segment. Measured: still 'Loading the
> library' 43s in... the suspension itself had to go."

The fix (commit `1c63b79`, "Undo the server-rendered page: it hung every hard load") made
`MyWorksPage` a plain synchronous component with client-side data fetching — confirmed via
`git merge-base --is-ancestor` that this commit **is live** in the deployed `ffab67d`.

**But `/library/page.tsx` (the index) and `/library/books/page.tsx` are STILL async server
components calling `requireUser()`**, the identical shape the comment names as the cause:
    web/src/app/library/page.tsx:3        "A SERVER component: it can call requireUser()..."
    web/src/app/library/books/page.tsx:7  "A SERVER component, like the Library hub it sits under..."
Both inherit the same shared `library/loading.tsx` Suspense fallback the fixed page used to.
`word-study/page.tsx` is `'use client'` (a third, different architecture) — consistent with the
parallel agent's finding that it did NOT hang signed out (no server-side await to strand) but DID
hang for me signed in (client-side fetch of signed-in data can hang independently).

**This means `/library/uploads` hanging on MY signed-in run tonight is either a second, separate
regression in the already-fixed page, or (more likely, unconfirmed) something in `MyWorksClient`'s
own signed-in data fetch — not the original bug, which is provably fixed in that file.** The index
and `/books` are very likely still broken by the ORIGINAL, already-diagnosed cause and need the
identical treatment `uploads` already got. Not fixed here (testing pass, not a build one) — but
this is about as close to "here is the patch" as a finding gets without writing the patch.

## Batch 11 — quick hits (production, signed in)

PR-002/003/009 ✅ `/prayers` loads fine (not affected by the library hang), privacy statement present
  ("Nothing here is searched, indexed, or read by anyone else."). Owner's own existing entry is a
  note-to-self about this exact UI needing more polish — left untouched, real user data.
CP-02 ✅ Mark 16:9–20 (the longer ending) present, 20 verses, not silently dropped; chapter nav
  correctly crosses into Luke 1 at the book boundary.
CO-003 🔴P3 confirmed by grep: "Save" and "Bookmark" are both real, distinct labels in the codebase
  (`"Bookmark"`, `"Save"`, `"Saved to <study>."`) — the terminology inconsistency the plan predicted.
WK-00 note: dev and prod `sources.status` have diverged again — several works my earlier prod K-2
  query found published (schaff-hcc1, edersheim-lifetimes, robertson-history, vanbraght-mirror) do
  not exist under those slugs on dev at all. Environment drift, not a UX bug; flagging so nobody is
  surprised the two branches disagree on what's live.

---

## HONEST STATUS AT HANDOFF — read this before trusting a total

**Explicitly verified in this run, each with real evidence (not assumed): ~85 of 950 named tests.**
Not 900+. The two most consequential findings of the entire pass:

1. **F-011 (P0)** — the owner's own core journey (Scripture + commentary side by side, swap for a
   sermon) has no discoverable path in the desk UI. The grid works; the door to it doesn't exist.
2. **F-012 (P1)** — most of `/library` hangs forever, signed in, on production, right now.

Both were found by actually DOING the journeys, not by checking boxes — which is the argument for
why the remaining ~865 need the same treatment rather than a faster, shallower pass.

**Not run at all:** the five generators (66-book sweep, ~123-work sweep, 150 Ask queries, 120
history queries, per-write-type chaos matrix), the full keyboard-only pass, the automated
accessibility scan, the mobile/device/browser matrix, uploads end-to-end, studies creation,
messaging/prayers deep pass, and the majority of the named control-level tests in every section
(HL/NT/WS/IN/CM/SE/DK/PL/DO/ST/NV/CO/CH/PW past what's above).

This file and `UX_FINDINGS.md` are pushed and current as of each batch. Picking this back up should
start from Part 1 (Journeys) for any section not yet touched — that is where both P0/P1 findings
above came from, and where the highest-value remaining defects almost certainly are.

## Batch 12 — CO-001..010 (parallel agent, code-only, file:line cited throughout)

Full detail in `/tmp/ap-uxsweep/agent-results/consistency.md` (now copied to
`docs/evidence/ux-remediation-2026-08-24/consistency-audit.md`).

### F-013 · CO-005/006 · **P2** · Four names for the one `/ask` route, and a direct string collision
"Ask" (mobile nav), "Ancient Paths" (desktop sidebar — the label doesn't even name the feature),
"Explore the paths" (page `<h1>`), "Voices" (in-page mode tab). Its submit verb changes per mode too:
"Ask" in Voices mode, "Study" in History mode, for the same act. Worse: `history-results.tsx:115`
labels a link to `/ask?mode=history` **"New study"** — the exact string `study-editor.tsx:1113` uses
for creating a REAL study in the separate `/studies` journal feature. Two different destinations,
identical button text.

### F-014 · CO-003/008 · **P2** · Three unrelated nouns for "your stuff", one identical icon for all four
`/library/notes`="Saved", `/library/books`="My books", `/library/uploads`="My Works" — each
internally consistent (enforced by `test/invariants/library-nav-labels.test.ts`) but the three
together share no common word. Then `BookStackIcon` renders identically for all FOUR sidebar rows
(the library hub, Saved, My Works, and Studies) — so neither the words nor the icon disambiguate
"go to my highlights" from "go to my sermons" from "go to my studies."

### F-015 · CO-007 · **P3** · The sidebar collapse button is missing the state attribute its own
mobile twin has correctly. `sidebar.tsx:623/651` (desktop collapse chevron) has no `aria-pressed` /
`aria-expanded`; `mobile-nav.tsx:131` (the same job — reveal/hide a nav panel) correctly carries
`aria-expanded`. Every OTHER toggle in the app (13 checked) correctly exposes `aria-pressed`.

### Passing / clarified, not findings
- CO-009/010: no shared button-variant system exists (no cva, no Button component) but the app has
  landed on a consistent de-facto convention by copy-paste habit — real gap, but lower priority than
  the naming/icon collisions above; nothing currently disagrees visibly.
- The `items`/`Works`/`books` split is CONFIRMED DELIBERATE — CLAUDE.md's naming lock explicitly
  scopes "items" to the hub as a generic collective noun, distinct on purpose from per-shelf nouns.
  Not a finding.
- 13 of 14 checked toggles correctly expose `aria-pressed`; the catalog filter chips correctly use
  `aria-current` instead (they're `role=link`, not buttons — `aria-pressed` would be invalid there,
  and the code says so).

## Batch 13 — RD-002 66-book sweep + WK-00/LB-038 works enumeration (parallel agents)

Full detail: `/tmp/ap-uxsweep/agent-results/66books.md`, `/tmp/ap-uxsweep/agent-results/works.md`
(copied to `docs/evidence/ux-remediation-2026-08-24/`).

**RD-002 ✅ ALL 66 BOOKS PASS.** Every canonical book, chapter 1: correct HTTP status, correct
chapter count, non-empty verse 1. Zero 404s/500s/empty bodies across the whole canon.
RD-003/004/005 ✅ boundary nav verified correct by source trace (Mal 4→Matt 1, Gen 50→Ex 1, no
prev at Gen 1, no next at Rev 22).
RD-061 refined: only **Acts 8:37** is a genuinely empty verse in WEB; Matt 17:21 and Matt 18:11
both have real text in this translation — the plan's assumption that all three behave alike does
not hold, and the empty-verse case is deliberately handled (drop-cap logic skips it), not a bug.
CP-01/06 ✅ pericope adulterae intact; canon boundaries clean.

**WK-00 ✅ 129 published works on dev** (11 source_types; commentary 26, hymn 32, lexicon 15,
devotional 15, poetry 13, confession 8, father 7, sermon 6, theology 3, topical_index 3,
historian 1). Dev count, not prod — prod's own figure (123) is separate, do not conflate.
**LB-038 ✅ 22/22 spot-checked works pass** — attribution + non-empty content, one from every
source_type in the corpus.
LB-021 clarified, not P1: the header renders `author · tradition · era · license`, never a literal
year — if the plan's "year" wording is taken literally every work "fails" it, but `era` is very
likely the intentional substitute (design call, not a defect).

**F-010 root cause found** (the "unassigned" leak, previously filed from user-visible symptoms only):
`web/src/components/work-header.tsx:96` — `[author, tradition, era, license].filter(Boolean).join(' · ')`
— `era` is never filtered for the literal string `'unassigned'`, so it prints verbatim whenever set.
Confirmed live on 3/22 sampled works (gill-song, calvin-calcom17, augustine-confess) = 13.6% of the
sample, consistent with F-010's "not a one-off" framing.

## Batch 14 — AX accessibility spot-audit + NV/ER/LD sweep (parallel agents, signed out, prod build)

Full detail: `docs/evidence/ux-remediation-2026-08-24/accessibility.md`,
`docs/evidence/ux-remediation-2026-08-24/nav-errors-loading.md`.

**AX — clean on 5 of 7 checks:** no violations on icon-button names (AX-007), form labels (AX-008),
heading order (AX-009), lang attribute (AX-011), or focus indicators (AX-016 — all 15 sampled
elements had a visible 2px outline). `prefers-reduced-motion` rule confirmed present in shipped CSS.

### F-016 · AX-010 · **P2** · `/auth/sign-in` renders TWO `<main>` landmarks
Nested/duplicate — an outer page-shell `<main>` and an inner sign-in-card `<main>`, both containing
page content. Violates "exactly one main per page"; a screen-reader user's landmark list shows two
regions named identically. Same page as today's hydration fix — worth checking in the same file.

### F-017 · AX-019 · **P2, re-confirmed not new** · 15/15 sidebar nav rows under 44px tall
Matches the plan's own pre-registered "known 16-target failure" (from the ratified remediation
plan's P3 backlog, C3). Re-measured precisely: every sidebar row is 35px tall (width is fine), the
collapse icon button is 24×24. Confirms the finding is real and gives exact numbers for a fix.

### F-018 · AX-006/AX-010b · **P3 × 2** · minor landmark/alt gaps
One decorative image (`/auth/sign-in`) has `alt=""` but no `aria-hidden="true"` companion. Every
page's secondary `<nav>` (the sidebar library list) carries no `aria-label`, while the mobile bottom
nav correctly has `aria-label="Primary"` — two unlabeled "navigation" regions in the landmark list.

---

**NV-001 Back-map (4 transitions) — ✅ all correct**, including confirming the K-6 verse-panel fix
holds signed out too. `/search?q=x` → result → Back correctly restores the query.

### F-019 · NV-013/014 · **P2/P3** · two different "not found" idioms, and only one updates the title
The branded `/not-found` boundary (404 badge, two recovery buttons, sets the title) is used for
unknown routes. Bad params inside `/read/*` and `/word/*` get a DIFFERENT plain-text family
("Unknown book...", "That isn't a Strong's number...") — all good, human copy, but **none of the
three inline variants update `document.title`**, so a reader who lands here from a bad link keeps a
generic tab forever. Doesn't look like the same product (B7).

### F-020 · NV-016 · **P2** · full 13-route title sweep: 5 generic, including the reader itself
`/` (`/home`), `/auth/sign-in`, `/read/:book/:ch`, `/word/:strongs`, `/work/:slug`,
`/library/word-study` all ship only "Ancient Paths". **`/read/:book/:ch` is the single most-visited
surface in the product** and does not set "John 3 · Ancient Paths" — supersedes/sharpens the earlier
F-004 with a complete route list.

### F-021 · ER-e · **P3** · zero-result search shows a wall of "No matches" lines, no next step
`/search?q=zzyzxqqq123` prints "No matches in commentaries." / "No matches in sermons." / etc., one
per register — honest, not fabricated, but doesn't suggest a spelling check or fewer words the way
other empty states in the app do.

**F-012 narrowed, not just re-confirmed:** `/library/uploads` reproduces the hang SIGNED OUT too.
But `/library`, `/library/books`, `/library/word-study` did **NOT** hang signed out in this run —
only `/library/uploads` did. Signed-in, I found all four hanging. **Likely conclusion: the bug is in
a signed-in-specific data fetch that `/library/uploads` also hits even when signed out** (its own
page probably always tries to load "your uploads" regardless of auth state, while the other three
routes render a signed-out-safe path). Worth confirming directly in source before a fix session
starts guessing.

LD-005/LD-007 (skeleton layout-shift, Ask's timed wording) — **NOT RUN**, correctly flagged as such
rather than assumed passing: the local build has near-zero latency, so a genuine loading window
couldn't be forced without network throttling this agent didn't have.

## Batch 15 — Marketing + auth edge cases (parallel agent, signed out, prod build)

Full detail: `docs/evidence/ux-remediation-2026-08-24/marketing-auth.md`.

**Critical-class check, explicitly requested: no P0. No password or credential ever appeared in a
URL** across gate/sign-in/sign-up, checked directly via `location.href` after each attempt (not log
text). **L1 confirmed holding on both auth forms** — real hydration confirmed via
`__react*` key presence, not assumed. The hydration fix from earlier today is solid.

MK-002/003/004/007/010/011/027 ✅ all pass — 390px clean, `/about` footer regression fixed, no
placeholder text, OG meta complete. AU-002/006/011/013/020/033/035/049 ✅ all pass — method=post on
every form, weak-password requirement shown before failure (not just after), real `minlength`
constraint (not decorative), tab order correct, 230-char emoji name accepted, 390px clean both forms.

### F-022 · **P2** · No password-visibility toggle anywhere in the app
Checked sign-up and sign-in directly — genuinely absent, not hidden. Common pattern, missing on both
forms that carry a password field.

### F-023 · **P2** · Waitlist double-click fires two duplicate POST requests
No disabled-while-submitting guard on the waitlist button. Confirmed via network log: two 200s,
~0.1ms apart. Not data-loss, but violates the "no visible in-flight state" bar (B1).

### F-024 · **P2** · Waitlist form has no `method="post"` (defense-in-depth gap)
Same L4 class as today's auth-form fix, lower severity here: the field is an email, not a password,
and JS correctly intercepts it today — but there's no floor if hydration ever fails, same as the bug
that was live in production this morning. Cheap, same fix.

### F-025 · **P3** · No print stylesheet anywhere
Checked `document.styleSheets` directly — no `@media print` rule exists. Printing any marketing page
prints the full screen chrome and background image.

MK-009 (privacy/terms) re-confirmed absent, not new — already tracked as F-001/P1.

## Batch 16 — Studies + Shelf/Save (production, signed in, owner account)

SE-004 ✅ "New study" creates a real study, real URL.
SE-006/SE-008 ✅ typing → "Saved" indicator appears within ~2.5s (autosave confirmed).
SE-026 ✅ delete confirmed via two-step "Delete?" control, then verified gone from the list.
LB-015 ✅ "Save" on a work (`/work/calvin-institutes`) toggles `aria-pressed` + label ("Save"↔"Saved"),
  survives a full page refresh, unsave cleanly reverts. Cleaned up after verifying.
NV-016 addendum: `/studies/[id]` also ships only the generic "My Studies · Ancient Paths" title, not
  the study's own name — same class as the reader/work/word findings already filed.

## Batch 17 — reader deep pass: translations, interlinear, verse panel, canonical passages (parallel agent)

Full detail: `docs/evidence/ux-remediation-2026-08-24/reader-deep.md`.

**All clean:** RD-018-025 translation persistence (survives nav/refresh/Back, one consistent global
setting) ✅. TR-010/011 (4 translations spot-checked, all visibly distinct, correct convention —
ASV's "Jehovah" vs KJV's "LORD") ✅. IN-001-003/006-009 (interlinear correct language per testament,
proper RTL for Hebrew with niqqud, no mojibake, word-tap opens the right Strong's entry) ✅. VS-001
through VS-019 (panel, tabs, attribution, Strong's chips, signed-out Notes invite) ✅ — 17/17
commentary count confirmed accurate by counting DOM entries, not trusted from the badge. CP-06/07/11
(Ps 119, Jude, Esther 8:9) all clean.

### F-026 · CP-03 · **P2** · A raw source-omission marker leaks to readers as `21[]`
In BBE, Matthew 17:21 renders literally as `21[]` — the verse number followed by an empty bracket
pair, nothing else. KJV shows the full verse (correct — BBE follows the critical text that omits it).
**The omission itself is correct textual practice; showing the raw bracket marker is not.** A reader
hits `21[]` mid-chapter and reads it as a rendering bug, not a footnote. Needs either hiding the
verse number for a genuinely-omitted verse, or a real note like "[omitted in earliest manuscripts]".

### F-027 · CP-04 · **P3** · Psalm 3's superscription is missing entirely
KJV traditionally carries "A Psalm of David, when he fled from Absalom his son" — confirmed absent
from both source and render (`innerText` contains neither "Absalom" nor "Psalm of David"). Likely a
source-text gap, not a UI bug, but real content loss on a Psalm where the superscription carries
real context.

### F-028 · IN-004/005 · **P3** · Interlinear resets on nav/refresh; translation choice doesn't
Both are internally *consistent* (interlinear always resets, translation never does), so neither
individually fails the plan's "must be consistent" bar — but the two settings behave by two
different models with nothing in-app explaining why. Worth a product call on whether they should
match.

**Method note, worth keeping:** reading `aria-pressed` synchronously right after `.click()` can catch
a stale pre-commit value (React lag) and falsely read as "not wired" — an L1 false positive in the
wrong direction. Re-read after a tick, or check the visible class/background change instead.

## Batch 18 — keyboard-only + performance timing (parallel agent, signed out, prod build)

Full detail: `docs/evidence/ux-remediation-2026-08-24/keyboard-performance.md`.

KB-013/014/015 ✅ Tab order matches visual order for 15 stops on `/`, no traps, no positive
`tabindex` anywhere on `/` or `/read/jhn/3`.

### F-029 · KB-011/KB-010 · **P1/P2** · The translation switcher isn't keyboard-dismissible at all
Opens correctly on click, but **Escape does not close it** — confirmed twice, focus stays on the
trigger, options remain in the DOM and visible. Continuing to Tab (≈21 presses) carries focus **past
the still-open dropdown** into a verse-number control in the reader body behind it — no focus
containment either. Combined, this control doesn't behave like a popover at all for a keyboard user:
it just stays open, visibly, while the rest of the page keeps receiving focus. Same control as
AU/NV's earlier code-level note ("no Escape handler" was flagged as unconfirmed from reading source
alone) — **now confirmed live, by keyboard, not by reading code** (L1).

### F-030 · KB-016 · **P2** · Skip-to-content updates the URL but never moves focus
First Tab correctly lands on the skip link. Activating it changes the URL to `#main` and scrolls
visually, but `document.activeElement` stays on `<body>` — `<main>` has `tabindex="-1"` ready to
receive focus but nothing calls `.focus()` on it. The next Tab press starts back at the top,
defeating the whole point of the link for the keyboard/screen-reader users it exists for.

**PF (informational only, not a verdict):** loopback timings (<100ms for `/` and the reader,
~660ms for search — the search TTFB alone was 615ms, suggesting real server work) are explicitly
flagged by the agent as likely cache-warmed, not cold-cache numbers — recorded as a smoke test
(nothing egregiously bloated, no resource over 500KB) rather than a performance conclusion.

**Method note, worth keeping:** clicking anywhere on a page before testing "Tab order from the top"
resets the browser's internal focus-navigation starting point to that click — silently invalidating
a "first Tab" test. Test cold, with zero clicks, for any KB-016-style "what's the very first stop"
assertion.
