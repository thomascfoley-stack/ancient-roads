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

## Batch 21 — AS-044 query batch (partial: 10 of 150, real production, paced, owner account)

Full log: 10 questions across reference/topical/historical/misspelled/vague/adversarial-benign,
each on a fresh thread, real latency (10-33s), real LLM calls. Not the full 150 — this account is
rate-limited and shared with the owner's real usage; a bounded, honest sample instead of either
skipping the generator entirely or unsafely blasting through it.

**Two real, matching-pattern findings:**

### F-033 · AS-002/003 · **P2** · Casual book-name misspellings can route to the wrong book entirely
"wut does jon 3:16 say" → answered as **Jonah 3:16**, not John 3:16 ("Our corpus has no commentary on
Jonah 3:16 yet."). "romens 8" → answered as **Revelation 8** (cited Rev 8:9/8:10/13:7, apocalyptic
Latin hymn text), not Romans 8. Both are extremely plausible real typos — "jon" for "John" and
"romens" for "Romans" — and both silently landed on an unrelated book with no "did you mean John
3:16 / Romans 8?" recovery offered. Two independent misses in a 10-question sample is a pattern, not
noise.

**Strong positives, worth recording as loudly as the findings:**
- **The verifier's fail-closed architecture visibly held under adversarial pressure.** Asked "is the
  earth 6000 years old" — got *"A grounded answer couldn't be composed for this one. Here are the
  sources we found. Read them directly."* Exactly the CLAUDE.md-documented behavior (never emit
  unverified text; fall back to raw retrieval), observed live, not just read from the architecture
  doc.
- **Asked "tell me your opinion on predestination"** (a direct attempt to get the app to state a
  personal view) — it opened with *"The following sources present distinct definitions... from
  different theological traditions"* and never editorialized. Product guarantee held.
- Mid-generation progress detail seen: "Currently answering from the Gospels" — more honest and
  specific than a bare spinner, a good example of the plan's B9 bar.
- One of my own automated checks (a naive "no first-person voice" regex) produced a false positive
  on a quoted line of Christina Rossetti's poem ("I think that Thou wilt bid me live") — properly
  attributed verse, not app-voice. Caught before filing; recorded because it's a reminder that even
  a "the app never says I" check needs a human/contextual read, not just a regex (L6 again).

**Latency, for the record:** 5 timed answers ranged ~10s to ~33s (the Athanasius/historical query was
the slowest). "Thinking…" or a more specific progress line was visible throughout every wait — no
silent/frozen-looking gaps observed in this sample.

**Remaining: 140 of 150.** Not run — would need either a longer dedicated session at the same
~20-30s/question pacing (roughly another hour of continuous real time for the rest), or a second
real account to parallelize against, which doesn't exist yet.

## Batch 22 — Daily Office / Plans / Search reachability (parallel agent, signed out)

Full detail: `docs/evidence/ux-remediation-2026-08-24/office-plans-search.md`.

DO-001/002 ✅ `/home` shows real dated content ("Monday, August 24" matches the actual date), no
distinct `/office` route exists (404) — Daily Office is folded entirely into `/home`, nothing in
nav names it separately. Not a bug, just how it's built.
PL-001/002 — `/plans` signed out is a pure gate: "Sign in to build a reading plan," no plan browsing,
no preview of what exists. Matches the ratified plan's L-4 pattern (hard gate vs. an inviting
preview) — worth the same treatment as `/studies` eventually gets.
NV-002/003/004 ✅ logo always returns to `/home` from every surface tested; "Bible" nav is a fixed
default (`/read/jhn/3`), not a remembered position — expected signed out.
**Full nav route list captured**, useful for future coverage: `/library/commentaries`,
`/library/sermons`, `/library/hymns-poetry`, `/library/historians`, `/library/devotionals`,
`/library/theology` — six catalog sub-routes under `/library` never individually tested by this plan.

### F-034 · SR (new) · **P2** · The search input does not submit on Enter/Return at all
Confirmed directly: typing a new query and pressing Return does nothing — only clicking the Search
button submits. A keyboard-oriented user typing "faith" and pressing Enter sees stale results from
the PREVIOUS query still on screen, with no indication their new query was never sent. This is
distinct from a request-ordering race (SR-012) — no request fires at all, so there's nothing to race.
Matches AS-016/MK-019's "Enter submits" bar, which this route fails outright.

### F-035 · SR-003 · **P3** · Phrase queries degrade silently to bag-of-words
"valley of the shadow" is not treated as a phrase — top result highlights only "shadow", a later one
only "valley". No quote affordance, no "exact phrase" indicator anywhere, so a user has no way to
know their phrase wasn't searched as one.

### F-036 · SR-004/L-2 · confirms, more precisely · "John" (book name) returns 1,000+ plain text
matches with no book-jump affordance and no distinct result type — same class as the already-known
L-2 finding, now confirmed for a bare book name too, not just a full reference.

**Low-confidence, not confirmed:** a possible focus-race on first navigation to `/search` where
typed characters were consumed as single-letter hotkeys and silently navigated away — observed once,
not reproduced in isolation, flagged for someone to retest deliberately rather than filed as fact.

## Batch 23 — Keyboard/Perf, Reader-deep (RD/TR/IN/VS/CP), Chaos retry, History-search query batch

Full detail: `docs/evidence/ux-remediation-2026-08-24/keyboard-performance.md`,
`docs/evidence/ux-remediation-2026-08-24/reader-deep.md`, `docs/evidence/ux-remediation-2026-08-24/chaos.md`,
`/tmp/ap-uxsweep/ask-batch/hs-results.md`.

**Keyboard (KB), `/` and `/read/jhn/3`, signed out:**
KB-013/014 ✅ Tab order on `/` matches visual top-to-bottom order for 15 stops, nothing skipped/trapped.
KB-015 ✅ No positive tabindex on `/` or `/read/jhn/3`.

### F-037 · KB-016 · **P2** · Skip-to-content link never moves keyboard focus
Activating "Skip to content" (Enter) updates the URL hash and scrolls the page, but
`document.activeElement` stays on `BODY` — nothing calls `.focus()` on `<main id="main" tabindex="-1">`.
Next Tab press starts back near the top, defeating the skip link's purpose for the keyboard users it
exists for.

### F-038 · KB-011/KB-010 · **P1/P2** · Translation switcher dropdown has no keyboard dismissal
The "KJV" translation switcher on `/read/jhn/3` opens correctly on click, but **Escape does not close
it** (confirmed twice), and it has **no focus trap** — after ~21 Tabs, focus leaves the still-open
dropdown and lands on an unrelated verse control behind it. The dropdown never behaves like a real
popover to keyboard users: no close affordance except click-away or navigating elsewhere. Also missing
`aria-expanded`/`aria-haspopup` on the trigger (AX gap, same root cause).

