# QA remediation ledger — every finding, both sheets, one disposition each

**Last measured:** 2026-08-17 · branch `fix/q1-signed-out-state`, 17 commits ahead of
`ship/editor-deploy` · web suite **1042 passed / 94 skipped / 1 failed** (pre-existing
`ECONNREFUSED` in `user-corpus/queue-never-drops`, proven by stashing this branch) · **nothing
deployed.**

**156 findings, enumerated individually.** Sheet A = 103
([`MASTER_QA_REPORT.md`](../evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md), 20 anonymous
sessions). Sheet B = 53
([`AUTHENTICATED_QA_REPORT.md`](../evidence/qa-fleet-2026-08-16/AUTHENTICATED_QA_REPORT.md), 10
authenticated sessions). IDs below are positional within each sheet.

| Disposition | Count |
|---|---|
| **Done** | 27 |
| **Not reproduced / retracted** | 13 |
| **No action** — positive or informational notes | 41 |
| **Open — me** | 42 |
| **Open — owner** | 18 |
| **Open — corpus & retrieval lane** | 15 |
| **Total** | **156** |

Counts verified by script: the six buckets **partition all 156 ids exactly** — no duplicates, none
unassigned. (A first draft of this table read 47 / 15 / 12 for the last three rows; that was
eyeballed and wrong, which is the same failure mode this whole ledger exists to catch.) One id,
**B044**, is genuinely split across two owners and is counted once, in §4d.

**Sheet B's headline is not a defect and outranks every row below.** The "concordance, not a
commentator" guarantee was exercised against real model output for the first time — 10 live
queries including adversarial bait and a direct prompt injection — and **held on every one. Zero
breaches** (B001, B002).

---

## 1. Done (27)

| ID | Finding | Commit |
|---|---|---|
| A002 | "LOG IN" nav button does not lead to a login form | `4ce3146` |
| A007 | Every `/ask` submission by an anonymous visitor 401s | `22be8cf` |
| A008 | `/ask` composer gives zero upfront signal that sign-in is required | `22be8cf` |
| A011 | The "please sign in" error has no actionable sign-in link | `22be8cf` |
| A013 | Clicking an example prompt auto-submits instead of filling the box | `c3c7370` |
| A016 | `/ask` page `<title>` contains no "Ask" | `4ce3146` |
| A021 | Footer "Contact" column contains no contact method | `4ce3146` |
| A026 | "Showing 10 of 11 voices" with no way to reach the 11th | `0c1a050` |
| A030 | Infinite scroll jumps out of 1 John into an unrelated book | `b95454b` — mechanism fixed (identity lookup); the exact "Gospel of John" destination was not reproduced |
| A038 | Hardcoded Gethsemane quote at the foot of every verse panel | `0c1a050` |
| A043 | Hebrew tab intermittently searches stale Greek data | `079fe89` |
| A051 | Passage search's source count (9) disagrees with its dropdown (10) | `3d72cd0` |
| A062 | Sidebar "Yours" labels do not match the pages they open | `01a0747` |
| A083 | Alias-table gaps for hyphenated / full-word / numbered slugs | `f1b72f5` — fixed the whole class, not the 4 reported |
| A085 | `/reading-plans` 404s | `c3c7370` |
| A086 | Sidebar labels `/ask` "Ancient Paths", duplicating the logo above it | `4ce3146` |
| A087 | `/sitemap.xml` and `/robots.txt` serve the app's 404 | `f1b72f5` |
| A099 | No skip-to-content link on the public marketing pages | `c3c7370` |
| B005 | Research History threads have no delete affordance anywhere | `fb33cf6` |
| B026 | Sidebar "Saved" label mismatch on the bookmark-list page | `01a0747` |
| B032 | Could not delete the research thread created during the session | `fb33cf6` |
| B042 | Sidebar label mismatches its destination page | `01a0747` |
| B028 | No way to delete a Study from the UI at all | `20b4a9f` |
| B023 | Bookmark control is stateless about removal | `20b4a9f` — half the finding was already wrong: the `⚑` flag and the toggle both existed; only the label never said so |
| B046 | No discoverable way to un-highlight | `84e1c3d` — removal existed in the study panel; it lived on a different surface from creation |
| B017 | Upload "Remove" deletes instantly with no confirmation | `7d31f0e` |
| B018 | Stale search results after deleting a document | `7d31f0e` |

Also corrected, not a finding: **A001's blocker was false** and the correction is filed in three
places (`93f6be0`).

---

## 2. Not reproduced or retracted (13)

Each **driven against the running app**, not reasoned about.

