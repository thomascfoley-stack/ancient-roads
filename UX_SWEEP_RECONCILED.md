# UX_SWEEP_RECONCILED.md — merged findings from three independent overnight runs

**Remediation plan lives in `UX_REMEDIATION_PLAN.md`** (the Kimi plan, under three-way review). This doc stays frozen as the findings record.

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
- **DeepSeek** — `deepseeks-findings.md` (main tree, untracked). **20 findings** (F01–F20) — see
  correction note below; the earlier "8 findings" figure predates DeepSeek's signed-out app sweep.
  Scope: MK (marketing/waitlist) + COV (route reconciliation) **plus a signed-out app sweep** — reader
  (66-book sweep, chapter nav, invalid book/chapter), translations, interlinear (NT Greek + OT
  Hebrew), word study, commentary attribution, and search (grouped results, zero-state). No test
  account, so no signed-in surfaces. What it did test, it tested precisely — its COV pass includes
  source-code verification, not just live probing.

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
| **P2** | ~16 | see below, grouped by source (incl. DeepSeek `/studies` redirect, `/desk` empty-state, translation-not-in-URL) |
| **P3** | ~17 | see below, grouped by source |
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

24. **P2 — `/studies` hard-redirects to `/auth/sign-in`** while every other surface (`/prayers`,
    `/plans`, `/settings`, `/desk`, `/library`) renders a signed-out state. Inconsistent — either the
    editor genuinely requires auth (then the empty state should say so, not raw-redirect) or it should
    render "sign in to create studies." (DeepSeek-F11; → plan L-4.)

25. **P2 — `/desk` empty state has no add-affordance.** "Your desk is empty" with no "Open the Bible /
    browse the library" CTA — the ledger's own DK-00/HM-01 standard requires an empty state that
    teaches. (DeepSeek-F12; → plan L-5.)

26. **P3 — Home headline is the single word "Evening"** with no context or Daily Office label.
    (DeepSeek-F13; → plan P3.)

27. **P2 — Translation choice is not carried in the URL.** Switching to KJV changes the text + button
    label, but the URL stays `/read/jhn/3`, so a shared link won't reproduce "this verse in KJV."
    (DeepSeek-F16; → plan L-6.)

28. **P3 — Signed-out verse-selection popover shows Highlight/Save affordances** that are gated on
    sign-in; whether a signed-out user gets a "sign in to save" explainer or a silent no-op is
    unverified. Same "gated action must explain itself" pattern as Kimi-18. (DeepSeek-F20; → plan P3.)

29. **Signed-out sweep passes (record, not bugs):** 66-book sweep 0/66 fails (DeepSeek-F14); interlinear
    renders Greek NT + Hebrew OT correctly (F15); 20+ translations switch correctly with KJV John 3:16
    verified (F16 partial); search grouped results + honest zero-state, "John 3:16" → 935 commentary
    matches (F17); commentary works render author · tradition · PUBLIC DOMAIN (F18); word study renders
    Greek with no mojibake (F19). These are the baseline "the core product works signed-out" evidence.

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

---

# ADDENDUM (Claude, after DeepSeek's review) — errata + late verifications

The body above stays frozen as written. This addendum carries corrections rather than editing the
record in place, per DeepSeek's proposal in the plan's review block.

## E1 — My description of DeepSeek's scope was stale. DeepSeek is right; this is my error.

The Sources block says "DeepSeek — 8 findings. Narrowest scope: MK + COV only." **Wrong.** DeepSeek has
**20 findings (F01–F20)** and ran a full signed-out app sweep — 66-book reader, translations,
interlinear, word study, commentary, search — which is where F09–F20 came from.

**How it happened, since the mechanism matters more than the apology:** `deepseeks-findings.md` was 137
lines (F01–F08) when I wrote v1 of this doc. It grew to 314 lines mid-review. I *did* catch this and
wrote a corrected v2 — but the write failed on a concurrent-edit conflict (Kimi was adding the
"frozen / see remediation plan" header at that moment), I pivoted to writing the plan review, and never
re-applied the v2 corrections here. DeepSeek caught the resulting inconsistency: **the plan cited
F11/F12/F13/F16 while this record didn't list them.** A plan ahead of its own findings record is exactly
the drift this doc exists to prevent.

## E2 — Additions to "UNIQUE TO DEEPSEEK" (were missing; the plan already acted on several)

- **F09** — `/ask` renders "Not open yet" signed-out/unverified. Not a code bug; see the tier-gating
  insight below. Blocks the AS/VO ledger sections regardless of cause.
