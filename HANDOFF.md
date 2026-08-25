# UX sweep handoff — for the fix pass (Kimi / DeepSeek)

Read-and-test only. No fixes were written during this pass — that's intentional, so an independent
agent fixes with fresh eyes rather than the same one that found the bug. Everything below is a pointer
into two source files; read those directly before fixing anything, don't work from this summary alone.

- **Full findings, one write-up per bug, with route + repro + evidence:** [`UX_RESULTS.md`](UX_RESULTS.md)
- **Every one of the 918 test IDs with a status:** [`UX_TRACKER.csv`](UX_TRACKER.csv)
- **The original 950-line test plan these IDs come from:** [`UX_TEST_PLAN.md`](UX_TEST_PLAN.md)

Branch: `fix/ux-overnight-sweep`. All work is committed and pushed there, nothing local-only.

---

## What was done

- Read [`UX_TEST_PLAN.md`](UX_TEST_PLAN.md) (950 named tests across journeys, per-surface sections,
  and cross-cutting sweeps) and extracted all 918 concrete test IDs into [`UX_TRACKER.csv`](UX_TRACKER.csv)
  (three columns: done-checkbox, ID+name, notes/status).
- Ran ~20 parallel signed-out agents against a local production build (`next build && next start`,
  gate-passed) to cover every reachable signed-out surface: marketing, auth forms, reader, translations,
  interlinear, verse panel, search, nav, library catalog, mobile/tablet viewports, keyboard-only
  navigation, accessibility (ARIA/contrast/landmarks), chaos/edge-cases (XSS, malformed input, offline
  simulation where the tooling allowed it).
- Then worked sequentially, signed in as the real production account on `ancientpaths.app` (only one
  real account exists — every signed-in test in this pass was done one at a time, by hand, never
  parallelized, to avoid corrupting real account state), through every PENDING-SIGNIN item that was
  genuinely testable: study editor, highlights, notes, reading plans (including a previously-untested
  custom-plan builder), uploads (real file uploads, real malformed/edge-case files), prayers, the
  shelf/save toggle, cross-translation anchoring, and Desk-pane interactions.
- All disposable test data (studies, highlights, notes, prayers, uploads, bookmarks) was created,
  tested, and cleanly deleted, verified via reload after each cleanup — except one item, see below.
- Merged every result into the tracker and wrote a dated batch entry into `UX_RESULTS.md` for each
  round, with a `Model: claude-sonnet-5` git trailer on every commit.

**Known incomplete cleanup:** one disposable reading plan ("Romans · 3 weeks",
`/plans/959dc6bc-d3b4-471c-8bdb-c034c8d4719a`) could not be deleted through the UI because deleting it
is the exact bug in F-108 below (deletes freeze the whole tab). It's inert test data — 0 of 15 days
ever marked read — left in the account until F-108 is fixed or someone deletes it directly in the DB.

---

## What was found — 81 findings (F-001 through F-109, numbering has gaps from earlier housekeeping)

Read each one in full in `UX_RESULTS.md` before fixing — the summaries below are one line each and
drop the repro steps, evidence, and severity reasoning that matter for actually fixing them correctly.

Rough severity split: **1 P0, 14 P1, ~45 P2, ~24 P3** (a few findings carry two tags, e.g. "P1/P2").

### Fix these first (P0/P1 — 15 findings)

