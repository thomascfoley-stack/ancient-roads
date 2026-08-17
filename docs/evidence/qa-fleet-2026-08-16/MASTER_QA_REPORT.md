# Ancient Paths — Overnight QA Fleet Master Findings Report

> ## ⚠ CORRECTION, 2026-08-17 — read before acting on the two BLOCKERs
>
> **BLOCKER 1 ("no site-wide access gate on any route") is FALSE.** The gate is up and unchanged
> since `2338c57` (2026-07-15). Re-measured against production 2026-08-17:
> `/read/jhn/1`, `/ask` and `/sitemap.xml` all `307 → /gate?next=…`; only `/`, `/about`,
> `/features`, `/why` and named marketing assets are public, per the exact-match allowlist in
> `web/src/lib/gate.ts`. **The sessions were behind the gate the whole time**: the gate cookie is
> set `httpOnly: true` (`web/src/app/api/gate/route.ts:56`), so `document.cookie` reads empty while
> a valid cookie is present. An instrument's blind spot was recorded as a property of the world —
> watchlist instance six, in a report written to find defects.
>
> **BLOCKER 2 (`/ask` 401s a signed-out visitor) is correct behaviour**, downgraded to MAJOR-UX: the
> defect is that nothing announces the requirement until after submission.
>
> **Therefore every session was a gate-passed, signed-out visitor, not an anonymous member of the
> public.** The findings are relabelled, not invalidated — that is the beta-tester persona. But any
> line phrased "an anonymous visitor can reach X" says nothing about the public.
>
> Also flagged UNREPRODUCED: the MAJOR "hero CTA is inert" — it is `<a href="#ask">` with a matching
> `id="ask"` section 16 lines below (`web/src/app/page.tsx:78`), and two other sessions describe it
> correctly as an anchor scroll.
>
> Triage plan and the full verification list:
> [`docs/pm/orders/2026-08-17-qa-fleet-attack-plan.md`](../../pm/orders/2026-08-17-qa-fleet-attack-plan.md).
> Findings below are left as filed — this is evidence, annotated not rewritten.

**Date:** 2026-08-16
**Target:** https://ancientpaths.app (production)
**Method:** 20 independent persona-driven QA sessions, each an anonymous (logged-out) visitor,
run concurrently in a shared browser pool. Raw session output synthesized below; nothing here has
been re-verified independently — treat every line as a QA report to triage, not a proven defect.

---

## Executive summary