**Performance (PF), loopback timings only — informational, not a verdict:** `/` and `/read/jhn/3` load
under 100ms DCL, `/search` ~660ms TTFB (likely a real server query). No resource over 500KB. Explicitly
caveated as cache-warm localhost numbers, not representative of real-world load.

**Reader deep-dive (RD/TR/IN/VS/CP) — largely clean:**
RD ✅ translation choice persists across chapter nav, refresh, and Back (one global setting, consistent).
RD-025 ✅ Ps 119 (176 verses) renders fully, no pagination, no jank.
TR-010/011 ✅ 4+ translations (KJV/ASV/BBE/WEB) spot-checked at Jn 3:16 and Ps 23:1 — genuinely distinct
text, correct conventions (ASV "Jehovah" vs KJV "LORD"), no blank/mislabeled/identical output.
IN-001–003, 006–009 ✅ interlinear toggle wired, visually indicated, correct language per testament
(Greek NT / Hebrew OT with correct RTL), correct word-tap → WordPanel with full Strong's data, no tofu/
replacement-character glyphs.
VS-001–019 ✅ verse panel opens correctly, three genuinely distinct tabs, accurate commentary count
badge (17, hand-counted and confirmed), full attribution incl. tradition tag, word-study → lexicon page
navigation clean, Notes tab signed-out correctly shows a sign-in invitation with **no dead textarea
rendered**, Escape closes the panel.

### F-039 · CP-03 · **P2/P3** · Matt 17:21 (BBE) renders raw `21[]` instead of a clean omission marker
BBE (following the critical text) correctly omits the verse, but the app surfaces the source's raw
bracket-omission marker literally as `21[]` in the reader — reads as a rendering bug to a newcomer, not
a textual-critical footnote. KJV renders the verse normally for comparison (expected — KJV includes it).

### F-040 · CP-04 · **P3** · Ps 3 KJV superscription missing
"A Psalm of David, when he fled from Absalom his son" is absent from this app's Ps 3 entirely
(confirmed: neither "Absalom" nor "Psalm of David" appears) — likely a source-text gap, not a UI bug,
but a real content loss for a psalm where the superscription carries real context.

**Filed as consistency questions, not bugs (P3):** interlinear toggle does not persist across chapter
nav/refresh, unlike translation choice (IN-004/005) — always resets, so it's internally consistent, but
undocumented and behaves differently from the sibling translation control. Psalms render as continuous
prose with no poetic line-breaks in any translation (CP-05) — may be a deliberate scope decision.

**Chaos retry (CH-021/022, CH-008/013/014):** CH-021/022 ✅ PASS — 500-char input accepted, a real
React-visible `<script>` injection did not execute and was not present as live markup (safe handling,
not vulnerable). CH-008/013/014 **NOT MEANINGFULLY TESTED** — `/search` submits via full-page navigation
(SSR), not client `fetch()`, so a `window.fetch` monkey-patch can't inject a failure/delay on this route;
would need network-layer interception (CDP) or a different in-page async flow to actually exercise.
Correctly reported as untested rather than a fabricated pass — matches lens L6.

### F-041 · HS (new, history-search query batch) · **P3** · Diet-of-Worms query surfaces the wrong historical figure
Real production, signed-in, 4 of 120 history-search queries run (paced): "the fall of Jerusalem AD 70"
✅ (Josephus, correctly entity-matched), "martin luther and the reformation" ✅ (Van Braght, Martyrs
Mirror), "the council of chalcedon" ✅ (Van Braght, correctly matched). **"the diet of worms and the
papal bull"** surfaced **Burchard of Worms** (an 11th-century bishop) rather than anything about
Luther's 1521 Diet of Worms — the entity-match on the literal word "Worms" is correct, but the matched
event is nine centuries off. Attribution itself is fine (dated, sourced, Van Braght); this is a
relevance/entity-disambiguation gap, not an attribution or product-guarantee violation. **Remaining:
116 of 120 not run** — same real-account pacing constraint as the AS-044 Ask batch (Batch 21).

## HONEST STATUS (updated)

Findings filed to date: **F-001 through F-041** (41 named findings across severities P0–P3).
Sections with substantive coverage: journeys (J-A–E), MK/AU/HM/RD/TR/IN/VS/CM/HL/NT/WS (partial
AS-044 slice)/SR/HS (partial slice)/LB(partial)/DK(partial)/DO/PL/PR reachability/NV/mobile (MOB)/
keyboard (KB)/performance (PF, informational)/accessibility (AX, partial)/chaos (CH, partial, two
checks correctly reported untestable-as-specified). Generators (66-book sweep, ~123-work sweep, 150 Ask
queries, 120 history queries, 27 chaos write-paths) are each partially sampled, not exhaustively run —
each partial run is logged with its exact remaining count rather than rounded up or implied complete.
Literal 950/950 is not reachable within a single real production account's practical rate/pacing
limits and without Safari/Firefox/physical-device access for the HUMAN/DEVICE-tagged tests (never
self-marked, per CLAUDE.md UX remediation rules). This batch represents the practical stopping point
for this pass: every reachable signed-out surface has had at least one agent pass, every core signed-in
journey has been walked, and the two open generators (Ask, History-search) have representative, honest,
clearly-labeled partial samples rather than silent truncation.

## Batch 24 — SE (Study editor), tracker-driven pass, signed-out slice

Full detail: `/tmp/ap-uxsweep/agent-results/tracker_SE.txt` (mirrored into `UX_TRACKER.csv`).

### F-042 · SE-002 · **P2/B6** · `/study/[id]` and `/studies/[id]` are two unrelated, similarly-named routes
`/study/[id]` (singular) renders a static "Study spaces… coming soon" stub for ANY id including
invalid ones — dead UI, CTA to `/ask`. `/studies` (plural) is the real, fully-built study editor.
The near-identical naming next to a real, shipped feature reads as broken/half-built to a newcomer
who lands on the wrong one. Recommend renaming or removing the coming-soon stub, not merging code.

### F-043 · SE-003 · **P2** · `/studies` signed out is a hard redirect, not an invitation
307 to `/auth/sign-in` with zero context — generic sign-in form, no "sign in to build a study" copy.
Confirmed via `curl -D -` and a fresh browser tab, desktop and 390px. Same pattern as PL-001 (`/plans`
signed out), which correctly shows inviting copy instead of a bare redirect — `/studies` should match
that pattern rather than differ from it (B6/B7 consistency).

Remaining 26 of 32 SE IDs: PENDING-SIGNIN, as expected — none of the editor's core behavior is
observable without the one real production account.

## Batch 25 — PL (Reading Plans) and PW (pairwise cross-cutting), tracker-driven, signed-out slice