| ID | What |
|---|---|
| F-011 | **P0.** The app's own core described journey — Scripture + commentary side by side, swap for a sermon — has no discoverable UI to add a commentary/sermon pane at all. |
| F-108 | "Delete plan" freezes the entire tab/renderer. Reproduced 3 independent ways, including a pure JS `.click()` that bypasses all mouse/CDP input handling and still hangs `Runtime.evaluate` itself for 45+ seconds — this is a real synchronous hang inside the click handler, not a tooling artifact. |
| F-012 | Most of `/library/*` hangs on "Loading the library" — reconfirmed live this session with a 55+ second hang on `/library/books`, the exact route this repo's own `MASTER.md` UX-2 gate claims is already fixed. Four independent hangs observed across different `/library/*` routes this session (20s/60s/50s+/55s+) — one shared root cause, not fixed. |
| F-069 | No privacy policy or terms of service anywhere on the site — every `/privacy` and `/terms` variant 404s, unlinked. The test plan itself flags this as a beta-launch blocker. |
| F-075 | "Sign in with Google" gets stuck in permanent loading state, never redirects. |
| F-076 | Deep authenticated routes (e.g. `/prayers`) don't redirect to sign-in when signed out in some cases, and where they do, the return path (`next=`) is lost. |
| F-090 | The verse-study panel (Commentaries/Word study/Notes) is completely unreachable while interlinear mode is on — the tap-word handles vanish from the DOM entirely, not just hidden. |
| F-082 | The verse-number control — the primary way a reader opens per-verse commentary/notes — has **zero keyboard path**. Enter/Space do nothing; mouse-click only. |
| F-084 | The translation-switcher dropdown has no keyboard dismissal (no Escape, no focus trap) — same root cause confirmed twice (F-038 and again via KB-012). |
| F-102 | `/library/uploads` itself (not just the detail pages) repeatedly stalls 20–60+ seconds on its loading skeleton with zero progress indication. Upgraded from P2 to P1 after a third observation at 60s. |
| F-104 | `/library/uploads/[id]` can hang indefinitely on reload — same class of bug as F-012, different route. |
| F-105 | Study export to Word (`.docx`) returns HTTP 503, reproduced twice, with **zero user-facing error** — the export dropdown just sits there as if nothing happened. |
| F-009 | Browser Back from a citation inside an Ask answer shows a blank composer instead of restoring the answer. |
| F-097 | Same root cause on a different path: Back to a finished Ask thread (not via a citation) also shows a blank form; a hard reload of the same URL correctly restores it, so data isn't lost — only the client-side Back transition fails. |

### Everything else (P2/P3, ~66 findings)

Grouped by theme so a fixer can batch related work — full detail for every row is in `UX_RESULTS.md`,
search for the `F-0xx` id.

