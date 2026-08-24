# UX_SWEEP_RECONCILED.md — merged findings from three independent overnight runs

**Sources (all 2026-08-24, target `https://ancientpaths.app` prod, run in parallel with no shared
files per DeepSeek's own header):**
- **Claude** — `/tmp/ap-uxsweep/repo/UX_SWEEP.md` + `UX_TASKS.md` (isolated worktree, branch
  `fix/ux-overnight-sweep`). 11 findings. Deepest coverage: signed-in surfaces (owner-supplied session
  cookie), library/works content, reader mechanics. Weakest coverage: auth forms, print, a11y scan,
  chaos/offline, most of the query-batch sections (deliberately not run — quota/cost).
- **Kimi** — `UX_SWEEP.md` + `UX_TASKS.md` (main tree, untracked). 23 findings, 404 ledger tasks
  claimed. Deepest coverage: auth flow (signup/signin/email-verification), broadest raw task count.
  Caveat: ran signed-in sections against **local dev**, not prod (prod `SITE_PASSWORD` correctly
  withheld from the runner); its own `UX_TASKS.md` has an unrelated formatting bug (many result lines
  repeat their output string 5-6× — cosmetic, but sanity-check exact counts before quoting them).
- **DeepSeek** — `deepseeks-findings.md` (main tree, untracked). 8 findings. Narrowest scope: MK
  (marketing/waitlist) + COV (route reconciliation) only, signed-out, no test account. What it did
  test, it tested precisely — its COV pass includes source-code verification, not just live probing.

**This doc's method:** every finding below is tagged with which source(s) reported it. Where two
sources conflicted, I checked live tonight (curl or a real browser session) rather than picking a side
by argument — those verdicts are marked **RESOLVED** with the check that settled it. One conflict is
left **UNRESOLVED** because I couldn't settle it with the access available. Nothing here was verified
by asking Kimi or DeepSeek to re-check their own work — per this repo's own audit discipline, a fixer
(or finder) doesn't get to be the verifier.

---

## Triage-ready summary

| Sev | Count | Items |
|---|---|---|
| **P1** | 6 | PostHog CSP blackout (3/3 confirmed) · No privacy policy (3/3 confirmed) · CCEL citation-stripping bug (Claude, root-caused) · Back exits reader from verse panel (Claude) · Sign-up gives zero feedback (Kimi) · Email verification invisible, blocks all signed-in testing (Kimi) |
| **P2** | ~13 | see below, grouped by source |
| **P3** | ~14 | see below, grouped by source |
| **Retracted** | 1 | `/dev/editor-preview` exposed in prod (Kimi's F23 — disproved live, see Resolved Disputes) |

---

## CONFIRMED — independently found by 2 or more sources (highest confidence)

### C1 — PostHog analytics are completely dark in production — P1
**All three sources**, three different methods:
- Kimi (F01) and DeepSeek (F01) both caught the CSP header detail: `connect-src` allows PostHog's host,
  but `script-src` does not — so the SDK's own bootstrap script can never load, even though the
  same-origin `/ingest` proxy design (docs/ENVIRONMENT.md) would otherwise have made this safe.
- Claude went one step further: confirmed via `read_network_requests` that **zero** requests to
  `/ingest` or any posthog hostname fire on a full page load, and `window.posthog` never initializes —
  so this isn't "some scripts blocked," it's total: no pageviews, no `search_outcomes`/`ask_outcomes`
  telemetry, no exception capture, nothing reaching the backend.
- **Fix:** add `us-assets.i.posthog.com` to `web/next.config.ts`'s CSP `script-src` (or `script-src-elem`).
- **Why it matters beyond the bug itself:** this repo's own programme sheet (`docs/pm/MASTER.md`)
  leans heavily on PostHog data (DAU, churn, UTM attribution, `ask_outcomes`) being real. It isn't,
  right now, and has not been for an undetermined amount of time.

### C2 — No privacy policy or terms linked anywhere on the marketing site — P1
**All three sources**, matching the ledger's own pre-registered prediction. Full-page/footer link
enumeration on `/`, `/about`, `/features`, `/why` — zero privacy/terms links found by any of the three
independent scans. Collecting waitlist emails with no linked policy is the beat-blocker the ledger
flagged in advance.

### C3 — Mobile nav / marketing tap targets under 44px — P2 (two measurements, use the larger)
- Kimi (F04): 2 targets under 44px ("Home" 35px, "Why" 25px wide).
- DeepSeek (F05): 16 targets under 44px — the same two nav links plus all 5 footer links and "Skip to
  content", each at 40px or less.
- **Not a real conflict** — DeepSeek's pass was simply more thorough (measured all 25 interactive
  elements in viewport; Kimi measured the header only). Use DeepSeek's count as the actionable one.

### C4 — Discoverability of the sign-up/waitlist path is weak — P2/P3 (two angles, same problem)
- Kimi (F05): no control on the landing page reads as a "sign-up" CTA at all — only "LOG IN" and the
  waitlist form, and the path to `/auth/sign-up` only exists by going through the LOG IN page first.
  Flagged by Kimi as possibly-deliberate during an invite-gated beta — owner call, not clearly a bug.
- DeepSeek (F06): the waitlist "Request access" button — the only CTA that *does* exist — sits
  **~4,536px below the fold**, the very last element on a long landing page.
- Read together: whatever the intended CTA is, a visitor has to scroll the entire page to find it, and
  even then it isn't labeled as an account-creation path. Worth one owner decision, not two separate
  tickets.

---

## RESOLVED DISPUTES — sources disagreed; settled live tonight

### R1 — `/dev/editor-preview` in production: Kimi says exposed, DeepSeek says guarded
- **Kimi's F23:** claims the route "renders a working block-editor preview... signed-out, no gating"
  in prod.
- **DeepSeek's COV-B:** claims it's `production`-guarded (`if (NODE_ENV==='production') notFound()`),
  verified in source AND live.
- **Verdict: DeepSeek is right, Kimi's F23 is wrong.** Checked live tonight, twice: `curl` against the
  raw URL hits the site gate (307, uninformative either way), but navigating there with a real
  gate-passed, signed-in session returns a genuine, well-designed 404 page ("That page isn't here...").
  Source confirms the guard: `web/src/app/dev/editor-preview/page.tsx:89`,
  `if (process.env.NODE_ENV === 'production') notFound();`. Kimi's finding was almost certainly run
  against local dev (where `NODE_ENV` isn't `'production'`, so the guard never fires) and mislabeled as
  a prod result — consistent with Kimi's broader pattern of pivoting heavily to local dev once its
  local auth workaround was in place. **F23 is retracted, not a real finding.**

### R2 — OG meta tags: Kimi says og:description is missing, DeepSeek says it's present
- **Verdict: DeepSeek is right.** `curl`'d the raw HTML tonight: `og:title`, `og:description`,
  `og:site_name`, `og:type`, `twitter:card`, `twitter:title`, `twitter:description` are **all present**
  with real content. Only `og:image` and `twitter:image` are genuinely absent — DeepSeek's F04 is the
  accurate version of this finding; Kimi's F03 over-states the gap. The real, narrower bug: **no share
  image**, which is still worth fixing (a bare-text unfurl), just smaller than "no description either."

### R3 — Typed Bible reference doesn't jump to the verse: Kimi's F15 vs. Claude's Omnibox finding
- Kimi's F15: `/search?q=John+3:16` returns 935 commentary text-matches, no verse-jump affordance.
- Claude's background-agent finding (tonight): the **Omnibox** (Cmd/Ctrl+K, or the mobile bottom bar's
  "Search passages") correctly jumps "John 3:16" → `/read/jhn/3#v16`, verse scrolled into view.
- **Verdict: both are correct — this isn't a conflict, it's a real product inconsistency.** Re-verified
  live tonight: `/search?q=John+3:16` genuinely returns a wall of commentary matches, not a jump.
  Two different entry points to "find a passage," one that jumps and one that doesn't, with no visible
  relationship between them. Worth filing as its own finding: **P2 — the dedicated `/search` page and
  the Omnibox disagree about whether typing a reference should jump to it or search for it as text.**

---

## UNRESOLVED DISPUTE

### U1 — Interlinear toggle desyncs from its own content after chapter navigation
- **Kimi's F13** (P1): toggle OFF doesn't remove Greek; after navigating to the next chapter with
  interlinear on, the button reads `aria-pressed="false"` while Greek is still rendered. Claims 3
  independent script reproductions (`rd.mjs`, `tr-in.mjs`, `au` of IN-02).
- **Claude, tonight:** ran the identical repro twice, live, on prod, with explicit waits between steps
  (to rule out a race) — toggle ON → OFF was clean both times (verified via DOM text, not just the
  aria attribute, after fixing a selector bug that gave a false read on the first attempt); toggle ON →
  navigate to next chapter reset the button AND the content together, consistently, both times.
- **Not settled.** Plausible explanations, none confirmed: (a) Kimi's repro ran on local dev, not prod,
  and a dev-mode/HMR quirk doesn't reproduce on the real deployment; (b) it's a genuine race condition
  that a scripted Playwright run's faster action cadence hits and a waited, manual-paced test doesn't.
  **Recommend:** one more re-test with the environment (prod vs. local, exact URL) explicitly logged
  before this goes on a fix list as a P1.

---

## UNIQUE TO CLAUDE — library/works content depth (none of these appear in Kimi or DeepSeek)

1. **P1 — CCEL ingestion bug, root-caused.** `src/ingest/adapter-ccel.ts:59`'s `thmlText()` regex
   deletes an entire `<scripRef>` element *including its inner display text* — the actual verse
   reference — leaving only surrounding punctuation (`( )`, `( , )`, `( ; ; )`) in quoted commentary
   text. Confirmed byte-for-byte against live CCEL source XML (`ccel.org/ccel/kempis/imitation.xml`).
   Affects every CCEL-sourced work with inline (non-footnote) `scripRef`s — Kempis confirmed live;
   Calvin's Institutes and Schaff's Creeds named as likely by source inspection, not individually
   re-verified. Sibling SWORD adapters handle the identical element correctly — this is CCEL-only.
2. **P1 — Back from an open verse panel exits the reader entirely**, rather than closing the panel —
   confirmed live via URL/title before and after; root-caused to the panel having no history entry
   (`read/[book]/[chapter]/page.tsx:277-281`, plain `useState`, no `pushState`).
3. **P2 — Sermon body text has zero clickable scripture references**, despite the API already carrying
   the verse metadata that would back them (`spurgeon-sermons01`'s own sections payload has
   `verseStart`/`verseEnd` on the exact sermon that quotes that verse).
4. **P2 — Reading progress reports 100% instantly** for unpaginated works (the entire 50-sermon
   Spurgeon volume mounts unvirtualized in one DOM fetch; progress likely computed from
   sections-fetched, not sections-actually-read).
5. **P2 — The verse panel's own "Word study" tab lists rows that look clickable but aren't** — the only
   working entry point to a word's full page is double-tapping the word in the passage text, completely
   undocumented from the panel.
6. **P2 — Settings' Text Size and Column Width controls do nothing** — no visual change after repeated
   clicks, no `localStorage` key, no computed style change on the reader — sitting right next to Theme
   and Default Translation on the same page, both of which work correctly.
7. **P2 — Daily Office's "Read {verse} in full" link drops the verse anchor**, landing at chapter top
   instead of the cited verse, even though the app's own `verseHref()` helper (used correctly by the
   Omnibox) exists for exactly this (`today-view.tsx:307`).