- **20 sessions run**, ~230 distinct workflow steps performed in total across them (counting each
  session's own `workflows_performed` list).
- **Findings after deduplication, by severity:**
  - **Blocker: 2** — the anonymous Ask wall (hit independently by 13 of 20 sessions), and the
    complete absence of any site-wide access gate on any route tested.
  - **Major: 24**
  - **Minor: 33**
  - **Cosmetic: 9**
  - **Note (positive / informational / no-defect): 47**
  - **Total distinct findings after merging duplicates: 115** (raw, pre-dedup finding count
    across all 20 sessions' `findings` arrays was well over 220; the number above is after
    merging same-URL/same-symptom reports into one line with a session count).
- **The single most-repeated finding, by a wide margin:** submitting any question through `/ask`
  as an anonymous visitor returns an instant `401` — `"Please sign in to explore the paths."` —
  with no upfront warning anywhere on the page before the user types and submits. **13 of 20
  sessions** independently found and filed this (as blocker or major, depending on the persona).
  The composer, lane filters, and example prompts all render normally and invite input; the
  failure is only discoverable after submission.
- **What this run could not tell us:** every account-gated feature — highlighting/annotations,
  the prayer journal's write path, desk save/load persistence across devices, My Works uploads,
  Settings persistence, and (most importantly) **whether the Ask pipeline's actual model output
  ever violates the "concordance not commentator" guarantee** — was unreachable, because the
  fleet is not permitted to create accounts or enter passwords. Every attempt to test the
  interpretation guarantee live (one session ran 5 deliberately leading/bait questions
  specifically to probe this) hit the same 401 before any model output was ever produced. This is
  a coverage gap, not a clean bill of health: the product's core guarantee was **not exercised at
  all** in this run. RLS / multi-account data isolation is likewise entirely untested — it needs
  two real accounts, which no session had.

---

## Sessions run (20)

| # | Persona | Coverage in one line |
|---|---|---|
| 1 | Cold-start first-time visitor | Full marketing site read-through, LOG IN button behavior, /library hang, footer/contact |
| 2 | Anonymous Ask explorer | 6+ real Ask submission attempts, all blocked; retry/duplicate-error behavior; mobile check |
| 3 | Verse panel deep reader | John 1 verse-by-verse panel mechanics across 12 verses; panel navigation gaps |
| 4 | Topical deep-dive researcher | Ask blocked; pivoted to Passage search and verse commentary; infinite-scroll book-jump bug |
| 5 | Church historian (Ephesus) | Ask blocked; Historians/Theology library search quality; reader TOC dead click |
| 6 | Hymnody-to-scripture researcher | Hymn-to-verse cross-linking coverage and gaps; Passage search omits hymns lane |
| 7 | Greek/Hebrew word study prober | Standalone lexicon vs. in-reader interlinear word-study tool; Hebrew/Greek tab bug |
| 8 | Library and catalog browser | All 6 subject catalogs, full-work reads, catalog search box (broken), taxonomy bugs |
| 9 | Reader navigation stress-tester | Deep-link stress test, Back-button stack, malformed/out-of-range routes, recovery cost |
| 10 | Mobile pastor (390px) | Mobile-width pass over homepage/Ask/reader/library/desk; one real Ask attempt |
| 11 | Tablet user (768px) | 768px layout audit (sidebar, Ask, settings, desk); found /settings now fully built |
| 12 | Gated-feature boundary prober | Systematically probed every account-required surface's failure mode (all clean gates) |
| 13 | Interpretation-guarantee prober | 5 deliberately leading/bait questions submitted to test the guarantee — all blocked pre-inference |
| 14 | Anonymous desk explorer | Desk discoverability, multi-pane mechanics, URL-only state, no nav entry point |
| 15 | Console and network error hunter | Cross-page console/network sweep; Search vs. Ask inconsistency; alias gaps |
| 16 | Broken-link and alias hunter | Systematic URL guessing: book aliases, deprecated paths, data-endpoint paths, XSS probe |
| 17 | Slow-query patience tester | Attempted to time 6-8 real Ask queries for latency; all blocked instantly, zero data |
| 18 | Keyboard-only accessibility skim | Tab-only navigation of homepage; found the primary hero CTA inert for keyboard AND mouse |
| 19 | Marketing funnel checker | Full funnel walk: hero CTA, demo sections, Log in, footer, /features, /why |
| 20 | Simulated returning-user session | Set preferences, closed tab, reopened, checked what persisted anonymously (partial) |

---

## Methodology note: the no-login constraint (a deliberate gap, not an oversight)

Per the fleet's hard rules, **no session was permitted to create an account, enter a password, or
sign in by any means** — including Google OAuth. This was true for all 20 sessions without
exception. The practical consequence, observed and reported independently by most sessions: the
product's flagship feature (Ask) is gated behind sign-in, so **no session ever obtained a single
real Ask answer**. Everything this report says about Ask, retrieval quality, voice attribution,
latency, or the interpretation guarantee is therefore about the **request/response mechanics of
the gate itself** — never about the model output behind it. Separately, roughly 12 of the 20
sessions reported that the shared QA browser pool was heavily contended (tab-creation capped,
tabs hijacked mid-task by other concurrent agent sessions, occasional "tab not fronted" errors).
Findings that could not be independently re-verified after such contamination were, per each
session's own account, either discarded or explicitly flagged low-confidence below — they are
kept in an "environment caveats" bucket per area rather than reported as confirmed product defects.

---

## Findings by area

Each line: **[severity] Title** (N sessions) — CONFIRMS KNOWN ISSUE: name / NEW — one-line detail.

### Auth-boundary

- **[BLOCKER] No site-wide access/password gate encountered on any route, despite documented
  pre-launch policy** (2 sessions: Cold-start [blocker]; Gated-feature boundary prober [note,
  flagged as a discrepancy with MASTER.md's SEC-1]) — NEW. Every route tested across the whole
  fleet (marketing pages, `/home`, `/library/*`, `/read/*`, `/ask`, `/desk`, `/settings`,
  `/account/settings`) rendered full real content with zero password prompt and an empty
  `document.cookie`/gate-pass cookie the entire time.
- **[MAJOR] "LOG IN" nav button does not lead to a login form — it silently drops the visitor into
  the full app as an unauthenticated guest** (2 sessions: Cold-start, Marketing funnel checker) —
  NEW. Href is `/home`, not `/auth/sign-in`; the real sign-in route only exists inside the app's
  own sidebar/menu.
- **[MAJOR] Authenticated-only deep links silently bounce a signed-out visitor to a bare sign-in
  screen with no return path and no explanation** (1 session: Broken-link and alias hunter) — NEW.
  `/account/settings` and `/ask/<id>` both client-redirect to `/auth/sign-in` with the original
  destination not preserved anywhere visible.
- **[MINOR] Anonymous reader-page loads fire a console-visible 401 from `/api/annotations` on
  every load** (5 sessions: Cold-start, Verse panel deep reader, Greek/Hebrew word study prober,
  Mobile pastor, Reader navigation stress-tester [NaN-chapter variant]) — NEW. Page itself renders
  fine; only the annotations fetch fails, but it fails loudly in devtools on every single reader
  page view.
- **[NOTE] Every other account-gated surface tested gates cleanly and legibly** (5 sessions:
  Gated-feature boundary prober, Mobile pastor, Library and catalog browser, Console and network
  error hunter, Anonymous desk explorer) — NEW (positive). Prayer journal, My Works/uploads,
  Saved (notes/highlights/bookmarks), and `/account/settings` all settle on a clear "Sign in to…"
  message with a working link; no crashes, no silent no-ops. One flagged flash-of-wrong-state on
  `/prayers` (briefly shows a "Write a prayer" button before the gate resolves) — minor, 1 session.
- **[NOTE] No cookies at all for anonymous visitors — all local state (theme, translation, text
  size, reading/scroll position) lives purely in localStorage** (1 session: Simulated
  returning-user session) — NEW. Not a bug, but means anonymous continuity is strictly
  per-browser with no user-facing warning that it can be lost.

### Ask / Retrieval

- **[BLOCKER] Every `/ask` submission by an anonymous visitor fails instantly with 401 —
  `"Please sign in to explore the paths."`** (13 of 20 sessions: Anonymous Ask explorer, Topical
  deep-dive researcher, Church historian, Hymnody researcher, Greek/Hebrew word study prober,
  Mobile pastor, Tablet user, Interpretation-guarantee prober, Console and network error hunter,
  Slow-query patience tester, Marketing funnel checker, Simulated returning-user session,
  Keyboard-only accessibility skim) — NEW. Confirmed with hand-typed questions, the page's own
  suggested example prompts, and the "Ask again" retry — all fail identically, in well under a
  second, not the 15-45s / ~10s the page itself advertises. Blocks the entire core
  workflow for every persona whose task depended on it; also means the "concordance not
  commentator" guarantee could not be exercised even once, adversarially or otherwise, in this run.
- **[MAJOR] The `/ask` composer gives zero upfront signal that anonymous use is blocked — the gate
  is discoverable only after the user has typed a full question and submitted it** (rolled into
  the count above; called out separately by Anonymous Ask explorer, Church historian, Mobile
  pastor, Tablet user, Slow-query patience tester, Marketing funnel checker) — NEW. No disabled
  state, lock icon, or inline note anywhere on the page beforehand.
- **[MAJOR] Homepage's "Ask the tradition" / "See it answered" demo section is entirely
  static — zero interactive elements, no path into the real `/ask` feature** (3 sessions:
  Cold-start, Marketing funnel checker [most detailed — confirmed 0 links/buttons in the section's
  DOM], Keyboard-only accessibility skim) — NEW. The homepage's own example question and its
  play-icon affordance do nothing when clicked.
- **[MINOR] Retrying a failed Ask stacks a duplicate question/error block instead of replacing the
  failed one** (2 sessions: Anonymous Ask explorer, Hymnody researcher) — NEW.
- **[MINOR] The "please sign in" error has no actionable sign-in link of its own** (3 sessions:
  Anonymous Ask explorer, Slow-query patience tester, Marketing funnel checker) — NEW. Only
  control offered is "Ask again," which just re-fails identically; the real Sign in link is
  elsewhere in the nav/menu.
- **[MINOR] Inconsistent copy and control layout across fresh loads of the same `/ask` URL** (2
  sessions: Anonymous Ask explorer, Topical deep-dive researcher) — NEW. Stated latency swings
  between "15-45 seconds" and "about ten seconds"; the collections filter renders as a collapsed
  dropdown on one load and fully expanded chips on another, with no user action in between.
- **[MINOR] Clicking an example prompt auto-submits instead of filling the textbox for review**
  (1 session: Slow-query patience tester) — NEW.
- **[MINOR] Third example prompt's wrapped second line is clipped by the divider below it at
  390px** (2 sessions: Topical deep-dive researcher, Mobile pastor) — NEW, same bug both times.
- **[MINOR] Submitting one question fires two near-simultaneous POST requests to
  `/api/ask/stream`** (1 session: Interpretation-guarantee prober) — NEW. Cost impact on a real
  (non-401) request is unverified — flagged as worth checking against a successful run.
- **[COSMETIC] Page `<title>` for `/ask` reads "Explore the paths," not anything containing "Ask"**
  (1 session: Cold-start) — NEW.
- **[COSMETIC] Momentary empty error banner frame when retrying a failed Ask** (1 session:
  Marketing funnel checker) — NEW.
- **[NOTE] Search (`/search`) works fully, live, and unauthenticated while Ask does not, despite
  similarly-worded framing** (1 session: Console and network error hunter) — NEW. Highlights an
  inconsistency between the product's two most similar-sounding entry points.
- **[NOTE] First Ask submission attempt in one session failed silently with no error message at
  all, before a second identical attempt correctly showed the 401 banner** (1 session, low
  confidence, possible tooling artifact: Greek/Hebrew word study prober) — NEW.

### Marketing funnel

- **[MAJOR] Primary hero CTA "See it answered" does nothing at all when activated — confirmed via
  both keyboard Enter and a genuine mouse click** (1 session: Keyboard-only accessibility skim) —
  NEW. `location.href`, `scrollY`, and focus all unchanged after activation. Note: this
  contradicts other sessions' description of the same button as "anchor-scrolls to a static demo"
  (Cold-start, Marketing funnel checker) — worth reconciling; may be a race/hydration-timing issue
  rather than two different behaviors.
- **[MINOR] Footer "Contact" column contains no actual contact method** (3 sessions: Cold-start,
  Broken-link and alias hunter, Marketing funnel checker) — NEW. Column is headed "Contact" but
  only links to About and the mislabeled Log in.
- **[NOTE] Waitlist copy ("we invite a few readers at a time") is contradicted by how much of the
  app is actually open with no invitation at all** (2 sessions: Cold-start, Marketing funnel
  checker) — NEW.
- **[NOTE] The homepage's John 1:1 "TEN VOICES ON THIS VERSE" demo is genuinely interactive and
  its promise holds up end-to-end into the real reader** (1 session: Marketing funnel checker) —
  NEW (positive) — the one funnel promise that fully works.
- **[NOTE] /features repeats the same static, unlinked "one question, four registers" illustration
  with no path to try it live** (1 session: Marketing funnel checker) — NEW.
- **[NOTE] The Easter Sunrise Sermon demo's specific claimed sources cannot be verified by a
  visitor before signup, since the feature that would prove it (Ask) is gated** (1 session:
  Marketing funnel checker) — NEW.

### Reader — verse panel & navigation

- **[MAJOR] John 1:1 panel states "Showing 10 of 11 voices" with no way to reach the 11th** (1
  session: Verse panel deep reader) — NEW.
- **[MAJOR] No next/previous-verse control inside the study panel — verse-by-verse reading
  requires close + relocate + reopen for every single verse** (1 session: Verse panel deep
  reader) — NEW.
- **[MAJOR] Adjacent verse numbers remain visible beside an open panel but clicking one silently
  closes the panel (hits an invisible backdrop) instead of switching verses** (1 session: Verse
  panel deep reader) — NEW, reproduced twice.
- **[MAJOR] In-work Table of Contents button is a dead click — no drawer, no navigation, no
  error** (1 session: Church historian, tested on 2 different works) — NEW. Makes it effectively
  impossible to browse a long reference work to a named section without already knowing the URL.
- **[MAJOR] Infinite-scroll silently jumps from the end of 1 John into unrelated chapters of the
  Gospel of John instead of advancing to 2 John** (1 session: Topical deep-dive researcher,
  reproduced twice with different scroll amounts) — NEW.
- **[MINOR] Reading-settings popover and the verse-study dialog can both be open simultaneously,
  overlapping** (1 session: Verse panel deep reader) — NEW.
- **[MINOR] Verse-number tap targets are well under the WCAG 24x24px guidance** (1 session: Verse
  panel deep reader) — NEW, ~5.5x11px raw box.
- **[MINOR] Background verse buttons remain in the accessibility tree, focusable and unmarked,
  while the study dialog is open on top of them** (1 session: Verse panel deep reader) — NEW.
- **[MINOR] "Bible" bottom-nav tab always hardlinks to John 1, discarding current reading
  position** (1 session: Reader navigation stress-tester) — NEW, confirmed from 4 different deep
  positions.
- **[MINOR] Out-of-range chapter routes render a text-only dead end with no recovery link and no
  chapter selector** (2 sessions: Reader navigation stress-tester, Broken-link and alias hunter) —
  NEW.
- **[MINOR] Word-study gloss for θεός (G2316, "God") shows "figuratively" instead of a meaning**
  (1 session: Simulated returning-user session) — NEW.
- **[MINOR] Library's own copy overstates what sign-in adds — claims "sign in to keep... your
  place in a work," but reading position for Library works demonstrably persists anonymously via
  localStorage across a full tab close/reopen** (1 session: Simulated returning-user session) —
  NEW.
- **[COSMETIC] An unrelated, unexplained Gethsemane quote ("Nevertheless, not as I will...") is
  hardcoded at the bottom of every verse-study panel regardless of which verse is open** (2
  sessions: Verse panel deep reader, Greek/Hebrew word study prober) — NEW.
- **[NOTE] Same commentary block correctly repeats verbatim across the verse span it actually
  covers, rather than being duplicated everywhere; topical sections (Theology, Sermons, Hymns) are
  genuinely verse-specific, not blanket-duplicated** (2 sessions: Verse panel deep reader, Church
  historian) — NEW (positive) — evidence the underlying retrieval is verse-grounded.
- **[NOTE] Bible reading position (book/chapter) does not persist across a tab close/reopen, unlike
  Library works, which do** (1 session: Simulated returning-user session) — NEW.
- **[NOTE] No React #418 hydration error reproduced this run on any reader page load** (6
  sessions: Hymnody researcher, Library and catalog browser, Console and network error hunter,
  Reader navigation stress-tester, Broken-link and alias hunter, Interpretation-guarantee prober)
  — CONFIRMS KNOWN ISSUE: React #418 hydration error on reader pages (not reproduced this
  session, in every instance — does not prove fixed; console tools have a known blind spot for
  errors thrown before they start listening).

### Word study

- **[MAJOR] Standalone `/library/word-study` lexicon page is a strictly thinner tool than the same
  feature reached via the reader's interlinear toggle** — missing grammatical parsing, the
  cross-verse occurrence list, and the commentary link (1 session: Greek/Hebrew word study
  prober) — NEW.
- **[MAJOR] Hebrew tab on the standalone lexicon intermittently searches stale Greek data with no
  error or loading indicator on the first switch after page load** (1 session: Greek/Hebrew word
  study prober) — NEW.
- **[MINOR] Word-study occurrence links jump to the top of the chapter, not the specific verse**
  (1 session: Greek/Hebrew word study prober) — CONFIRMS KNOWN ISSUE: Notes/annotations link back
  to the chapter, not the specific verse (same underlying pattern on a new surface).
- **[MINOR] Interlinear mode is dropped when following a word-study occurrence link** (1 session:
  Greek/Hebrew word study prober) — NEW.
- **[NOTE] Interlinear data is well-licensed and correctly attributed** (SBLGNT/MorphGNT/Open
  Scriptures Hebrew Bible, all CC BY / CC BY-SA, Strong's public domain) (1 session: Greek/Hebrew
  word study prober) — NEW (positive).

### Content-gaps (hymns / historians / theology)

- **[MAJOR] Watts's "When I Survey the Wondrous Cross" is not cross-linked to Galatians 6:14,
  despite the hymn's own printed header citing that exact reference** (1 session: Hymnody
  researcher) — NEW.