| ID | Finding | What actually happens |
|---|---|---|
| A001 | **[BLOCKER]** No site-wide gate on any route | Gate up, unchanged since 2026-07-15. Sessions were behind it holding an `httpOnly` cookie invisible to `document.cookie` |
| A012 | Inconsistent `/ask` copy across loads | Describes the pre-Design-C build; `2d043ba` superseded it |
| A020 | **[MAJOR]** Hero CTA "See it answered" is inert | `<a href="#ask">` with a matching `<section id="ask">` 16 lines below |
| A029 | **[MAJOR]** In-work ToC is a dead click | Opens a dialog with 22 real chapter rows — and **A069, in the same sheet, praises this feature as "fast and accurate"** |
| A049 | **[MAJOR]** Library search no-ops on Sermons/Historians | `/api/search/works` returns results for every catalog |
| A061 | **[MAJOR]** Catalog search box does not filter or navigate | 1000+ matches, 62 highlighted hits; empty case renders "No matches." |
| A071 | Catalog work-title link failed to navigate | Self-flagged low-confidence; not reproduced |
| A073 | **[MAJOR]** Library `+` replaces the desk instead of adding | **B008 contradicts it directly**: the `+` correctly ADDS a pane alongside existing contents |
| A097 | **[MAJOR]** Hero CTA inert (a11y duplicate of A020) | Same as A020 |
| A103 | Scroll-transition rendering glitch | Self-flagged low-confidence, attributed to tab contention |
| B033 | — | **Retracts** a previously-filed bug: `/settings` is a real preferences page, not a stub |
| B034 | — | **Retracts**: reading theme "Light" now survives a reload |
| B037 | — | **Retracts**: `/auth/sign-in` does not serve a form to a signed-in visitor |

