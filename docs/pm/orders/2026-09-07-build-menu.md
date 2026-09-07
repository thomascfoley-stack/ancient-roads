# Build menu, 2026-09-07 — what can be built now, what needs a ruling, what is blocked

Owner asked (2026-09-07, in session): "what is available to be built right now, C, maybe editing and
testing My Works and what else." Assembled from three parallel read-only sweeps (UX backlog files ·
My Works state · programme board + in-flight branches) plus a direct read of open PRs and CI. Every
item cites its source; the sweeps' own "not read" lists are at the end. The chat reply of the same
date is a summary of this file, not a second source.

## Ground truth re-measured before writing

- Live on `ancientpaths.app`: `d6e85f3` (the /ask redesign). `origin/main` is 23 commits behind
  HEAD (`c5ed477`) and 0 ahead. PR #235 opens the merge.
- **47 open PRs**: 35 `detail/*` bug-fix / dead-code branches (automated sweep, 08-29 → 09-06,
  2–4 commits each, tests in the diff) and 12 dependabot bumps. 26 detail PRs are fully green.
  Of the rest, the failing job on every one I read (#234 #229 #227 #213 #204) is
  `deploy.sh — gate harness (bash)`: their base (`main`) lacks the harness fix the sweep branch
  carries at `602bd9e`, and `deploy.sh` itself is byte-identical between `main` and HEAD. Merging
  #235 to main then rebasing them clears it.
- **`db-invariants` is red on `main` and nobody sees it**: `library-shelf-round-trip.test.ts:34`
  and `reading-progress-round-trip.test.ts:39` mock `@/lib/session` without `authFailureResponse`,
  which the shelf/progress/annotations routes have imported since D43 (`c11bc84`, 2026-08-23) —
  on `origin/main` too. The `audit` workflow runs on branches and PRs, never on pushes to `main`,
  so main's red is invisible. Ten-minute fix (add the export to both mocks).
- **Five board rows are stale**: `swarm/w-slice4-ask-integration`, `swarm/w-ux3-desk-grid`,
  `swarm/W-L2TOGGLE-plan-toggle`, `swarm/W-UX2VERIFY`, `swarm/w-scanre-false-floor` are all merged
  into `origin/main` and contained in live `d6e85f3`. MASTER rows C3 step 2, UX-3, SCAN_RE and
  B5's "Slice 4 in build" say otherwise. Bookkeeping, filed here, not yet corrected.

## A. Ready now — nothing needed but "go"

| # | Item | What the user gets | Size | Source |
|---|---|---|---|---|
| A1 | **Sidebar C** — capped, collapsible groups (canvas board "C", 2026-09-06) | Five fixed places; Research / Studies / Prayers / My Works / Reading plans as groups capped at 3 with a count when closed; the current page's group opens itself; state remembered; the 11 library rows fold behind Library; one nav table feeds rail, icon rail and mobile sheet | M | canvas; `UX_REMEDIATION.md` N2 supersession (ADR-121) |
| A2 | **Land the PR pile** — fix the two session mocks, merge #235, rebase the 35 detail PRs (and #212 study-editor draft, #216 search GET→POST, #204 blob-delete, #214 my-works routing among them) | ~35 real bug fixes already written and tested, currently unreachable | M aggregate, S each | `gh pr list`; this file §ground truth |
| A3 | **My Works: rename + accept the "Looks like" suggestion** — `PATCH /api/user-corpus/documents/[id]`, inline title edit, one-click apply on the chip | A document named `sermon-draft-FINAL-v3` can be renamed; "Romans 8 · 21 March 1871" can be accepted instead of just displayed | S | `my-works.tsx:934`; `documents.ts` (no update fn); `MY_WORKS_DRAFT_AND_METADATA_DESIGN.md:50-52` |
| A4 | **My Works: cite your own upload inside a study** — library panel searches My Works, inserts a clipping | The two live features finally meet; attribution copies the `/ask` "From your library" pattern already ruled | M | `study-editor.tsx` / `study-library-panel.tsx` (zero hits for uploads) |
| A5 | **Stop on /ask stops spending** — route reads `req.signal`, passes to `teach()` | Stop then Ask again no longer answers and stores the question twice | S | `UX_REMEDIATION.md:3000`; `deep-audit.md` 2026-09-06 |
| A6 | **`/search` loading state** | The page stops freezing for ~2s after Enter | S | `deepseeks-findings.md:322` |
| A7 | **`/studies` signed-out door** — render the house signed-out state instead of a raw redirect | Signed-out visitors see what Studies is instead of a bounce | S | `deepseeks-findings.md:80` |
| A8 | **Error-voice sweep** — no raw "Search failed (500)" / "TypeError: Failed to fetch" | Every error reads as the product, via the existing `api-error-message.ts` | M | `UX_POLISH_AUDIT.md:87` |
| A9 | **"Loading…" → the skeleton idiom** on ~14 surfaces | No bare word flashing, incl. an `<h1>` that says Loading… | M | `UX_POLISH_AUDIT.md:49` |
| A10 | **Saved page can unsave** — per-row remove on `/library/notes` | The page that lists everything you saved can drop an item | M | `UX_POLISH_AUDIT.md:223` |
| A11 | **`/home` 30s hydration** | The home page stops being unresponsive for half a minute | M | `UX_REMEDIATION.md:2684` |
| A12 | **Dialog & toggle ARIA** on translation dropdown, Aa popover, save-to-study picker, export menu | Keyboard and screen-reader users can leave and return focus | M | `UX_POLISH_AUDIT.md:57` |
| A13 | **Small lies batch** — shelf revert with no feedback, "No works here yet" under filters, `/about` "Log in" → `/home`, rail label, "Uploads" wording, Daily Office fetch without timeout | Six one-line dead ends closed | M | `REMEDIATION_QUEUE.md:60` |
| A14 | **Tap targets ≥44px + "Request access" reachable from the nav** | Chips at 30px and a CTA 4,500px down the landing page | M | `REMEDIATION_QUEUE.md:57` |
| A15 | **URL carries state** — passage search survives Back; KJV choice shareable | Back stops landing on a blank search | M | `UX_POLISH_AUDIT.md:182` |
| A16 | **Craft sweep + `design-lint.mts` gate** | Corners, 150ms hovers, glowing dark-mode button, dead classes; and the lint that keeps them out | M | `REMEDIATION_QUEUE.md:59,66` |
| A17 | **`deploy.sh` falls through to its identity check on a CLI poll timeout** (+ harness red-proof) | Last night's "outcome unknown" receipt cannot recur | S | WORKLOG 2026-09-06 |
| A18 | **Rescue `fix/db-invariants-lock-diagnostic`** — pre-push hook refusing pushes to `main`, migrations 110/116 self-heal grant drift | The branch-protection the GitHub plan won't give us, for free | M (19-day rebase) | branch, 9 commits ahead |
| A19 | **My Works anchor + metadata backfill** for pre-detection documents | Old uploads get the same anchors and chips as new ones | M | MASTER B5; design doc :55-56 |

## B. Needs one ruling, then buildable

| # | Decision | Unblocks |
|---|---|---|
| B1 | **Sidebar direction** — C as drawn, or A / B | A1 |
| B2 | **My Works accept-suggestion**: write a real `preached_on` date column (small migration) or title only | A3's second half |
| B3 | **Blob write token for `ancient-paths-corpus`** (D3; ~2 minutes in the Vercel dashboard, non-default env prefix) | three finished PD translations (weymouth / twenty / jps) reaching production; the 24,992-file corpus CDN sync |
| B4 | **Publish batch — 440 prod-staged + 58 dev-staged works** (runbook `2026-09-06-owner-publish-batch.md`, five slug files prepped) | the corpus the product serves; owner-run, 2–4h serve lock |
| B5 | **Privacy policy + terms copy** | `/privacy`, `/terms` (S once copy exists); the last open piece of S1 |
| B6 | **Vocabulary ratification** — "Study" names five things; "Log in" vs "Sign in" | the rename batch + the lint's banned-words list |
| B7 | **T4 — settings that follow you** (theme / text size / translation): option A wire `preferred_translation` only, B migrate + rethink the anti-FOUC script, C defer | account section that exists |
| B8 | **Four micro-rulings**: Aa presets vs stepper; single-chapter picker signal; marketing/app dialect seam; `SLOW_ANSWER_NOTICE_MS` from the two prod series | S each |
| B9 | **Connection moment**: verse-specific commentary alignment vs chapter intro | the tap-a-verse payoff (~70% built) |
| B10 | **Walk `/ask` signed in on production** — the owed DoD leg for what shipped 2026-09-06 | closes the redesign |
| B11 | **SEC-1 / open the gate** — the public-launch decision; also what lets `/api/ask` accumulate training examples | launch; Phase-D |

## C. Blocked on something other than a ruling

T3 tab-bar-over-scripture (real notched devices) · T1 onboarding measurement (no analytics
pipeline) · T2 branded auth sender (console credential) · 7 grandfathered unverified accounts
(prod DB go) · 1,937 CCEL-damaged sections (prod repair run) · real TOC section titles (ingest
slice under `quality-slice`) · OCR for scanned PDFs (ruling + provider + spend cap) · DRC + Brenton
versification (fund or descope) · bait ≥99% (~300 new adversarial cases) · false-confidence audit
of the upload test suites (owed since 2026-08-31) · human-eye passes (screenshot wall, 5-second
tests, watch a first session).

## Recommended order

1. **A1 Sidebar C** — most visible, already designed, owner has seen it.
2. **A2 the PR pile** — largest volume of fixes for the least new code; also turns `main` green.
3. **A3 + A4 My Works** — rename/accept (S) then cite-in-study (M).
4. **A5 A6 A7 A13** — the S-sized UX batch.
5. **B3** is the cheapest owner action on the board and unblocks the most.

## Not read by the sweeps (their own lists)

UX: none unread; `BUG_SWEEP.md`, `DEEP_SWEEP.md`, `UX_TASKS.md` skimmed (closed engineering bugs).
My Works: `2026-08-05-handoff-my-works.md`, `2026-08-20-uploader-deep-dive.md`, `UPLOADER_DESIGN.md`,
`DIRECT_UPLOAD_DESIGN.md` grepped not opened; ~20 `lib/user-corpus` module internals by role only.
Board: `MASTER_HISTORY.md`, `STATE_OF_TRUTH.md` (grepped), `LAUNCH_BLOCKERS.md` (secondhand),
`OWNER_DECISIONS.md`, `PLAN_NEXT.md`, `HANDOFF.md`, everything under `orders/` except the
publish-batch runbook, ADR bodies 107–117, and the 53 `detail/*` diffs beyond three diffstats.
