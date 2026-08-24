# UX_TEST_PLAN.md — the exhaustive user-experience pass

**Goal: polish.** Not "does it work" — *does it feel like one product, made on purpose, by people
who use it.* A test here fails if the app is technically correct and still makes a reader hesitate,
backtrack, re-read, or wonder whether something happened.

**Supersedes** the working log in `UX_TASKS.md` (that file is the previous sweep's findings record;
its enumeration sections are the source for the control names used here). Delete both when this
closes, per the temporary-doc convention.

---

## 0. How to run this

**Predict, then click.** Before every test write `I expect: ___`. A wrong prediction is a finding
*even when the app did something reasonable* — it means the app taught you the wrong thing.

**Two people-shaped lenses, held at once:**
- **The newcomer** — has never seen it, doesn't know the vocabulary, is deciding in 60 seconds
  whether this is serious.
- **The regular** — comes back on Tuesday with 40 highlights and 12 studies, wants to resume in one
  move and is furious at anything that loses work.

**Severity.** P0 broken/data-loss/credential · P1 user-angry or trust-damaging · P2 friction ·
P3 cosmetic. **P0/P1 must be independently reproduced by a second person before it counts.**

**Every finding records:** route · what I did · what I expected · what happened · severity ·
screenshot. No exceptions — a finding without a repro is an opinion.

---

## 0.1 The failure lenses — learned the hard way, 2026-08-24

These are not extra tests; they are questions to hold over **every** test below. Each one shipped to
production in this app, green, with a test file sitting on top of it.

**L1 — "Is it wired at all?"** The auth form renders, accepts typing, and has no JavaScript
attached: 181 of 234 nodes on the page hydrate, the form and its inputs do not. **Before trusting
any control, confirm something is listening.** In the console:
`Object.keys($0).some(k=>k.startsWith('__react'))` on the control itself.

**L2 — "Does the failure path exist?"** `if (error)` branches in `auth-forms.tsx` could never run,
because the client throws instead of returning. Every "friendly error message" in this app is
suspect until you have *seen it on screen*. **Force each error, don't read the code for it.**

**L3 — "Does the negative indicator move?"** `window.posthog` is `undefined` whether PostHog works
or not. A check that cannot go positive is not a check. **Ask of every assertion: what would make
this fail?**

**L4 — "Does the form default to GET?"** A `<form>` with no `method` puts every field in the URL if
JS is not attached — including passwords. **Check every form in the app for `method`.**

**L5 — "Was this already fixed / already right?"** Three findings from the last sweep were wrong,
one described working code, and one proposed a change that would have broken a deliberate
decision. **Before filing, re-observe; before fixing, `git log -S` the line you're blaming.**

**L6 — "Am I measuring, or reading log output?"** Three times in one night a passing test's stdout
was read as the state of the world. **Measure the thing itself.**

---

## 0.2 The polish bar — what "perfect" means for each of these

Applied to every surface; findings filed against the surface, not here.

| # | Bar |
|---|---|
| B1 | **Nothing silent.** Every action produces a visible acknowledgement within 100ms — pressed state, spinner, optimistic paint. |
| B2 | **Nothing lying.** No message asserts something the app does not know (see: "wrong password" to a reader whose password was right). |
| B3 | **Nothing dead.** No control that looks pressable and isn't; no link that goes nowhere; no tab that renders the same thing. |
| B4 | **Nothing lost.** No path where a reader's typing, highlight, note or position disappears without being told. |
| B5 | **Nothing jarring.** No layout shift after first paint; nothing moves under a finger about to tap it. |
| B6 | **One vocabulary.** One word per concept, everywhere. Ask/Search/Study, Save/Bookmark, Thread/History/Chat. |
| B7 | **One hand.** Type, spacing, colour, corner radius, button hierarchy consistent across every surface. |
| B8 | **Reversible.** Every destructive act is confirmed or undoable, and says which. |
| B9 | **Honest waits.** >1s acknowledged, >4s explained in words, >10s offers a way out. |
| B10 | **Attribution always.** Every quoted voice carries author + work, on every surface. This is the product's promise. |

---

# PART 1 — JOURNEYS (J) — 46 tests

**Run these first, and run them as a person, not a checklist.** A surface can pass every control
test below and still fail here. Each journey is one continuous sitting; do not reset state between
steps. Record where you hesitated, not just where it broke.

## J-A — The stranger (signed out, first 60 seconds) — 10

J-001 Land on `/` cold, no cache. What is this? Say it out loud in one sentence within 20 seconds.
J-002 Scroll `/` once, top to bottom. Is there a single moment you'd stop and leave? Name it.
J-003 From `/`, try to see actual product content without an account. How far do you get?
J-004 From `/`, decide to sign up. Count clicks and seconds to a usable form.
J-005 Read the waitlist copy. Is it clear what happens next and when? Does anything promise a thing the app doesn't do?
J-006 `/about`, `/features`, `/why` in turn — do the three tell one story, or three?
J-007 Look for what happens to your email. Privacy/terms reachable? (Known: absent — confirm still, note where you looked.)
J-008 Open `/` on a phone, one-handed, standing. Can you reach the primary action with a thumb?
J-009 Paste `/` into a chat app. Grade the unfurl as a stranger seeing it in a group.
J-010 Now open the app in a second language/locale browser setting. Anything obviously broken or untranslated in a way that looks unfinished?

## J-B — The first hour (new account) — 12

J-011 Sign up with a fresh address. Narrate every moment of doubt.
J-012 Whatever the app said would happen next — did it? (Verification mail, redirect, welcome.)
J-013 Land wherever sign-up puts you. Is your first instinct correct about what to do?
J-014 Without help, find the Bible and open John 3.
J-015 Without help, find out what a commentary is here and read one.
J-016 Without help, ask the teacher a question.
J-017 Without help, save something — anything — and then find it again.
J-018 Sign out, sign back in. Is your work where you left it?
J-019 Close the tab mid-task, reopen the app. Does it resume, or restart?
J-020 Return after "a week" (clear session, keep account). What does the app show you first?
J-021 Do the first-run affordances disappear once used, or do they nag forever?
J-022 At any point were you shown an empty screen with no instruction? Name each.

## J-C — The study session the owner described — 12

*This is the product's reason for existing. Run it end to end, twice: once desktop, once tablet.*

J-023 Open the Bible to a chapter you intend to study.
J-024 Bring a commentary alongside it — Scripture and commentary visible **at the same time**.
J-025 Read both. Is the pairing comfortable, or are you scrolling to keep your place?
J-026 Swap the commentary for a **sermon** on the same passage. Is the swap obvious? Count the moves.
J-027 Swap again for a historian. Same passage, third voice.
J-028 Mid-read, a question occurs — kick off a **search without losing your place**. Does the chapter survive?
J-029 Come back from that search to exactly where you were reading.
J-030 Highlight the verse that prompted the question.
J-031 Write a note on it, in your own words, while both panes are open.
J-032 Open a **journal/study** and pull that verse + the sermon quote into it.
J-033 Leave the desk entirely, come back tomorrow (refresh + re-entry). Is the whole arrangement still there?
J-034 Do the same session on a phone. Is it usable, gracefully simplified, or broken?

## J-D — The historian's thread — 6

J-035 Search the historians for something real ("council of nicea"). Grade the results as a reader.
J-036 Open a source. Is it clear who wrote it, when, and from what work?
J-037 Follow a Scripture reference inside a historian's prose into the reader.
J-038 Come back. Is the thread intact — query, scroll, results?
J-039 Save the thread. Find it again from cold.
J-040 Share it. Does the shared link work for the recipient, and does it leak anything you didn't choose to share?

## J-E — The upload — 6

J-041 Upload your own sermon/document. Do you know what will happen to it before you commit?
J-042 Watch the whole ingest. Are you ever unsure whether it's working?
J-043 Find your document afterwards and read it.
J-044 Ask a question that should surface your own document. Is it distinguishable from the public corpus?
J-045 Delete it. Is the deletion honest about what it removes?
J-046 Upload something broken on purpose. Does the app explain, or blame you?

---

# PART 2 — SURFACES

## MK — Marketing & waitlist (`/`, `/about`, `/features`, `/why`) — 32

MK-001 Enumerate every control on all four pages; append anything this list misses.
MK-002 `/` desktop cold load: complete render, no layout shift after settle (B5).
MK-003 `/` at 390px: no horizontal scroll, hero legible, every tap target ≥44px.
MK-004 `/` at 320px (smallest real phone) — does anything clip or overlap?
MK-005 Every nav link goes where its label says; Back returns.
MK-006 Logo click from each of the four pages → same destination every time.
MK-007 Footer present on all four (regression guard — `/about` lacked it).
MK-008 Footer links all resolve; none 404.
MK-009 Privacy + terms present and linked. **Absent today = P1, beta blocker.**
MK-010 No lorem, no placeholder, no TODO visible on any of the four.
MK-011 Every image loads; none stretched, none pixelated on retina.
MK-012 Hero image has a sensible `alt` or is correctly decorative.
MK-013 Waitlist: valid email → confirmation in human words, not a code.
MK-014 Waitlist: same email twice → no leak of whether it was already there.
MK-015 Waitlist: `a@b`, empty, spaces-only, 300-char address → inline guidance, input preserved.
MK-016 Waitlist: unicode/emoji address → no crash, no mangled echo.
MK-017 Waitlist: double-click submit → one submission (L1: confirm the handler is attached at all).
MK-018 Waitlist: submit with JS disabled → **check `method`** (L4); nothing sensitive in the URL.
MK-019 Waitlist: press Enter in the field → submits.
MK-020 Waitlist: submit offline → honest failure, input preserved, retry works.
MK-021 Waitlist while the API is slow (throttle) → button disabled, progress shown (B1/B9).
MK-022 Waitlist confirmation email: arrives? renders? sender legible? If none is sent, that's a product decision to file, not a bug.
MK-023 CTA path `/` → sign-up in ≤2 clicks and obvious at a glance.
MK-024 Refresh mid-scroll → no jump to top mid-read.
MK-025 `?utm_source=test` → identical behaviour, no param visible in the UI.
MK-026 Visit all four **while signed in** → offered the app, not a cold pitch.
MK-027 OG/meta on all four: title, description, image; unfurl each in a real chat app.
MK-028 `/manifest.webmanifest`: name, icons, theme sane.
MK-029 Add to home screen on a real phone → correct icon, opens correctly, no browser chrome surprise.
MK-030 Print `/` — does it produce anything sane, or a wall?
MK-031 Browser zoom 80%/125%/150% on all four → layout holds.
MK-032 `prefers-reduced-motion` on → hero/scroll animations subdued or off (B5).