8. **P3 — A work title renders a literal `&amp;`** instead of a decoded ampersand (`Tryal &amp; Triumph
   of Faith`) — a stored double-escape, likely ingestion-time.
9. **P3 — Reading-plan detail page's tab title duplicates the site suffix** ("Reading plan · Ancient
   Paths · Ancient Paths").

## UNIQUE TO KIMI — auth-flow depth (Claude and DeepSeek didn't reach these)

10. **P1 — Sign-up gives zero feedback.** Fresh signup, duplicate+right-password, and
    duplicate+wrong-password all silently land on `/read/jhn/1?firstrun=1` with no session and no
    message — good on the non-oracle front (bug #110), bad on telling the user anything at all,
    including that email verification is required.
11. **P1 — Email verification is enforced by hosted Neon Auth but invisible in the product.** No
    verification prompt anywhere, no resend-UI, discoverable only via a raw `EMAIL_NOT_VERIFIED` API
    code. This is also what blocked essentially all of Kimi's signed-in testing.
12. **P3 — No password-visibility toggle** on either auth form.
13. **P3 — Sign-in error message lingers** while the user retypes; doesn't clear on input change.
14. **P2 (dev-experience) — Local dev auth is broken for browsers even with the env vars set**: the
    hosted Neon Auth service rejects a `localhost` `Origin` header with a 403 (curl without an Origin
    header works). Complements Claude's earlier finding that the vars were simply *missing* — this is
    the next failure layer once they're present. Useful for whoever picks up local dev auth next.
15. **P3 — Reader page (`/read/...`) sets no distinct document title** — every chapter's tab reads
    "Ancient Paths," same as home. (Different from Claude's #9 above — that one's about the *plans*
    page having a title with a doubled suffix; this is the *reader* having no distinct title at all.
    Both real, both filed.)
16. **P3 — axe finds duplicate `<main>` landmarks on the auth pages** (`/auth/sign-in`). Other core
    surfaces scanned clean.
17. **P3 — Misspelled historical-search query returns bare zero results**, no "did you mean" / fuzzy
    fallback.
18. **P3 — No "sign in to save" invite on work headers when signed out** — inconsistent with the verse
    panel, which does invite sign-in for highlights. Flagged as a product-decision confirm, not clearly
    a bug.
19. **P3 — Verse-sheet overlay's click-outside dismissal wasn't confirmed to close it** (Escape works,
    click-outside untested/failed once); no enforced focus trap (Tab can leave the sheet). Complements
    Claude's earlier COV-01/02 background-agent finding that the Omnibox has the identical gap — read
    together, this looks like a pattern (none of the app's overlays enforce a real focus trap), not two
    isolated one-offs.

## UNIQUE TO DEEPSEEK — marketing-page depth, source-verified route reconciliation

20. **P2 — `/about` has no footer element at all** — every other marketing page has one; `/about` is a
    dead end with only "Request early access" and "Log in" links.
21. **P3 — Ten author-name buttons on the landing/features pages** (AUGUSTINE, CHRYSOSTOM, CALVIN...)
    have no discernible click action from the marketing page alone — flagged for follow-up against the
    signed-in "See it answered" demo.
22. **P3 — "Log in" from `/about` routes to `/home`** (which then gates to `?next=/home`), while every
    other page's "Log in" routes to `/auth/sign-in` directly — an inconsistent destination.
23. **Route-reconciliation value, not a bug:** DeepSeek's COV pass independently verified (source +
    live) that `/channel`, `/dev`, `/study` vs `/studies`, `/account`, and every other app route
    correctly 307s to the SEC-1 gate when signed out — "the wall holds." Useful as a clean baseline
    confirmation alongside Claude's COV-00 (which reached the same conclusion from source-reading, not
    live probing) and Kimi's COV-A/B (which got `/dev/editor-preview` wrong — see R1).