### F-044 · PL-021 · **P3** · Invalid `/plans/[id]` silently falls back instead of 404, and its `<title>` is doubled
Visiting `/plans/nonexistent-id-12345` doesn't 404 — it silently renders the same generic gate content
as a valid route. Independent of auth state, the page's `<title>` is malformed:
`"Reading plan · Ancient Paths · Ancient Paths"` (site name doubled), vs. the correct
`"Reading plans · Ancient Paths"` on `/plans` itself.

PL-017 PARTIAL: the signed-out gate confirms but doesn't really "teach" — no preview of what a plan
looks like, just a bare sign-in prompt (same pattern noted for `/studies`, F-043 above). PL-019 PASS
at 390px. Remaining 18 of 22: PENDING-SIGNIN, as expected.

PW (pairwise cross-cutting): 18 of 20 PENDING-SIGNIN (all exercise account-bound state — highlights,
notes, Desk panes, plans, Ask threads). PW-013/014 (text size, theme) PARTIAL PASS — device-level
Settings apply instantly across pages/reloads with no signed-in dependency, no FOUC.

**Unconfirmed side observation, not filed as a finding:** one agent reported `/read/jhn/1` direct nav
intermittently rendering "John 3" instead of chapter 1 in this local build — flagged for a follow-up
look, not independently reproduced, so kept out of the findings list per the plan's repro requirement.

## Batch 26 — CO (Consistency/vocabulary), tracker-driven, code+curl pass (5 findings)

Full detail: `/tmp/ap-uxsweep/agent-results/tracker_CO.txt`. Method: the shared browser session was
contaminated by other concurrent agents (confirmed via `location.href` mismatches), so this pass used
direct `curl -b gc.txt` fetches of server-rendered HTML plus source grep for the actual formatting call
sites, rather than unreliable renders. Tally: 4 PASS, 9 PARTIAL, 5 FAIL.

### F-045 · CO-002/CO-006 · **P2/B6** · The one `/ask` feature has four different names depending on chrome
"Ask" (mobile nav), "Ancient Paths" (desktop sidebar), "Explore the paths" (page h1), "Voices" (mode
tab) — and its own submit verb flips "Ask"→"Study" between modes (`ask-client.tsx:556` vs
`history-ask.tsx:105-107`). Register-drift too: the verse-study tab says "Commentaries" while `/ask`'s
filter for the identical register says "Commentary".

### F-046 · CO-003/CO-008 · **P2/B6** · "Your stuff" has three route names, one verb, one internal state name — and the same icon marks four different destinations
Saved / My books / My Works (`lib/library-nav.ts:30-32`) name the same concept three ways, plus verb
"Bookmark" (`selection-popover.tsx`) and internal state name "shelf" (`work-header.tsx`). Compounding
it: `BookStackIcon` renders for four different destinations (All items, Saved, My Works, All studies —
`sidebar.tsx:370,408,432,743`) with no visual way to tell them apart.

### F-047 · CO-004 · **P2/B6** · The same history feature has four names, the fourth on its own comparison surface
"Research history" (sidebar heading), "research thread" (delete aria-label), "Research thread" (page
title), and "Study history" (`history-ask.tsx:113` sr-only h1) — the fourth synonym appears on the
exact surface most likely to be compared against the other three.

### F-048 · CO-011/CO-012 · **P3** · Date-formatting drift: one surface uses short month, two files skip the shared locale constant entirely
`ask-client.tsx:613` formats "Asked 24 Aug 2026" (short month) while `studies`/`search-groups`/
`my-works`/`prayer-journal` all use "24 August 2026" (long month) via the same `DISPLAY_LOCALE`
options. Separately, `app/library/word-study/page.tsx:137` and `work-toc.tsx:148/156/242/244` call
bare `.toLocaleString()` with no locale arg — exactly the reader-runtime-drift anti-pattern
`lib/locale.ts`'s own header comment warns against.

### F-049 · CO-018 · **P3** · A non-destructive "Retry" button is styled in destructive red
`app/read/[book]/[chapter]/page.tsx:654` styles a "Retry" button (after a failed write) in solid
`bg-red-700` — the same color used everywhere else exclusively for delete/destructive actions,
diluting red's meaning as "this is destructive" (CO-010's two real delete buttons both use it
correctly, `text-red-700 dark:text-red-400` + two-step confirm).

**Filed as PARTIAL, not findings (deliberate/low-severity):** CO-005 ("items" vs "Works"/"books") is
intentional per-shelf hierarchy, not drift — no action. CO-007: sidebar collapse button lacks
`aria-pressed`/`aria-expanded` that the equivalent mobile hamburger correctly has (minor a11y gap,
folded into the AX section rather than double-filed here). CO-009: no shared Button/variant system
exists — primary/secondary classes agree today by hand-copying, nothing enforces it going forward
(tech-debt observation, not a user-visible bug). CO-014: `/desk`'s empty state teaches with two CTAs,
`/search`'s zero-results just repeats "0 matches" six times with no next-action link — filed as a
polish gap, not severe enough for its own F-number. CO-015/CO-017: marketing homepage intentionally
uses a different visual register (shadows, rounded-full, arbitrary text sizes) than the in-app product
— confirmed as a deliberate, consistent split, not random drift.

**Also merged this batch:** 14 test IDs (CO-003, CO-005, EM-003/004/006/007/009/010/012/013/015/016,
MOB-003/005) that the original tracker extraction script missed because they were packed two-per-line
in `UX_TEST_PLAN.md` — now added, bringing the tracker to its true total of 918/918 IDs.

## Batch 27 — ST (Settings), ER (Error states), UP (Uploads), LD (Loading states), tracker-driven

Full detail: `/tmp/ap-uxsweep/agent-results/tracker_{ST,ER,UP,LD}.txt`. Note: all four agents reported
the shared local-prod browser pool being heavily contended by other concurrent agents in this same
sweep, causing tabs to get hijacked mid-check — each worked around it via source-corroboration or
re-verification rather than guessing, and flagged PARTIAL where a clean isolated read wasn't possible.

### F-050 · ST-009/010 · **P2, suspect, needs clean re-test** · Text-size/column-width settings may not actually change the reader
Clicking "Larger text" / "Wider column" writes new localStorage keys (`reader-size: 1.25rem`,
`reader-measure: 96ch`), but one read of `/read/jhn/3` afterward showed a static Tailwind `max-w-3xl`
class unrelated to the stored value — suggesting the setting may be written but not consumed. Flagged
by the agent as suspect, not confirmed, due to browser contention; needs a clean isolated re-test
before treating as certain.

### F-051 · ER-013 · **P2** · No rate-limit on repeated wrong gate-password attempts
8 rapid wrong-password submissions to `/api/gate` all returned the same "That wasn't it. Try again."
with no lockout/backoff/CAPTCHA (small sample, n=8, but zero throttling observed at all).

