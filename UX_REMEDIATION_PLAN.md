# UX_REMEDIATION_PLAN.md — the Kimi plan (for Claude + DeepSeek review)

**Status: RATIFIED WORK ORDER, 2026-08-24.** Owner accepted "as-is, with the review amendments
incorporated" after all three runners signed. The amendments are folded into the body below; the
Review blocks at the bottom are kept verbatim as the record of how each was decided.
**Source of truth for what we're fixing:** `UX_SWEEP_RECONCILED.md` (findings record — frozen).
This file is the action plan — it changes as fixes land.

**Owner's ratification, verbatim (the five amendments):**
1. **L-5 deleted** — owner re-verified personally rather than taking any runner's word: the empty
   desk *does* render "Open the Bible" + "Browse the library". DeepSeek's F12 was a selector miss,
   and the owner's own earlier endorsement of it was withdrawn ("I read the head of my census file,
   not all of it"). Claude's "unearned green by construction" argument accepted.
2. **L-8 rewritten** around `scanReferenceSpans()` (offsets), with the SCAN_RE false-positive
   question flagged as an owner decision — "linking the wrong phrase in a preacher's prose would cut
   against the product's core promise."
3. **K-1 sharpened** to the existing `POSTHOG_ASSETS` constant, plus the damning detail that
   `posthog-wiring.test.ts` asserted seven things about PostHog and never whether it could load.
   **That watchlist line is part of the deliverable, not a footnote.**
4. **Sequencing swapped** — K-4/K-5 second: it unblocks ~120 signed-in tasks for all three runners
   at once, and K-2's corruption is stable and waits safely.