- **[MAJOR] The dedicated "Passage search" tool omits the Hymns & Sacred Poetry lane entirely** (1
  session: Hymnody researcher) — NEW.
- **[MAJOR] Library search silently no-ops on Sermons and Historians categories instead of showing
  "no matches"** — reverts to the full unfiltered catalog with no indication the search ran (1
  session: Church historian) — NEW.
- **[MINOR] Searching "Ignatius" surfaces the wrong Ignatius (Loyola, 16th c.) far more
  prominently than Ignatius of Antioch, the actual apostolic father relevant to most church-history
  queries** (1 session: Church historian) — NEW.
- **[MINOR] Passage search's stated source count (9) disagrees with its own live source-dropdown
  count (10)** (3 sessions: Hymnody researcher, Church historian, Library and catalog browser) —
  NEW, same bug found independently three times.
- **[MINOR] "Amazing Grace" carries no scripture heading in this edition, so it can never be
  verse-linked** (1 session: Hymnody researcher) — NEW (source-edition limitation).
- **[MINOR] Apparent OCR/parsing artifact in a multi-reference hymn heading** ("Col. 9. 16" — not
  a valid reference) (1 session: Hymnody researcher) — NEW.
- **[MINOR] Hymnal reader's Table of Contents has no way to browse or filter by scripture
  reference** (1 session: Hymnody researcher) — NEW.
