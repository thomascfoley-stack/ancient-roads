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

## HONEST STATUS — updated after the 10-agent parallel batch

**~90 distinct test IDs explicitly verified with evidence**, plus the two full generators (66/66
books, 22/129 works spot-checked across every source_type) — call it roughly 180-220 discrete
checks once the generators are counted individually, up from ~85 before this batch. **23 real
findings filed**, all with repro steps and most with exact file:line root causes. 9 of 10 dispatched
agents merged; the 10th (chaos/resilience) is still running and will be merged on completion.

**The two most consequential findings remain from before this batch** (F-011 desk journey, F-012
library hang) — this batch's biggest addition is the **root cause for F-012**: the exact fix that
already exists for one broken route (`library/uploads`) and was never applied to its two siblings
(`library`, `library/books`). That's not "here's a bug," that's "here's the patch that already
exists, apply it twice more."

**Newly confirmed via live keyboard testing, not source-reading:** the translation switcher has no
Escape-close and no focus containment (F-029) — this closes out an item the plan had flagged from
code alone as "confirm in a browser." **Newly pinned to an exact component:** the known "16 sub-44px
targets" finding is the footer link component specifically, 15 targets all exactly 40px (F-031).

**Still not run:** the two query-batch generators (150 Ask questions, 120 history queries — these
need the rate-limited real Ask/History endpoints on the one real account, deliberately not
parallelized), the full CH signed-in chaos matrix, uploads end-to-end (blocked on F-012 anyway),
messaging/prayers deep pass, most of PL/DO past what's spot-checked, and the majority of
individual control-level tests in sections not covered by an agent this round (HL/NT/WS/IN/CM depth
beyond what reader-deep covered, SE depth, DK depth beyond the journey walk, PW pairwise beyond the
two confirmed this session, CO-020 gestalt).

All findings, batches, and source evidence are in this file plus `docs/evidence/ux-remediation-2026-08-24/`
(one file per agent's full report). Picking this back up: the query batches and remaining signed-in
depth are the highest-value next slice, since everything code/DB/signed-out-reachable just got a
serious pass.

## Note — chaos agent failed and was retried

First chaos-resilience agent died mid-run: "API Error: Claude's response exceeded the 64000 output
token maximum" — no output file was written, nothing to salvage. Retried with a much tighter scope
(3 checks instead of 6, explicit truncation rules to prevent large HTML/JSON dumps). Will merge on
completion.

## Batch 20 — chaos, retry (signed out, prod build) — final agent, all 10 now merged

Full detail: `docs/evidence/ux-remediation-2026-08-24/chaos.md`.

CH-021/022 ✅ **PASS.** 500-char string accepted with no client truncation; a real React-dispatched
`<script>` input never executed and was never injected as live markup. No XSS on the waitlist field.

**CH-008/013/014 — NOT MEANINGFULLY TESTED, correctly reported as such rather than faked.** `/search`
submits via a full browser navigation to `?q=...` (SSR), not a client-side `fetch()` — so a
`window.fetch` monkey-patch resets before any request happens and can't inject a failure here.
**Architectural side-finding:** this confirms `/search` is server-rendered per query, which also
explains why LD's agent couldn't force a loading window on it earlier (no client fetch to delay).
Genuine offline/slow-network testing of this route needs network-layer interception (DevTools
Protocol) or a different async surface (Ask, History search — both confirmed client-fetch-driven
earlier this session) — queued, not run.

---

## FINAL TALLY — all 10 parallel agents merged (1 retry after a harness failure)

23 findings filed this batch, ~90 distinct test IDs verified, both full generators run (66/66 books,
22/129 works). One agent (chaos, first attempt) failed on an output-token limit with nothing to
salvage; retried at a third of the scope and completed cleanly. Everything above is pushed with
full evidence in `docs/evidence/ux-remediation-2026-08-24/` — one file per agent.