- **Desk feature gaps** (beyond F-011 above): F-062/063 (added panes never anchor to the scripture
  pane's current passage, no single-action swap), F-099 (highlights don't sync between reader and
  Desk), F-109 (Desk pane verse numbers aren't interactive at all — zero `<sup>` elements, so the
  verse-study panel can't be opened from Desk under any circumstance). These four all point at the
  same underlying gap: Desk is missing the connective tissue to the rest of the app's per-verse
  tooling.
- **Keyboard/accessibility**: F-037 (skip-link never moves focus), F-052 (errors not announced to
  assistive tech), F-057/060 (landmark/heading-structure gaps), F-061 (broader under-44px tap-target
  problem than first scoped), F-067 (highlight gesture has no keyboard path), F-083/091/092 (verse
  focus indicator, Space-key parity, sticky-header-hides-focused-verse), F-025-adjacent AX items.
- **Vocabulary/consistency drift** (all from one systematic pass, F-045 through F-049): the same `/ask`
  feature named four different ways depending on chrome; "your saved stuff" has three route names, one
  verb, and one icon marking four different destinations; the same history feature named four ways;
  date-formatting drift (short month vs long month, and two files skipping the shared locale constant
  entirely); a non-destructive "Retry" button styled in destructive red.
- **Search**: F-034 (Enter doesn't submit at all), F-035 (phrases silently degrade to bag-of-words),
  F-086 (verse references aren't recognized as references — "John 3:16" gets generic text matches),
  F-087 (no filters, no stated translation), F-088 (clicking a result lands at the top of the doc, not
  the match).
- **Content/data gaps**: F-010 (the literal string "unassigned" shown to users 20 times on one page),
  F-039 (BBE renders a raw `21[]` instead of a clean omission marker for Matt 17:21), F-040/094
  (missing Ps 3 superscription and Ps 119 acrostic headings), F-059/106 (inconsistent attribution
  completeness across lexicon entries; `/library/notes` silently drops entire sections instead of
  showing an empty state), F-064 (no publication year anywhere in the library catalog — flagged P1 in
  the original plan's own severity rule for this specific gap).
- **Uploads**: F-054 (no proactive quota warning), F-100 (a 0-byte file gets a factually wrong "not a
  text file" rejection message), F-101 (an internal codename, "Slice 1," leaks into user-facing error
  copy), F-103 ("suggested readings" gets stuck showing contradictory status messages forever).
- **Auth**: F-077 (no rate-limiting on repeated wrong gate/login passwords), F-078 (blank-name signup
  fails silently), F-079 (stale sign-in error doesn't clear on retry), F-080 (no password-visibility
  toggle anywhere).
- **Loading-state inconsistency** (same root pattern, three separate findings): F-055, F-066, F-074 —
  at least three incompatible loading idioms coexist across the app (a real skeleton, a reused progress
  bar, and ~13 bare "Loading…" text instances).
- **Misc P2/P3**: F-033 (misspelled book names can route to the wrong book), F-044 (invalid plan ID
  falls back silently instead of 404ing, doubled `<title>`), F-050 (text-size/column-width settings
  may not actually affect the reader — flagged suspect, needs a clean re-test), F-051 (no rate-limit on
  the site gate), F-056 (Daily Office reading link ignores its own verse anchor), F-058 (Back from
  word-study loses reader scroll/interlinear state), F-063/065/070/071/072/073/081/085/093/095/096/098
  — see `UX_RESULTS.md` for each.

---

## What is left — 481 test IDs not yet closed to PASS/FAIL

Real breakdown, not rounded:

| Status | Count | What it means |
|---|---|---|
| PENDING-SIGNIN | 128 | Needs the one real production account, done one at a time. Some of these are genuinely still open for anyone with account access to pick up (see below); many are correctly stuck on things this pass explicitly could not risk — see caveats. |
| PARTIAL | 201 | Partially tested; each row states the specific tool limitation (no network-throttle tool, no second browser/device/tab, no real screen reader). Not guessed at — read the note on each row before assuming it passes or fails. |
| NOT-RUN | 62 | Mostly the two open-ended query generators (`AS-044`: 150 Ask questions, only ~13 run; `HS-030`: 120 history-search queries, only ~4 run) — rate-limited by the single real account, not by unwillingness. |
| PENDING-DEVICE | 21 | Hard block — needs real iOS/Android hardware or a non-Chromium browser. Never self-marked as done; per this repo's own `CLAUDE.md` UX-remediation rule, only a human can close these. |

**Genuinely useful next targets within PENDING-SIGNIN** (testable by anyone with the real account,
not blocked by anything this pass lacked):
- `AU-*` group (sign-up/sign-in/reset/verification email flows, session expiry, two-tab sign-out) —
  this pass deliberately avoided all of these because the account has no recorded recovery credentials
  in this session; touching password change or sign-out risked an unrecoverable lockout mid-sweep.
  Someone who *does* have the password can safely close AU-014/015/020-022/024/025/028-032/047.
- `SE-*` remaining items (long-study performance, paste-sanitization with a real clipboard event
  rather than a synthetic one, print output, screen-reader labelling).
- `UP-*` remaining items (quota-boundary uploads, concurrent uploads, mobile upload, keyboard-only
  upload flow).
- Two-tab/multi-device consistency checks across several sections (`HL-013`, `NT-016`, `SE-013`,
  `CH-005/006`) — needs a second signed-in session, which this pass avoided per the "only one identity,
  no parallel writes" rule already in this repo's `AGENTS.md`.
- Screen-reader items (`AX-002/005`, `SE-032`, `NT-026`, `PL-022`, `HL-025`) — needs an actual screen
  reader, not a DOM/ARIA inspection proxy.

---

## Ground rules that applied to this pass (worth keeping for the fix pass too)

- Only one real production account exists (`ancientpaths.app`, the owner's). No test wrote to it
  without immediate, verified cleanup, except the one plan noted above (blocked by the bug it's testing).
- No fixes were made. `UX_RESULTS.md` and `UX_TRACKER.csv` are read-and-test artifacts only.
- Every finding was independently re-observed before filing (a couple of near-misses — a false XSS
  positive, a false "no keyboard feedback" read that turned out to be a stale test-tool coordinate —
  were caught and corrected before being written down; see the batch write-ups in `UX_RESULTS.md` for
  the specific corrections, they're left in as a record of the methodology, not scrubbed out).

---

# UPDATE — continuation pass, 2026-08-25 (session 2)

**738 of 918 IDs are now closed (PASS/FAIL/NA), up from 437.** 251 rows were closed in this pass and
`PENDING-SIGNIN` went from **126 to 4**. Full write-ups for everything below are in
[`UX_RESULTS.md`](UX_RESULTS.md) under the dated section headers; every row's own note is in
[`UX_TRACKER.csv`](UX_TRACKER.csv). Owner-only decisions are collected in
[`OWNER_DECISIONS.md`](OWNER_DECISIONS.md) — nine of them, none blocking the rest of the testing.

## What unblocked it

A **local production build of this branch** (`next build && next start`, `SITE_PASSWORD` set so the
gate is live) pointed at the **dev** Neon branch (`ep-tiny-hat`, never production `ep-odd-fog`), with
two disposable accounts created on it. Upload and teacher access were enabled locally through their
own documented env switches (`USER_CORPUS_OWNER_IDS`, `TEACHER_ALLOWLIST`). That made the entire
signed-in surface testable — annotations, studies, plans, uploads, prayers, desk, Ask and History —
without touching the owner's account.

## Six previously filed findings are WRONG, with measurements

| finding | verdict |
|---|---|
| **F-011** (P0) "the core journey has no discoverable UI" | **Disproven.** Walked end to end: `/desk` → Open the Bible → John 3 → `+` ("Add a work from the library") → Commentaries → `+` → two panes side by side. The desk-grid commit is an ancestor of the live sha, so this is production behaviour. The real defect is worse and precise: **F-158**, the added commentary opens at Genesis 1 with no way to bring it to the passage. |
| **F-012 / F-102 / F-104** (P1) "`/library/*` hangs" | **A hidden-tab artifact, not a bug.** The content is already in the DOM behind React's streaming Suspense reveal, the reveal is queued on `requestAnimationFrame`, and rAF never fires in a hidden tab. Running the queued callback by hand reveals the page instantly. |
| **F-051 / F-077** "no rate limiting" | **Disproven.** The gate caps at 10/min and sign-in at 5/min per address; both earlier tests stopped below the cap. (But **F-168** is new: `/search` really has no limiter at all.) |
| **F-050** "text size / column width may do nothing" | **Disproven.** 18→25.6px and 620→827px, measured. |
| **F-037** "the skip link never moves focus" | **Disproven.** Focus lands on `MAIN#main`. |
| **F-105** "study export returns 503" | **Does not reproduce.** A valid 9.4KB .docx and a print HTML with attribution. The route's only failure path is 500, so a production 503 is the gate or the platform. |
| **F-044** "invalid plan id falls back silently" | **Half wrong.** It says "This plan could not be opened." The doubled `<title>` is real. |

## The most serious new findings

- **F-177 (P1)** "Save to study" from an Ask answer **saves nothing** when you pick a study you
  already have — no request, no error, it just navigates. The "New study" path works.
- **F-162 (P1)** A failed commentary fetch renders as **"No commentary on this verse yet."** — a
  network error reported as the corpus being empty, on the app whose promise is reporting what
  commentators said.
- **F-151 (P1)** **1,110 of 1,258 Jamieson sections (88%)** have their scripture references stripped
  to bare punctuation — and Jamieson is served in Ask answers.
- **F-158 (P1)** The desk's added commentary lands at Genesis 1 with no follow, no sync, no jump.
- **F-116 (P1/AX)** All ten highlight colours fail AA in dark mode (**1.69–2.05** against 4.5).
- **F-112 (P1)** Password **reset** does not revoke existing sessions (password *change* does).
- **F-155 / F-088** Every in-app deep link into a work loses its anchor: a search result linked to
  `#s8` lands at `#s1` with the passage **504,073px** below the fold. Loading the same URL directly
  works.

## What is genuinely left — 180 rows

| status | count | what it means |
|---|---|---|
| PARTIAL | 102 | each row states its own specific limitation; many are runnable and simply not yet reached |
| NOT RUN | 25 | the remaining `AS-*` and `HS-*` behaviours (streaming, follow-ups, rate-limit copy, thread lifecycle) plus the two open-ended query generators |
| PENDING-DEVICE | 25 | real iOS/Android hardware or a non-Chromium browser. `CLAUDE.md` forbids an agent closing these |
| BLOCKED | 18 | 13 keyboard rows (this tool delivers **no key events** to the page — proven with a probe input), 3 verification-mail rows, 2 screen-reader rows |
| PENDING-SIGNIN | 4 | Google OAuth (owner decision D-3) and two screen-reader journeys (D-5) |
| other | 6 | `AS-044`/`HS-030` sampling, `CO-020` (a human judgement call), three `PF-*` rows |

**Tooling limits that bound the above, each proven rather than assumed:** no keyboard events reach
the page; `requestAnimationFrame` never fires (the pane is hidden), so animation and frame-rate rows
cannot be measured; no network throttling; no real screen reader; no mail access.