- **F11** — `/studies` hard-redirects to `/auth/sign-in` while every comparable surface renders a
  signed-out state. **Independently confirmed live by me** (cleared session, kept gate → landed on
  `/auth/sign-in`). Plan's L-4. Real.
- **F12** — `/desk` empty state has no add-affordance. **Disproved — see E4.** Plan's L-5 must go.
- **F13** — `/home`'s hero heading is the bare word "Evening" with no label. Real, P3, plan has it.
- **F16** — translation choice isn't carried in the URL, so a link can't reproduce "this verse in KJV."
  Real, P2, plan's L-6.

## E3 — Correcting C1's mechanism (my error, inherited into the plan)

C1 says the same-origin `/ingest` proxy "would otherwise have made this CSP-safe." **That design was
deliberately removed** by owner ruling 2026-08-18 — `web/next.config.ts:32-38` records why: it traded a
named CSP entry for a wildcard tunnel to a third party inside `'self'`, on our own domain, inside our
gate, with our cookies on every beacon. Direct-dial with the host named in `connect-src` is the intended
architecture, not a fallback.
**The conclusion (total blackout) is unaffected** — it rests on zero requests to the *posthog hostname*
plus `window.posthog === undefined`, both directly observed. But "zero `/ingest` requests" was never
evidence: by design there should be none. That leg is withdrawn.
**Follow-on P3:** `docs/ENVIRONMENT.md` still documents the `/ingest` rewrite as current — stale against
an owner ruling. Added to the plan's P3 housekeeping.

## E4 — R4 upgraded from "disproved" to definitive; DeepSeek's F12 is retracted

DeepSeek's review defends L-5 and proposes the desk "offer the same *Open the Bible / browse the
library* affordance" — **which is precisely what is already there.** That request is itself the
strongest evidence its enumeration missed the controls.
Re-verified tonight, signed-out (session cookies cleared, gate cookie kept), by enumerating every
interactive element in `<main>` rather than reading page text:
```
{ signedOut: true, url: "https://ancientpaths.app/desk",
  mainInteractive: [ {BUTTON, "Open the Bible", visible:true},
                     {A, "Browse the library", href:"/library", visible:true} ] }
```
Two controls, both visible, both exactly the proposed fix. **F12/L-5 retracted — nothing to build.**

## E5 — DeepSeek's F20 open question: answered from source, and the answer is good

F20 flagged, honestly, that it could not tell whether the signed-out selection popover's Highlight/Save
controls explain themselves or fail silently. DeepSeek confirmed the *gating* in source; the answer to
its actual question is a few lines further on in the same file:
- `selection-popover.tsx:257-270` — highlight swatches render only when `signedIn`; otherwise a
  **"Sign in to highlight"** link renders in their place.
- `:284-286` — Save-to-study renders `null` when signed out: **absent, not present-and-dead.**
- `:280-283` carries the rule as a written standing convention: *"a control which appears to work and
  silently does not is worse than an absent one."*
Note this is a **different component** from the verse-number panel I verified live in R5 (which shows
*"Sign in to highlight and save notes to your account →"*). Both entry points handle signed-out
correctly, by two consistent variants of the same pattern.
**F20 should close as verified-good, not enter P3 as a fix.** It stands as the house pattern that
plan items L-4 and Kimi-18 should copy.

## E6 — F09 / Ask, nuance recorded as DeepSeek asked

DeepSeek requests the frozen record carry the tier-gating nuance so nobody re-files "ask is closed" as
a fresh bug. Recorded: **`/ask` is not uniformly closed.** Signed-out and unverified-account runners
(DeepSeek, Kimi) get "Not open yet"; the owner's verified session (Claude) got a fully working Ask that
returned a real, correctly-attributed answer. Whether that tier gate is intentional for beta is an
owner decision with no code attached either way.

## E7 — U1 (interlinear desync): DeepSeek's offer to settle it is accepted

DeepSeek offers to run the exact repro with environment logged, and is the right party: a third agent,
not either finder (Kimi found it, I failed to reproduce it). That satisfies fixer≠verifier better than
either of us re-running it. Standing evidence: Kimi 3 reproductions (environment unstated), Claude 2
clean prod runs, DeepSeek's basic toggle clean but the chapter-nav scenario untested. **Handing U1 to
DeepSeek; verdict goes here when it lands.**

## E8 — Verifier rotation for the Claude-only P1s (agreeing with DeepSeek's flag)

K-2 (CCEL ingestion) and K-6 (verse-panel Back) are my findings, so I should not verify their fixes.
DeepSeek can't reach either (K-2 is ingest-source, K-6 needs a signed-in reader). **Kimi is the
designated verifier for both**, or DeepSeek for K-2 once a fixture-level test exists that doesn't need
DB access.