## AU — Auth (`/auth/[path]`, `/gate`, `/account/[path]`) — 52

*Highest-risk area in the app right now. **L1 applies to every single one of these.***

AU-001 **Is the form wired?** On each of sign-in / sign-up / forgot-password / reset-password, confirm the form and its inputs are hydrated before testing anything else. (Currently FALSE on production.)
AU-002 Every auth form has `method="post"` (L4).
AU-003 Sign-up, fresh address → account created, and the app says what happens next.
AU-004 Sign-up → is a verification mail actually sent? Does the UI match reality?
AU-005 Sign-up with an address that already exists → generic refusal, no existence signal (bug #110 class).
AU-006 Sign-up, password below minimum → requirement stated **before** submission, not only after.
AU-007 Sign-up, password exactly at the minimum → accepted.
AU-008 Sign-up, 200-char password → accepted or refused with a reason.
AU-009 Sign-up, password with spaces/emoji/unicode → works or explains.
AU-010 Password visibility toggle exists and works.
AU-011 Enter submits from every field.
AU-012 Double-click submit → one account, no error flash.
AU-013 Name field: blank → sensible default; 200 chars → handled; emoji → survives round-trip.
AU-014 Sign-up then immediately sign out then back in → state intact.
AU-015 Sign-in happy path → lands somewhere sensible in ≤3s felt.
AU-016 Sign-in wrong password → generic message; email preserved in the field.
AU-017 Sign-in unknown address → **identical** message to AU-016 (oracle check).
AU-018 Sign-in unverified account → truthful message + a resend control (not "wrong password").
AU-019 Resend verification → actually sends; rate-limited sanely; says so.
AU-020 Verification link → verifies, signs you in or tells you to sign in.
AU-021 Verification link clicked twice → second time is comprehensible, not an error page.
AU-022 Expired verification link → explains and offers a new one.
AU-023 Forgot password → same confirmation whether or not the address exists.
AU-024 Reset link end-to-end → new password works, old one fails.
AU-025 Reset link reused → refused with an explanation.
AU-026 Reset link malformed/truncated → human error, not a stack trace.
AU-027 Google sign-in button → works (L1: is its onClick attached?).
AU-028 Google sign-in cancelled halfway → returns cleanly, no half-state.
AU-029 Google account whose email matches an existing password account → documented, deliberate behaviour.
AU-030 Sign-out → clean; Back afterwards shows no cached private content.
AU-031 Session expiry mid-page (delete cookie) → next action explains and routes to sign-in; work not silently lost (B4).
AU-032 Two tabs: sign out in A → B's next action handles it gracefully.
AU-033 Sign in on mobile → keyboard doesn't cover the active field or the submit button.
AU-034 Password manager: field types/autocomplete correct; autofill lands right; save prompt appears.
AU-035 Tab order top-to-bottom on all four forms; focus always visible.
AU-036 Error appears, then you correct the field → error clears on retype, doesn't linger.
AU-037 Refresh mid-typing → documented loss, no crash, no half-state.
AU-038 Visit a deep app URL signed out → redirected to sign-in **and returned there afterwards**.
AU-039 `/gate` correct password → admits.
AU-040 `/gate` wrong password → human message, retry, no lockout surprise.
AU-041 `/gate` rate limit → message is human, says when to try again.
AU-042 `/gate?next=/read/john/3` → after the gate, lands on `/read/john/3`.
AU-043 Gate → auth → destination, stacked → no loop, destination not lost.
AU-044 Gate cookie expiry mid-session → re-gated gracefully, not a dead page.
AU-045 `/account/[path]` — what is it? Enumerate; is it ours or the vendor's UI?
AU-046 `/account` visual consistency with the rest of the app (B7) — if it's vendor UI, does it look like a different product?
AU-047 Change password from `/account` (if present) → works; old password invalidated; other sessions handled.
AU-048 Account deletion (if present) → honest about what is destroyed, confirmed (B8).
AU-049 Any auth page at 390px → all controls reachable, nothing clipped.
AU-050 Any auth page with JS disabled → does it fail safely? Nothing sensitive in the URL (L4).
AU-051 Screen reader: complete sign-in start to finish, announcing errors.
AU-052 Every auth error message collected and graded human vs robotic (B2).

## HM — Home / study entrance (`/home`) — 24

HM-001 Enumerate every tile, rail, link and entry point; append what this misses.
HM-002 Brand-new account → teaches the next step; no empty voids (B1).
HM-003 Returning account → reflects real activity accurately (recent chapters, threads, studies).
HM-004 Every entry point goes where its label says; Back returns to home.
HM-005 "Continue reading" rail → resumes the right work at the right place.
HM-006 Continue-reading with zero history → teaching empty state, not a blank strip.
HM-007 Continue-reading after 20 works → ordering sensible, list scannable.
HM-008 Daily Office card → today's content, correct date in the reader's timezone.
HM-009 Office card at 23:59 and 00:01 (fake clock) → day rolls correctly.
HM-010 Office card when the day's content is missing → human message.
HM-011 Plan card shows only when a reading is actually due.
HM-012 Plan card → opens the right day.
HM-013 Finished plan → no broken card.
HM-014 Home when every extra 401s/404s → degrades to something, never an error screen.
HM-015 Primary action reachable without scrolling at 390px.
HM-016 Refresh → stable, no reshuffle of rails.
HM-017 Tab title and URL sensible and bookmarkable.
HM-018 Time-of-day greeting (if present) correct at 05:00, 12:00, 18:00, 23:00.
HM-019 Home after deep activity (50 threads, 20 highlights) → still scannable, not a dump.
HM-020 Every rail's loading state → skeleton in final layout, no white void (B1/B5).
HM-021 Slow network → rails arrive independently; one slow rail doesn't hold the page hostage.
HM-022 Home at 1280 / 1024 / 820 / 390 → designed at each, not accidental.
HM-023 Keyboard-only: reach and activate every entry point.
HM-024 Screen reader: is the page's structure announced as a set of named regions?

## RD — Bible reader (`/read/[book]/[chapter]`) — 74

RD-001 Enumerate reader chrome: every header control incl. אα, Aa, highlight toggle, translation switcher, chapter nav.
RD-002 **66-book sweep** — open every book via the picker; correct book, chapter 1, no 404. *Expands to 66 rows; each is its own pass/fail.*
RD-003 Chapter next/prev across a book boundary (Gen 50 → Ex 1).
RD-004 Chapter next/prev across the testament boundary (Mal 4 → Matt 1).
RD-005 Prev at Gen 1 and next at Rev 22 → no dead control; behaviour deliberate.
RD-006 Deep link `/read/john/3` renders; `/read/jhn/3` too; both agree.
RD-007 `/read/john/99` → human error naming the real chapter count, with a way back.
RD-008 `/read/notabook/1` → human error, not a stack trace.
RD-009 `/read/john/0` and `/read/john/-1` → handled.
RD-010 Refresh on a chapter → same chapter, same translation, acceptable scroll.
RD-011 Back after chapter→chapter→chapter → steps back through chapters, not out of the reader.
RD-012 URL always reflects book/chapter; copy-paste reproduces the view.
RD-013 Rapid chapter-flipping (10 fast nexts) → no stale content arriving late.
RD-014 Chapter picker: discoverable, current position obvious, keyboard usable.
RD-015 Chapter picker with a long book (Psalms, 150) → scannable, not a wall.
RD-016 Verse-number handle: click opens the study panel.
RD-017 Verse-number handle: Enter and Space do the same (keyboard parity).
RD-018 Verse handle focus ring visible and clearly on the number.
RD-019 Tap the verse *text* (not the number) → is anything supposed to happen? Is that discoverable?
RD-020 Text selection → SelectionPopover appears; desktop toolbar vs mobile bar both correct.
RD-021 SelectionPopover: Escape dismisses; click-outside dismisses; collapse-selection dismisses.
RD-022 SelectionPopover signed out → gated actions explain themselves, never silently no-op (the house pattern).
RD-023 Copy selected text → clipboard clean, no verse-number artifacts, no UI text.
RD-024 Copy a multi-verse selection → sensible formatting, reference included or deliberately not.
RD-025 Long chapter (Ps 119) → scroll performance, no jank.
RD-026 Ps 119 section headings (aleph, beth…) render.
RD-027 One-chapter books (Jude, Obadiah, Philemon) → nav labels sane ("1 chapter").
RD-028 Reading typography at arm's length on a phone: size, line length, margins.
RD-029 Reading measure on a 27" monitor → does the column stay readable, or stretch?
RD-030 Aa reading-settings popover opens, closes, Escape works.
RD-031 Aa: text size actually changes the text (known suspect — verify).
RD-032 Aa: column width actually changes the column (known suspect — verify).
RD-033 Aa settings persist across chapters and reloads.
RD-034 Aa popover + study dialog interaction (A031): open Aa, then open the panel via keyboard and via `#v16:study` deep link — Aa closes both times.
RD-035 Highlight-mode toggle: aria-pressed AND a visible state change.
RD-036 Interlinear toggle: aria-pressed AND visible state on the אα button.
RD-037 Both toggles reachable and operable by keyboard.
RD-038 `#v16` deep link scrolls to and emphasises verse 16.
RD-039 `#v16:study` deep link opens the panel on verse 16.
RD-040 `#v999` (nonexistent verse) → ignored quietly, not an error.
RD-041 Back from an open verse panel closes the panel and stays in the chapter; Back again leaves.
RD-042 Four verse taps in a row → one history entry, not four.
RD-043 Close the panel by its own control → next Back is not a dead press.
RD-044 Deep-linked panel closed by its control → does not eject you from the site.
RD-045 Scroll position on Back into the reader → restored per the ratified back-map.
RD-046 New tab on a reader URL → full state reconstructs.
RD-047 Reader signed out → readable; gated actions explain themselves.
RD-048 Verse numbers legible but not shouting; superscript alignment correct at all text sizes.
RD-049 Red-letter text (if present) → toggleable? renders? copies correctly?
RD-050 Footnote markers (if present) → tappable, dismissible, don't break the line.
RD-051 Poetry passages (Ps 23, Ex 15) → line breaks render as verse, not prose soup.
RD-052 Prose passages → no accidental poetry formatting.
RD-053 Paragraph vs verse-per-line mode (if present) → both render correctly.
RD-054 Section headings within a chapter → styled distinctly from verse text.
RD-055 Chapter number/title treatment consistent across all 66 books.
RD-056 Longest verse (Esther 8:9) → layout holds, highlight span correct.
RD-057 Shortest verse (John 11:35) → tap target still ≥44px.
RD-058 Psalm superscriptions → verse numbering aligns; a highlight on Ps 3:1 anchors the same text after reload.
RD-059 John 7:53–8:11 in every translation → present/bracketed/footnoted per that translation's convention; no silent gap.
RD-060 Mark 16:9–20 in every translation → same standard.
RD-061 "Missing" verses (Matt 17:21, 18:11, Acts 8:37) → numbering skips honestly; neighbours don't go off-by-one.
RD-062 Verse 0 / verse 1 conventions across translations → interlinear alignment holds.
RD-063 Reader with 50 highlights in one chapter → still readable.
RD-064 Reader with 50 notes in one chapter → indicators don't wreck the layout.
RD-065 Reader while offline → honest degraded state, not an infinite spinner.
RD-066 Reader when the corpus CDN is blocked → honest failure, not a silent blank (B1).
RD-067 Reader when the CDN is merely slow → content arrives late but correct; no race with the shell.
RD-068 First paint: skeleton in the final layout, not a white void.
RD-069 Time to readable text on a cold load, throttled — record the number.
RD-070 Pinch-zoom on mobile → not disabled; layout survives.
RD-071 Landscape phone → reader usable.
RD-072 Print a chapter → legible, no app chrome, no truncation.
RD-073 Reader at 200% browser zoom → no overlap, no horizontal scroll.
RD-074 Screen reader: chapter reads as continuous prose, verse numbers not shouted over every verse.

## TR — Translations — 24

TR-001 Enumerate every translation in the switcher; record the exact labels.
TR-002 Switch translation → text changes AND label changes AND **the text matches the label**.
TR-003 Rapid A→B→A switching → final state consistent, no mismatch (race).
TR-004 Switch while mid-chapter → position kept or top, but always the same choice (B7).
TR-005 Choice persists across 3 chapter navigations.
TR-006 Choice persists across refresh.
TR-007 Choice persists across sign-out/sign-in.
TR-008 Choice persists across a new tab.
TR-009 Is the translation in the URL? If not, document the default and make sure a shared link is unambiguous.
TR-010 Each translation spot-checked on John 3:16 → plausible text, correct versification.
TR-011 Each translation on Ps 23:1 → poetry formatting survives the switch.
TR-012 Switcher on mobile → reachable; current selection visible without opening it.
TR-013 Switcher keyboard: open, arrow, select, Escape.
TR-014 Switcher has no Escape handler in code — confirm in a browser whether Escape genuinely does nothing.
TR-015 Switcher open + scroll → does it follow, close, or detach?
TR-016 Translation names: full names or abbreviations? Consistent everywhere they appear (B6).
TR-017 Attribution line per translation → present and correct (B10).
TR-018 A translation whose asset fails to load → honest error, not silent fallback to another translation.
TR-019 Switching translation with the verse panel open → panel content follows or explains.
TR-020 Switching translation with highlights present → highlights still anchor to the right verses.
TR-021 Switching translation with notes present → notes still attached to the right verses.
TR-022 Interlinear ON + switch translation → alignment survives or resets deliberately.
TR-023 Switch translation from the desk pane → does the reader agree?
TR-024 Any translation with restricted licensing → is the restriction respected and visible?

## IN — Interlinear (אα) — 20

IN-001 Enumerate interlinear behaviour for OT vs NT.
IN-002 Toggle on → original language appears; toggle off → clean removal.
IN-003 State visually obvious on the אα button, not only in aria (B3).
IN-004 State survives chapter navigation (or resets — document which, be consistent).
IN-005 State survives refresh.
IN-006 OT book shows Hebrew; NT book shows Greek.
IN-007 Hebrew renders right-to-left correctly, including punctuation.
IN-008 Greek diacritics render; no mojibake, no tofu boxes.
IN-009 Per-word tap → WordPanel opens for the right word.
IN-010 WordPanel: Escape closes; focus returns to the word.
IN-011 WordPanel on mobile → bottom sheet usable, dismissible by gesture.
IN-012 Interlinear + long chapter → performance acceptable.
IN-013 Interlinear at 390px → readable, no horizontal overflow.
IN-014 Interlinear + highlight mode → both work, selection not broken.
IN-015 Interlinear + text selection → copy produces sensible text, not interleaved gloss.
IN-016 Keyboard: Tab to אα, Enter/Space toggles, state announced.
IN-017 Word with no lexicon entry → honest empty state ("No dictionary entry linked"), not a blank.
IN-018 Transliteration line: present, consistent, not truncated mid-word.
IN-019 Morphology codes → decoded into words, not raw codes.
IN-020 Interlinear on a verse with textual variants → alignment doesn't silently drift.

## VS — Verse study panel — 30

VS-001 Enumerate the panel: tabs, controls, close, header, per-row affordances.
VS-002 Open from a verse number → correct verse, correct reference shown.
VS-003 Header reference matches the verse you tapped, in every translation.
VS-004 Three tabs (Commentaries / Word study / Notes) each render distinct content (B3).
VS-005 Tab switch preserves the verse.
VS-006 Tab labels match the vocabulary used elsewhere in the app (B6).
VS-007 Commentary count badge accurate (it says "17" — count them).
VS-008 Every commentary entry carries author + work + era (B10).
VS-009 An entry with no attribution available → is it shown at all? (Should not be.)
VS-010 Long commentary entry → readable, scroll contained to the panel, not the page.
VS-011 "Read more" expands in place; collapses again.
VS-012 Word-study rows: expand/collapse works; content appears.
VS-013 Strong's chip → navigates to `/word/G####`.
VS-014 Chip and row are separate targets; neither swallows the other's tap.
VS-015 Word with no Strong's number → row still useful, explains itself.
VS-016 Notes tab signed out → invites sign-in rather than showing a dead editor.
VS-017 Notes tab signed in → write, save, see it persist.
VS-018 Panel scrim click → closes.
VS-019 Escape → closes.
VS-020 Focus trapped inside while open; returns to the verse handle on close.
VS-021 Panel open + page scroll behind it → background locked or deliberately not.
VS-022 Panel on 390px → full-height sheet, drag/dismiss works, content not clipped.
VS-023 Panel on a tablet → is it a sheet, a sidebar, or an accident?
VS-024 Step to the next/previous verse from inside the panel → content follows.
VS-025 Step past the last verse of the chapter → disabled or wraps, deliberately.
VS-026 Panel with zero commentaries for a verse → teaching empty state.
VS-027 Panel while commentary is still loading → skeleton, not a jump (B5).
VS-028 Panel when the commentary fetch fails → honest error + retry.
VS-029 Two verses opened in sequence → no content bleed from the first.
VS-030 Panel + interlinear both on → coexist without overlap.

## CM — Commentary & voices — 22

CM-001 Enumerate every entry point into commentary across the app.
CM-002 Open commentary for a verse → correct verse's material.
CM-003 Attribution visible on every block: author, work, year (B10). **Unattributed = P1.**
CM-004 Multiple commentators → switching works, labels correct, no bleed.
CM-005 Era/tradition labelling consistent with the rest of the app (B6).
CM-006 Scripture cross-references inside commentary → clickable, land correctly.
CM-007 Back from a cross-reference → returns to the same commentary, same scroll.
CM-008 Commentary containing Greek/Hebrew → renders, no mojibake.
CM-009 Commentary containing empty citation parens `( )` → **known corpus damage; count occurrences seen** (1,937 sections in prod).
CM-010 Commentary with an `&amp;` or other raw entity in the title/body → decoded.
CM-011 Very long commentary → scroll performance.
CM-012 Verse with no commentary → teaching empty state, not silence.
CM-013 Refresh on a commentary view → same view.
CM-014 Commentary at 390px → readable, dismissible.
CM-015 Public-domain/quarantine handling → nothing served that shouldn't be.
CM-016 Chesterton-era content → correct gate behaviour.
CM-017 Commentary text selection + copy → clean, attribution included or deliberately not.
CM-018 Two commentaries in sequence → no bleed.
CM-019 Commentary in the desk pane vs the verse panel → same content, same attribution.
CM-020 Commentary loading state consistent with the rest of the app (B7).
CM-021 Print a commentary view → attribution included.
CM-022 Screen reader: author and work announced before the quoted text, not after.

## HL — Highlights — 26

HL-001 Enumerate colours, modes, gestures.
HL-002 Highlight a verse → paints instantly (optimistic), survives refresh.
HL-003 Highlight, navigate away, return → still there.
HL-004 Un-highlight → gone, stays gone after refresh.
HL-005 Multiple highlights in one chapter → all persist independently.
HL-006 Same verse highlighted twice → no duplicate row, sane result.
HL-007 Overlapping/partial-verse spans (if supported) → sane; if not supported, not offered.
HL-008 Each colour saves as that colour and renders as that colour.
HL-009 Colour contrast: every highlight colour keeps text ≥AA in light AND dark mode.
HL-010 Highlight mode toggle: aria-pressed + visible (B3).
HL-011 Highlight while offline → retry or honest failure; work not silently lost (B4).
HL-012 Add a highlight while a clear is still retrying → newer intent wins.
HL-013 Highlight in two tabs → consistent final state, no corruption.
HL-014 Highlight on mobile → gesture doesn't fight text selection or scroll.
HL-015 Highlight + interlinear on → coexist.
HL-016 Highlight across a translation switch → anchors to the verse, or documents otherwise.
HL-017 50 highlights in one chapter → render performance acceptable.
HL-018 100+ highlights → still acceptable; record the number.
HL-019 Highlights visible in the desk pane too.
HL-020 Highlights visible in plan/office reading contexts.
HL-021 A highlights list/overview (if present) → complete, links back to verses.
HL-022 Delete a highlight from the overview → reader updates.
HL-023 Highlight a verse with a note on it → both indicators legible, neither hides the other.
HL-024 Keyboard-only: create and remove a highlight.
HL-025 Screen reader: is a highlighted verse announced as highlighted?
HL-026 Highlight animation honours `prefers-reduced-motion`.

## NT — Notes — 26

NT-001 Enumerate every note affordance and entry point.
NT-002 Save a note → indicator on the verse; survives refresh.
NT-003 Edit a note → update persists.
NT-004 Delete a note → gone, stays gone; confirmed first (B8).
NT-005 Note with emoji + 5,000 characters → intact after save/reload (truncation class).
NT-006 Note with newlines/paragraphs → formatting survives.
NT-007 Note with markdown-looking text → rendered or escaped, consistently.
NT-008 Note with a script tag / HTML → escaped, never executed.
NT-009 Empty note save → prevented or meaningful.
NT-010 Whitespace-only note → same as empty.
NT-011 Navigate away mid-typing → warned, drafted, or documented loss — never silent (B4).
NT-012 Refresh mid-typing → same standard.
NT-013 Note editor on mobile → keyboard covers neither the text area nor the save button.
NT-014 Note editor autosizes as you type; doesn't jump.
NT-015 Save while offline → honest failure + retry; text preserved.
NT-016 Two tabs editing the same note → consistent outcome, no corruption.
NT-017 Note on the same verse as a highlight → both coexist.
NT-018 Notes list (`/library/notes`) → complete, ordered sensibly, links back to the verse.
NT-019 Notes list → the link lands on the **verse**, not the top of the chapter.
NT-020 Notes list empty state → teaches.
NT-021 Notes list with 100 notes → usable, searchable if offered.
NT-022 Long note in the list → truncated cleanly, full text reachable.
NT-023 Note timestamps → present, humane ("2 days ago" or a real date, consistently).
NT-024 Note on a verse in a work that later becomes unavailable → dangling reference handled.
NT-025 Keyboard-only: create, edit, delete a note.
NT-026 Screen reader: note editor labelled; save state announced.

## WS — Word study (`/word/[strongs]`, `/library/word-study`) — 26

WS-001 Enumerate both entry points and their differences.
WS-002 Open from a reader word → the right word's entry.
WS-003 Direct URL `/word/G26` → reproduces; refresh-safe.
WS-004 Back from word study → returns to the invoking context, not the top of the reader.
WS-005 Greek renders correctly with diacritics.
WS-006 Hebrew renders right-to-left correctly, with vowel points.
WS-007 Transliteration present and consistent.
WS-008 Definition, KJV usage, morphology all present where the data has them.
WS-009 Word with multiple senses → navigable, labelled.
WS-010 Obscure/hapax word → honest empty state.
WS-011 Invalid Strong's number `/word/G99999` → human error.
WS-012 Malformed `/word/XYZ` → human error, not a stack trace.
WS-013 Related verses list → lands correctly; Back returns.
WS-014 Occurrence count → present and plausible; matches the concordance.
WS-015 Concordance list paginated or capped sanely for a common word (e.g. G2532 καί).
WS-016 A very common word (thousands of hits) → page still loads and stays usable.
WS-017 Two word studies in sequence → no bleed of the previous word.
WS-018 `/library/word-study` browse/search → works per enumeration.
WS-019 Search a word in English → finds the right entries.
WS-020 Search gibberish → honest empty state with a suggestion.
WS-021 Mobile: script readable, long transliterations don't overflow.
WS-022 Lexicon asset fails to load → "unavailable" message, distinguishable from "no entry".
WS-023 Word study attribution: which lexicon is this? Named? (B10)
WS-024 Cross-link from word study back into a verse → correct.
WS-025 Keyboard-only navigation through a word entry.
WS-026 Screen reader: original-language text has correct `lang` so it isn't read as English.

## AS — Ask / the teacher (`/ask`, `/ask/[id]`) — 44

*The core feature. Never exercised in the 2026-08-24 session — treat all of this as unverified.*

AS-001 Enumerate the ask surface: input, submit, mode toggle, suggestions, citation affordances, history rail.
AS-002 Ask "what does 1 Corinthians 13 say" → real answer with sources.
AS-003 Same question as "1 Cor 13", "1cor13", "First Corinthians 13", "1 corinthians 13" → all route to the same place.
AS-004 A topical question ("what does the Bible say about grief") → answer with visible sources.
AS-005 A vague question ("that verse about love") → graceful and useful, not empty.
AS-006 A question with no good answer in the corpus → says so honestly; does not invent.
AS-007 **The product guarantee:** scan 20 answers for anything that reads as the app's own opinion rather than a quoted voice. Any interpretation in the app's voice = P0.
AS-008 Every answer names its voices with author + work (B10).
AS-009 Empty question → prevented politely; no request fired.
AS-010 Whitespace-only question → same.
AS-011 450-character question → handled; cap communicated, not silently truncated.
AS-012 Question at exactly the cap and one over → boundary behaviour correct.
AS-013 Emoji / Greek / Hebrew in the question → no crash, no mangled echo.
AS-014 A question containing a script tag → escaped everywhere it's echoed.
AS-015 Double-click submit → one answer, one history entry.
AS-016 Enter submits; Shift+Enter behaviour matches the visual affordance.
AS-017 Loading state within 100ms; the page never looks frozen (B1).
AS-018 At ~4s the wait is acknowledged in words; at ~10s there's a way out (B9).
AS-019 Time 10 varied questions; record p50 and worst. Anything >8s without a progress signal = finding.
AS-020 Streaming (if present) → readable as it arrives, not a flicker.
AS-021 Every citation in an answer → click-through lands on the right verse/source.
AS-022 Citation → Back → the SAME answer, scroll preserved.
AS-023 A citation to a work that is no longer served → handled, not a dead link.
AS-024 Follow-up question → context visibly continues; same-thread vs new-thread is legible.
AS-025 Refresh mid-generation → sane recovery, no orphan spinner.
AS-026 Navigate away mid-generation and return → answer present or cleanly absent, never half.
AS-027 Ask 11 questions in a minute → rate-limit message is human ("try again in a moment"), not a code.
AS-028 Rate-limit message says roughly when to retry.
AS-029 Answer typography on mobile → readable, sources tappable, no overflow.
AS-030 Answer with 10+ voices → scannable, not a wall.
AS-031 Ask history rail → previous questions listed, clickable, correct.
AS-032 History rail empty state → teaches.
AS-033 `/ask/[id]` → reopens the full answer after refresh.
AS-034 `/ask/[id]` opened by a different account → intended behaviour, never an error page.
AS-035 `/ask/[id]` opened signed out → gate/auth flow, then arrives.
AS-036 Ask thread URL unfurled in chat → sane card, leaks nothing the owner didn't choose to share.
AS-037 Mode toggle (Voices / History) → both modes work; pending state visible during the switch.
AS-038 Ask signed out → is it open, gated, or "not open yet"? Whichever, it must be unambiguous.
AS-039 Ask while offline → honest failure, question preserved.
AS-040 Ask with the LLM provider erroring → human message, retry, question preserved.
AS-041 Ask a question about the passage you're reading, from the reader → context carries.
AS-042 Your own uploaded document cited in an answer → distinguishable from the public corpus.
AS-043 Keyboard-only: ask a question and open a citation.
AS-044 **Query batch: 150 typed questions** across reference / topical / historical / misspelled / vague / adversarial-benign. Grade each on: routed correctly · sources present · nothing in the app's voice · latency bucket. *Expands to 150 rows.*

## SR — Search (`/search`) — 28

SR-001 Enumerate `/search`: modes, filters, facets, result types.
SR-002 Word search "shepherd" → verse results, correct translation, plausible count.
SR-003 Phrase search "valley of the shadow" → exact-phrase behaviour comprehensible.
SR-004 Typed reference "John 3:16" → jumps to the verse, or clearly offers both jump and results.
SR-005 Typed reference "1cor 13" → same.
SR-006 Reference-vs-search ambiguity resolved the same way here as in the omnibox (B6/B7).
SR-007 Result click → reader at that verse, located; Back → results intact (query, scroll, filters).
SR-008 Zero results ("zzyzx") → honest empty state, suggests spelling or a different translation.
SR-009 One result → layout doesn't look broken.
SR-010 Thousands of results → paginated or capped, and says which.
SR-011 Search respects the current translation, or states which it searched.
SR-012 Rapid re-search → results match the LAST query (race).
SR-013 Query preserved in the input after searching; editable for refinement.
SR-014 Filters/facets → apply, combine, clear; URL reflects them.
SR-015 Shared search URL → reproduces the same results.
SR-016 Search across works (not just Bible) → results labelled by type so you know what you're looking at.
SR-017 Result snippets → highlight the match, don't cut mid-word.
SR-018 Result snippets carry attribution (B10).
SR-019 Latency: results or a progress signal, never dead air >3s (B9).
SR-020 Input stays editable during a search; keystrokes are never eaten.
SR-021 Search offline → honest failure, query preserved.
SR-022 Search rate-limited → human message.
SR-023 Search on mobile → keyboard, submit, results all reachable.
SR-024 Search from within the reader mid-read → **the chapter survives** (journey J-028).
SR-025 Search with unicode / Greek / Hebrew input.
SR-026 Search with a very long query.
SR-027 Keyboard-only: search, move through results, open one.
SR-028 Screen reader: result count announced; results are a navigable list.

## HS — History search & threads — 30

HS-001 Enumerate the history surface, its results, and thread affordances.
HS-002 "council of nicea" → relevant, attributed results.
HS-003 "quartodeciman controversy" → relevant results.
HS-004 "easter" → not polluted by controversy-anchoring.
HS-005 Misspelled "counsil of nicea" → still useful, or helpfully empty.
HS-006 Zero-result query → honest, teaching, suggests reformulation.
HS-007 Result click → source view correct; Back → results intact.
HS-008 Every result attributed: author, work, date (B10).
HS-009 A result from a quarantined/withdrawn work → not served.
HS-010 Latency + progress bar during search (the `progress-travel` indicator) → appears, and disappears.
HS-011 Progress indicator honours `prefers-reduced-motion` (asserted only in CSS so far — verify live).
HS-012 Rapid consecutive searches → results match the last query.
HS-013 Refresh after a search → query/results handled consistently.
HS-014 Create a thread from a search → exists, titled sensibly.
HS-015 Thread titled from a query containing emoji → title intact, not truncated mid-character.
HS-016 Thread URL → reopens with full results.
HS-017 Thread in a second tab, same account → works.
HS-018 Thread list → all present, none orphaned-empty.
HS-019 Thread list empty state → teaches.
HS-020 Thread list with 100 threads → paginated/scrollable, findable.
HS-021 Delete a thread → confirmed (B8); gone from the list; URL handled gracefully afterwards.
HS-022 Close a thread by its own control → lands somewhere sane; reopen restores full state.
HS-023 Back from a thread → per the ratified back-map.
HS-024 Old thread after a deploy → still renders (payload compatibility).
HS-025 Thread with zero results, shared → opens to something comprehensible.
HS-026 Shared thread opened by a different account → intended behaviour, never an error page.
HS-027 Shared thread opened signed out → gate/auth, then arrives.
HS-028 Scripture reference inside a historian's prose → clickable into the reader; Back returns to the thread.
HS-029 Mobile thread view → readable.
HS-030 **Query batch: 120 historical queries** (events, people, councils, heresies, places, dates), none reused. Grade: relevance-as-felt · attribution present · latency · zero-result honesty. *Expands to 120 rows.*

## LB — Library & works (`/library`, `/library/[catalog]`, `/library/books`, `/library/passages`, `/work/[slug]`) — 38

LB-001 Enumerate the library: how works are listed, filtered, sorted, entered.
LB-002 `/library` cold → what is a newcomer supposed to do here? Is it obvious?
LB-003 Catalog facets/filters → apply, combine, clear; URL reflects them.
LB-004 Sort options → actually reorder; the active sort is visible.
LB-005 Search within the library → finds works by title and by author.
LB-006 Open a historian work → the designed reading view renders (margin ordinals, entrance).
LB-007 Same at 390px → the stacked mobile entrance actually works.
LB-008 Same on a tablet → designed, not accidental.
LB-009 Navigate within a work (sections/chapters) → position honest, URL reflects it, refresh restores.
LB-010 Table of contents → complete, current position indicated, jumps correctly.
LB-011 A work with 5,000+ sections → TOC and reader stay usable (virtualisation).
LB-012 Reading progress on a long work → accurate, not instantly 100%.
LB-013 Progress persists and resumes from the right place.
LB-014 Back from a work → library list intact (scroll, filters, sort).
LB-015 Work header: save-to-shelf toggles, shows state, persists (aria-pressed + visible).
LB-016 Save signed out → invites sign-in rather than silently failing.
LB-017 Shelf → shows saved works; click returns to the exact place.
LB-018 Unsave from the shelf → removed; unsave from the work → shelf updates.
LB-019 Shelf empty state → teaches.
LB-020 Shelf with 100 saves → usable.
LB-021 Every work shows author, source, year (B10). **Unattributed = P1.**
LB-022 Work titles with entities (`&amp;`) → decoded, not raw.
LB-023 Work titles that are very long → truncated cleanly, full text reachable.
LB-024 Scripture cross-refs inside a work → into the reader; Back returns to the same spot in the work.
LB-025 A work reached from history-search vs from the library → same view, no context bleed.
LB-026 Two works in sequence → no content bleed.
LB-027 Very long section → scroll performance, no jank.
LB-028 Section with Greek/Hebrew → renders, no mojibake.
LB-029 Section with empty citation parens → note occurrences (known corpus damage).
LB-030 `/library/books` → what is this vs `/library`? Is the distinction clear to a reader? (B6)
LB-031 `/library/passages` → same question.
LB-032 `/library/[catalog]` with an invalid catalog → human 404.
LB-033 `/work/[slug]` with an invalid slug → human 404.
LB-034 Work that is staged/unpublished → not reachable, and the 404 doesn't leak that it exists.
LB-035 Library loading state → skeletons in final layout (B1/B5).
LB-036 Library with the CDN blocked → honest degraded state.
LB-037 Print a work section → attribution included.
LB-038 **Per-work sweep:** open EVERY published work; first section + one middle section render, attribution visible, refs clickable. *Expands to one row per work (~123 published).*

## DK — Desk / side-by-side (`/desk`) — 34

*The surface the owner's core journey lives on. Test it as a workspace, not a page.*

DK-001 Enumerate desk panes, the add-rail, and every pane control.
DK-002 Empty desk → offers a way in ("Open the Bible", "Browse the library"); both work.
DK-003 Add a Scripture pane → correct chapter, independent scroll.
DK-004 Add a commentary pane beside it → **both visible at once**, comfortably.
DK-005 Read both without losing your place in either (journey J-025).
DK-006 Swap a commentary pane for a sermon → is the swap obvious? Count the moves (J-026).
DK-007 Swap for a historian → same.
DK-008 Three panes → layout still usable.
DK-009 Beyond the pane cap → refused with an explanation, not silently ignored.
DK-010 Each pane scrolls independently; scrolling one never moves another.
DK-011 Rapid pane switching → no stale content (cancelled-flag race).
DK-012 Close a pane by its own control → closes; layout reflows cleanly.
DK-013 Reopen → returns; close all → sane empty state, no orphan panes.
DK-014 Pane order/resize (if supported) → works, persists.
DK-015 Desk state on refresh → restored or clean start, consistently (B7).
DK-016 Desk state across sign-out/in.
DK-017 Back from the desk → sane landing.
DK-018 Continuous read across a chapter boundary in a pane → seamless, position honest.
DK-019 Highlights render inside desk panes.
DK-020 Notes render inside desk panes.
DK-021 Create a highlight in a desk pane → appears in the reader too.
DK-022 Edit an annotation in the reader → desk pane reflects it.
DK-023 Translation switch inside a pane → affects that pane only, or all — deliberately.
DK-024 Search kicked off from the desk → panes survive (J-028).
DK-025 Desk at 390px → usable or gracefully simplified, never a broken half-layout.
DK-026 Desk on a tablet at 1024×768 and 820×1180 → designed.
DK-027 Desk with a very long work in one pane → virtualised, no jank.
DK-028 Desk pane loading states → consistent with the rest of the app (B7).
DK-029 Desk pane whose content fails to load → that pane shows the error; the others keep working (no whole-page hostage).
DK-030 Keyboard: move focus between panes predictably.
DK-031 Keyboard: add and close a pane without a mouse.
DK-032 Screen reader: panes are labelled regions, not an undifferentiated blob.
DK-033 Desk deep link (if any) → reproduces the arrangement.
DK-034 Desk after a deploy mid-session → survives or reloads gracefully.

## SE — Studies / journals (`/studies`, `/studies/[id]`, `/study/[id]`) — 32

SE-001 Enumerate the editor: blocks, toolbar, save model, references.
SE-002 **`/studies` vs `/study/[id]` — two routes, one feature?** Resolve and file if it's a duplication (B6).
SE-003 `/studies` signed out → renders an invitation, not a hard redirect.
SE-004 Create a study → exists, named, findable.
SE-005 Untitled study → gets a sensible default, not "undefined".
SE-006 Write content → saves; is the save explicit or automatic? Is that obvious? (B1)
SE-007 Save indicator → shows saving, saved, and failed states distinctly.
SE-008 Edit and re-save → persists across refresh.
SE-009 Persists across sign-out/in.
SE-010 Navigate away mid-edit → warned, drafted, or documented loss — never silent (B4).
SE-011 Close the tab mid-edit → same standard.
SE-012 Offline edit → honest failure; text preserved; retry.
SE-013 Two tabs editing the same study → consistent outcome, no corruption.
SE-014 Pull a verse into a study → renders with its reference.
SE-015 Pull a commentary/sermon quote in → renders with attribution (B10).
SE-016 Reference click-through → correct destination; Back returns to the study at the same scroll.
SE-017 A reference whose source is later withdrawn → dangling reference renders, doesn't crash.
SE-018 Block controls (add/move/delete) → each works; delete is confirmed or undoable (B8).
SE-019 Toggle-style controls expose aria-pressed + visible state.
SE-020 Very long study (200 blocks) → editor stays responsive.
SE-021 Paste a large block of text → handled, formatting sane.
SE-022 Paste HTML from another app → sanitised, never executed.
SE-023 Emoji and unicode in study text → survive round-trip.
SE-024 Studies list → complete, ordered, with dates.
SE-025 Studies list empty state → teaches.
SE-026 Delete a study → confirmed; gone; URL handled afterwards.
SE-027 `/studies/[id]/export` → produces what it claims; attribution preserved.
SE-028 `/studies/[id]/feed` → what is this? Enumerate and test or file as unused.
SE-029 Study at 390px → editing viable, toolbar reachable, keyboard doesn't cover the caret.
SE-030 Print a study → usable handout with attribution.
SE-031 Keyboard-only: create, write, reference, save.
SE-032 Screen reader: editor labelled; block structure navigable.

## UP — Uploads / My Works (`/library/uploads`, `/library/uploads/[id]`) — 32

UP-001 Enumerate the upload surface, the queue states, and the personal library.
UP-002 Before uploading, is it clear what happens to the file and who can see it? (B2)
UP-003 Upload a clean small .docx → succeeds; appears in the library.
UP-004 Progress is visible throughout and quantified (%, steps, or named stages) — never an indeterminate bar for a minute (B9).
UP-005 Queue states are all distinguishable: queued / parsing / embedding / ready / failed.
UP-006 A document reaches `ready` and is actually usable afterwards.
UP-007 Suggested readings for a fresh document → do they ever arrive? (Known wedge class — verify.)
UP-008 Upload a malformed .docx → graceful rejection naming the problem, not a retry-then-cryptic loop.
UP-009 Upload a .exe renamed .docx → clear refusal.
UP-010 Upload a .png / .pdf / .txt → refused or supported, but stated up front.
UP-011 Upload a 0-byte file → refused cleanly.
UP-012 Upload over the size limit → **limit stated before the wait**, not after.
UP-013 Upload at exactly the limit → succeeds.
UP-014 Upload a duplicate (same bytes) → sane handling, explained.
UP-015 Two uploads at once → both tracked correctly.
UP-016 Ten uploads at once → queue is honest about position/ordering.
UP-017 Approaching the document quota → warned before hitting it.
UP-018 At the quota → clear message naming the limit and what to do.
UP-019 At the byte quota → same standard.
UP-020 Refresh mid-upload → honest state on return: resumed, failed, or restartable — never a zombie.
UP-021 Network cut mid-upload → same standard.
UP-022 Close the tab mid-upload → state on return is honest.
UP-023 A document whose bytes never stored → fails with a reason, not silently skipped.
UP-024 Delete an uploaded doc → confirmed (B8); gone from the library; quota released and visibly updated.
UP-025 Delete during processing → handled.
UP-026 Uploaded doc cited in an ask answer → labelled as yours, distinguishable from the corpus.
UP-027 Your document is never offered to another account (tenancy) — verify with two accounts.
UP-028 Library list with many docs → scannable, sortable, filterable per enumeration.
UP-029 Library empty state → teaches what uploading is for.
UP-030 `/library/uploads/[id]` → the document reads well; attribution says it's yours.
UP-031 Mobile upload → file picker works; progress visible; backgrounding the app doesn't lose it.
UP-032 Keyboard-only: choose a file, upload, and delete.

## PL — Plans (`/plans`, `/plans/[id]`) — 22

PL-001 Enumerate the plans surface, the day list, and the toggle.
PL-002 Browse available plans → each has a clear description and length.
PL-003 Start a plan → confirmation; it appears on home.
PL-004 Day toggle both directions → persists across reload.
PL-005 Day toggle by **keyboard** → works (known pointer-only suspect).
PL-006 Day toggle by assistive click → works.
PL-007 Toggle while offline → honest failure, not a silently reverted checkbox (B4).
PL-008 Plan content links → into the reader; Back returns to the plan at the same position.
PL-009 Progress indicator accurate (days read / total) — does it share the fake-100% computation? Check explicitly.
PL-010 Progress persists across refresh and sign-out/in.
PL-011 Finish a plan → celebrated or at least acknowledged; no broken state.
PL-012 Abandon/restart a plan → possible, confirmed, honest.
PL-013 Delete a plan → confirmed; gone; home updates.
PL-014 A plan day with a multi-chapter reading → all chapters reachable, progress sensible.
PL-015 A plan day in the past → clearly marked as missed or catch-up.
PL-016 Two plans at once → both tracked independently.
PL-017 Plans empty state → teaches.
PL-018 Annotate a verse from inside plan context → appears in the normal reader too.
PL-019 Plans at 390px → tappable, legible.
PL-020 Plan list with 50 plans → usable.
PL-021 `/plans/[id]` invalid → human 404.
PL-022 Screen reader: day list is a list; toggle state announced.

## DO — Daily Office — 16

DO-001 Enumerate the office surface and its sections.
DO-002 Today's office → today's content, correct date in the user's timezone.
DO-003 Morning vs evening → correct half for the local clock.
DO-004 Readings link into the reader **at the verse**, not the chapter top.
DO-005 Back returns to the office at the same position.
DO-006 Refresh → same day, same position.
DO-007 23:59 → 00:01 boundary (fake clock) → day rolls correctly.
DO-008 Timezone change mid-session → handled sanely.
DO-009 A day with no content → human message.
DO-010 Every quoted voice attributed (B10).
DO-011 Citation line rendered as a citation, outside the scripture paragraph.
DO-012 Annotate from within the office → persists into the reader.
DO-013 Office at 390px → readable flow.
DO-014 Office when its fetch fails → degrades to something, never an error screen.
DO-015 Office loading state consistent with the app (B7).
DO-016 Print the office → usable.

## PR / MSG / ACCT — the unmapped surfaces — 22

PR-001 `/prayers` — enumerate. What is it? Is it finished?
PR-002 `/prayers` signed out → gate/redirect sane.
PR-003 Create a prayer entry → saves, persists.
PR-004 Edit / delete → work, confirmed (B8).
PR-005 Empty state → teaches.
PR-006 Long entry, emoji, unicode → survive round-trip.
PR-007 Prayers at 390px.
PR-008 Is `/prayers` reachable from the main navigation? If not, is that deliberate?
PR-009 Prayer journal privacy: is it clear this is private? (B2)
MSG-001 `/channel/[id]` and `/chat/[id]` — enumerate. What are they? Shipped, or scaffolding?
MSG-002 Reachable from anywhere in the UI? If not, should the routes exist at all?
MSG-003 Invalid id → human 404, no leak of whether it exists.
MSG-004 Signed out → sane.
MSG-005 If live: send, receive, edit, delete — each confirmed and persistent.
MSG-006 If live: does the vocabulary collide with "thread"/"history"? (B6)
MSG-007 If scaffolding: file as dead surface to remove or finish before beta.
ACCT-001 `/account/[path]` — enumerate every sub-path.
ACCT-002 Visual consistency with the app (B7) — does it read as a different product?
ACCT-003 Every control works and persists.
ACCT-004 Relationship to `/settings` — two places for one concept? (B6)
ACCT-005 Invalid sub-path → human 404.
ACCT-006 Mobile.

## ST — Settings (`/settings`) — 24

ST-001 Enumerate **every** setting present; append one test per setting.
ST-002 Each setting takes effect immediately, or says when it will (B1).
ST-003 Each setting persists across refresh.
ST-004 Each setting persists across sign-out/in.
ST-005 Each setting persists across devices (or is documented as per-device).
ST-006 Theme: light/dark both readable on the core five surfaces.
ST-007 Theme: system preference honoured by default.
ST-008 Theme: choice persists; no flash of the wrong theme on load.
ST-009 Text size: **does it change anything?** (Known suspect.)
ST-010 Column width: same.
ST-011 Default translation setting → actually applied in the reader.
ST-012 Any setting that does nothing → P2 finding, one per control (B3).
ST-013 Form validation → inline and human.
ST-014 Save/cancel semantics obvious; unsaved changes warned about (B4).
ST-015 Change password (if present) → end-to-end; old password invalidated.
ST-016 Data export/deletion controls (if present) → honest about what happens.
ST-017 If absent, file as a beta product decision — users will ask.
ST-018 Settings cross-links → land where they say.
ST-019 Two tabs: change in A → B reflects on next action, no corruption.
ST-020 Settings at 390px → all controls reachable.
ST-021 Keyboard-only pass through every control.
ST-022 Screen reader: every control labelled; state announced.
ST-023 Settings empty/default state comprehensible to a newcomer.
ST-024 Back from settings → previous context, not home.

## NV — Navigation, URL & the Back-map — 30

NV-001 **Build the Back-map**: every view-transition × what Back should do. Owner ratifies. Everything below tests against it.
NV-002 Every header/nav control on every surface → labelled truthfully, goes where it says.
NV-003 Logo/home from every surface → one consistent destination.
NV-004 Active-section indication → you can always tell where you are.
NV-005 Forward after Back → returns forward; history intact both directions.
NV-006 Ten-step random walk, then ten Backs → reverses exactly, per the map.
NV-007 Back out of a modal → closes the modal, doesn't leave the page.
NV-008 Back out of the verse panel → closes the panel (regression guard).
NV-009 Back out of a desk pane → deliberate behaviour, documented.
NV-010 New tab on any deep URL → full state reconstructs.
NV-011 Deep URL signed out → gate/auth → returns to that URL.
NV-012 Scroll restoration on Back → per the map (lists restore, new content tops).
NV-013 404 page → human, branded, offers a way home.
NV-014 404 from a deep invalid path (`/read/x/y/z`) → same.
NV-015 Global error boundary → trigger it; is the page human? If none exists, that's a finding.
NV-016 Tab titles: every major surface sets a distinct, truthful title.
NV-017 Tab titles update on client-side navigation, not just first load.
NV-018 URL never leaks question text, note content, or credentials (L4).
NV-019 Omnibox: enumerate; reference vs search behaviour matches `/search` (B6).
NV-020 Omnibox keyboard: open, type, arrow, Enter, Escape.
NV-021 Omnibox with no results → honest.
NV-022 Mobile nav (menu/drawer): opens, closes, Escape, click-outside, focus trap.
NV-023 Mobile nav → every destination reachable.
NV-024 Nav while a write is in flight → doesn't silently discard it (B4).
NV-025 Browser zoom 80–150% → nav holds on every surface.
NV-026 Breadcrumbs (if present) → accurate, clickable.
NV-027 Skip-to-content link → present, works, visible on focus.
NV-028 Focus after client-side navigation → lands somewhere sane, not lost to `<body>`. Test on 8 transitions.
NV-029 Rapid navigation during loads across 10 surface pairs → no stale content.
NV-030 Every route in the manifest visited once, signed in and signed out → nothing 500s, nothing blanks.

---

# PART 3 — CROSS-CUTTING SWEEPS

*These are where polish lives. Run them across the whole app and collect into one inventory each.*

## EM — Empty states — 18

EM-001 Inventory **every** list/collection surface in the app and its empty state.
EM-002 Home, no activity. EM-003 Continue-reading, none. EM-004 Shelf, empty.
EM-005 Notes list, empty. EM-006 Studies list, empty. EM-007 Thread list, empty.
EM-008 Uploads library, empty. EM-009 Plans, none started. EM-010 Prayers, empty.
EM-011 Ask history, empty. EM-012 Search, zero results. EM-013 History search, zero results.
EM-014 Word study, no entry. EM-015 Commentary, none for this verse. EM-016 Desk, no panes.
EM-017 Each of the above: does it **teach the next action**, or just say "nothing here"? (B1)
EM-018 Each: is the empty state visually designed, or an unstyled sentence? (B7)

## ER — Errors — 24

ER-001 Collect **every** error message the app can produce; grade each human vs robotic (B2).
ER-002 Force each one rather than reading the code for it (L2).
ER-003 No raw vendor text reaches a user (e.g. "Invalid or expired session token").
ER-004 No error code shown without a human sentence beside it.
ER-005 No error blames the user for the app's fault.
ER-006 Every error that can be retried offers a retry.
ER-007 Every error preserves the user's input.
ER-008 Network failure on each write path → honest, recoverable.
ER-009 500 from each API route → the UI degrades, never white-screens.
ER-010 401 mid-session on each surface → routes to sign-in with the destination kept.
ER-011 403 (RLS refusal) → does NOT read as "signed out" (a real prior defect class).
ER-012 404 for each `[param]` route → human, branded.
ER-013 429 rate limit on ask, search, gate, upload → human, says when to retry.
ER-014 Corpus CDN blocked → every dependent surface degrades honestly (reader, commentary, word study).
ER-015 LLM provider error → ask surface explains, preserves the question.
ER-016 Database unreachable → does the app say something true?
ER-017 Malformed URL params on every parameterised route.
ER-018 An error toast/banner → dismissible, doesn't cover the control you need.
ER-019 Two errors at once → they don't stack into an unreadable pile.
ER-020 Error styling consistent everywhere (B7).
ER-021 `role="alert"` on errors so they're announced.
ER-022 An error while offline → distinguishes "you're offline" from "we broke".
ER-023 Session expiry during a long edit → work preserved or explicitly saved elsewhere (B4).
ER-024 After any error, is there always a path forward? Name any dead end.

## LD — Loading, waiting, perceived speed — 22

LD-001 Write the waiting standard; owner ratifies: <100ms instant ack · 100ms–1s skeleton in final layout · 1–4s progress + control disabled · >4s words · >10s a way out.
LD-002 Grade **every** async surface against it; deviations are findings, not preferences.
LD-003 Skeletons, not spinners, on the core surfaces (home, reader, ask, library, history).
LD-004 No white void on first paint anywhere.
LD-005 No layout shift when content replaces a skeleton (B5).
LD-006 Nothing moves under a finger about to tap it.
LD-007 Ask: honest words at ~4s and ~10s, not one eternal spinner.
LD-008 Upload: quantified progress, staged labels.
LD-009 Search: input stays editable; keystrokes never eaten.
LD-010 Every submit/toggle pressed twice mid-load → idempotent, visibly disabled (B1).
LD-011 Partial availability: throttle one API → that panel shows its own state; the page stays usable.
LD-012 Missing content → says so and offers retry; never renders as if the content doesn't exist (B1).
LD-013 Navigating away mid-load and back → clean re-request or restored result, never stuck.
LD-014 Slow 3G first load of each core surface → progressive, usable.
LD-015 Slow 3G: record time-to-first-meaningful-paint and time-to-usable per surface.
LD-016 Same on a fast connection — record both, compare against the standard.
LD-017 Link navigation feedback: does a `<Link>` tap acknowledge within 100ms? (Most currently do not.)
LD-018 Loading treatments consistent in shape and colour across surfaces (B7).
LD-019 Spinner/progress honours `prefers-reduced-motion`.
LD-020 Long operation in a background tab → still completes; state correct on return.
LD-021 A wait that finishes instantly → no flash of a skeleton (worse than none).
LD-022 Optimistic UI that later fails → the reversal is visible and explained (B4).

## KB — Keyboard-only — 20

KB-001 Complete J-B (first hour) with no mouse.
KB-002 Complete J-C (the study session) with no mouse.
KB-003 Complete J-D (historian thread) with no mouse.
KB-004 Complete J-E (upload) with no mouse.
KB-005 Sign in and sign out with no mouse.
KB-006 Ask a question and open a citation with no mouse.
KB-007 Read, highlight, and note a verse with no mouse.
KB-008 Open, switch, and close verse-panel tabs with no mouse.
KB-009 Add and close a desk pane with no mouse.
KB-010 Every modal/sheet: Tab cycles inside, Escape closes, focus returns to the opener.
KB-011 Every dropdown: arrow keys move, Enter selects, Escape closes.
KB-012 No focus trap anywhere except deliberately inside a modal.
KB-013 Focus visible on **every** interactive element, on every background colour.
KB-014 Tab order matches visual order on every major surface.
KB-015 No positive `tabindex` anywhere.
KB-016 Skip-to-content works and is the first stop.
KB-017 Any step that requires a pointer = P1; name it.
KB-018 Custom controls (`role="button"` spans) respond to both Enter and Space.
KB-019 Keyboard shortcuts (if any) → documented, discoverable, don't collide with the browser's.
KB-020 Sticky headers/bars don't hide the focused element when tabbing.

## AX — Accessibility — 22

AX-001 Automated axe scan on all 33 routes; triage each violation individually.
AX-002 Screen-reader: sign in → ask → hear the answer → open a citation.
AX-003 Screen-reader: open a chapter, toggle interlinear, highlight a verse — states announced.
AX-004 Screen-reader: navigate the library and open a work.
AX-005 Screen-reader: complete the desk journey.
AX-006 Every image has alt text or is correctly decorative.
AX-007 Every icon-only button has an accessible name.
AX-008 Every form control has a label (not just a placeholder).
AX-009 Headings form a sensible outline on every surface; no skipped levels.
AX-010 Landmarks present (main/nav/complementary) and unique.
AX-011 Page has a lang attribute; original-language text carries its own `lang`.
AX-012 Colour contrast ≥AA for body, muted, disabled, and placeholder text — light AND dark.
AX-013 Highlight colours keep text ≥AA (both themes).
AX-014 Accent/antique-gold on parchment ≥AA at small sizes.
AX-015 Never colour alone to convey state (B3).
AX-016 Focus indicators ≥3:1 against their background.
AX-017 `prefers-reduced-motion` honoured app-wide — including the highlighter release and the history progress bar.
AX-018 Text resize to 200% → no loss of content or function.
AX-019 Touch targets ≥44px everywhere (a known 16-target failure — re-count).
AX-020 Live regions used for async results, so screen-reader users know an answer arrived.
AX-021 Error messages associated with their fields programmatically.
AX-022 Zoom + screen reader together on the reader → still usable.

## MOB — Mobile & devices — 26

MOB-001 Re-run every surface's mobile test at 390×844 on a real device, not just a viewport.
MOB-002 Same at 320px (small phone). MOB-003 Same at 430px (large phone).
MOB-004 Tablet 820×1180 portrait. MOB-005 Tablet 1024×768 landscape.
MOB-006 Landscape phone on the reader.
MOB-007 Safari iOS: the core five journeys.
MOB-008 Chrome Android: the core five journeys.
MOB-009 Firefox desktop: the core five journeys.
MOB-010 Safari macOS: the core five journeys.
MOB-011 iOS: fixed bars vs the keyboard — nothing covered on any form.
MOB-012 iOS: `100vh` behaviour with the URL bar — no clipped content.
MOB-013 iOS: rubber-band scroll doesn't break sticky chrome.
MOB-014 Safe-area insets respected on a notched device.
MOB-015 Pull-to-refresh doesn't fire during a pane scroll.
MOB-016 Text selection on mobile doesn't fight the highlight gesture.
MOB-017 Long-press behaviour deliberate everywhere.
MOB-018 Double-tap-to-zoom not accidentally disabled.
MOB-019 Autofill on iOS/Android for the auth forms.
MOB-020 Backgrounding the app mid-write → work survives.
MOB-021 PWA installed vs in-browser → same five journeys behave identically.
MOB-022 PWA: no dead browser chrome; back gesture works.
MOB-023 Offline PWA launch → honest message, not a blank shell.
MOB-024 Screen rotation mid-read → position kept.
MOB-025 Slow device (throttle CPU 4×) → reader and ask still usable.
MOB-026 Dark mode on a real phone in a dark room — is it actually comfortable?

## PF — Performance — 14

PF-001 Lighthouse on the core five: perf/a11y/best-practices/SEO — record all four.
PF-002 Bundle size per route; flag anything unexpectedly large.
PF-003 Reader first load, cold cache, throttled — record.
PF-004 Ps 119 scroll at 60fps? Record dropped frames.
PF-005 A 5,000-section work: scroll and TOC performance.
PF-006 Desk with three panes: interaction latency.
PF-007 Ask p50/p95 over 20 questions.
PF-008 Search p50/p95 over 20 queries.
PF-009 Memory after 30 minutes of heavy use — leak check.
PF-010 100 highlights + 50 notes in one chapter → render time.
PF-011 Time to interactive on the auth pages (currently never — see L1).
PF-012 Font loading: FOUT/FOIT behaviour, no layout shift (B5).
PF-013 Image loading: correct sizes, no oversized downloads on mobile.
PF-014 Repeat-visit performance (warm cache) vs first visit.

## CH — Chaos & resilience — 24

CH-001 Enumerate every write path in the app (highlight, note, study, plan-day, upload, thread, prayer, settings, progress).
CH-002 Refresh during each → no zombie state. *One row per write path.*
CH-003 Offline during each → honest failure + recovery. *One row per write path.*
CH-004 Session expiry injected before each → work preserved or honestly lost. *One row per path.*
CH-005 Two tabs interleaving writes on the same object → consistent final state.
CH-006 Two devices, same account, same object → last-write behaviour documented.
CH-007 Rapid-fire navigation during loads across 10 surface pairs → no stale content.
CH-008 Storage disabled (cookies/localStorage blocked) → degrades with a message, not a white screen.
CH-009 Third-party cookies blocked → auth still works.
CH-010 Ad-blocker / tracker-blocker on → app still works; analytics failing must not break the page.
CH-011 CDN host blocked → reader, commentary, word study degrade honestly.
CH-012 CDN slow → late but correct; no race with the shell.
CH-013 API slow (5s) on each core surface → usable.
CH-014 API returns malformed JSON → handled.
CH-015 API returns an empty array where content was expected → empty state, not a crash.
CH-016 Clock skew on the device → date-dependent surfaces (office, plans) behave.
CH-017 Mid-session deploy → existing sessions survive or reload gracefully.
CH-018 Browser back/forward spam (20 presses) → app stays coherent.
CH-019 Very long session (2h idle) then an action → handled.
CH-020 Multiple accounts in different browser profiles → no bleed.
CH-021 Extremely long strings in every user-supplied field → no layout break.
CH-022 XSS probe strings in every user-supplied field → escaped everywhere they're echoed.
CH-023 SQL-ish strings in search inputs → treated as text.
CH-024 Unicode direction-override characters in a note title → don't reverse surrounding UI.

## PW — Pairwise feature interactions — 20

PW-001 Highlight in reader → same verse in a desk pane shows it; edit in desk → reader reflects it.
PW-002 Note on a verse → reach it via search → note indicator present.
PW-003 Interlinear ON → click an ask citation into the reader → interlinear state sensible.
PW-004 Plan reading → highlight inside plan context → appears in the normal reader.
PW-005 History thread → scripture ref in a historian source → reader → Back → thread intact.
PW-006 Uploaded doc cited in ask → open citation → Back → answer intact.
PW-007 Bookmark a chapter → switch translation → bookmark still targets it.
PW-008 Word study open → switch translation elsewhere → word study coherent.
PW-009 Copy verse text with a highlight active → clipboard clean.
PW-010 Daily Office reading → annotate from within it → persists in the reader.
PW-011 Study referencing a verse whose source is withdrawn → still renders.
PW-012 Desk pane + verse panel open together → no overlap, both usable.
PW-013 Aa settings changed → do they apply in desk panes and plan reading too?
PW-014 Theme change → applies everywhere without reload, including open panels.
PW-015 Sign out with unsaved work in a study → warned.
PW-016 Search → open result → highlight → Back → results intact with the highlight visible.
PW-017 Two panes on the same chapter → annotations sync between them live.
PW-018 Ask a question about the chapter you're reading → context carries; Back returns to the chapter.
PW-019 Upload a doc, then ask a question it should answer, then open it from the citation.
PW-020 Create a study from a thread, then edit the thread → study reference stays valid.

## CO — Consistency & the one-hand test — 20

CO-001 Terminology inventory: every user-facing noun and verb; one term per concept or a finding each (B6).
CO-002 Resolve: Ask vs Search vs Study. CO-003 Resolve: Save vs Bookmark vs Shelf.
CO-004 Resolve: Thread vs History vs Chat vs Conversation. CO-005 Resolve: Work vs Book vs Document vs Source.
CO-006 Resolve: Voices vs Commentary vs Sources.
CO-007 Toggle-state table: every toggle exposes visual + aria state (B3).
CO-008 Icon inventory: no icon means two things; no action has two icons.
CO-009 Button hierarchy: primary/secondary/destructive styled consistently everywhere.
CO-010 Destructive actions: all confirmed, all styled as destructive (B8).
CO-011 Date/time formatting identical across surfaces.
CO-012 Number formatting (counts, percentages) identical.
CO-013 Capitalisation style consistent in labels and headings.
CO-014 Sentence tone consistent — no mix of terse and chatty.
CO-015 Corner radius, border weight, shadow depth consistent (B7).
CO-016 Spacing rhythm consistent on the five most-used surfaces.
CO-017 Type scale: no one-off sizes.
CO-018 Colour usage: accent means one thing everywhere.
CO-019 Dark mode: every surface designed, not inverted.
CO-020 **The gestalt test:** screenshot the ten most-used surfaces, put them side by side. Does this read as one product designed by one hand? File specifics, not vibes.

---

# PART 4 — COVERAGE, ORDER, AND WHAT "DONE" MEANS

## The arithmetic — honestly

| Part | Explicit lines |
|---|---|
| Journeys (J) | 46 |
| Surfaces (MK, AU, HM, RD, TR, IN, VS, CM, HL, NT, WS, AS, SR, HS, LB, DK, SE, UP, PL, DO, PR/MSG/ACCT, ST, NV) | 708 |
| Cross-cutting (EM, ER, LD, KB, AX, MOB, PF, CH, PW, CO) | 196 |
| **Explicit total** | **950** |

Five lines are **generators** and expand well beyond that:

| Generator | Expands to |
|---|---|
| RD-002 — 66-book sweep | 66 |
| LB-038 — every published work | ~123 |
| AS-044 — typed question batch | 150 |
| HS-030 — historical query batch | 120 |
| CH-002/003/004 — per write path (9 paths × 3) | 27 |
| ST-001 — one row per setting | unknown until enumerated |

**Realistic total: ~1,430 checks**, of which ~950 are hand-written and named. That is comfortably
past the 700 asked for, and the number is *bounded by enumeration, not by confidence* — the first
task in every section is "enumerate and append what this missed."

## Order — this matters more than the count

1. **Unblock first.** `AU-001` is the gate on roughly 60% of everything here: sign-in does not work
   on production, so no signed-in test can run until the auth hydration bug is fixed. Do not start
   the signed-in half until AU-001 passes.
2. **Journeys before controls.** Run Part 1 first, whole, as a person. Journey failures reframe the
   control tests; control failures rarely reframe a journey.
3. **Then surfaces**, in this order: RD → VS/CM → AS → LB/DK → SR/HS → SE/NT/HL → UP → the rest.
   That is roughly descending order of how much of the product's promise each carries.
4. **Cross-cutting last**, because they are collection passes — they need the other sections' output.
5. **MOB and browser matrix last of all**, re-running what already passed on Chromium.

## Exit criteria

1. Every line ✅ or 🔴 with a filed finding. Zero unattempted, zero "probably fine".
2. Every enumeration task has actually appended what it found — a section whose enumeration added
   nothing is a section that was not enumerated.
3. Every P0/P1 independently reproduced by a second person.
4. The four inventories exist and are ratified: **Back-map** (NV-001), **waiting standard**
   (LD-001), **terminology** (CO-001), **empty states** (EM-001).
5. Every finding re-tested by someone other than whoever fixed it.
6. The gestalt test (CO-020) passes in the owner's judgement — that one is not delegable.

## Standing rule for this pass

**A test that cannot fail is not a test** (L3), and **a green you did not watch go red is not
evidence** (L6). If a check passes on the first try and you cannot describe what would have made it
fail, you have not run it yet.