**Four of these share one symptom — "I clicked it and nothing happened" — which is also exactly
what a hijacked tab looks like.** Sheet A records ~12 of 20 sessions hitting tab-cap exhaustion and
cross-agent hijacking; B036 records the same class in the authenticated run ("automated
coordinate/ref-based clicks did not register"). **Requirement for the next run: a dedicated tab
pool per session.** Until then, a single-session MAJOR reading "control does nothing" is unconfirmed.

---

## 3. No action — positive or informational (41)

Nothing to build. Listed so they are accounted for, not lost.

**Sheet A (21):** A005 gated surfaces gate cleanly · A006 no cookies, localStorage only · A018
Search works while Ask does not (addressed in Q1's copy) · A023 John 1:1 demo works end-to-end ·
A025 Easter demo unverifiable pre-signup (a consequence of the gate) · A039 commentary correctly
verse-scoped · A041 React #418 not reproduced · A046 interlinear licensing correct · A059 hymn
links correctly labelled paraphrase · A068 nonexistent `/work/` degrades gracefully · A069 ToC
search fast and accurate · A070 My Works gate clean · A081 Desk needs no account · A088 `/study`,
`/chat`, `/channel`, `/account` walked clean · A089 malformed routes degrade gracefully · A090
recovery cost low · A091 no mobile horizontal overflow · A092 mobile tap targets comfortable ·
A100 focus visibly indicated · A101 no overflow at 200% zoom · A004 the `/api/annotations` 401 —
**downgraded to NOTE**: `use-annotation-writes.ts:85-93` rejects gating it deliberately, and my
first plan wrongly prescribed "fixing" it.

**Sheet B (20):** B001 + B002 the guarantee held 10/10 · B006 sporadic 401/403 traced to setup ·
B008 Desk `+` adds correctly · B009 3-pane cap enforced · B010 closing a middle pane works · B012
mobile desk stacks cleanly · B019 honest "no scripture detected" explanation · B020 full-text
search over uploads works · B021 upload flow works end-to-end · B025 duplicate of B014 · B027 My
Studies is real and usable · B035 preferences are device-local by design · B036 automated clicks
did not register (instrument, not product) · B039 `/account/settings` is sparse · B040 sign-out
location confirmed · B048 highlight colours enumerated · B049 sub-span highlighting works · B051
prayer journal exists and is reachable · B053 note dialog is per-verse scoped · B003 (see §6 —
routed to the lane) · B033/B034/B037 counted in §2 as retractions.

---

## 4. Open — me (47)

I can do every one of these end-to-end on a branch, with tests.

### 4a. Delete / remove paths — plumbing exists, UI missing (2 remain of 7)

| ID | Finding | What it takes |
|---|---|---|
| B022 | **[MAJOR]** Bookmark feature exists but has no icon or button in chrome | Same slice as B023 |
| B024 | Bookmark control hidden on mobile behind an undiscoverable scroll | Same slice |

### 4b. Real bugs (10)

| ID | Finding |
|---|---|
| B047 | **[MAJOR]** Highlight popover does not mount when a drag-selection crosses a verse boundary |
| B029 | **[MAJOR]** Study-editor Library-panel buttons often don't respond — **reproduce before fixing**; may be the B036 instrument artifact |
| B015 | **[MAJOR]** "Suggested readings" never completes for an uploaded document *(may route to §6 if it is an embedding-pipeline fault)* |
| A010 | Retrying a failed Ask stacks a duplicate error block |
| A015 | One submit fires two POSTs to `/api/ask/stream` — measure first |
| A031 | Reading-settings popover and study dialog can be open simultaneously |
| A084 | Malformed chapter routes fire `NaN` backend fetches |
| A102 | 20+ redundant `/api/auth/get-session` calls — measured 1–2 in dev; needs a production check |
| B013 | 4 persistent console errors on every desk page |
| B041 | Console errors incl. one React #418 — **note A041 says #418 did not reproduce**; reconcile |

### 4c. Missing affordances / dead ends (11)

| ID | Finding |
|---|---|
| A027 | **[MAJOR]** No next/previous-verse control in the study panel |
| A028 | **[MAJOR]** Adjacent verse click closes the panel instead of switching |
| A042 | **[MAJOR]** Standalone lexicon is a thinner tool than the in-reader one — product question inside it |
| A035 | Out-of-range chapter routes are a dead end with no recovery |
| A034 | "Bible" tab hardlinks to John 1, discarding reading position |
| A044 | Word-study occurrence links jump to chapter top, not the verse |
| A045 | Interlinear mode dropped when following an occurrence link |
| A054 | Hymnal ToC cannot browse or filter by scripture reference |
| A075 | Empty desk's "Open the Bible" CTA navigates away instead of adding a pane |
| A078 | 3-pane cap is enforced silently — say something |
| B043 | Desk has no nav entry in the mobile-width menu — safe subset of the Desk design question |

### 4d. Copy, labels, a11y, layout (16)

| ID | Finding |
|---|---|
| B044 | **[BLOCKER]** Unlabeled Menu button silently signed the account out — I can label it; the "why" is O-side |
| A014 | Third example prompt clipped at 390px |
| A017 | Momentary empty error-banner frame on retry |
| A019 | First Ask attempt failed silently once — unverified, low confidence |
| A033 | Background verse buttons in the a11y tree — largely mitigated (`aria-modal` + focus trap); residual only |
| A037 | Library copy overstates what sign-in adds |
| A040 | Bible reading position does not persist, unlike Library works |
| A066 | Catalog row's "open work" link has no accessible name |
| A079 | At 390px a multi-pane desk gives no sign a second pane exists |
| A080 | Desk never explains its state is URL-only |
| A093 | No dedicated tablet nav treatment at 768px |
| A094 | Long titles truncated with no tooltip at 768px |
| A095 | Sidebar collapse control is an unlabeled chevron |
| A098 | Header keyboard focus order zigzags |
| B011 | New desk pane flashes "UNLABELLED" and a raw slug |
| B016 | Uploaded file size shows "0 KB" |

### 4e. Needs a small decision first (2)

| ID | Finding |
|---|---|
| B038 | Two "settings" surfaces with different content — merge or cross-link? |
| B030 | "+ Add to study" inserts the whole chapter, not the matched excerpt — touches the clipping engine (`111_study_block_trim`) |

### 4f. Verification only (1)

| ID | Finding |
|---|---|
| A096 | 768px multi-pane desk layout never verified — drive it |

---

## 5. Open — owner (18)

No agent can close these.

| ID | Item | Why it's yours |
|---|---|---|
| A060 / B014 / B025 | **[MAJOR] `/library` hangs** — the most-reported defect in either sheet (5 sessions) | Does **not** reproduce in dev. Root cause already diagnosed in-tree (`library/uploads/page.tsx:14-28`: the parent `loading.tsx` boundary never swaps on a hard load, measured at 43s). A production-build repro needs the gate password entered **by you** at `localhost:3003/gate`. **B014 adds new information: it happens "after the first visit in a session"** — then I can finish it |
| B045 | **[BLOCKER]** 1 test highlight live on your account | **Removable today**: verse study panel → `clear` |
| B005-related | 9 research threads on your account | Needs `fb33cf6` deployed |
| B050 | **[BLOCKER]** Prayer journal never tested — tab was signed out | Needs an authenticated re-run |
| B052 | **[BLOCKER]** Notes-link-to-verse never tested — tab was signed out | Needs an authenticated re-run |
| B044 ↗ | Why an unlabeled Menu button signed the session out | Needs a real authenticated session to diagnose. **Counted in §4d**, where I label the control; only the diagnosis is yours |
| B004 | **Live `/ask` latency 21–37s, avg 28.5s** — first production measurement, 2–3× the UI's stated "about ten seconds" | Copy changes or the pipeline does. Your call, now on a real number |
| B007 / A077 / A074 / A072 / A076 | **Desk model** — no persistence signed in *or* out, multi-pane only via URL, no nav entry, no add-to-desk on the reader | Design decision you're mid-thought on; overlaps UX-1/UX-3/UX-4. Login changes nothing |
| A032 | Verse tap targets under WCAG 24×24 | **ADR-047**, an owner ruling whose asymmetry is documented as deliberate |
| A009 / A024 / A022 | Static demo has no path to the live feature; `/features` repeats it; waitlist copy contradicted | While SEC-1 is open, "See it answered" can only mean "see this screenshot". The honest fix may be copy |
| A082 | Bare `/bible/web`, `/commentaries` return a raw 400 | The error is the **Blob store's**, via the Lane D corpus rewrite. D3's store isn't connected; untestable locally |
| A003 | Auth deep links bounce with no return path (`?next=`) | Three call sites plus a Neon `callbackURL` validator that has already taken production auth down once. I can build it — wants your go, blast radius is auth |
| A063 | 6–13s `/library` skeleton for a ~1s request | Same surface as the hang; sequence after it |
| — | **Deploy anything** | `deploy.sh` gates on a clean tree; the tree currently holds another session's uncommitted `WORKLOG.md` + `AUTHENTICATED_QA_REPORT.md`. Plus bylaw 7 |
| — | **Next fleet run** needs a dedicated tab pool per session | See §2 |

---

## 6. Open — corpus & retrieval lane (15)

Corpus and retrieval. **Not a different agent — a different GATE.** These change what the
pipeline retrieves or ranks, so each one carries the accuracy diagnostic and the held-out eval and
must be recorded in `WORKLOG.md` (CLAUDE.md). That is why they are not batched with the UI work
above: mixing them would mean shipping a retrieval change under a UI change's evidence. I can do
them; they just need the `quality-slice` discipline and their own session.

| ID | Item | Note |
|---|---|---|
| A064 | Hymns tradition filter fragmented by capitalisation | **Best first task** — pure metadata, contained, no eval needed |
| A065 | Manton's set split by inconsistent title prefix | Same batch as A064 |
| A055 | Greek commentary on James filed under Hymns & Poetry | Same batch as A064 |
| A053 | OCR artifact in a hymn heading ("Col. 9. 16") | Same batch |
| A047 | **[MAJOR]** Watts's "When I Survey" not linked to Galatians 6:14 despite its own printed header | Cross-linking; real retrieval work |
| A048 | **[MAJOR]** Passage search omits the Hymns & Sacred Poetry lane | Lane config — changes results, so it carries the eval |
| A050 | "Ignatius" ranks Loyola above Ignatius of Antioch | Ranking |
| A036 | θεός gloss shows "figuratively" instead of a meaning | Lexicon data |
| A052 | "Amazing Grace" has no scripture heading in this edition | Source-edition limitation; may be a re-source decision |
| A056 / A057 / A067 | "It Is Well" absent; no Ignatius of Antioch primary text; Historians holds one work | Corpus coverage |
| A058 | Song of Songs commentary thin in Passage search | Confirms the known `gill-song` gap (Lane D D1) |
| B031 | Historical Background lane returns irrelevant Josephus excerpts | Historian-lane retrieval |
| B003 | When the corpus is lopsided, concordance format can read like a verdict | **Not a breach** — but the most interesting thing in either sheet after the guarantee result. Worth a design think |

---

## 7. Recommended order

1. **Me:** §4a — all seven delete/remove gaps in one slice. Closes the "creates but never deletes" theme.
2. **You, 30 seconds:** clear the tree; remove the stuck highlight via the study panel.
3. **Me:** §4b real bugs, reproducing each before fixing.
4. **You:** the gate password → I finish `/library` (the most-reported defect across both sheets).
5. **Corpus lane (own session, own gate):** A064/A065/A055/A053 as one metadata batch (no eval needed — metadata only), then A047/A048/A050, each with the accuracy diagnostic re-run.
6. **You, at your pace:** Desk (§5), latency-vs-copy (B004), funnel promise, ADR-047.