- **[MINOR] Library miscategorization — a Greek-text scholarly commentary on James is filed under
  Hymns & Poetry** (1 session: Hymnody researcher) — NEW.
- **[NOTE] "It Is Well with My Soul" is absent from the corpus** (1 session: Hymnody researcher) —
  NEW (content-coverage observation; likely outside the corpus's pre-1900 PD skew).
- **[NOTE] No primary-source text of Ignatius of Antioch's actual letters exists in the corpus;
  the Historians library holds exactly one work (Josephus)** (1 session: Church historian) — NEW.
- **[NOTE] Song of Songs commentary coverage is thin in Passage search** (1 session: Library and
  catalog browser) — CONFIRMS KNOWN ISSUE: Song of Songs / gill-song corpus gap (STATE_OF_TRUTH /
  Lane D D1), observed here from the browsing side.
- **[NOTE] Verse panel's Hymns section correctly surfaces scripture-to-hymn connections when the
  link exists (John 1:1, Psalm 23:1), clearly labeled paraphrase-not-Scripture** (1 session:
  Hymnody researcher) — NEW (positive) — confirms the underlying mechanism works, only coverage is
  inconsistent.

### Library / Catalog

- **[MAJOR] `/library` hangs indefinitely on "Loading the library" for an anonymous visitor on a
  direct/hard page load** (3 sessions: Cold-start, Simulated returning-user session [hard-nav
  specifically], Church historian [intermittent, several-second 0x0 viewport variant]) — NEW.
  Sidebar category counts load correctly; only the main content pane never resolves. Reaching the
  same page via in-app client-side navigation works reliably.
- **[MAJOR] Catalog-level search box does not filter or navigate on submit** (1 session: Library
  and catalog browser, tested on 2 catalogs with both Search-button and Enter-key submission) —
  NEW.
- **[MAJOR] Sidebar "Yours" nav labels do not match the pages they open** — "Notes" opens a page
  headed "Saved," "Saved" opens a page headed "My books," "My uploads" opens a page headed "My
  Works" (1 session: Library and catalog browser) — NEW.
- **[MINOR] Every `/library/*` page shows a 6-13 second loading skeleton before content appears,
  even though the underlying data request returns in about a second** (2 sessions: Library and
  catalog browser, Broken-link and alias hunter [`/library/uploads` specifically, ~4-5s longer
  than its sibling `/library/books`]) — NEW.
- **[MINOR] Hymns & Poetry tradition filter is fragmented by inconsistent capitalization**
  ("anglican" / "Anglican" / "Anglican-Evangelical" as three separate chips) (1 session: Library
  and catalog browser) — NEW.
- **[MINOR] Thomas Manton's multi-volume set is split across the alphabetical list by an
  inconsistent title prefix** ("Complete Works of..." vs. "Works of...") (1 session: Library and
  catalog browser) — NEW.
- **[COSMETIC] Primary "open work" link on every catalog row has no accessible name** (1 session:
  Library and catalog browser) — NEW.
- **[NOTE] Historians catalog has only 1 item despite being a first-class nav entry** (2 sessions:
  Library and catalog browser, Church historian) — NEW.
- **[NOTE] Nonexistent `/work/` slugs show a graceful empty state, not a crash** (1 session:
  Library and catalog browser) — NEW (positive).
- **[NOTE] In-work Table of Contents search is fast and accurate even on a 3,540-entry work** (1
  session: Library and catalog browser) — NEW (positive).
- **[NOTE] My Works / My uploads gate is clean and clearly messaged** (1 session: Library and
  catalog browser, corroborated under Auth-boundary above) — NEW (positive).
- **[MINOR] A catalog work-title link occasionally failed to navigate on click (low confidence,
  possible tab contention)** (1 session: Library and catalog browser) — NEW.

### Desk

- **[MAJOR] The Desk feature has no entry point anywhere in the app's own navigation** (1 session:
  Anonymous desk explorer) — NEW. Confirmed across 4 separate page loads' full sidebar link
  enumeration. The only way in is a library row's "+" button or already knowing the URL.
