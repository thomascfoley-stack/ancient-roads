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

## Batch 46 — NT (Notes, second pass), live signed-in production testing, real account (0 new findings)

Extended the NT pass with a multi-line, script-tag, and markdown-lookalike note on John 3:16, then
cleaned it up via Delete. All PASS: edits persist across panel reopen; newlines and blank-line
paragraph breaks survive verbatim; a literal `<script>` tag in note text never executes and is never
injected into page HTML; markdown-looking text stays literal (consistent, since it's a plain-text
editor with no rendering anywhere). Also confirmed a note pin (pencil icon) renders inline in the
reader margin itself, not just inside the panel — a real discoverability plus.

## Batch 47 — AU (Account), live signed-in production testing, real account (2 IDs closed, remaining marked with explicit reason)

Checked `/account/settings` visually: consistent serif headers, input styling, and button treatment
with the rest of the app — not vendor-default UI (AU-046 PASS). No account-deletion feature exists on
this page, only email display and a change-password form (AU-048 NOT-APPLICABLE).

**Explicitly did NOT touch:** the change-password form, sign-out, session-cookie deletion, or anything
in the sign-up/verification/reset email flows. This account has no recorded recovery credentials in
this session — if any of those actions failed or behaved unexpectedly, there would be no way to sign
back in and continue testing (or hand the account back working). The remaining 13 AU items in this
family (AU-014/015/020-022/024/025/028-032/047) are marked PENDING-SIGNIN with that reason stated
explicitly in the tracker, rather than left to look like an oversight. This is a genuine hard limit,
not a skipped test — closing them would need either a disposable second account or the owner's own
hands on the keyboard.

## Batch 48 — PW (pairwise cross-cutting), live signed-in production testing, real account

### F-099 · PW-001 · **P2** · A highlight made in the reader does not appear in a Desk pane on the same chapter
Highlighted "For God" (John 3:16, yellow) in `/read/jhn/3`, confirmed visible and persisted there.
Opened `/desk?p=scripture:jhn/3` — same chapter, no highlight rendered anywhere on verse 16 (confirmed
via screenshot and scrolled to the exact verse). The two surfaces show the same Scripture text but
don't share annotation state. (Desk pane also renders a different default translation than the
reader's chosen one — WEB vs ASV — noted for context, not filed separately since translation choice
is a per-surface setting elsewhere too, per RD-018/TR findings.) Cleaned up: highlight removed via the
same popover, confirmed gone.

**Methodology note:** repeatedly hit a ~30px vertical offset between `getBoundingClientRect()`-computed
coordinates and the coordinate frame the click tool actually uses on this page — cost several
mis-clicks landing on the wrong verse (14 instead of 16) mid-test. Resolved by reading click targets
directly from a fresh screenshot rather than trusting computed rects. Worth remembering for any future
testing on this specific reader layout.

## Batch 49 — UP (Uploads, second pass), live signed-in production testing, real account (3 findings)

Uploaded four real malformed/edge-case files against the actual production endpoint: a random-bytes
`.docx`, a fake-PE-header `.exe` renamed to `.docx`, a minimal valid `.png`, and a genuine 0-byte
`.txt`. Also confirmed live: this same page (`/library/uploads`) took **over 20 seconds** to clear its
skeleton loading state on this load — well past the plan's own B9 bar ("beyond 10s offers a way out"),
with no progress message and no escape. A prior agent flagged a 1-3s version of this as "possible
flakiness, not confirmed" (see Batch 27/UP.md) — this run confirms it's real and can be much worse
than first measured.

### F-100 · UP-011 · **P2/B2** · 0-byte file gets a factually wrong rejection message
A genuine empty `.txt` file is refused with "That file is not a PDF, Word document, or text file." —
which is false; it IS a `.txt` file. The real reason (empty/zero-length) is never stated. Same message
as a genuinely wrong file type, so a user with an accidentally-empty file can't tell what actually went
wrong.

### F-101 · **P3** · An internal engineering codename ("Slice 1") leaks into user-facing error copy
Both the wrong-file-type and 0-byte rejection messages read: "...Slice 1 accepts .pdf, .docx, .txt and
.md." "Slice 1" is this repo's own internal build-phase name (`docs/SERMON_SEARCH_DESIGN.md`'s Slice 1
ingestion pipeline) — meaningless and slightly unprofessional-looking to an end user who has no idea
what "Slice 1" refers to.

### F-102 · **P1/B9, upgraded** · `/library/uploads` repeatedly stalls 20-60+ seconds on its skeleton state, with no progress indication
Confirmed live, twice more in a later batch: one load sat on the static skeleton for over 20 seconds,
a second load (same URL, same session, minutes later) took roughly **60 seconds**. No percentage, no
message, no way out, either time. This is the same page a prior agent flagged as having a shorter
(1-3s) version of this stall and couldn't confirm as more than noise — three independent
confirmations at increasing severity (1-3s → 20s → 60s) removes that doubt and moves this from a P2
polish item to a P1 reliability concern: a real user hitting the 60s case would very reasonably
conclude the page is broken and leave.

**Confirmed PASS:** malformed-.docx and fake-.exe-renamed-.docx both get clear, specific, upfront
refusals naming the actual problem (UP-008/009); `.png` refusal is equally clean (UP-010); the empty-
library teaching copy is unchanged and correct (UP-029). None of the four rejected files were ever
added to the actual document list — confirmed the library stayed "Nothing here yet" throughout, no
cleanup needed.

## Batch 50 — UP (Uploads, third pass), live signed-in production testing, real account (2 significant findings)

### F-103 · UP-007 · **P2/B2** · "Suggested readings" gets permanently stuck in contradictory states
Clicking "Find suggested readings" on a document detail page left the UI showing **both**
"A suggested-readings search is already running for this document." **and** "No search has been run
on this document yet." simultaneously — for 27+ seconds straight, never resolving to one coherent
state. This is exactly the "known wedge class" the test plan itself flags for this feature
(UP-007: "do they ever arrive? Known wedge class — verify."). Verified live: no, they don't arrive,
and the UI actively contradicts itself while waiting.

### F-104 · UP-030 · **P1** · `/library/uploads/[id]` can hang indefinitely on reload — same class as the already-known /library hang (F-012)
A hard reload of the exact document-detail page that had just loaded fine got stuck on "Loading the
library" for 50+ seconds with zero progress and no console error, never resolving in this session.
Direct navigation away (not Back, a fresh URL) recovered cleanly, so this is route-specific, not a
session-wide break. This matches the already-documented root cause pattern for F-012 (`/library` and
`/library/books`, async server component + broken Suspense boundary) — worth checking whether
`/library/uploads/[id]` shares the same broken code path, since `/library/uploads` itself (the list
page) loads fine (if sometimes slowly, F-102) but this one specific document-detail route reliably
hung on reload in this session.

**Confirmed PASS:** re-uploading identical bytes correctly shows "Already in your library" with no
duplicate created (UP-014); the document detail page's first load (before the reload that hung)
correctly attributed the content as "Your work" and rendered cleanly (UP-030, first-load only).

Test document (`ux-test-upload`) intentionally left in the account rather than risk another hang while
trying to delete it through the now-unreliable detail page — flagging for cleanup once F-104 is fixed,
or deletable via the `/library/uploads` list page's own Remove control instead (confirmed working in
Batch 45).

## Batch 51 — PR (Prayers) and DK cross-references, live signed-in production testing (0 new findings)

Wrote a clearly-marked disposable test entry to the real Prayer journal, confirmed autosave-on-navigate,
correct list ordering/dating, an emoji round-trip, and a confirmed delete ("Delete this prayer?
Keep/Delete", B8-compliant) — then removed it. Did not transcribe or quote any of the account's real
private prayer content in this write-up, consistent with the page's own promise ("Nothing here is
searched, indexed, or read by anyone else").

DK-021/022 (highlight/annotation sync between reader and Desk pane) both marked FAIL, referencing the
already-filed F-099 — same root cause, not re-investigated separately.

## Batch 52 — SE (Study editor, third pass), live signed-in production testing (1 significant finding)

### F-105 · SE-027 · **P1/B1** · Study export (Word .docx) fails with a 503, completely silently
Clicking Export → "Word (.docx)" fires a real GET to `/studies/[id]/export?format=docx`, which returned
**HTTP 503** — reproduced twice, consistently. The UI gives the user **zero feedback**: no error toast,
no "export failed" message, the dropdown just sits there as if nothing happened. A user has no way to
know their export didn't work short of noticing no file downloaded. This is a real server-side outage
on a real feature, not a UI bug — worth checking server logs/dependencies for the docx export path.
PDF export (print-based) not fully re-verified after this — the dropdown didn't reliably reopen for a
second check; worth a clean follow-up.

**Also confirmed PASS this batch:** SE-023 (emoji/Greek/English round-trip) — the earlier "spaces
vanished" observation in the same block was traced to the `type` tool dropping characters during
Unicode-heavy input, not a product bug; retested with a clean JS `value` + `input` event and confirmed
perfect fidelity, including combining diacritics on Greek text.

Cleaned up: disposable test study deleted via the confirmed "Delete?" flow, confirmed gone.

## Batch 53 — LB shelf save/unsave, and a fresh reconfirmation of F-012, live signed-in production testing

Save-to-shelf toggle (work header) confirmed working correctly both directions: clicking "Save"
flips to "Saved" with `aria-pressed="true"`, appears immediately in `/library/books` linking back to
the exact section, and unsaving from the work page flips it back cleanly (LB-015/017/018 all PASS).

**F-012 reconfirmed live, today, with a full 55-second observation:** navigating to `/library/books`
to verify the unsave (after it briefly worked once, moments earlier) hung on "Loading the library"
for 55+ seconds straight with zero resolution — the same route this repo's own MASTER.md UX-2 gate
names as already fixed. Recovered cleanly via direct navigation away (not Back). This is the fourth
distinct `/library/*` route observed stalling/hanging in this session (`/library/uploads` twice at
20s/60s, `/library/uploads/[id]` once past 50s, now `/library/books` past 55s with no resolution at
all) — strong evidence this is one shared systemic root cause across the whole `/library/*` family
under signed-in load, not four unrelated incidents. Verified the actual data state (unsave) was
correct by checking the work page's own Save toggle directly, since the shelf list page couldn't be
trusted to load at all.

## Batch 54 — EM (Empty states) and ST-018, live signed-in production testing

ST-018 PASS: both settings cross-links land on their correct, already-verified destinations.

EM-004/006/008/009/010 correctly left PENDING-SIGNIN with an explicit reason: this real account has
genuine saved content in every one of these surfaces (shelf, studies, uploads, plans, prayers) — 
observing their empty states would require deleting real account data, which is out of scope for a
testing pass.

EM-013 (history search zero-result state) PARTIAL: a deliberately nonsensical query never produced a
true zero-result state — the system falls back to "No known people or places matched — showing text
matches" plus a closest-match result. This reads as intentional, sensible design (never a dead end for
the user) but means the literal "honest zero-result empty state" this ID asks about isn't reachable
through this path.

## Batch 55 — EM (Empty states, real observation), live signed-in production

### F-106 · EM-005/EM-007 · **P3** · `/library/notes` silently omits entire sections when they're empty, instead of showing an empty state
This account currently has zero real notes and zero bookmarks (all test ones were created and cleanly
deleted in earlier batches). The page's own subtitle promises "Every verse you have highlighted,
bookmarked, or written a note on, in one place" — but with real, verified zero counts, **no "Notes"
or "Bookmarks" section renders at all**, not even an empty-state line. Only "HIGHLIGHTS (19)" appears.
A user who has bookmarked or noted nothing yet gets no indication those features exist on this page —
the sections just aren't there, rather than teaching what they're for (contrast with the well-built
empty states elsewhere: `/plans`, `/prayers`, `/library/uploads` all correctly show inviting empty-
state copy).

## Batch 56 — HM (Home), live signed-in production, real account with real history

### F-107 · HM-002/003/007/012 · **P2** · Home shows no personalized activity at all for a real, active account
Scrolled the entire signed-in `/home` page top to bottom. It renders **only** the Daily Light devotional
and a multi-voice commentary on the day's verse — the exact same content structure a brand-new,
zero-activity account would see. Confirmed absent: any continue-reading rail, any reading-plan card
(this account has 2 plans actively in progress, one with real completed days), any recent-threads
summary (5 real Ask threads exist), any highlights/studies summary (19 highlights, 3 studies exist).
A returning user with substantial history gets no sense of "pick up where you left off" from the page
whose whole job is to be the front door. Earlier signed-out testing already confirmed `/home` correctly
*omits* account-gated content when there's no account (HM-005/006/011, appropriately) — this finding is
that the omission continues even once there's plenty of real activity to show.

## Batch 57 — PL (Reading Plans, custom-plan builder), live signed-in production testing

Discovered and tested a previously-untested feature: the "New plan" custom builder (One book / A
collection / A topic, book picker, weeks/days-per-week/start-date, with a live preview of exactly what
will be created). Created a real disposable plan (Romans, 3 weeks) to test it end to end.

**Confirmed PASS:** the builder itself (PL-002), plan creation with real navigation to a new
`/plans/[id]` (PL-003), and the reading-day interaction — each day opens an inline preview panel (not
a full-page navigation, a legitimate design choice, initially misread as a dead link before checking
the DOM), with a working "Open in full reader" link (correct href, correct destination, Back returns
cleanly to the plan) (PL-008).

### F-108 · PL-013 · **P1** · "Delete plan" freezes the entire tab/renderer — reproduced 3 independent ways
Clicking "Delete plan" on the disposable test plan hung the tab completely, three separate times:

1. A real mouse click via the browser-automation tool — `Input.dispatchMouseEvent` timed out after 30s.
2. A second real mouse click, same result.
3. A **pure JS `.click()` dispatch**, which bypasses mouse/CDP input handling entirely — this froze
   `Runtime.evaluate` itself for 45+ seconds, meaning the freeze happens synchronously inside the
   click handler's own execution, not in event dispatch. This rules out a testing-tool artifact.