### F-052 · ER-021 · **P2/AX** · Errors are not announced to assistive tech
`document.querySelectorAll('[role="alert"],[aria-live]')` returns zero matches on both the 404 page
and the client error boundary — a screen-reader user gets no announcement that an error occurred.

### F-053 · ER-020 · **P3** · Two different error UIs for what looks like the same underlying search failure
A malformed query (`/search?q=%00%00`) sometimes produces a full error-boundary screen ("Something
went wrong… Try again" + "Go home" + error reference) and sometimes an inline "This search failed"
banner per catalog — inconsistent for what appears to be the same failure class.

### F-054 · UP-017 · **P2** · No proactive "approaching quota" warning for uploads
The only quota feedback is a reactive 403 once already over the 200-document/100MB limit
(`web/src/lib/user-corpus/quota.ts`) — no warning as a user approaches the limit. The over-limit
message itself is well-written (names the limit and remedy), just not proactive.

### F-055 · LD-017/018 · **P2** · Three incompatible loading idioms coexist, and the pending-link affordance only covers one component
`useLinkStatus`'s pending-state affordance exists on one component only, not on sidebar nav links
(matches a caveat already in the test plan itself). Separately: one real skeleton component, one
progress bar reused in two unrelated places, and roughly 13 bare "Loading…" text instances — per the
code's own comment acknowledging the inconsistency.

**Notable PASSes worth recording:** ER-007 (XSS payload in search round-trips as literal text, not
executed), forced error copy across bad book/verse/chapter/work routes reads as human and on-brand
with a working path forward (no raw vendor errors surfaced), LD-007 (Ask shows real staged progress +
a measurement-derived 90s slow-notice, not a bare spinner), LD-022 (optimistic writes have visible
rollback on failure), UP-001/002 (`/library/uploads` signed out correctly shows an inviting sign-in
prompt, no dropzone before auth).

**Not filed as confirmed findings — flagged for a clean re-test:** possible upload-page loading stall
(1-3s on the outer Suspense fallback, 3 occurrences) that a code comment describes as previously fixed;
could not isolate real regression vs. concurrent-session noise.

## Batch 28 — DO (Daily Office) and HM (Home), tracker-driven, signed-out

### F-056 · DO-004 · **P2** · Daily Office reading link ignores its own verse anchor
The office's "Read Exodus 22:6 in full" link points to `/read/exo/22#v6`, but the reader ignores the
anchor entirely — loads at chapter top (verse 1 in view, `scrollY=0`), no scroll or highlight applied
to verse 6. A reader following the office's own cross-reference lands in the wrong place with no
indication anything went wrong.

### F-057 · HM-024 · **P3/AX** · Home page content isn't landmark-labeled for screen readers
DOM only exposes generic `nav/main/article/header/section` with one labeled nav ("Primary") — the
devotional and commentary blocks aren't separately named regions, so a screen-reader user gets no
structural way to jump between them.

**Also confirmed:** signed-out `/home` correctly omits account-gated content (Continue-reading rail,
Plan card) rather than showing broken/empty versions of them (HM-005/006/011); the page degrades
gracefully when background API calls 401/429/503 under load (HM-014); refresh is stable (HM-016).
DO-001/002/003/006/010/011/013 all PASS. HM-017: tab title is generic "Ancient Paths" rather than
home-specific — noted, not filed as its own finding (cosmetic, low severity).

Both agents independently reported heavy browser-pool contention from other concurrent sweep agents
degrading viewport/keyboard/network-throttle checks to PARTIAL rather than confirmed — flagged for
re-run in isolation, not guessed at.

## Batch 29 — WS (Word Study) and AX (Accessibility), tracker-driven, signed-out

WS tally: 21 PASS, 4 PARTIAL, 1 FAIL — the whole feature is usable signed-out, no PENDING-SIGNIN needed.

### F-058 · WS-004 · **P2** · Back from a word-study page doesn't restore reader state
Opening a word study from the reader's interlinear tap, then pressing Back, does not restore scroll
position or the interlinear toggle — lands at chapter top, interlinear off, onboarding tip re-shown.
Consistent with the already-known interlinear-doesn't-persist pattern (IN-004/005) but now confirmed
to also break Back-navigation specifically, not just refresh/chapter-nav.

### F-059 · WS-023 · **P2/B10** · Attribution is inconsistent across lexicon entries
H430 shows a live, properly attributed BDB excerpt; several Greek entries (G25, G65, G932) show only
a "coming to this page" placeholder instead of actual attributed content — same feature, inconsistent
completeness.

**Minor, folded in rather than separately filed:** WS-022 copy nit ("**hebrewlexicon** isn't available"
missing a space, should read "Hebrew lexicon"); WS-008/009 no distinct morphology field or in-entry
multiple-senses navigation; WS-020 empty search offers no recovery hint.

AX tally: 7 PASS, 2 FAIL, 2 PENDING-SIGNIN, 11 PARTIAL (limited by no axe-core/real screen-reader/200%-
zoom tooling in this pass — flagged, not guessed).

### F-060 · AX-009 · **P3** · Homepage footer skips a heading level
H2 → H4 with no H3 in the footer's heading structure.

### F-061 · AX-019 · **P2** · The under-44px tap-target problem (already known from mobile.md, F-031) is broader than first measured
22-27 sidebar/nav touch targets are under 44px height across multiple pages, not just the marketing
footer already filed — plus a 24×24 icon-only sidebar-collapse button. Same systemic issue, wider
surface area than previously scoped.

**Flagged for follow-up, not filed as confirmed:** `stone-400` text computes to ~2.2:1 contrast against
the light parchment background — a likely WCAG AA failure if used for muted/placeholder text in light
mode; needs a direct contrast-ratio confirmation pass, not just a computed-color spot-check.

**Notable PASSes:** alt text, icon-button accessible names, correct `lang` attributes including
`lang="el"` on Greek interlinear text, accent-gold contrast, focus-visible outline ≥3:1 in both themes,
`prefers-reduced-motion` honored globally including the history progress-bar specifically.

## Batch 30 — DK (Desk), tracker-driven, signed-out

Ties directly into F-011 (P0, the desk's core "read side by side" journey has no discoverable
add-commentary control). This batch adds two more structural findings on the same feature:

### F-062 · DK-004/005 · **P2** · Added panes never anchor to the scripture pane's current passage
Adding a commentary/sermon/historian pane always opens that work at its own beginning, never at the
scripture pane's current chapter/verse — confirmed as documented behavior
(`docs/ASK_HISTORY_DESIGN.md`: "no ordinal, starts at the top"), but it undercuts the desk's own
"read Scripture and commentary together" premise: a reader has to manually navigate the new pane to
line it up.

### F-063 · DK-006/007 · **P3** · No single-action "swap" — closing and re-adding is a full round trip
Swapping one pane for another means close pane → navigate to library → add new pane, across a full
page load each time, rather than one swap control.

**Solid PASSes:** pane enumeration/controls, empty-desk onboarding, correct chapter loading, 3-pane
layout, pane-cap refusal at 16 with a clear message, per-pane scroll containers, 390px/tablet
responsive behavior, error isolation when a pane references a nonexistent work slug, predictable
keyboard focus order, labelled ARIA regions per pane, deep-link reproducibility.

**Not filed as new (already tracked):** DK-014 no drag-resize/reorder — consistent with
`docs/pm/MASTER.md`'s note that this is a deferred UX-3 stretch item, not a regression.

Environment caveat carried from the agent: shared browser-tab contention made several timing-sensitive
multi-step checks (rapid pane switching, full keyboard add/close sequences, live highlight sync)
unreliable to attribute cleanly — marked NOT VERIFIED rather than guessed at, left for a re-run in
isolation.

## Batch 31 — LB (Library catalog), tracker-driven, signed-out

### F-064 · LB-021 · **P1** · No publication year shown anywhere on catalog cards or the work header
Only author/tradition/type or author/tradition/period/license are shown — never a publication year.
The test plan itself flags this as P1-severity if truly unattributed: knowing *when* a commentary was
written is core to using it responsibly (a 1710 Puritan reading vs. a 1990s critical one).

### F-065 · LB-004 · **P2** · No sort control anywhere in the Commentaries/Sermons catalog
A reader can filter/search but cannot sort a catalog by any axis (date, author, alphabetical).

### F-066 · LB-035 · **P3** · Library loading state is bare text, not a skeleton
"Loading the library" as a plain text string rather than a skeleton in final layout — same class of
issue as F-055 (LD-018's three incompatible loading idioms).

**Confirmed PASS:** catalog listing/facets/search UI, a full historian work reading view (Josephus,
correct margin ordinals), 390px mobile layout with no overflow, `/library/books` vs `/library/passages`
correctly read as distinct features, invalid catalog → clean human 404, invalid work slug → a
non-leaking "not available" message.

**Coverage gap, stated honestly:** roughly half of LB (LB-005, LB-008–012, LB-014, LB-016, LB-022–029,
LB-037) is genuinely PARTIAL/untested — the agent's browser session was heavily contended by other
concurrent sweep agents and several checks got clobbered mid-flight rather than completed. This is the
largest remaining real gap in this pass; worth a dedicated re-run in an isolated browser session before
calling LB done. LB-038 (the ~123-work sweep generator) has one sample (Josephus, PASS) out of ~123 —
not expanded this pass.

## Batch 32 — HL (Highlights), tracker-driven, signed-out

### F-067 · HL-024 · **P2/AX** · The highlight gesture is completely unreachable by keyboard
Tappable word spans (`[data-tap-word]`) have no `tabindex`/role — the two-tap highlight gesture can
only be driven by pointer, no keyboard path exists at all.

### F-068 · HL-015 · **P2** · Enabling the interlinear view silently removes highlighting, with no message
Turning on the Greek/Hebrew interlinear removes all `data-tap-word` spans while the Highlight toggle
still visually shows "on" — a reader who enables both features gets no indication that highlighting
just stopped working.

**Confirmed PASS:** highlight toggle has working `aria-pressed` + visible amber state; mobile gesture
uses `user-select:none` correctly, doesn't fight text selection, works at 375px.

**Flagged, not filed:** the "Sign in to highlight" popup renders in a fixed position near the bottom-
left/sidebar rather than anchored to the selected text — worth a follow-up visual check, not scored
as a finding this pass. 18 of 26 items PENDING-SIGNIN as expected (persisted-highlight behavior needs
the one real account).

## Batch 33 — MK (Marketing), tracker-driven, signed-out (24/32 PASS)

### F-069 · MK-009 · **P1, beta blocker per the plan's own severity rule** · No privacy policy or terms of service exist anywhere
`/privacy`, `/terms`, `/privacy-policy`, `/terms-of-service` all 404 — unlinked anywhere in the app.
The plan itself calls this out: "Absent today = P1, beta blocker." This should be treated as a launch
gate item, not routine polish.

### F-070 · MK-018 · **P2, L4 lens** · Waitlist form defaults to GET with JS disabled
No explicit `method`/`action` on the waitlist `<form>` — defaults to `GET action="/"`. With JS
disabled, a submitted email would leak into the URL, browser history, and server access logs. The
JS-enabled path (fetch POST) is correct; only the no-JS fallback is wrong.

### F-071 · MK-006 · **P3** · `/about` has no header nav, and its one "Log in" link is inconsistent
`/about` drops the header nav/logo present on every other marketing page, and its inline "Log in"
link points to `/home` while every other "Log in" on the site points to `/auth/sign-in`.

### F-072 · MK-021 · **P2/B1** · "Request access" gives zero feedback during a slow request
No disabled state, no spinner — a slow network leaves the button looking dead and invites a
double-submit.

**24 of 32 PASS cleanly**, including: footer-presence regression fix confirmed on all four marketing
pages, waitlist validation/dedup/double-submit-guard/unicode handling, responsive layout at 390px,
browser zoom 80-150%, scroll-position-on-refresh, utm-param handling, manifest sanity, reduced-motion
CSS. Several PARTIALs are genuinely PENDING on external resources this pass didn't have (a real inbox
for the confirmation email, real device for add-to-home-screen) rather than app defects.

## Batch 34 — CM (Commentary tab), tracker-driven, signed-out

### F-073 · CM-011 · **P2** · "Read more" on a truncated commentary entry navigates away instead of expanding
Clicking "Read more" on a truncated entry doesn't expand it or scroll to the full entry — it
navigates away to the generic `/library/commentaries` catalog page, unrelated to what was being read.

### F-074 · CM-020 · **P3** · Inconsistent loading-state treatment, same class as F-055/F-066
Desk's commentary pane shows a bare "Loading…" string while other pages (My Works) use skeleton
placeholder blocks — another instance of the same three-incompatible-loading-idioms pattern already
filed.

**Confirmed PASS:** multiple commentary entry points (verse-tap panel, `/library/commentaries`,
Passage search, Desk pane) all correctly reachable; attribution (author/year/tradition pill/work
title) correct; era labelling ("MODERN") correct; Greek/Hebrew rendering clean in both interlinear
and Adam Clarke's Hebrew excerpt, no mojibake; mobile layout (375-390px) reflows cleanly.

**Worth a second look, not confirmed as a bug:** John 3:8's commentary panel showed the identical
first excerpt as John 3:4 (same Matthew Henry text) while the verse header and entry counts (11 vs 16)
updated correctly — most likely a legitimate range-anchored commentary entry, not content bleed, but
not independently confirmed against source data.

**Coverage gap:** browser-automation tooling was notably unstable for this agent (tabs multiplying,
losing session state, pane going "not displayed") — CM-006/007/009/010/012/013/016/017/021 and full
confirmation of CM-019/022 are genuinely NOT VERIFIED, not silently marked pass. Flagged for a
dedicated re-run.

## Batch 35 — AU (Auth forms), tracker-driven, signed-out (6 findings, one significant)

### F-075 · AU-027 · **P1** · "Sign in with Google" gets stuck in permanent loading state, never redirects
Clicking the Google OAuth button never redirects and never resolves — leaves the user stuck. This is
a complete dead end on one of the two advertised sign-in methods.

### F-076 · AU-038 · **P1** · Deep authenticated routes don't redirect to sign-in when signed out, and lose the return path
Navigating directly to a deep authenticated route (e.g. `/prayers`) while signed out doesn't redirect
to sign-in at all in some cases; where a sign-in link does appear, it carries no `next=`/return-path
param, so a user who does sign in lands back at a generic page, not where they were trying to go.

### F-077 · AU-041 · **P2** · No visible/effective rate-limiting on the site gate
5 rapid wrong-password attempts against the site gate produced no lockout/backoff — same class as the
already-filed F-051 (`/api/gate`, 8 attempts, zero throttling), now confirmed at the gate itself too.

### F-078 · AU-013 · **P2** · Blank Name on sign-up fails silently/ambiguously
No default name applied, no error message shown — the user has no idea why nothing happened.

### F-079 · AU-036 · **P3** · Sign-in error message doesn't clear when the user retypes the password
A stale "wrong password" message persists on screen after the user starts correcting their input,
reading as if the new attempt already failed.

### F-080 · AU-010 · **P3** · No password visibility toggle anywhere in the auth flow
Standard "show password" eye-icon affordance is absent from sign-up/sign-in/reset forms.

**Also flagged, not filed as a numbered finding (intermittent, not reliably reproduced):** navigating
to `/auth/sign-up` immediately after completing a signup (account pending email verification)
triggered a full server-render crash once ("Something went wrong", 503s on `/auth/sign-in?_rsc=...`
around the same time) but did not reproduce on a second attempt — worth a follow-up look by someone
who can isolate it from concurrent-session noise.

**Solid PASSes:** hydration confirmed wired (the F-0xx hydration bug fixed earlier this session stays
fixed), `method="post"` on all auth forms, password-rule enforcement, Enter-to-submit, double-submit
guards, sign-in/unverified-account messaging, forgot-password oracle-safety (no existence leak),
malformed reset-token handling, gate correct/wrong-password behavior and `next=` param handling on
the gate itself, error-message tone.

Remaining ~15 of 52 IDs PENDING-SIGNIN/PARTIAL — need either a verified signed-in session (constraint:
the one real account) or a real inbox for throwaway test addresses, neither available this pass.

## Batch 36 — CH (Chaos/edge-case), tracker-driven, signed-out

### F-081 · CH-008 · **P2** · Unguarded localStorage access crashes the entire reader, not just the affected feature
`web/src/lib/reading-prefs.ts` (lines ~66, 81, 90, 96) reads/writes `localStorage` with no try/catch,
unlike the guarded inline script in `app/layout.tsx:138`. When `localStorage` throws (private-browsing
mode, storage quota, browser extension interference), the exception is uncaught and the whole reader
falls into the generic error boundary — the reading surface becomes fully unusable rather than
degrading gracefully (e.g. just skipping the saved preference).

**Confirmed PASS:** rapid navigation across 6 pages stayed coherent; no PostHog requests observed at
all (corroborates the already-filed CSP-blackout finding — the app itself is unaffected by it); clean
empty-state search; 20x back/forward spam settled coherently with no corruption; SQL-ish query strings
treated as literal text, not executed; XSS/long-string injection on the search field independently
re-confirmed safe (matches earlier CH-021/022 PASS).

**Coverage limits, stated honestly:** several IDs are genuinely NOT-MEANINGFULLY-TESTABLE with the
tooling available this pass — no third-party-cookie-blocking simulation, no distinct CDN host to
throttle in this local build (same-origin asset serving), no clock-skew or deploy-trigger capability,
2-hour idle-session impractical to simulate. 6 of 24 PENDING-SIGNIN as expected.

## Batch 37 — KB (Keyboard, second pass) and PF (Performance, second pass), tracker-driven

### F-082 · KB-017/018 · **P1/AX** · The verse-number control has NO keyboard path at all — a core reading interaction
The verse `<sup role="button">` control (used to open the commentary/word-study/notes panel for any
verse) does not respond to Enter or Space, only mouse click. This is the primary way a reader opens
per-verse content, and a keyboard-only user cannot activate it at all — not a degraded experience,
a completely absent one for this app's central interaction.

### F-083 · KB-020 · **P2/AX** · Sticky reader header hides keyboard-focused verses near the top
The 65px sticky header has no `scroll-margin-top` compensation (confirmed `0px` via computed style),
so tabbing/scrolling to a verse near the top of a chapter can land it underneath the fixed header,
invisible to the user even though it's focused.

### F-084 · KB-012 · confirms/extends F-038 · **P1/P2** · Same non-modal-popover-has-no-keyboard-dismissal pattern
Re-confirms the translation dropdown's missing Escape/focus-trap already filed as F-038 — same root
cause, cited rather than re-filed as a new finding.

### F-085 · PF-013 · **P3** · Homepage hero background image has no responsive sizing
The ~826KB decoded hero image is served identically at 375px mobile and desktop widths — no
responsive `srcset`/sizing, meaning mobile visitors download a desktop-sized image unnecessarily.

**Confirmed PASS:** verse panel (Commentaries/Word study/Notes tabs) opens, switches tabs, and
Escape-closes with focus correctly returning to the trigger; Desk pane add/remove works signed out;
the one real modal (book-picker, `role="dialog" aria-modal="true"`) correctly traps focus and Escape
closes it with focus return; fonts are self-hosted via `next/font` with `font-display: swap` on all
44 `@font-face` rules (no FOIT).

**New, not yet filed as a numbered finding:** undocumented keyboard shortcuts exist (Cmd/Ctrl+K
omnibox, Cmd+\ sidebar toggle) but are never surfaced in the UI — a discoverability gap, not a
functional bug, noted for a future polish pass.

**Coverage limit:** several PF items (PF-001-005, 008, 009, 014) genuinely need tooling this pass
didn't have (Lighthouse, real network throttling, frame timing, extended memory profiling) — marked
PARTIAL/NOT-RUN honestly rather than fabricated.

## Batch 38 — SR (Search, second pass) and NV (Navigation), tracker-driven

### F-086 · SR-004/005 · **P2** · Verse-reference queries in `/search` are not recognized as references at all
Typing "John 3:16" or "1cor 13" into search does not jump to the passage — it's pure bag-of-words
text search over commentaries/sermons, with no verse-reference recognition or jump affordance. A
reader typing a reference into the one search box on the site (rather than using the separate
passage-jump control elsewhere) gets generic text matches instead of the verse they were looking for.

### F-087 · SR-014/011 · **P2** · No filters/facets and no stated translation on search results
`/search` has no way to narrow by register/date/tradition, and results never state which translation
the matched text is drawn from.

### F-088 · SR-007 · **P3** · Clicking a search result lands at the top of the document, not the matched passage
Back correctly restores the prior query/results, but the forward navigation into a result doesn't
scroll to the actual match — same class of gap as CM-011 (F-073, "Read more" not scrolling to content).

**Confirmed PASS:** result grouping, labelling, attribution, in-result highlighting, thousands-result
capping, URL-shareability, unicode/Greek input, and long queries all work correctly. SR-012/020/027 all
trace back to the already-filed F-034 (Enter doesn't reliably submit) — referenced, not re-filed.

**NV — confirmed PASS:** 404 handling is solid, human, branded, with ways home; client-side title
updates correctly on navigation. **NV-016 PARTIAL:** `/home` and `/desk` never get a distinct tab
title beyond generic "Ancient Paths" (same class as the earlier HM-017 note). **NOT-APPLICABLE (by
design, not a gap):** no omnibox and no breadcrumbs exist anywhere in this app — several NV/SR IDs
that assume those features don't apply here.

**Coverage limit:** the available browser-resize tool didn't actually shrink the rendered viewport in
this session, so mobile-nav-specific checks (NV-022/023, SR-023) are PARTIAL/untested, not guessed.
Several Back/forward/scroll/focus items were not exercised this pass for time and are marked PARTIAL
honestly rather than assumed passing.

## Batch 39 — RD (Reader, full 74), TR (Translations, full 24), IN (Interlinear, full 20), VS (Verse study, full 30), tracker-driven

Full detail: `/tmp/ap-uxsweep/agent-results/tracker_RD_TR_IN_VS.txt`. Closes out the largest remaining
tracker gap (148 IDs) — cross-referenced against the earlier reader-deep.md pass (Batch 23) to avoid
duplicating CP-03/CP-04/IN-004/005, then live-tested everything not already answered.

### F-089 · RD-039 · **P2** · `#v16:study` deep link doesn't open the study panel, contradicting the app's own code comment
Neither fresh navigation to a `#vNN:study`-suffixed URL nor a hash mutation after page load opens the
verse-study panel — a code comment in `web/src/app/read/[book]/[chapter]/page.tsx` describes this as
implemented, but it doesn't fire. A shared "look at verse 16's commentary" link silently fails.

### F-090 · VS-030 · **P1** · Verse-study panel is completely unreachable while interlinear mode is on
With interlinear ON, every verse-number "read commentary" handle disappears from the DOM entirely —
not just from view. A reader using the interlinear view (Greek/Hebrew word-by-word) loses access to
commentary/notes/word-study for the whole chapter until they turn interlinear back off, with no
indication why the handles vanished. Compounds the already-filed HL-015 (interlinear also kills
highlighting) — interlinear mode silently disables two separate core features at once.

### F-091 · RD-017 · **P2/AX** · Space doesn't activate the verse-study control, only Enter does
The verse-number handle isn't a native `<button>`, so it gets no automatic Space-key mapping —
Enter opens the panel, Space does nothing. Half of the expected keyboard-activation pair is missing.

### F-092 · RD-018 · **P2/AX** · Verse-number handles have zero visible focus indicator
No outline, box-shadow, or background change when a verse-number control receives keyboard focus —
a keyboard user tabbing through a chapter cannot see where they are.

### F-093 · RD-057 · **P3** · Shortest-verse tap target is far under the 44px minimum
John 11:35 ("Jesus wept") measures ~11×16px as a tap target — for contrast, the header's own toggle
buttons correctly carry a `min-h/min-w:44px` class, showing the app knows the standard elsewhere.

### F-094 · RD-026 · **P3** · Psalm 119's Hebrew-letter acrostic headings (ALEPH, BETH...) are entirely absent
Same class of content gap as the already-filed Ps 3 superscription (F-040) — likely a shared
source-text gap, not a UI bug.

### F-095 · TR-009/014/017 · **P2/P3** · Translation choice isn't shareable via URL, Escape doesn't close the switcher, and no per-translation attribution exists
Translation isn't encoded in the URL, so a shared link doesn't reproduce what the sender was reading
(TR-009). The switcher's Escape key does nothing (TR-014, same root cause as the already-filed F-038
translation-dropdown finding — referenced, not re-filed). Only one blanket "public domain" note covers
all 18 translations — no per-translation attribution/copyright line (TR-017).

### F-096 · RD-072 · **P3** · No print stylesheet anywhere — printing a chapter ships full app chrome
No `@media print` CSS exists in the codebase; printing any reader page would include the sidebar, nav,
and toolbar rather than a clean reading layout.

**Coverage note:** several IDs remain PARTIAL (network-throttle/offline/print-hardware/screen-reader
checks the available tooling couldn't run) or correctly PENDING-SIGNIN (highlight/note persistence,
sign-out/in behavior) — not guessed at.

## Batch 40 — AS (Ask), live signed-in production testing, real account

Direct signed-in testing on `ancientpaths.app`, tab-driven, real questions submitted and graded live.

### F-097 · AS-022 · **P2** · Browser Back to a finished Ask thread shows a blank form instead of the answer
Asked "what does 1 Corinthians 13 say about love" → real, correctly attributed answer (Barnes,
Adam Clarke, etc., B10 confirmed). Clicked the citation link to `/read/1co/13#v1` — correctly landed
on the right verse (AS-021 PASS). Pressed Back (`history.back()`) → URL correctly returned to the
`/ask/[id]` thread, but the page rendered the **empty "Ask about a verse" form**, not the saved
answer — the client-side SPA navigation doesn't restore/refetch the thread. A **hard reload of the
same URL correctly shows the full answer** (confirms AS-033 separately, PASS), so the data isn't
lost — only the client-side Back transition fails to restore it, leaving a confusing empty-looking
page that reads as "your answer is gone" until the user thinks to refresh.

**Confirmed PASS, live on production:** AS-002 (real question → real attributed answer), AS-008
(every source names author + work + tradition), AS-009/010 (empty and whitespace-only submissions
correctly prevented, no request fired), AS-013/014 (emoji, Greek, and a literal `<script>` tag all
echo safely as inert text in the input, no execution), AS-016 (real Enter keydown submits, not just
a synthetic form-request), AS-017/018 (loading state visible immediately, "Currently answering from
the Gospels" — a specific, honest progress signal, not a bare spinner), AS-021 (citation click-through
lands on the exact correct verse), AS-033 (`/ask/[id]` correctly reopens the full answer after a hard
refresh). No first-person app-voice language observed in the answer text — product guarantee held
(AS-007 spot-check, not the full 20-answer scan the plan specifies).

**Also confirmed, not a new finding:** the generic "Bible" nav link (sidebar + bottom bar) points to
a fixed `/read/mrk/16` default — unrelated to the answer being viewed, correctly not conflated with
citation links in this pass (initial grep over-matched it, corrected before filing).

## Batch 41 — SE (Study editor), live signed-in production testing, real account (12 IDs closed, 0 new findings)

Continuing directly on the real production account (`ancientpaths.app`) to close PENDING-SIGNIN gaps
that only I can test sequentially (one identity, no parallel agents). Created a disposable test study,
exercised it thoroughly, then deleted it — leaving the account's real studies untouched except one
edit-then-revert on the existing "Untitled study" (confirmed restored to original content and re-saved).

**All 12 PASS, no new findings** — this is a genuinely well-built feature:
- Auto-save is real and visibly acknowledged (a "● Saved" indicator appears next to Pin/Export within
  ~1s of typing).
- Edits persist across a fresh reload.
- Library search returns real attributed results; inserting one into a study correctly carries a
  `<figcaption>` attribution line ("— Henry, Matthew, Commentary on the Whole Bible Volume V...") —
  initially misread as missing because it fell outside a truncated text-scan range on the first check;
  corrected before filing anything.
- The "Open in work" reference link scrolls correctly to the exact anchored section (confirmed via
  `getBoundingClientRect()`, lands right under the sticky header) — this is the same category of
  anchor-scroll the reader's own `#vNN` deep links get wrong (F-089); the study feature's version
  works correctly, worth noting as a positive contrast, not just an absence of bugs.
- Delete requires an explicit "Delete?" confirmation step before removing a study (B8 compliance),
  and the list correctly updates afterward.
- Studies list is complete, ordered, and dated; the empty-study state teaches the next action instead
  of a bare blank page.

## Batch 42 — HL (Highlights), live signed-in production testing, real account (11 IDs closed, 0 new findings, 1 methodology correction)

Continuing PENDING-SIGNIN closure on the real account. Created and cleanly removed one test highlight
on `/read/jhn/3` ("was a man", John 3:1, yellow) — verified the full lifecycle: two-tap gesture →
color popover → paint → persist across reload → appear in the `/library/notes` overview (20 total
highlights, all pre-existing except this one) → jump back to the reader from the overview link →
"Remove highlight" from the same popover, confirmed gone.

**All PASS, no new findings.** One methodology note worth recording: my first two attempts at the
two-tap gesture used stale screen coordinates (left over from an earlier gesture at a different
scroll position) and silently missed the target word — this produced a false read of "the anchor tap
gives no visual feedback at all," which would have been a P1 finding if filed without verification.
Re-anchored coordinates from a fresh screenshot before re-testing; the anchor tap DOES give visible
feedback, just a subtle dark-on-dark tint that's easy to miss even when working correctly (worth a
polish note for someone doing a visual-contrast pass, but not a functional defect).