- **[MAJOR] The only discoverable "add to desk" control (library row "+") replaces the desk's
  contents instead of adding a pane alongside what's already open** (1 session: Anonymous desk
  explorer) — NEW. Contradicts the desk's own copy ("Open up to 3 things side by side").
- **[MAJOR] Multi-pane desk (up to 3, side by side) is only reachable by hand-editing the URL's
  comma-separated query param — no click-path produces it** (1 session: Anonymous desk explorer)
  — NEW.
- **[MINOR] The empty desk's own "Open the Bible" CTA navigates away to the plain reader instead
  of putting a Scripture pane on the desk, despite the empty-state copy promising exactly that** (1
  session: Anonymous desk explorer) — NEW.
- **[MINOR] No add-to-desk control exists on the Bible reader page itself** (1 session: Anonymous
  desk explorer) — NEW, related to backlog UX-1 but distinct (the reader has no path back onto the
  desk either).
- **[MINOR] Desk contents live only in the URL query string with no persistence and no
  user-facing warning that this is the case** (1 session: Anonymous desk explorer) — NEW.
- **[MINOR] The 3-pane cap is enforced silently — a requested 4th pane is dropped with no
  toast/message** (1 session: Anonymous desk explorer) — related to backlog UX-3 (cap confirmed to
  already exist, just silent).