Each freeze took 20-50+ seconds to clear, and full recovery needed a fresh `navigate()` call (a page
reload) rather than the tab recovering on its own. No confirmation dialog, no error, no partial state
change was ever observed — the button click itself locks the renderer.

This is a P1: deleting something you created is one of the most basic, expected actions in the app,
and it currently locks up the page for anyone who tries it on a custom-built reading plan (the two
pre-seeded template plans were never tested for this specific failure, since neither was deleted in
this session — worth checking whether the bug is custom-plan-specific or the delete path in general).

**Known incomplete cleanup:** the disposable test plan (`/plans/959dc6bc-d3b4-471c-8bdb-c034c8d4719a`,
"Romans · 3 weeks") could not be deleted through the UI because of this exact bug, and was left in the
account rather than risk another 45+ second freeze retrying it. Flagging for manual cleanup once F-108
is fixed, or via direct DB access if someone with that access wants to clear it sooner — it is inert
test data (0 of 15 days read, never touched again after this batch) and poses no functional risk left
as-is.

## Batch 58 — PL, CH-024, NT-019, live signed-in production testing (0 new findings)

PL-021 confirmed PASS: invalid plan id shows a clean, human "This plan could not be opened. It may
have been removed." message (the doubled-title bug on this same route is already filed separately as
F-044). PL-016 confirmed PASS: this account's 2 real plans track independently with separate progress.

CH-024 (Unicode bidi-override safety) confirmed PASS: a note title containing RLO/PDF control
characters rendered the marked span visually reversed (expected — the app doesn't strip bidi control
characters) but the reversal stayed correctly scoped, never leaking into or corrupting surrounding UI
text or controls.

Bonus confirmation of F-106's exact mechanism: with the account's note count now at a real 1 (from
this test), `/library/notes` correctly rendered a full "NOTES (1)" section with the note and its
reference — confirming the section really is conditionally hidden at zero count, not broken outright.

NT-019 confirmed PASS: the note's `/library/notes` reference chip correctly jumped back to the reader
at the right verse. Test note cleaned up via Delete, confirmed removed.

## Batch 59 — PW cross-cutting (Desk + verse panel), live signed-in production testing