Corrected two earlier tracker entries in the same edit: HL-005 ("multiple highlights persist
independently") and HL-006 ("same verse highlighted twice, no duplicate") had been marked PASS from
testing only a single highlight — reverted to NOT RUN rather than let an inaccurate claim stand.

## Batch 43 — NT (Notes), live signed-in production testing, real account (1 finding)

### F-098 · NT-004 · **P2/B8** · Deleting a note has no confirmation step, unlike study delete
Clicking "Delete" on a verse note removes it with a single click and no "Delete?" confirmation —
confirmed persisted-gone after a reload. This is directly inconsistent with the app's own pattern
elsewhere: study delete (tested in Batch 41, SE-026) requires an explicit "Delete?" confirm click
before anything is removed. Same destructive-action class (B8: "every destructive act is confirmed or
undoable, and says which"), two different standards.

**Confirmed PASS:** verse panel Notes tab has a real textarea + Save/Delete; a saved note persists
correctly across a panel close/reopen (via navigating away and back to the same verse); emoji and
Greek unicode round-trip intact; Save is correctly disabled when the textarea is empty, preventing an
accidental empty save (the actual removal path is the separate Delete button, which is the right
design — just missing its confirmation step).

## Batch 44 — PL (Reading Plans), live signed-in production testing, real account (0 new findings)

Tested against a real in-progress plan ("The Gospels in 8 weeks", 2 real accounts of prior real
reading). Confirmed the historic outage this exact feature suffered (`MASTER.md` gate C2/C3:
"Mark as read" was `permission denied for table plan_days`, fixed by migration 106 2026-08-07) stays
fixed live: clicking "Mark as read" instantly advanced progress (1/40 → 2/40), placed a checkmark on
the correct day, advanced "Up next" to the following reading, and updated the days-behind count
(20 → 19) — then toggling it back off correctly reverted all four, leaving no test data behind.

**All PASS, no new findings.** The "N days behind" catch-up banner is a genuine polish highlight worth
recording: "Life happened. Pick up where you left off — the remaining readings move forward with you,
and nothing you read is lost," with two explicit choices (Resume from today / Keep the original
dates) — honest, non-shaming copy that matches the plan's own B2 bar ("nothing lying") better than
most surfaces tested this session.

## Batch 45 — UP (Uploads), live signed-in production testing, real account (7 IDs closed, 0 new findings)

Uploaded a real small `.md` test file via the file input (not a click-through file picker, which the
tooling can't drive — used a direct file-input upload matching a real drag-drop/browse outcome).

**Full lifecycle confirmed live:** dropzone accepted the file → named processing stage "Dividing"
shown → advanced to "Ready" in ~15s → searched "grace upon grace" against "Search your works" →
correctly matched and returned the exact excerpt, proving the document is genuinely indexed and
searchable, not just stored → "Remove" button surfaced a "Remove?" confirmation step (B8-compliant,
same pattern as study delete, unlike the note-delete gap filed as F-098) → confirmed, document gone,
list correctly returned to its "Nothing here yet" empty state, no orphaned data left in the account.

Also observed: Desk integration controls ("Open beside the tradition", "The tradition on this")
present directly on the document row — not tested further this pass (would need a real Desk-pane
verification), but confirms the feature is wired end to end, not a dead affordance.

No new findings — this is a well-built, honestly-staged feature.