- **[MINOR] At 390px, a multi-pane desk gives no visual indication a second pane exists** — no
  swipe hint, dots, or counter, though no horizontal overflow occurs (1 session: Anonymous desk
  explorer) — NEW.
- **[NOTE] Unlike the Library's clear inline messaging about the anon/account boundary, the Desk
  never explains that its state is session/URL-only** (1 session: Anonymous desk explorer) — NEW.
- **[NOTE] The Desk itself requires no account at all — fully usable anonymously once reached** (2
  sessions: Gated-feature boundary prober, Anonymous desk explorer) — NEW (positive/informational).

### Navigation / Routing / Aliases

- **[MAJOR] Bare data-serving paths (`/bible`, `/bible/web`, `/commentaries`) return a completely
  unstyled, un-branded raw HTTP 400 "Not a valid path" page with no header, sidebar, or `<title>`**
  (1 session: Broken-link and alias hunter) — NEW.
- **[MINOR] Alias-table gaps for hyphenated / full-word / numbered book slugs** — `1-corinthians`,
  `song-of-solomon`, `song-of-songs`, `1jo`, `iikings` all fail to resolve, most falling to a plain
  unstyled "Unknown book" inline error rather than the app's styled 404 (4 sessions: Topical
  deep-dive researcher [`1jo`], Console and network error hunter, Broken-link and alias hunter,
  Simulated returning-user session [also notes `1corinthians` unexpectedly redirects to `/ask`]) —
  CONFIRMS KNOWN ISSUE: `/read/jhn/1` vs `/read/john/1` alias table (extends the known gap with
  specific new failing aliases; common abbreviations like `jhn`, `john`, `song`, `1cor`, `phil`,
  `2kings` do resolve correctly).