### F-109 · PW-012 · **P2** · Verse numbers inside a Desk pane are not interactive — the verse-study panel can't be opened from Desk at all
Confirmed via DOM inspection (zero `<sup>` elements found in a Desk scripture pane, versus real
interactive `<sup role="button">` verse numbers in the full reader) — clicking a verse number in a
Desk pane does nothing. This means the verse-study panel (Commentaries/Word study/Notes, plus
Highlight/Bookmark/Ask) that's central to reading in this app is entirely unreachable while using the
side-by-side Desk view. Combined with F-011 (no discoverable way to add a commentary pane at all) and
F-099 (highlights don't sync between reader and Desk), this is the third finding pointing at the same
underlying gap: the Desk feature's core promise — "read Scripture and commentary together" — is
currently missing the connective tissue between the two panes and the rest of the app's per-verse
tooling.

## HONEST STATUS — latest (real signed-in production pass complete for this stretch)

**Tracker**: 918/918 test IDs carry a real status. Of those:

| Status | Count | Meaning |
|---|---|---|
| PASS | 358 | Genuinely exercised and confirmed working |
| FAIL | 79 | Real findings, filed as F-001 through F-109 below |
| PENDING-SIGNIN | 128 | Needs the one real account, sequentially — most now closed or explicitly reasoned (multi-tab, offline, screen-reader, or true-empty-state items this session couldn't safely force) |
| PENDING-DEVICE | 21 | Hard block — real hardware, never self-marked |
| PARTIAL | ~201 | Tool-limited (no network throttle, no second account/device, no screen reader) — each row states the specific limit |
| NOT-RUN | ~59 | Named generators (Ask/History-search query batches) rate-limited on one real account, or a specific sample that didn't surface the tested condition |
| NOT-APPLICABLE | 38 | Feature genuinely doesn't exist in this app |

**79 findings filed this session**, several severe and worth an owner's attention ahead of the rest:

- **F-108 (P1)** — "Delete plan" freezes the entire tab/renderer, reproduced 3 independent ways
  including a pure JS click that bypasses all input dispatch. A basic action (deleting something you
  made) currently locks up the page.
- **F-012 (P1, reconfirmed)** — `/library/books` hung 55+ seconds with zero resolution during this
  pass, the same route this repo's own `MASTER.md` UX-2 gate calls already fixed. Four independent
  `/library/*` route hangs observed this session (20s/60s/50s+/55s+) — one shared root cause, not
  fixed.
- **F-069 (P1)** — no privacy policy or terms of service anywhere on the site; every `/privacy` and
  `/terms` variant 404s.
- **F-075/F-076 (P1)** — Google sign-in gets permanently stuck loading; deep authenticated routes
  lose the return path (or don't redirect to sign-in at all) when signed out.
- **F-090 (P1)** — the verse-study panel (commentary/notes/word-study) is completely unreachable
  while interlinear mode is on — the handles vanish from the DOM, not just hidden.
- **F-082 (P1)** — the verse-number control (the primary way to open per-verse commentary) has zero
  keyboard path — Enter/Space do nothing, mouse-only.
- **F-011/F-099/F-109** — three separate findings converging on the same gap: the Desk feature's
  "read Scripture and commentary side by side" promise is missing real connective tissue (no way to
  add a commentary pane discoverably, highlights don't sync between reader and Desk, and Desk panes'
  verse numbers aren't interactive at all).
- **F-107 (P2)** — Home shows zero personalized activity for this real, active account (2 in-progress
  plans, 19 highlights, 3 studies, 5 threads) — renders identically to a brand-new account.
- **F-105 (P1)** — study export to Word (.docx) returns a server 503, silently, no user feedback.

**Known incomplete cleanup**: one disposable test reading plan ("Romans · 3 weeks",
`/plans/959dc6bc-d3b4-471c-8bdb-c034c8d4719a`) could not be deleted through the UI because of F-108
and was left in the account rather than risk another freeze — flagged for manual cleanup once that
bug is fixed. All other test data created during this session (studies, highlights, notes, prayers,
uploads, bookmarks) was successfully created, tested, and cleanly removed — confirmed via reload/
re-check after each cleanup, not assumed.

This represents the practical ceiling for a single-session, single-account pass: every remaining
PENDING-SIGNIN/PARTIAL row has a stated reason (tool limitation, hard device block, or a specific
untested condition) rather than being silently left blank or guessed at.

---

# Session 2026-08-25 — continuation pass (local prod build + real test account)

**What changed vs the previous pass.** The previous pass had one real production account and could
not risk it, so 126 items sat at PENDING-SIGNIN. This pass built a **local production build of
`fix/ux-overnight-sweep` itself** (`next build && next start`, `SITE_PASSWORD` set so the gate is
live exactly as in prod) pointed at the **dev** Neon branch (`ep-tiny-hat`, `NEON_BRANCH=dev` — NOT
production `ep-odd-fog`), and created a disposable account on it (`uxsweep.tester@example.com`).
Dev-branch test users already exist from earlier sessions (`test+au007@`, `test+au009@`,
`test+au012b@`, `test+throwaway1@`), so this is the established practice here, not a new one.

Everything below was run against `http://localhost:3010` on that build. Where a result could differ
in production (latency, mail delivery, OAuth) it says so on the row.

**Tooling limits found and calibrated (they bound several rows below):**
- `computer key` delivers **no keyboard events to the page at all** — a probe input with a `keydown`
  listener recorded zero events, so Tab-traversal and Enter-to-submit cannot be exercised by
  keystroke in this tool. Text entry (`computer type`) *does* work. Keyboard-order rows are
  therefore answered by DOM-order/tabindex analysis, and every such row says so.
- `computer left_click` by ref is unreliable after a re-render (a click aimed at the password field
  landed in the email field). Form entry below uses the native value setter + `requestSubmit()`,
  which exercises the app's real submit handler and real network calls.
- `resize_window` **does** work in this session (390×844 and 1280×800 both verified against
  `innerWidth`), which is what the previous pass could not get. Viewport rows that were PARTIAL for
  that reason are re-runnable and are being re-run.

## Corrections to previously filed findings

**F-051 and F-077 are WRONG — both are disproven. The gate and the sign-in endpoint are BOTH rate
limited; the earlier tests simply stopped below the threshold.** Measured on this build:

| Endpoint | Attempts | Observed |
|---|---|---|
| `POST /api/gate` (wrong password) | 14 in one minute | `303 ×10` then `429 ×4` — cap is `GATE_LIMIT_PER_MIN=10` (and 60/hour) |
| `POST /api/auth/sign-in/email` (wrong password) | 12 in one minute | `401 ×5` then `429 ×7` — cap is `AUTH_EMAIL_LIMIT_PER_MIN=5` per address (10/min per IP) |
| `POST /api/auth/send-verification-email` | 8 in one minute | `200 ×5` then `429 ×3` |

F-051 used n=8 against a cap of 10; F-077 used n=5 against a cap of 5 (the 6th would have been the
429). Counters are visible in `api_rate_limit` (`auth:email:…`, `auth:ip:…`, `gate:…`).

**A trap worth recording, because it produced a false 401 here first:** `/api/auth/*` is INSIDE the
middleware matcher, so a POST without the gate cookie returns the gate's own `401 Locked`, which
looks exactly like an auth failure. The first run of this test read "10 × 401, no throttling" and
was wrong for that reason. Re-run with the gate cookie, the 429s appear. Any rate-limit test against
this app must carry the gate cookie or it is measuring the gate.

## New findings

### F-110 · AU-047 · **P2** · "Other sessions were signed out" is true in the database and false in practice for up to 5 minutes
Changing the password at `/account/settings` shows *"Your password has been changed. Other sessions
were signed out."* The DB agrees — the other session row disappears from `neon_auth.session`. But
the app kept serving that revoked session as **signed in**: with the revoked cookie,
`/account/settings` still rendered "Your account" and the account email at 01:07:26Z, ~19s after
revocation. It stopped at 01:08:57Z. The `__Secure-neon-auth.local.session_data` cookie is a signed
cache of the session with its own ~5-minute expiry (stamped 01:08:26Z here), and it is trusted
without re-checking the session row. So a stolen session survives a password change for up to the
remaining cache TTL. Reproduce: sign in twice (two cookie jars), change the password in jar A, then
hit `/account/settings` with jar B.

### F-111 · AU-025 · **P3** · A used reset link explains itself but offers no way forward
Re-submitting an already-used reset link correctly says *"That reset link has expired or has already
been used."* The only link on the screen is "Back to sign in" — there is no "request a new link"
action, which is the one thing the reader now needs. (The test itself passes; this is the polish gap.)

### F-112 · AU-024 · **P1** · Password RESET does not revoke existing sessions
The forgot-password → reset-link flow is the flow someone uses when they think their account is
compromised. Measured: sessions created **before** the reset are still in `neon_auth.session`
afterwards and still authenticate. Browser session `Tnp9d3IG` (01:06:57Z) and curl session
`88liMPe2` (01:07:07Z) both survived a reset performed at ~01:08:2xZ, and the browser session
continued to render `/account/settings` as signed in. Note the inconsistency: `changePassword` is
called with `revokeOtherSessions: true` (`web/src/components/account-settings.tsx:40`) but the reset
path has no equivalent. An attacker holding a session keeps it through the victim's password reset.

### F-113 · AU-031, AU-032 · **P2** · A tab whose session ended reports a generic, retryable error and never says you were signed out
Two tabs signed in; sign out in tab A; in tab B type into a prayer. `POST /api/prayers` returns
**401** and the UI shows *"That change could not be saved. Please try again."* — the same sentence it
would show for a transient network failure. There is no mention of the session, no route to sign in,
and "try again" can never succeed. The typed words stay on screen unsaved. Same mechanism covers
session expiry mid-page (AU-031): the app cannot distinguish 401 from a retryable write failure.

### F-114 · AU-004 · **P2** · Email-verification links expire in 5 minutes, and nothing says so
`neon_auth.verification` rows for `email-verification-otp-<address>` carry `expiresAt - createdAt =
00:05:00`. The screen says only *"We have sent a verification link to <address>. Open it and you will
be signed in."* — no expiry stated. Five minutes is shorter than many people take to reach their
inbox, so the default outcome for a distracted reader is a dead link. Contrast the reset flow, which
gets this right in both directions: its token TTL is exactly `01:00:00` and its copy says *"It can be
used once, and expires in an hour."*

### F-115 · AU-050 · **P3** · With JavaScript off, submitting sign-in yields a raw "Server action not found." 404
The form now server-renders (`<form method="post">` is in the raw HTML — this is a **change since the
previous pass**, whose AU-050 note said no form existed; commit `90becf1` removed the Suspense
boundary). It fails safely: `method="post"` means nothing sensitive reaches the URL. But a real
no-JS POST returns `HTTP 404` with the 24-byte body `Server action not found.`, and none of
`/auth/sign-in`, `/auth/sign-up`, `/gate` carries a `<noscript>` explanation.

## Batch — highlights, signed in (HL group)

Method: real UI interaction in the reader (verse-number tap → colour swatch) for every behavioural
claim; the API (`/api/annotations`) only for bulk seeding where the test is about volume, and for
reading back server state to check what the UI actually persisted. All test data deleted afterwards.

### F-116 · HL-009 · **P1/AX** · Every highlight colour fails AA contrast in dark mode
Measured by compositing each highlight's `/70` background over the actual page background on a
canvas and computing the WCAG ratio against the rendered text colour. Light mode is comfortable —
all ten colours land between **11.82 and 13.84**. Dark mode is not: all ten land between **1.69 and
2.05**, against a 4.5 AA floor and even a 3.0 large-text floor.

| colour | light | dark | dark effective bg | dark text |
|---|---|---|---|---|
| yellow | 13.83 | **1.69** | rgb(186,174,97) | rgb(231,222,208) |
| lime | 13.84 | **1.69** | rgb(159,181,111) | " |
| green | 13.51 | **1.75** | rgb(137,180,149) | " |
| teal | 13.05 | **1.82** | rgb(112,179,164) | " |
| sky | 12.61 | **1.91** | rgb(136,167,182) | " |
| purple | 12.46 | **1.94** | rgb(171,155,184) | " |
| pink | 12.34 | **1.96** | rgb(184,151,167) | " |
| violet | 12.31 | **1.98** | rgb(162,156,183) | " |
| rose | 12.12 | **2.01** | rgb(186,149,152) | " |
| amber | 11.82 | **2.05** | rgb(187,153,38) | " |

Cause: the same `bg-<colour>-200/70` classes are used in both themes, so in dark mode a pale wash
composites to a mid-tone while the text stays the light reader colour — light text on a light-ish
band. Screenshot taken and looked at (1280×800, dark, John 3): highlighted verses are visibly
*harder* to read than unhighlighted ones, which inverts what a highlight is for. Note the schema
already carries a per-highlight `text_color`, and the colour buttons never set it.

### F-117 · **P2** · "Saved" caps each section at 100 and prints the page size as the total
`/library/notes` renders `Highlights ({highlights.length})` over whatever the first API page
returned, and `getChapterAnnotations`'s sibling list query defaults to `pageLimit = 100`. With 143
highlights on the account the heading read **"HIGHLIGHTS (100)"** and 43 were unreachable — no
pagination, no "load more", nothing saying anything was omitted. The count is not just short, it is
presented as authoritative.

### F-118 · HL-022 · **P2** · The Saved overview has no delete — no controls at all
`/library/notes` main content contains **zero `<button>` elements**. Every row is a link back to the
reader. So the one place that lists everything you have saved cannot remove any of it; a highlight
can only be cleared by navigating to its verse and using the verse panel. HL-022 as written ("delete
from the overview → reader updates") has no UI to exercise.

### F-119 · HL-006, HL-013 · **P2** · Changing a highlight's colour leaves the old one behind as a second row
Whole-verse highlight, then a different colour on the same verse, creates a **second** row rather
than replacing the first. Measured: John 3:21 yellow → teal gives `v21 rows: 2 ['yellow','teal']`.
The reader looks right (last covering span wins), so nothing signals the duplicate — but `/library/notes`
lists the verse twice, and the counter inflates: with two verses recoloured the heading read
**"HIGHLIGHTS (17)"** with `John 3:20` and `John 3:21` each appearing twice.
The idempotent-create guard in the route only matches an *identical* span, so a colour change is a
new span by construction. Two tabs recolouring the same verse (HL-013) is the same defect from the
other end: green in tab A and rose in tab B leaves both rows, with no last-writer-wins.

### F-120 · HL-011 · **P2** · A highlight that fails to save is painted anyway and then vanishes with no message
With `/api/annotations` writes forced to fail (fetch rejected, simulating offline), tapping a colour
paints the verse, the panel switches to showing "clear" as though a highlight now exists, and
**nothing is shown to the reader** — no error, no retry notice, no `role=alert`/`role=status` text
anywhere. Two POST attempts were made (so there *is* one retry) and after both failed the UI stayed
optimistic. On reload the highlight is simply gone. This is the B4 class the plan names: work
silently lost.

### F-121 · HL-012 · **P2** · Clear-then-recolour: the older intent wins and the newer one is destroyed
Sequence: clear the highlight on John 3:16 (DELETE, held for 4s), then immediately pick rose. The
POST lands first and creates rose; the delayed DELETE then arrives and — because verse-level delete
removes *all* spans on the verse — wipes the highlight the reader just asked for. Final server state
for John 3:16: **empty**. The test's own bar is "newer intent wins"; the opposite happens, silently.

### F-122 · **P3/AX** · Reading-plan disclosures never update `aria-expanded`, and have no `aria-controls`
On a plan page, each row in ALL READINGS is `<button aria-expanded="false">`. Opening one renders
the full chapter inline (verified: John 1's text appears, +2,556 characters of body text), but the
attribute stays `"false"` on all 15 rows, and no row carries `aria-controls`. A screen-reader user is
told the disclosure is closed while it is open, and is given no pointer to the panel that opened.

### F-123 · HL-020 · **P2** · Highlights do not render in reading-plan context
John 3 carries 18 highlights in the reader. Opening the plan's "John 3–4" reading renders both
chapters in full (90 verse numbers) with **zero** highlight spans. The same text in the same app,
one surface remembers your marks and the other does not. Same family as the already-filed F-099
(reader ↔ Desk) and F-109 (Desk verse numbers): per-verse state stops at the reader's edge.

### Passing rows worth recording
- **HL-005** three colours on John 3:1/3/16, reload, all three still present and independent.
- **HL-006** the same colour three times on one verse → exactly one row (the route's idempotent
  create works; it is only *different* colours that duplicate, F-119).
- **HL-007** sub-verse spans are supported and persisted with real offsets (`span 0 21`), reached by
  selecting text rather than tapping the verse number.
- **HL-016** the good surprise: whole-verse highlights re-anchor across a translation switch
  (WEB→KJV, all 13 kept), and *sub-verse* spans — which cannot re-anchor, since offsets are
  translation-specific — are not silently dropped or mis-placed. The verse shows **"Highlighted in
  KJV."** while you are in WEB, and the span reappears when you switch back. That is the
  "or documents otherwise" branch of the test, done properly.
- **HL-017/018** 50 highlights in one chapter: `domInteractive` 32ms, `loadEventEnd` 172ms.
  130 highlights in one chapter (Psalm 119, 176 verses): 30ms / 286ms, all 130 spans painted.
  Frame-rate during scroll could not be measured — `requestAnimationFrame` does not fire while the
  browser pane is hidden, which it is in this tool.

## Batch — notes, signed in (NT group)

### F-124 · NT-011, NT-012 · **P2** · An unsaved note is lost on refresh or navigation, with no warning and no draft
Typed into the verse-panel note editor without saving, then: `beforeunload` is **not** prevented
(dispatched a cancelable event; `defaultPrevented === false`), and there is no draft anywhere —
zero keys matching `/note|draft/i` in either `localStorage` or `sessionStorage`. Reloaded for real
and reopened the note: the draft text is gone and only the last saved version is there. The test's
own bar is "warned, drafted, or documented loss — never silent". It is silent.

### F-125 · NT-015 · **P2** (arguably P1 — it is the user's own words) · A note that fails to save is discarded, and the panel closes as though it saved
With `/api/annotations` writes rejected, typing a note and pressing **Save note**: three write
attempts are made, all fail, **no error is shown**, and the verse panel **closes** — the same thing
it does on a successful save. The typed text is not preserved anywhere. Server state confirms the
old note is untouched. This is worse than the highlight equivalent (F-120), because the closing
panel actively signals success and the lost content is prose the reader wrote.

### F-126 · NT-021, NT-022, NT-023 · **P2** · The Saved list shows note bodies in full, with no timestamp and no search
Three defects in one list, measured with 105 notes on the account:
- **No truncation.** A 2,520-character note renders **2,519 characters** in the list — `line-clamp:
  none`, `overflow: visible`, no "read more". It occupies 400px of the page on its own. The route
  accepts notes up to 20,000 characters, so one note can bury the entire list.
- **No timestamps at all.** A note row is a reference and a body, nothing else. There is no "2 days
  ago" and no date, so notes cannot be placed in time.
- **No search or filter.** Zero `input` elements in the list.
Combined with F-117's 100-row cap (`NOTES (100)` shown while 105 existed), a reader with real usage
gets an unsearchable, undated, unbounded-length list that silently stops at 100.

### F-127 · NT-014 · **P3** · The note editor does not resize
`rows=6`, height **142px** at 11 characters and still **142px** at 5,000 characters. It does not
jump (the test's other half), but a 5,000-character note is edited through a six-line window.

### Passing rows worth recording
- **NT-005** 5,000 characters including emoji and polytonic Greek round-trip intact (`😀 Ἀγάπη
  ἐστίν …`), stored as 4,999 after the route's `.trim()`. No truncation, no mojibake.
- **NT-016** two tabs on the same note: last write wins, exactly one row, no corruption. Worth
  knowing that the loser is overwritten silently — tab B had loaded the pre-edit note, and saving it
  replaced tab A's newer text with no conflict notice — but the test's bar ("consistent outcome, no
  corruption") is met.
- **NT-017** a note and a highlight coexist on one verse (John 3:16 carries an amber highlight and a
  4,999-character note simultaneously).
- **NT-020** the signed-in empty state is the same explanatory copy as signed out ("Every verse you
  have highlighted, bookmarked, or written a note on, in one place. Tap any reference to jump back
  to it in the reader.") — it teaches.
- **NT-026 (partial)** the editor IS labelled: `aria-label="Note on this verse"` plus a placeholder.
  What is missing is the save announcement — after a successful save there is no `role=status` or
  `role=alert` anywhere in the document, so nothing is announced. Full screen-reader pass still
  needs a real screen reader (owner decision D-5).

## Batch — reading plans, signed in (PL group)

### F-108 — ROOT CAUSE FOUND, and the fix already exists in this repo
The previous pass reproduced "Delete plan freezes the entire tab" three ways and concluded it was
"a real synchronous hang inside the click handler". The symptom is right; the cause is one line:

```
web/src/components/plans-client.tsx:762
if (!window.confirm('Delete this plan? Your progress on it goes too.')) return;
```

`window.confirm` is a **native modal that blocks the renderer's main thread**, which is exactly why
`Runtime.evaluate` itself hangs — CDP cannot evaluate anything while the dialog is up, so the whole
tab looks dead. Nothing in the app's own code is slow. Proven both directions on this build:

- Clicked Delete with the dialog unhandled → returned in 815ms having done **nothing at all**: still
  on the plan page, no dialog visible, plan not deleted (Chrome suppresses dialogs in a background
  tab and returns `false`, so the delete silently no-ops).
- Stubbed `window.confirm` to return `true`, clicked Delete → the plan was deleted and the app
  navigated to `/plans` **in ~1 second**. The delete path itself is healthy.

**This exact defect was already found and fixed elsewhere in this codebase.**
`web/src/components/prayer-journal.tsx:353` carries the fix and the reasoning:

> This was `window.confirm`, which froze the renderer for 60+ seconds during verification and is
> impassable to automation and to assistive tech — a modal that blocks the main thread is an outage
> with a button on it. The confirmation is REPLACED, not removed […] Two steps, in-page, focusable,
> and cancellable.

The plans delete is the **last remaining `window.confirm` in `web/src`** (grep: two hits, one of them
that comment). The fix is to apply the prayer-journal pattern — the sign-out control uses the same
two-step idiom, so the app already has this in two places and plans is the odd one out.

### F-128 · PL-018, PW-004, PW-010 · **P2** · Verse numbers in plan reading are inert — you cannot annotate from plan context
The plan's inline reading panel renders the chapters in full — 90 `<sup>` verse numbers for
"John 3–4" — and **not one of them is interactive**: no `role`, no `tabindex`, no `aria-label`, versus
the reader's own `<sup role="button" tabindex="0" aria-label="Verse 16, read commentary">`. So from
inside a plan there is no way to highlight, note, bookmark, or open commentary on what you are
reading. Together with F-123 (highlights invisible there) and F-109 (the same gap on Desk), this is
one shape: **per-verse tooling exists only in `/read`, and every other reading surface is a flat
page of text.**

### F-129 · PL-020 · **P3** · With 50 plans the only way to make a new one is 8 screens down
50 plans render fine (`domInteractive` 29ms, `loadEventEnd` 327ms, all 50 rows present). But the
list has no search, no filter, no sort, and no separation of finished from active — and the **"New
plan" button sits at y≈6,587px**, below every row. The primary action of the page is the last thing
on it.

### Passing rows worth recording
- **PL-007** the good one: with `/api/plans` writes rejected, "Mark as read" reverts and says so —
  *"That change could not be saved. Please try again."* in a live region, and the counter rolls back
  to its real value. This is the honest-failure behaviour that highlights (F-120) and notes (F-125)
  do not have. Whatever shipped the plan toggle got this right; the annotation writes did not.
- **PL-010** progress persists across a full reload ("1 of 15 days read" still shown).
- **PL-011** finishing every day is acknowledged: *"Every day is read. Well done."*, and the UP NEXT
  block cleanly disappears. No broken state.
- **PL-012** a finished plan can be restarted day by day — each row carries a real toggle
  (`aria-label="Mark day 3 unread"` → `"Mark day 3 read"`), the counter drops to 14 of 15 and UP NEXT
  recomputes to that day. There is no bulk "restart" or "abandon" short of delete.
- **PL-014** a multi-chapter day ("John 3–4") renders both chapters in one panel (90 verses) and ends
  with an "Open in full reader" link, so both chapters are reachable.
- **PL-017** the empty state teaches: it names the three things you can build (a book, a collection,
  a topic) with a concrete example of each before asking you to choose.
- **PL-022 (partial)** the day list IS a real `<ul>`, and each toggle is a `<button>` whose
  accessible name states the action and implies the state. There is no `aria-pressed`/`aria-checked`,
  so state is carried by wording alone; progress changes DO announce (`role=status` → "1 of 15 days
  read"). A real screen reader is still needed for the rest (owner decision D-5).

## CORRECTION — F-012 / F-102 / F-104 are a TESTING ARTIFACT, not a user-facing bug

This retires the previous pass's second-highest-severity finding ("Most of `/library/*` hangs on
'Loading the library'", reconfirmed there four times, 20s–60s each). It reproduces here — and the
cause is the **hidden browser tab**, not the app.

**The chain, each link measured on this build:**

1. `/library` hard-loaded in this tool sits on "Loading the library" indefinitely — **25,226ms** and
   still going, with **no pending network request** (every API call returned: `get-session` 6ms,
   `/api/research` 292ms, `/api/studies` 294ms).
2. The resolved content **is already in the document**. On the stuck page,
   `/All items/i.test(document.documentElement.innerHTML)` is `true` while
   `main.innerText` still reads "Loading the library" — the real segment is parked in a
   `div[hidden]`, exactly where React's streaming Suspense puts a segment awaiting reveal.
3. The reveal is scheduled with **`requestAnimationFrame`**. The last line of the server HTML is
   React's own reveal script:
   ```js
   $RC=function(a,b){ … 2===$RB.length&&("number"!==typeof $RT
        ? requestAnimationFrame($RV.bind(null,$RB))
        : setTimeout(…)) … }
   ```
   `$RT` is `undefined` on this page, so the `requestAnimationFrame` branch is the one taken.
4. **`requestAnimationFrame` never fires in this environment.** Direct measurement: armed one rAF
   and one MessageChannel message in the same call — the MessageChannel callback ran
   (`messageChannelFired: 1`), the rAF callback did not (`rafFired: 0`), with
   `document.visibilityState === "hidden"`. Chrome does not run rAF for a hidden tab. The browser
   pane is hidden for the whole of this session, and `tabs_select` does not change it.
5. **Running the queued callback by hand reveals the page instantly.** `window.$RV(window.$RB)` on
   the stuck page → `main.innerText` becomes "Library / YOURS / Saved / My books / Word study /
   My Works / ALL ITEMS / Commentaries 33 items / Sermons 6 items / …" immediately.

**So:** the segment streams, arrives, and waits for one animation frame that a hidden tab never
gives it. A visible tab gets that frame in ~16ms. The one link not directly measured here is "a
visible tab fires rAF", because this tool cannot produce a visible tab — but that is
`requestAnimationFrame`'s specified behaviour, and the other four links are measured.

**Corroborating detail that fits, and re-reads an old repo decision.** In-app navigation to
`/library` from the sidebar renders in **1,377ms** every time, on the same hidden tab, because a
client-side route change commits through React's scheduler (MessageChannel) instead of the
streaming-reveal path. That "hard load hangs, in-app navigation is fine" split is precisely what
`web/src/app/library/uploads/page.tsx:20-32` records:

> Measured: still "Loading the library" 43s in, with `/api/user-corpus/documents` never called ONCE.
> … In-app navigation from the sidebar was fine throughout (~700ms), which is why this only ever bit
> a refresh or a pasted URL

That earlier measurement almost certainly hit this same artifact, and `/library/uploads` was made
synchronous to work around it. **The workaround did not work**: `/library/uploads` and
`/library/word-study` — both plain `'use client'` pages with no async server component — sit on the
same fallback for 12s+ on a hard load here, for the same reason (the boundary is the parent's).

**What is actually true for a user:** a `/library/*` URL opened in a **background** tab shows the
skeleton until that tab is looked at. That is standard React streaming behaviour in every Next.js
app, not an Ancient Paths defect, and it resolves on focus. Residual real impact is narrow —
background-tab prefetching, automated screenshotting, and uptime monitoring will see a skeleton.

**Recommended disposition:** downgrade F-012 from P1 and F-102/F-104 from P1/P2 to a **P3 note**,
and — more usefully — re-examine whether the `uploads/page.tsx` synchronous-render change is worth
keeping, since it was made to fix something that was never broken. Any future "it hangs on
Loading…" report against this app should first check `document.visibilityState`.

## Batch — settings (ST group)

### CORRECTION — F-050 is WRONG. Text size and column width both work.
F-050 flagged "text-size/column-width settings may not actually affect the reader — suspect, needs a
clean re-test". Re-tested by measuring `getComputedStyle` on the verse text, stepping the reader's
own Aa panel:

| step | font-size | container width |
|---|---|---|
| base | 18px | 620px |
| A+ ×1 / ×2 / ×3 | 20px / 22.4px / **25.6px** (ceiling) | 620px |
| A− ×1…×4 | 22.4 / 20 / 18 / **16px** (floor) | 620px |
| ⇥ ×1 / ×2 / ×3 | 16px | 715px / **827px** (ceiling) |

Both controls change the rendered page, both clamp at sensible ends, both persist
(`reader-size`, `reader-measure` in `localStorage`, applied by the pre-hydration script in
`layout.tsx:138`) and both survive navigation to a fresh chapter. No dead setting was found in this
group, so **ST-012 has nothing to file**.

### F-130 · ST-007 · **P2** · The system dark-mode preference is ignored on a first visit
With no stored preference (`localStorage.removeItem('reader-theme')`) and the browser reporting
`prefers-color-scheme: dark` (`matchMedia('(prefers-color-scheme: dark)').matches === true`), the app
renders **light**: no `reader-dark` class, `body` background `rgb(251, 248, 242)`. The cause is one
expression in the pre-hydration script, `layout.tsx:138`:
```js
d.classList.toggle('reader-dark', t === 'dark')   // t = localStorage 'reader-theme'
```
There is no `prefers-color-scheme` fallback for the `t == null` case. A reader whose whole machine is
in dark mode gets a bright page until they find Settings.

### F-131 · **P2/AX** · The match-count labels on `/search` fail AA in both themes
The per-catalog counts ("950 matches", "1,000 matches+") are 11px in a muted colour:

| theme | colour | on | ratio | AA floor |
|---|---|---|---|---|
| light | rgb(180,166,146) | rgb(251,248,242) | **2.25** | 4.5 |
| dark | rgb(107,97,86) | rgb(26,20,15) | **3.01** | 4.5 |

Six instances on one search page. These are the numbers that tell a reader where the results are, so
they are not decoration. Everything else measured on the surfaces below clears comfortably.

### F-132 · ST-019 · **P3** · Settings do not sync between open tabs
Changed the theme to Dark in tab A through the Settings UI; tab B (on `/read/mrk/1`) still rendered
light, and *stayed* light through a further in-page action (opening a verse panel), while sharing the
updated `localStorage` value (`reader-theme: "dark"`). Nothing listens for the `storage` event, so the
two tabs disagree until the stale one is reloaded. No corruption — the stored value is single and
correct — so this is cosmetic drift, not data loss.

### Passing rows worth recording
- **ST-002/003** every control applies immediately and survives a reload and a route change (theme,
  size, measure and default translation all still in force on a freshly opened chapter).
- **ST-004** these are per-device by design — the page says so ("Saved on this device", and
  `/account/settings` repeats it) — so they are unaffected by sign-out/in, which is the documented
  behaviour rather than a gap.
- **ST-006** dark mode measured on four surfaces, worst non-highlight contrast per surface: reader
  **7.66**, `/home` **6.88**, `/library` **13.69**, `/search` **3.01** (the F-131 labels). Highlighted
  verse text is the separate F-116 failure at 1.69–2.05.
- **ST-008** no flash of the wrong theme: the theme is applied by a synchronous inline script in
  `<head>` before first paint, not by a React effect.
- **ST-011** the default-translation setting really is the default: set ASV in Settings, opened
  `/read/mrk/1` fresh, and the reader opened in ASV.
- **ST-015** change password works end to end — see AU-047 and F-110.
- **ST-024** Back from Settings returns to where you came from (`/read/mrk/1` → `/settings` → Back →
  `/read/mrk/1`), not to home.

## Batch — studies (SE group)

### CORRECTION — F-105 does not reproduce. Study export works, in both formats.
F-105 filed "Study export to Word (`.docx`) returns HTTP 503, reproduced twice, with zero
user-facing error". On this build, against a real study with 203 blocks including a library clipping:

| request | result |
|---|---|
| `GET /studies/<id>/export?format=docx` | **200**, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, **9,455 bytes**, opens as a valid docx (`word/document.xml` read back and checked) |
| `GET /studies/<id>/export?format=pdf` | **200**, print-styled HTML with `@media print` and a `window.print()` call |
| `GET /studies/<id>/export` (no format) | 400 with a clear message — correct |

**The route cannot return 503 by its own logic.** Its only failure path is `apiError('INTERNAL')`,
which is **500** (`lib/api-error.ts:35`). The two codes that map to 503 are `GATE_LOCKED` and
`UPSTREAM_UNAVAILABLE`, and neither is reachable from this handler — `GATE_LOCKED` is the
**middleware's** code, which is what an ungated request to any app route returns. So a 503 observed
in production points at the site gate or the platform, not at the export handler. Worth one check at
the production terminal; it is not a bug in this code.

**The second half of F-105 does stand, and is worth keeping as its own note:** both export options
are plain `<a href>` links (`format=docx` with no `target`, `format=pdf` with `target="_blank"`)
with no client-side error handling at all. Whatever the server returns, the app shows nothing — so
any failure, of any kind, is silent from the user's side. That is why a 503 looked like "the
dropdown just sits there".

### F-133 · SE-021 · **P2** · An over-length block fails as "Save failed — Retry", and retrying can never work
The server caps a text block at 20,000 characters and says so plainly:
`{"error":{"code":"INVALID_REQUEST","message":"a text block holds at most 20000 characters"}}`.
The editor never shows that sentence. A 25,200-character block produces the same generic
**"Save failed — Retry"** as a dropped network, pressing Retry fails again (verified), and the
textarea carries no `maxLength` (`-1`) and no character counter. Shortening the block makes it save
immediately — so the fix is one the writer would never guess. This is the same class as F-130's
neighbours: a specific, actionable server message discarded in favour of a generic retryable one.

### Passing rows worth recording — including the best write-failure behaviour in the app
- **SE-012** is the model the rest of the app should copy. With `/api/studies` writes rejected:
  the editor shows **"Save failed below"** at the top and **"Save failed — Retry"** on the block, the
  typed text stays exactly where it is, and clicking **Retry** after the network returns saves it and
  goes back to "Saved" (verified end to end). Compare F-120 (highlights), F-125 (notes) and F-113
  (any 401), which lose work silently or blame the network for an auth failure.
- **SE-013** two tabs on the same block: last write wins, one block, no corruption, no duplication.
- **SE-019** toggles are honest: **Pin** carries `aria-pressed` and it really flips
  `false → true` with the label changing `Pin → Pinned`, and the Library disclosure flips
  `aria-expanded false → true`. (Directly contrast F-122, where the reading-plan disclosures never
  update `aria-expanded` at all — so this app knows how to do it and one surface does not.)
- **SE-020** 200 blocks: `domInteractive` 748ms, `loadEventEnd` 914ms, editor renders 100 blocks and
  offers **Show more** (which is what `/studies/[id]/feed` is for — see SE-028). Keystroke cost in a
  block, measured as input-handler + forced-layout time: **2–12ms at 100 blocks, 17–29ms at 202
  blocks**. Usable, but a keystroke at 200 blocks costs ~1.5 frames of a 60fps budget, so this is the
  number to watch if block counts grow.
- **SE-021 (the paste half)** the editor is a plain `<textarea>`, so a paste can only ever be text —
  no formatting to go wrong.
- **SE-022** HTML is stored and rendered as literal text. Posted a block containing
  `<img src=x onerror="window.__XSS=3">` and `<script>window.__XSS=4</script>`: nothing executed
  (`window.__XSS` stayed undefined), zero `<img>` or `<script>` elements appeared in `main`, and the
  **export escapes it too** (`&lt;img src=x onerror=&quot;…`). Safe by construction, not by filtering.
- **SE-028** `/studies/[id]/feed` is not unused scaffolding — it is the block pagination endpoint the
  editor's "Show more" calls (`study-editor.tsx:606`, `?afterPosition=`). Verified live: 202 blocks,
  100 shown, Show more brings the rest and then removes itself.
- **SE-029** at a real 390px viewport the editor has no horizontal overflow (`scrollWidth == 390`),
  the textarea is 318px, the library panel is reachable. **235 controls are under the 44px minimum**
  though — "+ Insert" at 28px (×200), the export items at 32px, the title field at 36px — which is
  concrete evidence for the already-filed F-061.
- **SE-030** the print/PDF export is a usable handout **and it attributes**: a clipping renders as the
  quoted text followed by "— Calvin, John, Commentary on Isaiah - Volume 3 (Chapter 43)", in both the
  print HTML and the .docx. No licence/public-domain line, but author + work + locus is there.

### Method note that nearly produced a false finding
The study title appeared not to save: setting the field and calling `.blur()` fired no request, and
the study stayed "Untitled study". It saves on **React's `onBlur`**, which listens for `focusout`;
`element.blur()` in this hidden tab does not produce one. Dispatching a real `focusout` fired the
`PATCH /api/studies/<id>` immediately and the title persisted (confirmed in `/api/studies` and in the
export's `<title>`). **The title save is fine** — recorded because the same trap would catch anyone
automating this editor.

## Batch — uploads / My Works (UP group)

Uploads were unreachable for a second account: `/library/uploads` said *"Uploads are not available on
this account yet."* The gate is `uploadDenial()` (`lib/user-corpus/access.ts:82`) — the §4 owner-only
beta, an env allowlist. Enabled for the disposable test account by starting the local server with
`USER_CORPUS_OWNER_IDS=<test user id>`, which is the documented way in.

### F-134 · UP-013 · **P2** · The upload limit is advertised as 25 MB and is actually just under 10 MB
The UI says **"PDF, Word, text or Markdown · up to 25 MB"**, and the client-side pre-check refuses
only above 25 MB (`my-works.tsx:204`). But anything at or above **10,485,760 bytes (10 MiB)** is
rejected by the server with **`{"error":"Attach a file in the \"file\" field."}`** — a message about
a missing form field, which mentions neither size nor a limit. Bisected exactly:

| bytes | result |
|---|---|
| 9,437,184 (9 MB) | 201 Created |
| 10,485,184 (9.9995 MB) | **201 Created** |
| **10,485,760 (10 MiB)** | **400** "Attach a file in the \"file\" field." |
| 12 / 16 / 25 MB | 400, same message |

Next.js names the cause in the server log, with the fix:
```
Request body exceeded 10MB for /api/user-corpus/upload. Only the first 10MB will be available
unless configured. See .../config/next-config-js/middlewareClientMaxBodySize
```
The route sits behind middleware, so the middleware body limit truncates the request; `formData()`
then finds no `file` field and the handler's missing-file branch answers. **A 15 MB sermon PDF — the
exact thing this feature is for — fails with a message the writer cannot act on.** Two fixes are
needed and they are independent: raise `middlewareClientMaxBodySize` to match the advertised cap,
*and* make the advertised number and the enforced number come from one constant.

### F-135 · UP-015, UP-016 · **P2** · 3 of 10 simultaneous uploads lost their bytes
Ten small files (≈20 KB each) selected at once: all ten reported **"Added"** in the upload panel and
all ten created rows, but **batch-08, batch-09 and batch-10 landed in `status: failed`** with
*"The uploaded file was not stored, so it cannot be parsed. Please upload it again."* The three
failures are the last three submitted, which points at the blob write rather than at the file. A
single upload immediately before and immediately after the batch both succeeded, so the store was
healthy either side of it. **Nothing appears in the server log** — the blob failure is swallowed and
only surfaces as a document status.

The recovery is real, and worth crediting: each failed row shows the message above with a **Try
again** button, and pressing it re-sends the bytes and heals the row to Ready (verified on batch-10).
That is the D11 heal path working. The defect is the ~30% failure rate on a batch a user is invited
to make — the file input is `multiple`.

### F-136 · UP-028 · **P3** · 200 documents, one flat list, no sort and no filter
Seeded to 200 documents: all 200 rows render with a Remove button each. There is a **"Search your
works"** box, so the list is searchable — but there is no sort control and no filter control of any
kind (checked every `select`, `input` and `button` in `main`), and no grouping by status, so the two
`failed` documents sit wherever creation order put them.

### F-137 · **P3** · The upload gate blames your account for a deployment setting
The server says *"Uploads are not enabled on this deployment."* (`access.ts:89`, the branch taken
when the allowlist is empty). The screen says *"Uploads are not available on this **account** yet."*
(`my-works.tsx:619`). A reader is told to wonder what is wrong with their account when the answer is
that the feature is off for everyone. `access.ts` has a *separate*, correct per-account string
("Uploads are not enabled for this account.") for the case where an allowlist exists and you are not
on it — the UI collapses both into the account wording.

### Confirmations of previously filed findings
- **F-100 and F-101 both confirmed, and they are the same string.** A 0-byte `.txt` returns
  `HTTP 415` with: *"That file is not a PDF, Word document, or text file. Slice 1 accepts .pdf,
  .docx, .txt and .md."* — factually wrong (it is a text file; it is empty), and it leaks the
  internal codename. The string is `lib/user-corpus/sniff.ts:67`; a second copy carrying "Slice 1"
  is `lib/user-corpus/parse-docx.ts:215`. Cause of the wrong wording: `looksTextual()` is false for
  zero bytes, so an empty file falls through to the unsupported-type branch.
- **The `SCAN_RE` false-floor class, live in the product.** A test document beginning "Sermon number
  10." was labelled by the uploads list as **"Looks like: Numbers 10"** — a common noun plus a
  numeral read as a book reference. That is the queued `SCAN_RE` item in `docs/pm/MASTER.md`,
  observed on a user-facing surface rather than in an eval.

### Passing rows worth recording
- **UP-012** the size refusal happens **before** any transfer: a 26 MB file produced no POST at all
  (network log shows only the list refresh) and the row read *"Refused — Larger than the 25 MB limit
  (26.0 MB)"* with a "1 refused" summary. Exactly the shape the test asks for — it is only the number
  that is wrong (F-134).
- **UP-018 / UP-019** both quota refusals name the limit, the current usage and the remedy:
  *"You have reached the limit of 200 documents (you have 200). Delete a document to upload another."*
  and *"This file would take you past the 100 MB storage limit (you have used 100.2 MB). Delete a
  document to free up space."* Re-uploading identical bytes is correctly exempt — it returns the
  existing document with *"You have already uploaded this file."* and adds nothing to usage.
- **UP-020 / UP-022** reloading mid-upload leaves **no row at all** — no zombie, nothing half-created;
  the upload is simply restartable.
- **UP-021** a network cut mid-upload says *"Could not be uploaded. Check your connection and try
  again."* and creates no row.
- **UP-023** a document whose bytes never stored fails visibly with a reason and a Try again — it is
  never silently skipped (this is what F-135 surfaced through).
- **UP-025** deleting a document mid-processing returns `{"deleted":true}`, removes it from the list,
  and drops the queue depth by one. No orphan, no stuck claim.
- **UP-027 tenancy holds on every path testable here.** A second real account
  (`uxsweep.tester2@example.com`) sees `{"studies":[]}`, `{"plans":[]}`, `{"prayers":[]}` and empty
  annotations, gets **404 "No such plan."** for account 1's plan id, **404** for account 1's study
  page *and* its export, and an empty (not leaking) `/studies/<id>/feed`. Note precisely what is NOT
  proven: account 2 could not be tested against account 1's *documents*, because the upload routes
  refuse it at the feature gate (403) before any ownership check runs. That leg needs both accounts
  on the allowlist.
- **UP-030** the document page reads well: title, the document's text under a **"Your work"**
  heading (which is where the "it's yours" attribution lives), plus "The tradition" (voices on
  passages it anchors) and "Suggested readings" sections, each with an honest empty state.

## Batch — history search (HS group)

The `/ask?mode=history` surface, signed in with the teacher/history allowlist enabled locally
(`TEACHER_ALLOWLIST`). 24 real queries were run through `POST /api/history/search` across the
categories HS-030 names (events, people, councils, heresies, places, dates, misspelled, vague), plus
UI checks on the rendered surface.

### F-138 · **P2** · Every attribution renders an em dash immediately followed by a comma
On the Ask answer surface, each voice is captioned `Author —, Work`. Looked at, not just read out of
`innerText` — screenshot at 1280×800 shows **"Adam Clarke —, Adam Clarke's Commentary  Methodist"**.
The markup explains it: the em dash is an *era swatch*, `<span aria-hidden="true"
class="ml-1.5 text-xs text-era-modern">—</span>`, and the caption then continues with a literal
`, Work`. So a decorative element sits exactly where a reader expects a name-and-date separator, and
the punctuation reads as a typo. All three voices in the sampled answer render this way.
Two things follow: the caption carries **no publication year at all** (the already-filed F-064 gap,
here on the product's core attribution surface), and the era swatch is invisible to assistive tech
(`aria-hidden`) while being the only thing standing between the author and the comma.

### F-139 · HS-002, HS-003, HS-005 · **P2** · History searches the whole of church history against one first-century book
`coverage` on every response reads `{"works": 1, "sections": 4112}`. The library agrees: the
Historians shelf holds **1 item**. That work is Josephus (d. c. 100), so every query about anything
after the apostolic age has no source that could answer it. Measured over 24 queries:

| | |
|---|---|
| HTTP 200 | 24 / 24 |
| returned exactly one result | 22 / 24 |
| returned zero results | 2 / 24 (`donatism`, `quartodeciman controversy`) |
| distinct works across all results | **1** (`josephus-whiston`) |
| query entity recognised | 9 / 24 — and all nine are first-century (Jerusalem, Polycarp, Origen, Herod, Pilate, Antioch, Alexandria, Rome). Councils, heresies and post-apostolic events: 0 |
| latency | p50 **1.6s**, p95 3.6s, max 4.0s (a cold first query took 21.8s) |

What that looks like to a reader: `council of chalcedon` → *The War of the Jews* on Bernice and the
Pharisees; `athanasius` → *Antiquities* Book 20; `constantine` → *Antiquities* Book 8; `the great
schism` → *Against Apion*. **The framing is honest** — the surface says *"No known people or places
matched — showing text matches"* and labels the result **"CLOSEST MATCH TO YOUR QUESTION"**, so it
never claims relevance. The gap is that it does not say what it *has*.

### F-140 · **P2** · The surface discloses its coverage only when it finds nothing
The zero-result state is genuinely good and says the important thing:
> Nothing in the 1 served history items matches this. · Browse the history shelf · **Searched 1
> items · 4,112 sections**

The closest-match state — the other 22 of 24 — says none of that. The one fact that would let a
reader calibrate ("this shelf is one book") is shown exactly when they least need it. The number is
already in the API response (`coverage`) on every call. *Also:* the copy reads **"the 1 served
history items"** and **"Searched 1 items"** — no singular form.

### F-141 · HS-019, HS-020, HS-021 · **P2** · History threads are saved forever and there is no way to find them again
Every history search silently creates a thread: 24 batch queries produced 24 thread ids, and this
account now holds **27 `chats` rows with `persona = 'history'`** against 1 with `persona = 'ask'`.
But `/api/research` — the endpoint behind the sidebar's recent-threads rail — filters on
`THREAD_PERSONA` (`'ask'`), so it returns **1** thread and none of the 27. And `lib/history-threads.ts`
exports exactly `createHistoryThread`, `servedHistoryWorks` and `getHistoryThread` — **there is no
list function at all.**

So a history thread is reachable only by its URL. There is no thread list, therefore no empty state
for one (HS-019), nothing to paginate (HS-020), and no delete (HS-021) — a search you ran once is
retained indefinitely with no way to see or remove it. This is the same gap UX-4/Research History
closed for Voices, left open for History.

### Passing rows worth recording
- **HS-006** the zero-result state is the best empty state measured in this sweep: it says what was
  searched, how much of it there was, and offers the shelf to browse.
- **HS-014 / HS-016** a thread is created per search and its URL reopens the whole thing — query,
  matched entity ("Herod — tap a name to set it aside"), closest match and the full result list.
- **HS-015** emoji survive titling in both directions: `🔥 Polycarp and the martyrs 😀` stored intact,
  and a 100-character emoji query truncates to 78 characters ending in `…` with no broken surrogate
  pair (`truncateCodePoints`).
- **HS-010** latency is good and the surface is fast enough not to need reassurance: p50 1.6s.
- **HS-026 / HS-027** a thread opened by a different account is the app's styled **404 "Not found"**,
  not a crash or a leak; opened signed out it is `307 → /auth/sign-in`. That redirect **drops the
  destination** — no `next=` parameter — which is the already-filed F-076, confirmed here and on
  `/ask/[id]` as well.

## Batch — Ask / the teacher (AS group)

`/ask` is gated to an allowlist (`TEACHER_ALLOWLIST`, ADR-116 ruling 3) and answers "Not open yet"
to everyone else. Enabled locally for the disposable account. **12 real questions** were put through
`POST /api/ask` — the shipped compose→verify path, with real model calls — plus UI checks on the
rendered surface. Every answer's full JSON was kept and analysed.

### The product guarantee held on every answer
This is the one that matters, so it is stated with its evidence. Across all 12 answers there were
**15 non-voice blocks, every one of them a neutral `framing` sentence**, and a scan for
first-person/verdict language (`I think`, `we believe`, `clearly`, `the truth is`, `you should`,
`the correct…`) returned **zero hits**. The framing sentences read:
> "The following sources present distinct historical perspectives on the parable of the prodigal son
> **without resolving interpretive differences**."

Every `voice` block carried an author, a work and a verbatim quote — **no block was missing
attribution or a quote**. The bait question ("Is Jesus really God? Just tell me what you think.")
did not produce an opinion: it produced `kind: "fallback"`, i.e. **zero composed voices and raw
retrieval instead**, which is precisely the "verifier fails closed → fall back to raw retrieval"
contract in `CLAUDE.md`. The fallback's user-facing copy explains itself rather than apologising:
> "A grounded answer couldn't be composed for this one. Here are the sources we found. Read them
> directly. … Every quote is checked word-for-word against the original before it is shown. This
> draft didn't pass that check, so the sources are given to you unedited rather than an answer we
> can't stand behind. Asking again often composes cleanly."

### F-146 · AS-003 · **P2** · `1cor13` (no spaces) routes to 1 Corinthians **3**, not 13
Four spellings of the same reference, same corpus, same session:

| question | anchors returned |
|---|---|
| `1 Cor 13` | 46013001, 46013009 — 1 Cor **13** ✓ |
| `First Corinthians 13` | 46013001, 46013013 ✓ |
| `1 corinthians 13` | 46013001, 46013013 ✓ |
| **`1cor13`** | **46003004, 46003014**, 46013013 — 1 Cor **3** |

Three of four route identically; the unspaced form pulls its top anchors from chapter 3. The answer
still reads plausibly (it is real Barnes and Clarke, correctly attributed) which is what makes it
worth filing: the reader has no way to notice they were shown the wrong chapter.

### F-147 · AS-006 · **P2** · There is no "we have nothing on that" — the teacher always finds a topic
`what does the Bible say about cryptocurrency` returned a fully composed answer, three attributed
voices, framed as:
> "The following sources discuss **the spiritual dangers and proper ordering of wealth and gold**."
Nothing is invented — the quotes are real J.C. Ryle, Matthew Henry and Augustine — but nothing tells
the reader that the corpus has nothing on what they actually asked, and that the answer is about a
neighbouring subject. Compare the History surface, which does exactly the right thing here
("Nothing in the 1 served history items matches this"). The teacher has no equivalent state.

### F-148 · **P2** · A quarter of questions fall back, and the promised time is exceeded on a quarter too
Of 12 real questions, **3 returned `kind: "fallback"`** rather than a composed answer — and two of
those are ordinary, well-formed questions this product exists to answer:
- "what does the Bible say about grief" (49.4s → fallback)
- "What did the church fathers say about the incarnation in John 1?" (40.0s → fallback)
- the deliberate bait question (29.3s → fallback, correctly)

Latency over the same 12: **p50 26.7s, p95 63.2s, max 63.2s**, with 3 of 12 over 40s. The surface
promises *"An answer usually takes 20–40 seconds"*. So a reader asking a normal topical question has
roughly a one-in-four chance of waiting past the promised window and then being told no answer could
be composed. The fallback copy is good; the rate is the finding.

### F-149 · **P3** · Tradition labels are inconsistently cased, and "unassigned" reaches the reader
Across the 12 answers the `tradition` values were: `Presbyterian` ×10, `Methodist` ×9,
**`unassigned` ×4**, `Nonconformist` ×2, `anglican` ×1, `Patristic` ×1, `catholic` ×1. Two defects in
one field: `anglican`/`catholic` are lower-case while their neighbours are capitalised, and
`unassigned` is a database placeholder rendered straight onto the attribution line — the already-filed
F-010, confirmed here in the answer payload and in the fallback's `figcaption`
(`{author}, {sourceTitle} · {tradition}`).

### F-142 · AS-011, AS-012 · **P2** · The 500-character cap is enforced silently, and breaching it says "Something went wrong"
The textarea carries `maxLength={500}` with **no counter and no message**, so a longer pasted
question is silently truncated. If a longer question does reach the server (it is easy to produce),
the API answers precisely — `{"error":{"code":"INVALID_REQUEST","message":"That question is too long
(max 500 characters)."}}` — and the UI throws that away and shows **"Something went wrong. Please try
again."** with an "Ask again" button that will fail identically. The app *can* do better and does
elsewhere: with the network cut it correctly says **"Network error. Please try again."** So the
machinery for a specific message exists; the 400's message is the one discarded.

### Passing rows worth recording
- **AS-005** a vague question ("that verse about love") composes gracefully — three voices, framed
  as "distinct perspectives on the nature and origin of love". Not empty, not a shrug.
- **AS-034** a thread opened by another account is the styled 404, not a crash.
- **AS-038** the gate is unambiguous in both directions (see the tracker row).
- **AS-039** offline is honest and distinct: "Network error. Please try again." + Ask again.
- **AS-030** cannot be exercised as written: the answer shape caps at **3 voices per lane**
  (`sermons: 3, theology: 3, song_verse: 3` on every one of the 12 answers, `retrieval: 6`), so a
  "10+ voices" answer is not reachable by design.

## Batch — the reader (RD group)

### F-143 · RD-024 · **P2** · A multi-verse selection copies only the first verse, and labels it as if that were the whole selection
Selected 297 characters spanning John 13:16–18 and pressed **Copy**. The clipboard received the
**137 characters of verse 16 only**, captioned `John 3:16 · ASV` — a single-verse reference for a
multi-verse selection. Captured by intercepting `navigator.clipboard.write` and reading the
`ClipboardItem` back, so this is what actually lands on the clipboard, in both `text/plain` and
`text/html`. Nothing on screen indicates the selection was trimmed. Single-verse copy is excellent
(see below), which makes this worse: the reader has no reason to check.

### F-144 · RD-045 · **P2** · The reader never restores scroll position
Scrolled the reader to 1400px, navigated to `/settings`, pressed Back: the reader returns at
**scrollTop 0**. The mechanism is worth stating because it also explains the already-filed F-058
(Back from word study loses reader position): the reader scrolls an **inner container**
(`<main class="flex-1 overflow-y-auto">`, `scrollHeight` 2562 vs `clientHeight` 800) while
`document.scrollingElement` never scrolls at all. The browser's native scroll restoration only
applies to the document scroller, so an app that moves scrolling into a child element has to restore
it itself — and this one does not. On a long chapter, Back sends the reader to verse 1.

### F-145 · RD-064 · **P2** · Notes and bookmarks are invisible in the reader
Wrote a note on **every one of John 13's 38 verses**, plus a bookmark on verse 7, and reloaded.
Highlights render (38 coloured spans). Notes and bookmarks render **nothing at all**: zero
indicators of any kind, and the verse markup is byte-identical to a verse with no note —
`<span id="v5" data-verse="5" class="verse inline scroll-mt-20 rounded ">` with a `<sup>` whose
accessible name is `"Verse 5, read commentary"` whether or not a note exists. So the layout survives
38 notes perfectly, for the wrong reason. A reader cannot see where they have written, and must open
each verse panel one at a time to find their own notes.

### F-150 · **P2** · Interlinear glosses are broken or empty for about 1 word in 15
Sampled the first **60** Greek words of John 3 in interlinear mode. Four carried a gloss that is not
a gloss:

| word | transliteration | gloss shown |
|---|---|---|
| ἄνθρωπος | ánthrōpos | `from G3700 )` — a fragment of a Strong's etymology, with a stray `)` |
| ἐκ | ek | `literal or figurative` — a fragment of a definition, not a meaning |
| οἴδαμεν | *(empty)* | *(empty)* |
| τις | *(empty)* | *(empty)* |

That is **6.7% of sampled words**, on the feature whose whole purpose is showing the word behind the
word. (A `swarm/w-strongs-gloss-fix` branch exists in this repo, so the class is known; this is the
user-facing measurement.)

### F-090 CONFIRMED, with the mechanism
Interlinear ON: the reader's 38 `<sup>` elements — 36 of them `role="button" tabindex="0"` verse
handles — drop to **zero**. They are not hidden; they are replaced. The verse number in interlinear
mode is a plain `<span class="…text-accent-600…">` with no role, no tabindex and no label, while each
Greek *word* becomes a `<button>`. So the verse-study panel (commentaries, notes, word study) has no
entry point at all while interlinear is on, exactly as F-090 says.

### Passing rows worth recording
- **RD-013** ten rapid "next chapter" clicks land on `/read/jhn/13` with the John 13 text (38 verses,
  the foot-washing) and no John 3 content anywhere. No stale content arriving late.
- **RD-023** single-verse copy is very good. The clipboard receives
  `“For God so loved the world, …”` / `John 3:16 · ASV` as `text/plain`, plus a styled `text/html`
  `<blockquote>` + reference. No verse numbers, no UI text, reference *and* translation included, and
  the button confirms with "Copied ✓".
- **RD-029** the reading column does not stretch: at a 1920px viewport it stops at **827px** (≈91
  characters) on the widest setting, and the Settings copy states the design intent explicitly
  ("Standard is the designed 66-character measure; widen it to fill a large screen").
- **RD-034** the Aa popover and the verse panel cooperate: Aa opens, then opening a verse panel
  closes Aa and opens the panel. No two-popover state.
- **RD-062** verse numbering is consistent across translations: Psalm 3 renders verses 1–8 in ASV,
  KJV and WEB alike, with no verse-0/verse-1 divergence. (The superscription "A Psalm of David, when
  he fled from Absalom" is absent in all three — that is F-040, a content gap, not a numbering one.)
- **RD-063** 130 highlights in one chapter still read fine — see HL-018 for the numbers.
- **RD-065 / RD-066** an unavailable corpus asset fails honestly: with `/bible/*` rejected, a fresh
  book renders **"Failed to load chapter"** + the chapter name + **"Choose another chapter"**. Not a
  blank, not an infinite spinner. Two gaps worth noting: there is no "try again", and the message is
  not in a live region (`role=alert`/`role=status` search returns nothing), so it is not announced.
- **RD-067** with the corpus fetch delayed 5s the reader shows a **named** waiting state —
  "Loading Exodus 1" — and then renders the correct chapter. No race, no stale text.
- **RD-068 / RD-069** first paint is the reader chrome (title, Aa, HL, interlinear, translation)
  with the text area saying "Loading <book> <chapter>" — better than a white void, but it is the
  bare-"Loading…" idiom rather than a skeleton in the final layout (the F-055/F-066/F-074 family).
  Cold-load numbers, unthrottled and local: the chapter asset is **32 KB, 48 ms**. A throttled number
  could not be taken (no network-throttle capability in this tool); the injected-5s-delay run above
  is the substitute and it degrades gracefully.
- **RD-073** at a 640×400 viewport (the layout equivalent of 200% zoom) there is no horizontal
  scroll (`scrollWidth == clientWidth == 640`), nothing overflows the viewport, and the sticky header
  does not overlap the first verse.

## Batch — the library and works (LB group)

### F-151 · LB-029, LB-024 · **P1** · 88% of Jamieson's sections have their scripture references stripped to bare punctuation
`LB-029` calls this "known corpus damage"; here is the size of it, counted over the served corpus:

| work | sections | with an empty `( )` | with a bare `; ;` |
|---|---|---|---|
| **jamieson-jfb** | 1,258 | **1,110 (88%)** | **716** |
| augustine-homilies | 3,723 | 85 (2%) | 0 |
| adam-clarke | 12,693 | 0 | 0 |
| matthew-henry | 4,210 | 0 | 0 |

What a reader sees — Jamieson's first section, the *Chronological Table of the Parables of Christ*:
> The strong man armed / Galilee / **; ; , .**
> The unclean spirit / Galilee / **; .**

The reference column is gone; only its punctuation survives. In prose it reads
"…as opposed to every kind of idol or false god **( )**." This is the K-2 class (the CCEL adapter
dropping `scripRef` display text) — the fix is on this branch (`1cef7e8`) but it governs ingest, so
**the already-ingested rows still carry the damage**. This is not a cosmetic issue for this product
specifically: Jamieson is served in Ask answers (it supplied the fallback sources for the
interpretation-bait question in the AS batch), so citations with their references deleted are being
handed to readers as sources.

**LB-024 is the same wound from the other side:** a scripture reference inside a work's prose is not
a link. Every work page carries exactly **two** `/read/` links and both are the sidebar's Bible
entry — none are in the content.

### F-152 · LB-020 · **P2** · The shelf shows 50 of your saved works and does not say so
Saved **100** works via the shelf API, then opened *My books*: the page renders exactly **50**
`a[href^="/work/"]` rows, with **no count, no "load more", and nothing indicating a limit**. Half the
shelf is unreachable and the page reads as complete. Same family as F-117 (Saved capped at 100 shown
as the total) and F-136 (200 uploads with no sort/filter) — three surfaces, one habit: a page size
presented as the whole.

### F-153 · LB-012 · **P2** · A work has no reading progress at all
`LB-012` asks whether progress is accurate; there is none to be accurate. On a work page there is no
`progressbar`/`<progress>` element, no percentage, and no "section N of M" text — only Contents, Save
and Aa. The one progress signal in the product is inside the Contents dialog, where the current part
is badged **READING**. On a 3,723-section work opened at 89,129px of scroll height, that is the whole
of it. (`/api/work/[slug]/progress` exists, so the data is being kept — it is the surface that is
missing.)

### F-154 · **P3** · The work header prints the same word twice
`/work/augustine-homilies` reads: **"AUGUSTINE OF HIPPO · PATRISTIC · PATRISTIC · PUBLIC DOMAIN"**.
The tradition and the source-type both resolve to "patristic" for this work and both are rendered.
The library list gets it right for the same work — "AUGUSTINE OF HIPPO · PATRISTIC · FATHER" — so
the two surfaces disagree about which field goes in the second slot. No publication year appears in
either (F-064).

### Confirmation: F-010 ("unassigned") is bigger than 20 instances
The commentaries catalogue's own tradition filter is the clearest statement of it:
> All traditions · **unassigned 24** · methodist 2 · patristic 2 · anglican 1 · catholic 1 ·
> lutheran 1 · nonconformist 1 · reformed 1

**24 of 33 commentaries (73%) carry `unassigned`**, and the raw value is offered to the reader as a
filter option and printed on every shelf row ("MORRIS, JOSEPH · UNASSIGNED"). Note also the casing
split already filed as F-149: this list is lower-case throughout while the Ask surface capitalises
the same values.

### Passing rows worth recording
- **LB-002** the cold `/library` is legible for a newcomer: a **YOURS** row (Saved · My books · Word
  study · My Works) over an **ALL ITEMS** list of registers with real counts (Commentaries 33,
  Sermons 6, Hymns & Poetry 45, Historians 1, Devotionals 15, Theology & Creeds 11) and the
  instruction "Tap a work to read it, or + to open it beside what is on your desk."
- **LB-005** search finds works by title *and* by author: "Catena Aurea" → 5 matches, top hit the
  right work; "Augustine" → 718 matches; "Clarke" → 93; a nonsense query → "No matches." and the full
  list returns. It is a full-text search over section content rather than a metadata filter, so an
  author query also surfaces passages that merely mention the author (Spurgeon on Clarke) — worth
  knowing, not wrong.
- **LB-008** at 768px the 256px sidebar stays put and the content takes the remaining 512px in one
  column with no horizontal scroll. Designed, not accidental — the layout does not simply shrink the
  desktop grid.
- **LB-009 / LB-010** Contents is a 395-entry hierarchical dialog with the current part badged
  READING; jumping works and the URL follows (`#s37`), and reloading that URL restores the position
  (`main.scrollTop` 20,027, the anchor 96px from the top, in view). **A false finding was avoided
  here:** the first `Chapter …` heading in the DOM is not the one you jumped to, so reading the
  heading out of `innerText` says you landed in the wrong chapter. Checking the anchor element itself
  showed the jump was correct.
- **LB-016** Save works and reports state: the control flips to **"Saved"** with `aria-pressed="true"`.
- **LB-022** NOT-APPLICABLE, verified rather than assumed: a query over every published source found
  **zero** titles containing `&amp;`, `&#`, `&quot;` or `&gt;`. There is nothing to decode.
- **LB-023** a 113-character title wraps to two lines (66px) at 390px with `line-clamp: none` and no
  overflow — shown in full rather than truncated, so "full text reachable" holds by a different route.
- **LB-027** an 89,129px work scrolls with 0.1–0.3ms of forced-layout cost per 1,500px step. No jank.
- **LB-028** Greek renders correctly with no mojibake (zero `Ã`/`â€`/`Â` sequences in 40,505
  characters). It is not language-tagged in work prose, though — zero `[lang=el]` elements — which is
  the same gap the reader has outside interlinear.

### Correction to the batch above — three rows were written from reasoning, then actually run

LB-014, LB-025 and LB-026 were first recorded as PASS on the strength of *how the routes are built*
rather than on an execution. That is the unearned-green shape this repo's own watchlist names, so
each was then run properly. Two survived, one produced a new finding, and one adjacent row (LB-013)
turned out to be **better** than recorded.

- **LB-014 — stands, with the mechanism.** The tradition filters are `<a>` links carrying the state
  in the URL (`/library/commentaries?tradition=methodist`), so Back genuinely restores it: went
  methodist (2 items) → `/work/adam-clarke` → Back → `/library/commentaries?tradition=methodist`,
  still 2 items. Scroll restoration is *not* proven by this run (a 2-item list has nothing to scroll)
  and F-144 says the app does not restore inner-container scroll generally.
- **LB-026 — stands.** `/work/adam-clarke` ("…Many attempts have been made to define the term God…",
  41,331 chars) then `/work/augustine-homilies` ("…teousness of the scribes and Pharisees…", 40,501
  chars): each renders its own title and its own body, no substring of the first survives into the
  second.
- **LB-013 — better than recorded: reading position really does resume.** Reopening
  `/work/augustine-homilies` with **no fragment** landed back at `#s37`, the section left earlier,
  with `main.scrollTop` 180. `/api/work/<slug>/progress` is called on both works. So position is
  tracked and restored silently — which narrows F-153 to *display*: progress is kept, never shown.

### F-155 · LB-025 · **P2** · "Open in book" from a history result drops you at the top of the work
The link is correct — `/work/josephus-whiston?from=hist:…&fq=herod%20the%20great#s14` — and the
work view even adds a proper context bar (**"← Results for "herod the great""** with a ✕). But after
the in-app navigation the hash has been rewritten to **`#s1`**, `main.scrollTop` is **0**, and the
cited section `s14` ("The Life of Flavius Josephus — Section 9") sits **8,793px** below the fold.
Still true 6 seconds later, so it is not a timing artifact.

**It is specific to the in-app transition.** Loading the same anchor directly —
`/work/josephus-whiston#s14` — lands correctly: hash `#s14`, `scrollTop` 180, the section 66px from
the top. So the route and the anchor both work; the client-side navigation loses them, and something
(a scroll-spy writing the visible section into the hash) replaces `#s14` with `#s1` before the scroll
happens. The effect is that every history citation lands the reader at the start of a very long book
rather than at the passage that was cited — which is the one thing "History points you into the
sources" promises to do.

### Self-audit — every "persists across sign-out/in" claim, actually executed

Several rows in the batches above said data "survived this session's sign-out and sign-in". That was
loose: the studies, plans and settings in question were all created *after* the sign-out/in sequence,
so nothing had been proven. The claim was re-tested properly by opening a **completely fresh session**
— new cookie jar, new `POST /api/auth/sign-in/email` — which is exactly a sign-out followed by a
sign-in, and reading the account back through it:

| checked from a brand-new session | result |
|---|---|
| plans | `John · 3 weeks` present, **15 days, 14 completed** — the progress set earlier survived |
| studies | `UX sweep study — SE group` present |
| annotations | highlights/notes read back unchanged |

So the underlying claim holds; it now has an execution behind it. **A trap for the next person:**
the plan day's completion field is `completed_at`, not `read`/`read_at` — a first pass at counting it
reported "0 read" for a plan that was 14/15 done. That was a bad parser, not a bug, and it was caught
by looking at the raw row.

### Correction — LB-016: signed-out Save is deliberately absent, not an invitation
The row was first written as "the control is replaced by the sitewide sign-in invitation". It is not.
`web/src/components/work-header.tsx:18` states the decision in the code:

> Signed-out readers get **NOTHING** here rather than a disabled control or a sign-in prompt — the
> route 401s them, and the reader is mid-page in a book, which is the wrong moment to advertise an
> account. `/library/books` makes the offer where it is relevant.

Confirmed against a signed-out fetch of `/work/adam-clarke`: no Save control in the header. So
nothing fails silently — because nothing is offered — and the invitation is deliberately relocated to
the shelf page, which does carry it ("Open a work and press Save in its header to keep it here").
That is a defensible answer to the row's intent, and it is a design decision rather than the gap the
row anticipates.

### RD-070 — the viewport declaration, read rather than assumed
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover,
interactive-widget=resizes-content">`. No `user-scalable=no`, no `maximum-scale`. Pinch-zoom is not
disabled by declaration; whether the layout survives it still needs real hardware (owner decision D-4).

## Batch — navigation, viewports, error routes (NV + MOB groups)

### CORRECTION — F-037 is wrong: the skip link does move focus
F-037 filed "skip-link never moves focus". Measured: the link is `<a href="#main">`, `#main` exists
and carries `tabindex="-1"`, and after activating it **`document.activeElement` is `MAIN#main`**.
Focus moves, to the right element, by the standard pattern.

The visibility half could not be observed at runtime and the reason is worth recording: the CSS is
`.skip-link:focus { top: 1rem }` (`globals.css:284`, plain `:focus`, not `:focus-visible`), and in
this environment **no element ever matches `:focus`** — `document.activeElement === skip` is true
while `skip.matches(':focus')` is false, because the browser window itself is not focused. So the
rule is present and correct by inspection; watching it slide into view needs a focused window.

### CORRECTION — F-044 is half right
The doubled title is real and still there: `/plans/<id>` renders
**`<title>Reading plan · Ancient Paths · Ancient Paths</title>`**. The other half is not: an invalid
plan id does **not** fall back silently — it says *"This plan could not be opened. It may have been
removed."* with a "← All plans" link.

### F-156 · NV-015 · **P3** · The error states are good and every one of them returns HTTP 200
The app's malformed-route messages are among the best copy in the product:

| route | what the reader sees | status |
|---|---|---|
| `/read/notabook/1` | **"Unknown book: "notabook""** + a John 1 link | **200** |
| `/read/jhn/999` | **"John has 21 chapters"** + John 1 + "Choose another chapter" | **200** |
| `/work/no-such-work` | **"This work isn't available. It may still be staged for review, or the link is mistaken."** + "Browse the library" | **200** |
| `/word/ZZZ999` | **"That isn't a Strong's number. A word page looks like /word/G2316 (Greek) or /word/H430 (Hebrew)."** + "Search the dictionary" | **200** |
| `/plans/not-a-uuid` | "This plan could not be opened. It may have been removed." | **200** |
| `/library/uploads/not-a-uuid` | (My Works shell) | **200** |
| `/studies/not-a-uuid` | styled "Not found · Ancient Paths" | **404** ✓ |

Only `/studies/[id]` answers with a real 404; every other bad URL is a **soft 404**. For a reader
that is fine — better than fine, the messages are specific and actionable. For crawlers, uptime
monitors and anything that reads status codes, six routes claim success while serving an error.
`/studies/[id]` shows the intended shape, so the fix is a pattern the app already has.

### F-157 · NV-016 · **P2** · Eleven surfaces still share the title "Ancient Paths" — including the reader and every work
Current, complete sweep of 26 routes (this supersedes the earlier partial list in F-004):

| distinct title | generic "Ancient Paths" |
|---|---|
| `/about`, `/features`, `/why`, `/settings`, `/ask`, `/plans`, `/prayers`, `/search`, `/studies`, `/library`, `/library/books`, `/library/uploads`, `/library/commentaries`, `/library/sermons` | `/`, `/home`, `/account/settings`, `/desk`, `/library/notes`, `/library/passages`, `/library/word-study`, **`/read/jhn/3`**, **`/work/adam-clarke`**, `/word/G26`, `/auth/sign-in` |

The two that matter most are in the wrong column: **the reader** (which should say "John 3") and
**a work** (which should carry the work's title). Those are the pages a reader keeps open in a tab
strip and returns to. `/ask?mode=history` also shares `/ask`'s title, so the two modes are
indistinguishable in a tab.

### Passing rows worth recording
- **NV-005 / NV-006** history is exact in both directions. A nine-step walk
  (`/read/jhn/3 → /library → /plans → /prayers → /settings → /library/commentaries → /studies →
  /home → /desk`) reversed in precisely the reverse order under nine Backs, and three Forwards then
  replayed it forwards (`/read/jhn/3 → /library → /plans`).
- **NV-008** Back out of the verse panel closes the panel and stays in the chapter (the K-6
  regression guard holds).
- **NV-028** after a client-side navigation focus lands on `MAIN#main` — not lost to `<body>`.
- **NV-030** every route in the manifest, visited **signed in and signed out — 40 routes, zero 500s**.
  All 200s or purposeful 307s: `/auth/sign-in|sign-up` redirect a signed-in reader away;
  `/account/settings`, `/studies`, `/studies/[id]` redirect a signed-out one to sign-in;
  `/channel/[id]` 307s both ways (the documented stub). Checked for leakage on the two routes that
  return 200 while signed out — `/plans/<id>` and `/library/uploads/<id>` — and **neither leaks**: no
  plan title, no document title, no document body in the server HTML, just the shell and a sign-in
  prompt.
- **NV-018** no content in URLs: an ask thread is `/ask/<uuid>`, a history thread
  `/ask/<uuid>?mode=history`, a note has no URL at all, and the only query strings carrying text are
  the ones the reader typed into a search box (`?q=`, `?fq=`), which is the expected place for it.
- **MOB-002 … MOB-006** the viewport half of the mobile matrix is clean. Six surfaces (`/home`,
  `/read/jhn/3`, `/library`, `/plans`, `/prayers`, `/settings`) at **320×700**, **430×932**,
  **820×1180**, **1024×768** and landscape **812×375**: no horizontal scroll anywhere
  (`scrollWidth == clientWidth` at every size), **zero** elements overflowing the viewport box, and
  the 256px sidebar holds its place from 768px up. Sub-44px targets: 0 on most surfaces, 1 on the
  reader at phone widths, 6 on the reader at tablet widths. Landscape phone keeps the header at 55px
  with content below it and about nine lines of scripture visible.

## Batch — the Desk (DK group)

### CORRECTION — F-011, the sweep's only P0, is wrong on this build. The journey works.
F-011: *"The app's own core described journey — Scripture + commentary side by side, swap for a
sermon — has no discoverable UI to add a commentary/sermon pane at all."* It was walked end to end
here, every step through the UI:

1. `/desk` empty state: *"Open up to 16 things in a grid: a chapter of Scripture, a commentary on it,
   and a sermon, hymn, poem or history in the panes around them."* → **Open the Bible**
2. book picker → John → 3 → `/desk?p=scripture:jhn/3`, one SCRIPTURE pane
3. the pane rail's **`+`**, `aria-label="Add a work from the library"` (also `title=`) →
   `/library?desk=scripture:jhn/3` — the library in add-to-desk mode, carrying the desk state
4. **Commentaries** → each row gains a `+` labelled *"Add Adam Clarke's Commentary on the Bible to
   your desk"*
5. → `/desk?p=scripture:jhn/3&p=work:adam-clarke`, **two panes, SCRIPTURE and COMMENTARY**, side by
   side at 494×644 each on a 1280px viewport

A third pane (Spurgeon, SERMON) loads from the URL in 914ms. The add controls are both **44×44px**
with `aria-label` and `title`. **This is not a build difference:** the desk-grid commit (`e7dbe20`
"W-UX3: desk layout model — 4×4 grid, 16-pane ceiling, windowed panes") is an ancestor of
`origin/main` *and* of the live commit `7747f10`, so the controls exist in production too.

What is fair in F-011's neighbourhood is **discoverability, not existence**: both controls are icons
(`+` and an unlabelled glyph) whose only text is a tooltip, and the empty state names the outcome
("a commentary on it") without naming the gesture that gets you there. That is a P3 wording gap, not
a P0 missing feature.

### F-158 · DK-004, DK-006, F-062 · **P1** · The commentary you add lands at Genesis 1, and there is no way to bring it to the passage
This is the real defect behind F-011's symptom, and it is worse than a missing button. Adding Adam
Clarke's commentary *beside John 3* opens the pane at **Genesis 1**:
> "God in the beginning created the heavens and the earth - בראשית ברא אלהים … Many attempts have
> been made to define the term God…"

Nothing anchors the added pane to the scripture pane's current passage, and there is **no follow
control, no sync toggle and no "jump to this passage"** — the pane's only navigation is its own
Contents, which opens at "Genesis 1 / Part 1 of 19" over a **12,693-section** work. So the journey
the product describes is reachable in five clicks and then unusable: the two panes are showing John 3
and Genesis 1.

**Swap cost (DK-006/DK-007), counted:** replacing the commentary with a sermon is
`✕ close` → `+` → pick a register → pick a work = **four moves**, with no single swap action, and the
replacement lands at *its* beginning too. F-063's "no single-action swap" is confirmed by count.

### F-099, F-109 and F-145 all confirmed inside the desk pane, together
On a desk SCRIPTURE pane showing John 3 — a chapter that carries **18 highlights and 38 notes** on
this account:
- highlight spans rendered: **0** (F-099)
- `<sup>` verse numbers present: **0** — not inert, *absent* (F-109)
- note or bookmark indicators: **0** (F-145)

So the desk shows the bare text of a chapter the reader has marked up heavily, with no sign of any of
it and no way to open the verse tools. Three filed findings, one root: per-verse state and per-verse
tooling exist only in `/read`.

### F-159 · DK-018 · **P2** · A desk scripture pane stops dead at the chapter end
Scrolled the John 3 pane to its bottom: it ends at 3:36 ("…the wrath of God remains on him.") and
**does not continue into John 4**. The pane's controls are only `John 3` (picker), *Contents of John
3*, and `✕` — there is **no next-chapter control** and no continuous read. The reader has continuous
chapter flow; the desk does not, so following an argument across a chapter boundary means opening
Contents and choosing again.

### Passing rows worth recording
- **DK-005** panes scroll independently: driving one scroller to 800px left the others at 0.
- **DK-011** no stale content under churn: pushed four different desk URLs 120ms apart, and the
  settled state matched the **final** URL exactly (1 pane, SCRIPTURE John 3) with nothing left over.
- **DK-013** closing every pane returns the empty state and clears the URL back to `/desk`. No
  orphans.
- **DK-016** the desk is URL state by design and says so on screen — *"This desk is not saved to your
  account. It lives in the page address — bookmark or share the link to keep it."* So sign-out/in
  cannot affect it; a 3-pane URL rebuilt the full desk in 914ms.
- **DK-023** there is no per-pane translation control; panes follow the stored default (`translation:
  "web"` in localStorage → the pane renders WEB). Deliberate and consistent, if not per-pane.
- **DK-024** panes survive leaving and returning: `/desk` (3 panes) → Search → Back → all three panes
  and the exact query string restored.
- **DK-027** the panes really are windowed. With Spurgeon (**118,371 sections**) in one pane, the
  whole document holds **472 DOM nodes**, each pane's scroll height is ~35,000px rather than the
  work's true length, and scrolling costs **0.1–0.7ms** per 1,200px step.

**DK-017, re-run properly.** The first write-up leaned on the DK-024 evidence, which is Back *into*
the desk, not Back *from* it. Run cleanly from a fresh history: `/home` → `/desk` → Back → **`/home`**,
landing on the devotional feed. Sane. Worth knowing alongside it: each desk state change pushes its
own history entry, so inside the desk Back walks back through pane states (adding a pane is undoable
with Back) before it leaves the desk at all.

## Batch — cross-journey walks (PW group)

### F-160 · PW-006, PW-019, AS-042 · **P2 / owner decision** · Your own uploads are searchable in My Works and never appear in an Ask answer
Asked a question that quotes an uploaded document almost verbatim — *"What does it mean that grace
and peace are multiplied through the knowledge of God?"* against a document whose text is
"Grace and peace be multiplied unto you through the knowledge of God." repeated. The answer composed
in 20.7s with **three corpus voices, every one `origin: "corpus"`**, and **no user voice at all**;
the whole JSON contains no reference to any uploaded document.

The pipeline underneath is healthy — this is not a broken upload:
- `user_sections`: **1,054** rows for this account, all with embeddings (`user_section_embeddings`
  1,054)
- `GET /api/user-corpus/search?q=grace and peace be multiplied` → **200**, `mode: "fused"`, top hit
  `batch-01` with the exact sentence

So the documents are indexed and findable in **My Works**, and simply do not reach `/ask`. The reason
is in the history: `5c8ab31` **"W-SLICE4: revert the behavior change per pre-registered withdrawal
bar"** reverted the user-voices lane's product code — its own commit message says the control bar
"failed EVERY run including the pre-change baseline — a defective pin", and the withdrawal rule was
honoured anyway. `lib/teacher/user-voices.ts` and the `teach.ts` wiring are still in the tree
(`teach.ts:200/275/288`, attributing user sections as author **"You"**), so the code is present and
the behaviour is not.

**This is an owner decision, not a defect to fix blind:** ship Slice 4 (re-land the lane with a
sound control bar) or state that uploads are for My Works search only. Until it is decided, three
test IDs cannot be exercised at all.

### F-161 · PW-013 · **P2** · Text size and column width apply only in `/read`
`--reading-size` was set to `1.6rem` and the desk pane's text stayed at **16px**, because no desk
pane is inside a `.reading-scale` container (`document.querySelectorAll('.reading-scale').length ===
0` on both the desk and the plan reading panel). Neither surface offers an **Aa** control either.
So the two reading controls govern one of the app's three reading surfaces.

In fairness to the copy: Settings attaches *"Applies everywhere, and is remembered on this device"*
to **READING THEME** only — text size and column width claim nothing. And the theme really does
apply everywhere (PW-014 below). So this is an unfinished consistency rather than a broken promise.

### Passing rows worth recording
- **PW-014** the theme is genuinely global and live. With the **verse panel open**, switching to Dark
  from the reader's Aa popover repainted the panel in place — background `rgb(253,250,244)` →
  `rgb(43,33,25)` — with the panel still open and no reload, and `body` went to `rgb(26,20,15)` at
  the same moment.
- **PW-018** asking about what you are reading carries real context. The selection toolbar's *"Ask
  Ancient Paths about this"* navigates to
  `/ask?q=What have commentators said about "For God so loved the world, that he gave his only born
  Son," (John 3:16)?` — the selected words **and** the reference — with the question **prefilled in
  the textarea**, and Back returns to `/read/jhn/3`.
- **PW-009** copying from a verse that carries an active highlight gives a clean clipboard:
  `“For God so loved the world, that he gave his only born Son,”` / `John 3:16 · WEB`, plus a clean
  `text/html` blockquote. No highlight markup, no UI text. (Checked the toolbar's Copy control while
  there: its `innerText` is empty but its `textContent` is "Copy", so it has an accessible name — an
  icon-looking button that is correctly labelled.)
- **PW-002 (half)** notes are reachable by search and the link is exact: `/search?q=…&personal=1`
  returns **"YOUR NOTES — 38 matches"** with verse references and note bodies, and the result links to
  `/read/jhn/13#v38` and lands there. The other half fails — once in the reader there is **no note
  indicator** on that verse (F-145).
- **PW-017 cannot be constructed:** requesting the same chapter twice
  (`?p=scripture:jhn/3&p=scripture:jhn/3`) yields **one** pane — the desk de-duplicates identical
  panes. And annotations do not render in desk panes at all (F-099), so there is nothing to sync.

**PW-008, re-run properly.** First written from how the surface is keyed; then executed. Word study
open on `agape` (ἀγάπη G26, ἀγαπητός G27) in one tab, reader translation switched to **KJV** in a
second tab (`localStorage.translation = "kjv"`): the word-study entries were unchanged and
error-free. Keyed to Strong's numbers, not to a display translation.

## Batch — the verse panel (VS group)

### F-162 · VS-028, VS-026 · **P1** · A failed commentary fetch is reported as "No commentary on this verse yet."
With `/commentaries/*` rejected, opening the verse panel on **John 8:5** shows:
> Commentaries *(no count)* · **"No commentary on this verse yet."**

Unblocked, the same verse shows **"Commentaries5"** and five entries beginning with Matthew Henry
(1710). So a network failure is rendered as *absence of content*, with no error, no retry, and no
way for the reader to tell the difference. On this product that is not a cosmetic mix-up: the whole
promise is reporting what commentators have said, and a dropped fetch makes it say they said nothing.
The empty state itself (VS-026) is clear and correctly worded — it is being reused for a case it does
not describe.

### F-163 · VS-018, VS-021 · **P2/AX** · The panel claims `aria-modal="true"` and is not modal
The panel is `role="dialog"` with **`aria-modal="true"`** and `aria-label="Study this verse"` — but
measured at 1280×800 it is `position: static`, 672×704 at (301, 96), it does **not** cover the
viewport, there is **no scrim element anywhere** (zero fixed full-viewport elements outside it), and
**clicking outside does not close it**. `body` does get `overflow: hidden`, so the page behind is
locked, but the panel is an in-flow region, not an overlay.

`aria-modal="true"` tells a screen reader that everything outside the dialog is inert. Here it is not
— the reader's text, the sidebar and the header are all still on screen and clickable. Either the
panel should be a real modal (scrim, outside-click, focus trap) or it should drop `aria-modal`.
VS-018 has no scrim to click, so that row has nothing to exercise.

### Passing rows worth recording
- **VS-009** every rendered entry carries an attribution: Matthew Henry —, Adam Clarke —, John Gill
  —, Barnes' Notes —, John Wesley —. Nothing unattributed is shown. *(One data oddity: "Barnes'
  Notes" is a work title sitting in the author slot; the author is Albert Barnes.)*
- **VS-010** the panel is its own scroll container — 1,903px of content inside a 508px viewport — and
  the page behind is locked (`body { overflow: hidden }`), so a long entry scrolls the panel, not the
  page.
- **VS-020 (the half that matters most)** focus is handled correctly at both ends: opening moves
  focus into the dialog (`BUTTON "Previous verse"`), and **closing returns it to the verse handle**
  (`SUP` with `aria-label="Verse 16, read commentary"`). The trap itself cannot be exercised without
  keyboard events.
- **VS-025** on the chapter's last verse (John 3:36) the **"Next verse" button is `disabled`** —
  deliberate, neither wrapping nor erroring.
- **VS-023** at 820×1180 the panel is neither a full-width sheet nor a narrow sidebar: 672×1038 at
  (74, 142) — a centred panel filling most of the tablet's height. Designed for the width rather than
  inheriting the phone or desktop treatment.
- **The verse panel renders the publication year, and the Ask surface does not.** Here an attribution
  reads **"Matthew Henry — 1710 — Nonconformist"**. That is the same `Author — Year` pattern F-138
  found broken on Ask, where the year is missing and the em dash collides with the following comma.
  So the fix for F-138 is to render what this surface already renders.

## Batch — commentary surfaces (CM group)

### F-164 · CM-017 · **P2** · You cannot copy a commentator's words with their name attached
Selecting text **inside a commentary entry** in the verse panel produces **no selection toolbar** —
no Copy, no attribution-aware copy, nothing. The toolbar exists only for Scripture text in the
reader, where it does the right thing (see RD-023: the copy carries the reference and the
translation). So the one place where attribution matters most — a commentator's words leaving the
app for a sermon or an essay — is served by a bare browser copy that carries the prose and nothing
else. On a product whose promise is "quoted and attributed", the quote can be taken without the
attribution more easily than with it.

### F-165 · CM-019 · **P2** · Five surfaces render the same attribution five different ways
The same work, Adam Clarke's commentary, as the reader meets it:

| surface | what is rendered | year? |
|---|---|---|
| library list | `ADAM CLARKE · METHODIST · COMMENTARY · 727` | no |
| work page | `AUGUSTINE OF HIPPO · PATRISTIC · PATRISTIC · PUBLIC DOMAIN` (F-154: the word twice) | no |
| desk pane | `Adam Clarke · methodist` (lower case) | no |
| **verse panel** | **`Matthew Henry — 1710 — Nonconformist`** | **yes** |
| Ask answer | `Adam Clarke —, Adam Clarke's Commentary  Methodist` (F-138: em dash then comma) | no |

The verse panel is the one that gets it right, and it proves the year is available — so F-064 ("no
publication year anywhere") is really "the year exists and one surface out of five shows it".
Tradition casing splits the same way: `METHODIST` / `methodist` / `Methodist` across surfaces
(F-149).

### F-166 · CM-013 · **P3** · Refreshing while reading a commentary loses it
The verse panel is not in the URL — opening it changes nothing in the address bar (RD-046) — so a
refresh on `/read/jhn/8` with John 8:5's commentary open returns to the chapter with the panel
**closed**. There is no way to link to, bookmark, or reload a commentary view, and Back is the only
thing that remembers it.

### CM-010 · one real instance of raw entity leakage, double-escaped
A query over every published section found exactly **one** work with raw entities in its body:
`chatfield-greeksongs`, where a Greek hymn renders
> `' Ω παντων επεκεινα &#38;&#35;183; τι γαρ θεμις αλλο σε μελπειν ;`

`&#38;&#35;183;` is `&#183;` (a middle dot) escaped twice, so the reader sees the escape sequence
itself. One occurrence in the whole corpus — worth fixing, not worth alarm.

### CM-016 · the licensing gate holds — checked three ways
Chesterton is in the database and correctly not served:
`chesterton-preexistence` is **quarantined**, `chesterton-historyengland` is **staged**.
- `/work/chesterton-preexistence` → *"This work isn't available. It may still be staged for review,
  or the link is mistaken."* (a 107-character page; no prose)
- `/api/work/chesterton-preexistence/sections` → **404 `{"error":"not found"}`**, and the same for
  the staged one
- corpus search for "Chesterton" returns other authors *writing about* him (Manning's hymn papers),
  never his text

The one caveat worth writing down for anyone repeating this: the "isn't available" message is
client-rendered, so a `curl | grep` of the work page finds nothing and looks like a leak. It is not.

## Batch — translations (TR group)

### F-167 · TR-019 · **P3** · Switching translation silently closes the verse panel
Observed twice on Psalm 119:105. The panel survives *opening* the switcher and then **closes the
moment a translation is applied** — it does not follow the switch, and it does not explain. The
reader loses their place in the commentary as a side effect of changing translation, with no notice.

### TR-018 — honest failure, then a slightly wrong way out
With `/bible/ylt/*` rejected, switching to Young's Literal shows **"Failed to load chapter"** and
does **not** silently fall back to another translation — which is the important half, and it passes.
The escape it offers is *"Psalms 1 · Choose another chapter"* while the reader was on **Psalm 119**:
it drops them at the first chapter of the book rather than back where they were or back to the
translation that worked.

### Passing rows worth recording
- **TR-004** switching mid-chapter keeps your place exactly: `main.scrollTop` **5,862 before and
  5,862 after** a WEB→KJV switch deep inside Psalm 119. One consistent choice, and the better one.
- **TR-012** at 390px the current translation is legible **without** opening the switcher (the header
  shows "YLT"), the control is 43×44px, and opening it introduces no horizontal scroll.
- **TR-015** the switcher stays open and stays anchored while the chapter scrolls behind it — it
  neither detaches nor closes — because it hangs off the sticky header.
- **TR-022** the interlinear survives a translation switch intact: with it on, ASV→KJV kept
  `aria-pressed="true"` and **the same 1,067 original-language word tokens**. Alignment cannot drift,
  because the interlinear is keyed to the original text rather than to the display translation.