---

## A reconciliation insight, not a bug: why "/ask" behaved differently for each runner

DeepSeek (no test account) and Kimi (account created but never verified, per finding #11 above) both
hit **"Not open yet"** on `/ask` and marked the whole AS/VO section blocked-product. Claude, using the
**owner's own real, verified, signed-in session** (handed over live tonight via cookie, not a synthetic
account), got a fully working `/ask` and a real, correctly-attributed answer. This isn't a
contradiction — it's strong evidence that `/ask` access is gated by account tier (verified owner vs.
unverified/no account), on top of whatever product-stage gating exists. Worth confirming explicitly
before the next run assumes Ask is uniformly open or uniformly closed.

---

## Coverage caveats, for anyone triaging this

- **Task-count claims aren't apples-to-apples.** Kimi's "404 tasks, 191 pass" is real work, but its own
  ledger has a formatting bug that repeats result strings 5-6× per line — worth a manual count on
  anything load-bearing before quoting the number externally.
- **DeepSeek's 8 findings are all it attempted** (MK + COV, signed-out only) — its silence on every
  other section is "didn't test," not "passed."
- **Claude deliberately did not run** the ~1000-query AS/HS/VO batches, voice search, uploads, or the
  browser/device matrix (Safari, Firefox, real phones) — one Chromium automated browser was available
  tonight. See `WORKLOG.md`'s final entry for the full NOT-DONE list.
- None of the three runs completed **AU-22..24** (the real gate-password round trip) — all three
  correctly treat `SITE_PASSWORD` as owner-only and didn't try to obtain it.

## Recommended next actions, roughly by leverage

1. **PostHog CSP fix** — one CSP line, stops ongoing silent data loss. Highest leverage, lowest cost.
2. **CCEL ingestion regex fix** (`adapter-ccel.ts:59`) + a DB grep to size the actual blast radius
   before re-ingesting affected works.
3. **Privacy policy link** — beta blocker per the ledger's own pre-registered rule.
4. **Email verification UX** (Kimi's #10/#11) — currently silently blocks every new signup from ever
   getting in, and blocked most of tonight's own signed-in testing across all three runners.
5. **Verse-panel Back-stack gap** — likely needs a real history entry or a `popstate` listener on panel
   open.
6. Re-run **U1 (interlinear desync)** with environment explicitly logged before treating it as a
   confirmed P1.
7. Everything else in the P2/P3 tables above, roughly in the order they'd naturally get picked up during
   a launch-week pass.