- **[MINOR] Malformed chapter routes (e.g. `/read/jhn/abc`) still fire wasted backend fetches with
  a literal `NaN`, hitting 404/401 in the console, even though the user-visible error renders
  correctly** (1 session: Reader navigation stress-tester) — NEW.
- **[MINOR] `/reading-plans` 404s despite matching the sidebar's own visible label text; the real
  route is the unrelated-looking `/plans`** (1 session: Broken-link and alias hunter) — NEW.
- **[MINOR] Sidebar nav item linking to `/ask` is labeled "Ancient Paths," duplicating the brand
  logo's label directly above it in the same sidebar** (1 session: Gated-feature boundary prober)
  — NEW.
- **[COSMETIC] `/sitemap.xml` and `/robots.txt` both serve the app's HTML 404 page instead of real
  crawler files** (1 session: Broken-link and alias hunter) — NEW.
- **[NOTE] `/study`, `/chat`, `/channel`, `/account` (and `/library/books`, `/library/uploads`) all
  now walked and confirmed for logged-out visitors — clean styled 404s for the first four; the
  latter two resolve to real stub/gate pages, not 404s** (7 sessions: Topical deep-dive researcher,
  Hymnody researcher, Interpretation-guarantee prober, Console and network error hunter, Tablet
  user, Simulated returning-user session, Cold-start [partial]) — CONFIRMS KNOWN ISSUE: these
  routes had never been walked by prior QA; now they have, and none showed a defect for an
  anonymous visitor.
- **[NOTE] Out-of-range/malformed/unknown-book reader routes degrade gracefully — no crash, blank
  screen, or raw stack trace anywhere tested, including an XSS-style probe that was safely
  escaped** (2 sessions: Reader navigation stress-tester, Broken-link and alias hunter) — NEW
  (positive).
- **[NOTE] Recovery cost from any depth in the Bible is low — Home is always 1 tap, any other
  chapter is ≤3 taps via the picker, and 5 consecutive browser-Back presses through a 6-chapter
  history unwound correctly every time** (1 session: Reader navigation stress-tester) — NEW
  (positive).

### Mobile (390px)

- **[NOTE] No horizontal overflow found on any core mobile surface tested** (homepage, `/ask`,
  reader, verse panel, library, a desk pane) (2 sessions: Mobile pastor, Hymnody researcher) — NEW
  (positive), confirmed via `scrollWidth === innerWidth` checks, not just visual inspection.
- **[NOTE] Verse panel bottom sheet and Library index tap targets are comfortable and fully
  readable at 390px with no account required** (1 session: Mobile pastor) — NEW (positive).
- See also: the clipped example-prompt text on `/ask` at 390px (Ask/Retrieval section, 2 sessions).

### Tablet (768px)

- **[MINOR] No dedicated tablet nav treatment — 768px renders the full 256px desktop sidebar with
  full text labels (consuming a third of the screen); one pixel narrower flips entirely to the
  phone bottom-nav layout** (1 session: Tablet user) — NEW.
- **[COSMETIC] Long work titles are aggressively truncated with no tooltip in library rows at
  768px, in a column with room to spare** (1 session: Tablet user) — NEW.
- **[COSMETIC] Sidebar collapse control works correctly at 768px but is an unlabeled, undiscoverable
  chevron with no tooltip** (1 session: Tablet user) — NEW.
- **[NOTE] Multi-pane desk layout at 768px is unverified — likely cramped by design math (2-3
  panes would get ~170-256px each with the sidebar present), but no session completed the test**
  (1 session: Tablet user) — related to backlog UX-3, flagged for direct verification.

### Accessibility