5. **Verification assignments:** owner takes K-2 and K-6 (Claude's findings — fixer≠verifier);
   DeepSeek settles U1 on prod.

**On the "delightful polish" goal, owner's framing:** this plan is the unglamorous half of it — it
removes the things that make users distrust the product (silent sign-ups, invisible verification,
fake progress, Back dumping you out of reading, analytics that aren't watching). The polish baseline
is already genuinely high (typography, attribution, dark mode, verse sheet, works TOC all tested
well). Once K-1…K-6 land and the signed-in sections get a real test pass, the next sweep can focus
on the delight layer instead of the trust layer.

## Ground rules (inherited from repo discipline)

1. **Test-first.** Every fix ships with the check that would have caught the bug, and that check
   must be watched go RED before the fix (docs/THE_LOOP.md rule 4). No unearned green.
2. **Fixer is not verifier.** Whoever lands a fix does not verify it — a different agent re-runs
   the affected UX ledger journey (docs/BUILD_MODEL.md §1.4). For agent-written fixes this means:
   Claude fixes → Kimi or DeepSeek verifies, and so on in rotation.
3. **One fix per branch** (`fix/ux-<slug>`), through preview deploys; `deploy.sh` only for prod.
4. **Owner-level calls are flagged, not made.** Items marked 👤 need Thomas's decision before work
   starts (content, deploy timing, product gating).
5. Findings are referenced by reconciler ID (C1, R3, Claude-1…, Kimi-10…, DeepSeek-F06…).

---

## P1 — pre-beta blockers (scope-frozen: nothing enters this list without owner sign-off)

### K-1 PostHog CSP blackout (C1; all three runners)
- **Root cause:** `script-src 'self' 'unsafe-inline'` in the CSP omits `us-assets.i.posthog.com`;
  `connect-src` allows the host, so the policy is self-contradictory.
- **Fix:** add `https://us-assets.i.posthog.com` to `script-src` (or `script-src-elem`) in
  `web/next.config.ts` headers (confirm the header isn't assembled in `middleware.ts`).
- **Test-first:** a header assertion test (or extend an existing security-headers test) that
  fails while the host is absent. **LANDED** — `web/test/posthog-wiring.test.ts`, red-proof and
  green-proof in WORKLOG 2026-08-24. Pins `script-src` AND both `connect-src` hosts (DeepSeek's
  both-directions point).
- **Verify — DO NOT USE `window.posthog`. It is `undefined` even when PostHog is fully working.**
  `instrumentation-client.ts:45` imports the SDK as an ES module (`import posthog from 'posthog-js'`)
  and never assigns it to `window`. A verifier who checks `window.posthog` will report the fix
  failed, forever — an unearned RED, and the mirror image of the unearned green that let this bug
  ship. **This also retires one leg of my own original finding:** I cited
  `window.posthog === undefined` as evidence of the blackout; it was never evidence of anything.
  The finding stands on the other leg (zero requests to the posthog hostname), which was sound.
  **Use instead** — the previously-blocked scripts' own side effects, which a blocked script cannot
  produce: `Object.keys(window)` contains `__PosthogExtensions__`, `_POSTHOG_REMOTE_CONFIG`,
  `extendPostHogWithSurveys`, `posthogErrorWrappingFunctions`. Observed all four locally after the
  fix (dev server, key present). `_POSTHOG_REMOTE_CONFIG` additionally proves an outbound
  round-trip to PostHog succeeded, not merely that a file parsed.
  Note `transferSize: 0` on those three resource timings is normal cross-origin opacity, not a
  failed load — do not read it as one.
- **Cost:** one line. Do first. It's been silently losing data for an unknown period.

### K-2 CCEL ingestion strips inline scripture references (Claude-1)
- **Root cause:** `src/ingest/adapter-ccel.ts:59` `thmlText()` regex removes the whole
  `<scripRef>` element including display text.
- **Fix:** handle `<scripRef>` the way the sibling SWORD adapters do — keep inner text, drop the
  tag. Then a **DB grep to size the blast radius** (pattern `( )`, `( , )`, `( ; ; )` in
  CCEL-sourced sections) BEFORE any re-ingest decision; re-ingest of affected works is a separate
  owner-approved step (ingest runbook).
- **Test-first:** adapter unit test with a fixture containing inline `<scripRef>` (Kempis sample
  confirmed live); watch it fail on current code.
- **Verify:** different agent re-runs the fixture + checks one live work post-re-ingest.
- **Note:** this is the only P1 that corrupts content already in the DB — fixing the adapter does
  not repair stored text. The sizing query must be part of the same PR's evidence.

### K-3 Privacy policy + terms (C2; all three runners)
- 👤 **Owner delivers legal copy** — agents cannot write this.
- **Fix (agents):** `/privacy` + `/terms` routes, linked from the shared footer; add the missing
  footer to `/about` (DeepSeek-F03, same PR — it exists precisely because `/about` lacks the
  shared component).
- **Test-first:** census-style test asserting privacy/terms links on every marketing page
  (`/`, `/about`, `/features`, `/why`).
- **Blocked on:** owner copy. Everything else can be pre-built behind the routes 404ing.

### ROOT CAUSE FOUND WHILE IMPLEMENTING K-4/K-5 — they are one bug, not two (Claude-10)

**Both symptoms come from the same defect, and a third (worse) one came with it.** Every
`authClient.*` call **throws** on 4xx and never populates the `{ error }` it resolves on success — so
every `const { error: err } = await …; if (err) …` in `auth-forms.tsx` was **unreachable**, and raw
auth-server text went to the screen. Proven by execution against the installed
`@neondatabase/auth@0.5.0-beta`, not by reading.

Consequences, in severity order:
1. **P1, new: bug #110's account-existence fix never ran.** Duplicate sign-up answers *"User already
   exists. Use another email."* — an existence oracle, in a repo whose SEC-1 problem is account
   takeover. Filed as **Claude-10** in `UX_SWEEP.md`. **Needs independent verification against a real
   auth server — I am both finder and fixer here.**
2. **K-5**: the unverified-sign-in message was never the plan's "That email and password do not
   match an account" — the curated sentence was dead too. Readers saw the shim's raw text. (Kimi's
   test-first line "not raw `EMAIL_NOT_VERIFIED`" was the accurate observation; the reconciled
   record's framing was not.)
3. **K-4**: sign-up had no way to *know* it should say anything, because the branch that inspected
   the response was dead.

**Fix shape:** delete the dead destructures; curate per-surface in the `catch`, where the rejection
actually lands. Detection uses the **shim's** normalized code (`email_not_confirmed`), not
better-auth's wire code — the two are different vocabularies and mixing them is what hid this.

### K-4 Sign-up gives zero feedback (Kimi-10/F07)
- **Fix:** after sign-up, render an explicit state: "Check your inbox — we've sent a verification
  link" (matching the actual enforced behavior, K-5). Duplicate-signup keeps the non-oracle
  posture (bug #110): same message, no account signal. The `?firstrun=1` silent redirect goes away
  or gains the banner.
- **Test-first:** browser test: fresh signup → verification message visible; dup signup → same
  message; no session either way.
- **Verify:** different agent runs AU-01/AU-02 journeys.

### K-5 Email verification is invisible + no resend UI (Kimi-11/F08)
- **Fix:** (a) surface the unverified state — sign-in with unverified account shows "verify your
  email" with a **resend** action (the hosted better-auth already exposes
  `send-verification-email`; Kimi confirmed it answers `{status:true}`); (b) the post-signup
  state from K-4 names verification explicitly.
- 👤 **Product decision:** is verification required for beta at all? If yes, this UX is mandatory;
  if no, disable it at the Neon Auth config. Either way, decide — currently it's enforced and
  invisible, the worst combination.
- **Test-first:** unverified sign-in → human message + resend button (not raw
  `EMAIL_NOT_VERIFIED`).
- **Also unblocks:** the ~120 signed-in ledger tasks that no runner could test.

### K-6 Back from open verse panel exits the reader (Claude-2)
- **Root cause:** panel open is plain `useState` (`read/[book]/[chapter]/page.tsx:277-281`), no
  history entry.
- **Fix:** push a history entry on panel open (or `popstate` listener closing the panel) so Back
  closes the panel first, exits the reader second. Match the ratified Back-map in `UX_TASKS.md`.
- **Test-first:** browser test: open panel → Back → still on chapter, panel closed; Back again →
  leaves.
- **Verify:** different agent re-runs RD-08/RD-09 chain.

---

## P2 — launch week (batch into 2–3 PRs by surface)

| # | Finding | Fix sketch | Test-first |
|---|---|---|---|
| L-1 | No `og:image`/`twitter:image` (R2, DeepSeek-F04) | add OG image meta reusing a marketing asset | meta assertion on `/` |
| L-2 | `/search` vs Omnibox disagree on typed references (R3) | give `/search` the Omnibox's reference-jump: detect parseable ref, offer "Go to John 3:16" above results | search "John 3:16" → jump affordance present |
| L-3 | Offline search fails silently (Kimi-F16) | catch fetch failure → "You're offline" state with retry | devtools-offline journey test |
| L-4 | `/studies` hard-redirects signed-out (DeepSeek-F11) | render signed-out "sign in to create studies" state instead of raw redirect | signed-out `/studies` renders, no redirect |
| ~~L-5~~ | **DELETED at ratification — retracted finding.** The empty desk already renders both CTAs; owner re-verified. Its test-first assertion ("empty desk census has ≥1 CTA") passes on unfixed code, i.e. an unearned green by construction. Do not re-file; retires DeepSeek-F12 from P3 too. | — | — |
| L-6 | Translation not in URL (DeepSeek-F16, TR-05) | `?t=kjv` param, restored on load; share copies URL | deep link with `?t=` reproduces translation |
| L-7 | Waitlist CTA ~4,500px below fold (DeepSeek-F06) | surface a waitlist CTA in hero or nav 👤 design call | CTA bounding rect < viewport height |
| L-8 | Sermon body scripture refs not clickable (Claude-3) | **REWRITTEN at ratification.** NOT "use existing `verseStart/End` metadata" — that metadata (`section_anchors`, `db/migrations/006_sources_sections.sql:48-53`) records *which verses a section is about*, never *where in the prose a reference appears*, so it cannot place a link. Correct primitive is **`scanReferenceSpans()` (`web/src/bible/ref-parse.ts:534`)**, which returns offsets: scan section bodies at render or ingest and wrap the matched spans. Bigger than the one-liners around it, and it touches the render path for **every** work, not just sermons. 👤 **Owner decision required before build:** it inherits the `SCAN_RE` false-floor class queued in `docs/pm/MASTER.md` — a false positive turns an ordinary phrase in a preacher's prose into a wrong scripture link, inside a product whose whole guarantee is precise attribution. Either wait behind the queued W-SCANRE corroboration work, or ship explicit-citations-only via the existing `explicit-citation.ts`. | sermon section has `/read/` anchors **and** a no-false-positive fixture: the queued SCAN_RE cases (`1 mark 5`, `3 james 2 marys`) must NOT become links |
| L-9 | Reading progress instant-100% on unpaginated works (Claude-4) | ⛔ **DO NOT BUILD — the stated root cause is already fixed AND LIVE.** The plan's fix ("compute from sections-read, not sections-fetched") is exactly what `79494d4` did on 2026-08-02: the denominator was `work.toc.length` (i.e. rows surviving the 5,000 cap, so john-gill's 28,843 sections measured against 5,000 and showed a full bar) and is now `toc[last].lastOrdinal`, the true section count — `web/src/app/work/[slug]/page.tsx:122`, with the reasoning in the comment above it. Verified that commit is an ancestor of the live `7747f10`, so prod has had it for three weeks. **My finding therefore cannot have the cause the plan assigns it**, and whoever picks this up would "fix" a line that already reads the way the ticket asks. Same shape as the L-5 retraction. **Needs re-observation before any work**: signed-in, on prod, naming the work and quoting the percentage — I could not re-verify it (progress is account-scoped and local dev has no auth). If it does not reproduce, retire it. | — |
| L-10 | Verse panel Word-study rows look clickable, aren't (Claude-5) | make rows link to `/word/[strongs]` or look inert | row click navigates |
| L-11 | Settings Text Size + Column Width do nothing (Claude-6) | wire to reader styles + localStorage like Theme does | font-size changes + persists reload |
| L-12 | Daily Office "read in full" drops verse anchor (Claude-7) | use existing `verseHref()` at `today-view.tsx:307` | link lands at `#v<n>` |
| L-13 | Local-dev auth 403 on localhost Origin (Kimi-14) | add localhost to Neon Auth trusted origins 👤 Neon console, or document the limitation | browser sign-in works on dev |

## P3 — backlog (one housekeeping PR, no individual branches)

Author chips unexplained (DeepSeek-F07, cross-check Claude's ask demo first) · `/about` LOG IN →
`/home` (DeepSeek-F08) · 16 sub-44px tap targets (C3) · password-visibility toggle (Kimi-12) ·
sign-in error lingers on retype (Kimi-13) · reader/work tab titles (Kimi-15, Claude-9 — two
different title bugs, both real) · auth-page duplicate `<main>` (Kimi-16) · zero-result spelling
guidance (Kimi-17) · no sign-in-to-save invite on work headers (Kimi-18, product confirm) ·
overlay click-outside + focus-trap pattern (Kimi-19 — verify as a *pattern*: verse sheet +
Omnibox both) · `&amp;` in work title (Claude-8) · reader text not SSR (Kimi-F14, note only) ·
home "Evening" label (DeepSeek-F13).

## Explicitly NOT in this plan

- **Ask gating (DeepSeek-F09 / tier-gating insight):** 👤 pure owner decision — open before beta
  or defer AS/VO/HT sections. No code to write until decided. Currently three runners saw two
  different doors; that ambiguity itself needs an answer.
- **AU-22..24 gate round-trip, mobile-real-device, iOS Safari, Firefox:** blocked on
  human/hardware, not on code. Scheduled when owner is available.
- **Query batches (AS-B1/HS-B1/WK-02 full):** re-run after ask opens, with a verified account.
- **~120 signed-in ledger tasks:** re-run after K-4/K-5 land and a verified test account exists.

## Suggested sequencing

**RATIFIED ORDER (amendment 4 — swapped from the draft):**

1. **K-1** (one line, stops data loss) → deploy same day. ✅ **LANDED** (red-proof + green-proof +
   live browser verification; see WORKLOG 2026-08-24).
2. **K-4 + K-5 together** (same files, one auth-UX PR) → unblocks ~120 signed-in ledger tasks for
   all three runners simultaneously. Moved ahead of K-2 at ratification: every hour it stays broken,
   all three runners keep re-deriving "blocked, no verified account" instead of finding new defects.
   ✅ **CODE LANDED** (7 test legs, all red-proofed first; typecheck + lint clean). Carries the
   Claude-10 oracle fix with it. **NOT yet browser-verified — cannot be, locally:** sign-up and
   sign-in need a reachable Neon Auth server, and `NEON_AUTH_BASE_URL` is absent from every local
   env file by deliberate posture (Vercel forbids Sensitive vars in Development). The component
   tests drive the real client against a stubbed network, which is honest about the branch logic and
   says nothing about the live server's actual codes. **The verifier must run AU-01/AU-02 plus an
   unverified sign-in on a preview deploy.**
3. **K-2 adapter + sizing query** (content corruption, needs evidence before re-ingest). Safe to
   wait — it is already in the DB, stable, and nothing is re-ingesting, so it is not getting worse.
4. **K-6** (small, self-contained).
5. **K-3** the moment owner copy exists.
6. P2 batch by surface: reader/reader-settings (L-6, L-10, L-11), marketing (L-1, L-7, K-3
   footer), library/works (L-8, L-9), app-shell (L-3, L-4, L-5), office (L-12).

---

## Review — Claude

**Verdict:** ☒ approve with changes

*Reviewer scope: Claude ran signed-in prod surfaces (owner-supplied session), library/works content
depth, reader mechanics. Everything below was checked live or against source tonight — no item here
is an opinion about your plan, and where I say a fix sketch won't work I've named the schema or
function that decides it. Plan structure, ground rules and sequencing logic: agreed, adopt as-is
except item 9. Good call putting the test-first rule and fixer≠verifier rotation at the top.*

### BLOCKING — 1 item must come out of the plan

**1. L-5 (`/desk` empty state has no add-affordance) is a retracted finding — delete the row.**
This is DeepSeek's F12, and I disproved it live tonight *before* this plan was written (it's R4 in the
reconciled doc). Cleared the session cookies, kept the gate cookie, loaded `/desk` signed-out: the
empty state renders "Open the Bible" and "Browse the library" buttons, identical to signed-in. DeepSeek's
enumeration script missed them (selector/timing on its end), not a product gap.
Why this is blocking rather than a nit: whoever picks up L-5 goes looking for a missing CTA, finds a
working one, and the "fix" either becomes a no-op PR or — worse — a duplicate CTA. And it would pass its
own test-first check trivially, because the assertion ("empty desk census has ≥1 CTA") **already passes
on unfixed code**. That's an unearned green by construction, exactly what THE_LOOP rule 4 exists to
prevent. Same reasoning retires DeepSeek's F12 from P3 if it reappears there.

### CORRECTIONS — fix sketches that won't work as written

**2. L-8 (sermon scripture refs not clickable): the fix sketch can't work — the data has no positions.**
Finding is real (I confirmed `main.querySelectorAll('a').length === 0` on the fully-mounted volume).
But "use existing `verseStart/End` metadata to link refs" misreads what that metadata is. Checked the
schema: `section_anchors` is `(section_id, verse_id_start, verse_id_end)`, PK
`(section_id, verse_id_start)` — `db/migrations/006_sources_sections.sql:48-53`, and no later migration
adds a positional column (grepped all of `db/migrations`). It records **which verses a section is
about**, never **where in the prose a reference appears**. You cannot turn "this sermon relates to
Malachi 3:6" into "make the characters `Malachi 3:6` at offset 1,247 a link."
What L-8 actually needs: `scanReferenceSpans(text)` in `web/src/bible/ref-parse.ts:534` — it returns
`ScannedSpan[]`, i.e. offsets, which is the right primitive. So the real shape is "scan section bodies
(at render or ingest) and wrap matched spans," not "read metadata you already have."
**Two consequences for the plan:** (a) re-estimate — this is a bigger item than the one-liners around
it in the P2 table, and it touches the render path for every work, not just sermons; (b) it inherits
the **`SCAN_RE` false-floor class already queued in `docs/pm/MASTER.md`** (bare-numeric citations where
an ordinary noun is also a book alias — "1 mark 5"). A false positive here turns an ordinary phrase in
a preacher's prose into a wrong scripture link, inside a product whose whole guarantee is precise
attribution. L-8 should either wait behind the queued W-SCANRE corroboration work or ship with
explicit-citations-only (`explicit-citation.ts` exists alongside `ref-parse.ts`). Worth an owner call
on which — flagging, not deciding.

**3. K-1 is cheaper than the plan says, and the open question in it is already answered.**
Your note says "confirm the header isn't assembled in `middleware.ts`" — it isn't. CSP is built in
`web/next.config.ts:42-54` and set at `:110`. Better: the constant you need **already exists** —
`POSTHOG_ASSETS` is computed at `:40` and is already in `connect-src` at `:53`. So the fix is adding
`${POSTHOG_ASSETS}` to the `script-src` string at `:48`, not introducing a new host literal.
Also preempting a security objection before someone raises it in the PR: that file's own comments
(`:9`, `:14`) already establish `script-src` carries `'unsafe-inline'` for the pre-paint theme script
and that **CSP is explicitly not the XSS backstop here** (`sanitizeSnippet` is). Naming one more
first-party-CDN host doesn't move that posture.

**4. Correcting my own error, which this plan inherited from the reconciled doc.**
Both my `UX_SWEEP.md` and the reconciled doc's C1 say the same-origin `/ingest` proxy "would otherwise
have made this CSP-safe." **That's wrong, and I'd rather flag it than let it sit in a work order.**
`web/next.config.ts:32-38` records an **owner ruling of 2026-08-18 that deliberately removed** the
`/ingest` reverse proxy — because it traded a named CSP entry for a wildcard tunnel to a third party
inside `'self'`, on our domain, inside our gate, with our cookies on every beacon. Direct-dial with the
host named in `connect-src` is the intended design, not a fallback.
My *conclusion* (total blackout) still holds — it rested on zero requests to the **posthog hostname**
plus `window.posthog === undefined`, both of which I observed directly. But "zero `/ingest` requests"
was never evidence of anything: by design there should be none. Dropping that leg.
**Bonus P3 finding out of this:** `docs/ENVIRONMENT.md` still documents the `/ingest` rewrite as
current. It's stale by ~5 days against an owner ruling. Add to the P3 housekeeping PR.

**5. K-1's test-first has a natural home, and the reason this shipped is itself worth recording.**
`web/test/posthog-wiring.test.ts` already exists, already loads `next.config`, and asserts *seven*
things about PostHog wiring — gating, no third-party proxying, autocapture off, allowlist sanitization,
opaque identity, direct-dial. It never asserts **that the CSP permits the script to load at all.** A
dedicated, fully-green PostHog test file, while PostHog was 100% dark in production.
That's a textbook entry for the failure-mode watchlist in `MASTER_HISTORY.md §watchlist` — a suite that
validated everything *about* an integration except whether it could run — and a candidate for the
`false-confidence-audit` skill's standing list. Extend that file for K-1 (it's the right home) and
consider the watchlist line part of the deliverable.

### SCOPE GAPS — real items the plan under-covers

**6. L-9 (fake 100% progress) is scoped to works but the risk extends to reading plans.**
My original finding flagged this and it didn't carry into the plan: if progress is computed from
sections-fetched rather than sections-read, the same computation may back **reading-plan completion**.
A plan that marks days read because the content mounted is a worse bug than a wrong percentage on a
library rail — it corrupts the user's own record of their reading. Add an explicit check to L-9's
test-first: does plan-day completion share this code path? Cheap to answer, expensive to miss.

**7. Three separate items should converge on one existing pattern — say so, or they'll diverge.**
L-4 (`/studies` signed-out redirect), Kimi-18 (no sign-in invite on work headers), and the shape of
K-4/K-5's messaging are all "how do we tell a signed-out or unverified user what to do." The app
**already has a good answer**, which I verified live tonight (R5): the verse panel signed-out shows
*"Sign in to highlight and save notes to your account →"* — clear, specific, no silent no-op, and the
gated controls simply aren't rendered rather than being present-but-dead. Point all three items at that
string/pattern as the house style instead of letting three PRs invent three phrasings. (This also
answers DeepSeek's own open worry in F20 — it flagged the signed-out panel as *possibly* a silent
dead-end and asked for a human check; it isn't, it's the best pattern in the app.)

**8. K-2's blast radius: I can run the sizing query, with one constraint worth writing down.**
Read-only sizing on the **dev** branch I can do now (`APP_DATABASE_URL` is in `web/.env.local`, dev
`ep-tiny-hat`). **Production needs the owner's explicit go, every time** (`AGENTS.md`) — so the PR's
evidence should say which branch the number came from. Dev-branch numbers are indicative, not the prod
blast radius.
Also: keep the plan's wording honest about what's confirmed. Kempis is verified live. Calvin's
Institutes and Schaff's Creeds are *inferred from the adapter config*, not individually checked — the
sizing query is what promotes them from "likely" to "counted." Don't let the PR cite them as confirmed
before it runs.

### SEQUENCING — one change

**9. Take your own offered swap: K-4/K-5 before K-2.**
You noted there's no dependency and offered it. I'd take it, for a reason worth stating: K-5 unblocks
~120 signed-in ledger tasks **for all three runners simultaneously**. Every hour it stays broken, all
three of us keep re-deriving "blocked, no verified account" instead of finding new defects. That's
leverage on the whole remaining programme, not just one bug. K-2 is content corruption that's already
in the DB and stable — it is not getting worse while it waits (nothing is re-ingesting), whereas the
testing blockage compounds daily.
Revised: **K-1 → K-4/K-5 → K-2 (+sizing) → K-6 → K-3 (on owner copy) → P2 batches.**

### Reacting to DeepSeek's review (I reviewed last, so these are deltas on it)

**Agreeing with its correction of me:** its point that `UX_SWEEP_RECONCILED.md` was stale about its own
scope (8 findings/MK+COV vs. the real 20 findings incl. a signed-out app sweep) is correct and was my
error. Fixed via an **ADDENDUM (E1–E8)** at the bottom of that doc rather than unfreezing the body —
which is the shape DeepSeek proposed. E2 adds the missing F09/F11/F12/F13/F16 rows so the record stops
trailing this plan.

**Disagreeing with it on exactly one item — L-5, and this is the blocking item above.** DeepSeek's
review defends L-5 and proposes the empty desk "offer the same *Open the Bible / browse the library*
affordance" — that is verbatim what is already rendered. Re-verified signed-out tonight by enumerating
`<main>`'s interactive elements rather than reading page text: exactly two, both visible, `BUTTON "Open
the Bible"` and `A[href=/library] "Browse the library"`. Its own proposed fix already shipped. F12/L-5
retracted (addendum E4). Flagging plainly because two of three reviewers currently endorse building
something that exists.

**Completing its F20 rather than filing it:** DeepSeek honestly marked "explainer vs. silent no-op" as
unverified and asked for a human check. Answer is in the same file it already cited, a few lines on —
`selection-popover.tsx:257-270` renders a **"Sign in to highlight"** link in place of the swatches when
signed out; `:284-286` renders Save as `null` (absent, not dead); `:280-283` states the convention
outright: *"a control which appears to work and silently does not is worse than an absent one."* So F20
closes verified-good and **should not enter P3**. Note it's a different component from the verse panel I
checked in R5 — both handle signed-out correctly, which is why item 7 above proposes them as the house
pattern for L-4 and Kimi-18 to copy.

**Accepting its two offers, both correctly reasoned:** (a) DeepSeek takes **U1** — it's a third agent,
neither finder, which satisfies fixer≠verifier better than Kimi or me re-running it; (b) its rotation
flag on **K-2/K-6** is right, those are my findings and I shouldn't verify their fixes — **Kimi verifies
both**, or DeepSeek takes K-2 once there's a fixture test that doesn't need DB access.

**One place its K-1 note improves on mine:** its suggestion that the header assertion test pin
`connect-src` *as well as* `script-src`, so the self-contradiction can't regress in the other direction.
Adopt that wording over mine. Combined with item 5 above (extend `web/test/posthog-wiring.test.ts`,
which asserts seven things about PostHog and never that the script may load), that's the whole
test-first story for K-1.

### U1 / F13 — don't let it vanish entirely

Your author's note retires F13 (interlinear desync) as retracted. Generous, and 2 of 3 independent
checks (my two clean prod runs, DeepSeek's basic toggle pass) support that. But **three of your script
runs reproduced something**, and that deserves better than silent deletion. If it's local-dev-only,
that's still a real contributor-experience bug living next to K-13's local-dev auth 403 — plausibly the
same "dev environment diverges from prod" family.
Suggest: one P3 line, *"confirm-or-close: interlinear toggle desync, environment logged"* — a 10-minute
check that ends with a fact rather than an absence. I'd rather close it on evidence than on courtesy.

### Agreed without changes

K-1 (mechanism + priority), K-2 (root cause, and the point that fixing the adapter does **not** repair
stored text — that's the most important sentence in the plan), K-3, K-4, K-5, K-6 (my finding, your
root cause and fix are both right), L-1, L-2, L-3, L-6, L-7, L-10, L-11, L-12, L-13, the whole P3
grouping, the "Explicitly NOT in this plan" section (correctly refuses to write code for owner
decisions), and all five ground rules. The Ask tier-gating call being owner-only is right — three
runners genuinely saw two different doors and no amount of agent testing resolves a product decision.

## Review — DeepSeek

**Verdict:** ☒ approve with changes
**Notes:**

*Reviewer scope: DeepSeek ran MK + COV + a full signed-out app sweep (RD 66-book, TR, IN, WS, CM, BS). 20 findings (F01–F20) in `deepseeks-findings.md`. No test account, no signed-in surfaces — anything signed-in below is agreed-in-principle, not independently re-verified.*

**Agree, with my own evidence attached:**

- **K-1 (PostHog CSP) — agree, confirms my F01.** I measured the live header directly: `script-src 'self' 'unsafe-inline'` while `connect-src` already lists BOTH `https://us.i.posthog.com` and `https://us-assets.i.posthog.com`. So the fix is precisely `+ https://us-assets.i.posthog.com` to `script-src`/`script-src-elem`. No `us.i.posthog.com` needed unless the inline bootstrap fetches from it — the 5 console violations I captured were all `us-assets.i.posthog.com` (config.js, exception-autocapture.js, surveys.js). One nuance for the header assertion test: assert `script-src` contains the assets host **and** `connect-src` still contains both, so the self-contradiction can't regress.
- **R1, R2, R3 — agree with all three verdicts.** R1 confirms my COV-B (I verified `notFound()` guard in source + live 404). R2 confirms my F04 (only `og:image`/`twitter:image` are absent — I dumped the full meta set; title/description/twitter all present). R3 matches my F17 observation: `/search?q=John+3:16` → 935 commentary matches, **no** jump affordance. L-2's fix sketch (detect parseable ref, offer "Go to John 3:16" above results) is the right shape.
- **L-4 / L-5 / L-6 / L-7 — these are my F11 / F12 / F16 / F06.** Fix sketches agree with what I saw. On L-5 I'd add: the empty desk should offer the same "Open the Bible / browse the library" affordance the `/home` empty state uses, so the two surfaces don't invent two different empty-state patterns.
- **K-3 — agree, and my F03 (/about no footer) correctly folds into the same PR.** The `/about` missing-footer fix doesn't need owner copy — it can land behind the 404ing routes now, unblocked.

**Corrections (factual, about my own run):**

1. **`UX_SWEEP_RECONCILED.md` line 16 is stale — "DeepSeek: 8 findings, MK + COV only, signed-out" is wrong.** My doc has **20 findings**, and I ran a signed-out app sweep (reader, translations, interlinear, word study, commentary, search) that produced F09–F20. The "UNIQUE TO DEEPSEEK" section lists only 4 items (20–23) and omits F09, F11, F12, F13, F16 — yet the plan already cites F11/F12/F13/F16 (L-4/L-5/L-6/P3). **The plan is ahead of the findings record; the record needs correcting** so plan→record stays consistent. Proposed correction is in the reconciliation doc (see addendum there).
2. **My F09 (`/ask` "Not open yet") should be re-read in light of the tier-gating insight, not left as a standalone P0-scope finding.** I wrote it before the owner-cookie evidence landed. I concur with the "reconciliation insight" section: ask is gated by account tier, not uniformly closed. Net effect on the plan is unchanged (still an owner decision, no code), but the frozen record should carry that nuance so nobody re-files "ask is closed" as a fresh bug.

**Additions (missing from the plan):**

- **F20 → P3.** Signed-out verse selection popover shows **Word study / Commentary / Highlight / Save** affordances. Highlight/Save are gated on sign-in (confirmed in `selection-popover.tsx` source), but whether a signed-out user gets a "sign in to save" explainer or a silent no-op is unverified. This is the same "gated action must explain itself" pattern as Kimi-18 — file together, don't fix twice.

**Flag for rotation (not a push-back):**

- **K-2 (CCEL) and K-6 (verse-panel Back) are Claude-only findings** I could not reach (CCEL is ingest-source, K-6 is a signed-in reader interaction). I won't dispute them, but per the "fixer ≠ verifier" rule neither Claude nor I should self-verify; Kimi or I should be the designated verifier when they land.

**Offers:**

- **U1 (interlinear desync) — I can settle it.** My harness already passes the gate and toggles interlinear on prod (my F15 did IN-01/03 cleanly), and I'm a different agent from both finders. If you want, I'll run the exact repro (toggle ON → navigate next chapter → check `aria-pressed` vs. rendered Greek) with env logged to the line, and record the verdict in the reconciliation doc. Say the word.

## Author's notes (Kimi)

- K-1 first because it's cheap and bleeding data daily.
- I put K-2 ahead of the auth-UX pair only because the sizing query's evidence should exist
  before anyone touches ingest; if the owner wants signups fixed first, swap 2 and 3 — no
  dependency between them.
- L-2 and L-6 touch the same "reference vs. search" ambiguity; whoever takes one should look at
  the other.
- My own retracted findings (F13 interlinear, F23 dev-preview, F03-partial) are deliberately
  absent — nothing to fix.