- **[MAJOR] Primary homepage CTA "See it answered" is inert for both keyboard Enter and mouse
  click** (1 session: Keyboard-only accessibility skim) — NEW (see also Marketing funnel).
- **[MINOR] Keyboard focus order in the header zigzags** (logo → Log in on the far right → Features
  → Why, and "Home" is not itself focusable) rather than following visual left-to-right order (1
  session: Keyboard-only accessibility skim) — NEW.
- **[MINOR] No skip-to-content link on the public marketing homepage**, though the global CSS for
  one exists and other app-shell pages do render it (1 session: Keyboard-only accessibility skim)
  — NEW.
- **[NOTE] Focus is visibly indicated (2px accent outline) on every element reached via a genuine
  keyboard Tab press** (1 session: Keyboard-only accessibility skim) — NEW (positive) — with the
  caveat that script-triggered `.focus()` does NOT reproduce this in Chromium, so future automated
  a11y checks need real key presses, not scripted focus.
- **[NOTE] No overflow/clipping observed at 200% zoom or 400px width on the homepage's first
  viewport (limited coverage — not scrolled further at zoom)** (1 session: Keyboard-only
  accessibility skim) — NEW.
- Small verse-number tap targets and non-inert background buttons behind an open dialog are
  covered under Reader above (both accessibility-flavored, both 1 session).

### Performance

- Multi-second/indefinite `/library` loading is covered under Library above (up to 5 sessions
  touching some variant of this pattern).
- **[MINOR] Excessive redundant `/api/auth/get-session` calls** — 20+ fired within ~10 seconds of
  page activity, suggesting many independent components each re-check auth state rather than
  sharing one result (1 session: Simulated returning-user session) — NEW.
- **[NOTE] Possible scroll-transition rendering glitch (blank frames / header overlap while
  scrolling the homepage) — low confidence, most likely explained by confirmed concurrent-session
  tab contention rather than a real product defect** (1 session: Cold-start) — NEW, flagged for a
  follow-up check in an isolated single-session browser only.

---

## Testing-environment caveats (not product findings)

Roughly 12 of the 20 sessions independently reported that the shared QA browser pool was heavily
contended: `tabs_create` refused with a tab cap reached, tabs being silently navigated or resized
mid-task by other concurrent agent sessions, "tab not fronted"/"pane is currently hidden" tool
errors, and in a few cases stray content from another session's in-flight test (e.g. an XSS probe
URL, someone else's queued desk, a pre-filled sign-up form) appearing briefly in a shared tab.
Every session that hit this adapted by cross-checking `location.href`/DOM state immediately before
trusting an observation, and several explicitly discarded or downgraded-confidence findings they
could not cleanly reproduce afterward (noted inline above where relevant, e.g. the "possible
scroll-transition glitch" and one unreplicated `/read/jhn/5` → 1 John content flash). This is a
QA-infrastructure limitation for future fleet runs, not a defect in Ancient Paths — but it means
confidence on a handful of low-session-count findings above should be read as somewhat lower than
their face value, and a future run would benefit from either a dedicated tab per agent or a larger
tab-pool headroom for the number of concurrent sessions expected.

---

## What this run could not tell us

- **The interpretation guarantee itself** ("concordance, not commentator" — never interprets,
  never verdicts, never fabricates) was **never exercised**, adversarially or otherwise. One
  session (Interpretation-guarantee prober) specifically submitted 5 leading/bait questions
  designed to test this and got 401 on all 5 before any model output was produced. This run says
  nothing whatsoever about whether the live compose→verify pipeline is holding the line — it only
  confirms that an anonymous visitor cannot reach it at all.
- **Real `/ask` latency in production** could not be measured — one session was specifically
  tasked with timing 6-8 real queries and got zero data, since every attempt failed at the auth
  layer in well under a second.
- **Everything behind an account**: highlighting/annotation writes, the prayer journal's actual
  write path, desk save/load persisted per-account (vs. the URL-only anonymous behavior confirmed
  here), My Works uploads, Settings persistence, reading-plan creation, and bookmark writes were
  all unreachable. The fleet confirmed these surfaces *gate cleanly* for anonymous visitors, but
  none of their actual authenticated behavior was tested.
- **RLS / multi-account data isolation** requires two real signed-in accounts to test meaningfully
  and was not touched by any session in this run.
- **/auth/sign-in serving a form to an already-signed-in visitor** (a known backlog item) could
  not be re-checked, since no session was ever signed in.
- **Whether the previously-logged React #418 hydration error and the production 45-104s Ask
  latency are still live issues** remains open — the former did not reproduce in 6 sessions'
  spot-checks (a non-reproduction, not proof of a fix, per the console tool's known blind spot for
  errors thrown before it starts listening); the latter could not be measured at all since Ask
  never got past the auth gate for any anonymous session.
