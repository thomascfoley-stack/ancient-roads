# Attack plan — the 2026-08-16 QA fleet findings

**Filed:** 2026-08-17 · **Source:** [`docs/evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md`](../../evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md)
**Lane:** C (UX remediation) · proposes gate **C7** · **Status:** plan only, nothing implemented

The fleet report is 20 persona sessions against production, deduplicated to ~115 findings. It says
of itself: "nothing here has been re-verified independently — treat every line as a QA report to
triage, not a proven defect." This plan takes that seriously. It does three things: corrects the
frame the whole report was written inside, groups the findings by root cause instead of by page,
and sequences the work so each block is one branch with one exit test.

---

## Status board — updated 2026-08-17, end of the first build session

| Block | State | Landed |
|---|---|---|
| **Q0** | **DONE** | Corrections filed in the report, the WORKLOG and this plan |
| **Q1** | **DONE** | Pre-submit notice + sign-in link in the 401. `?next=` split out as **Q1b** (below) |
| **Q2** | **DONE** | `lib/library-nav.ts` — one label per route, both navs derive it; heading-match invariant |
| **Q3** | **MOSTLY DONE** | 11th voice; Gethsemane line; the word-study language race; chapter-advance identity. Two remain (below) |
| **Q4** | **DONE** | Count bug closed; **both no-op search findings NOT REPRODUCED** (see below) |
| **Q5** | **NOT REPRODUCED** | Does not occur in dev; a production-build repro is blocked (below) |
| **Q6** | **DONE** | Normalizer fix closes every hyphenated/unspaced-ordinal book URL; robots + sitemap added |
| **Q7** | **DONE** | Log in → sign-in, footer "Contact" renamed, `/ask` title, sidebar duplicate label |
| **Q8** | **DESIGN QUESTION** | Unchanged — still an owner call, still not a branch |
| **Q9** | **OUT OF LANE** | Unchanged — quality-slice lane |

**The single most useful output of this session is not a fix.** Every block was written from the
findings list rather than from the code, and **three of the four blocks that got read carefully
turned out to be wrong about their own root cause**:

- **Q1** prescribed gating `/api/annotations` on the session. The tree had already rejected that,
  with reasons; the prescribed exit test would have failed against correct code.
- **Q4** called the source count a hand-typed set. Both counts were derived — from different sets.
  The defect was one noun.
- **Q6** was filed as four missing aliases. Three of the four were already in the table; the
  normalizer never converted hyphens, so **every** numbered and multi-word book failed from a
  pasted URL. The property test found ~20 more than the fleet reported.

The lesson is now load-bearing rather than rhetorical: **a findings list tells you where to look,
never what is wrong.** Reproduce from the code before writing a line of fix.

### NOT REPRODUCED — six findings, three of them BLOCKER/MAJOR

Driven against the running app, not reasoned about. Each was reported by one session and each
works:

| Finding | What actually happens |
|---|---|
| **[BLOCKER]** No site-wide gate on any route | Gate is up and unchanged since 2026-07-15; the sessions were behind it holding an `httpOnly` cookie they could not read |
| **[MAJOR]** Hero CTA "See it answered" is inert | `<a href="#ask">` with a matching `<section id="ask">` sixteen lines below |
| **[MAJOR]** Catalog search box does not filter or navigate | Returns **1000+ matches** with 62 highlighted hits on `/library/commentaries`; the empty case renders "No matches." rather than reverting |
| **[MAJOR]** Library search silently no-ops on Sermons and Historians | `/api/search/works` returns results for **every** catalog including both of those |
| **[MAJOR]** In-work Table of Contents is a dead click | Opens a dialog labelled "Contents" with 22 rows of real chapter titles — and the report's **own** Library session praised this same feature as "fast and accurate even on a 3,540-entry work" |
| **[MINOR]** Inconsistent `/ask` copy and control layout across loads | Describes the pre-Design-C build; `2d043ba` shipped the always-visible chip band and corrected the latency line the same week |

**These are not sloppy reporting so much as a contaminated instrument.** The report itself records
that ~12 of 20 sessions hit tab-cap exhaustion and cross-agent tab hijacking, and a hijacked tab
produces exactly one symptom: *"I clicked it and nothing happened."* That is the signature of four
of the six above. **A future fleet run needs a dedicated tab pool per session**; without it, a
single-session MAJOR that reads as "control does nothing" should be treated as unconfirmed until
driven by hand.

### Carried forward

| # | Item | Why it is not done |
|---|---|---|
| **Q1b** | `?next=` return path after sign-in | Sign-in hardcodes `router.push('/home')`; Google rides `FIRST_RUN_DESTINATION` through a Neon `callbackURL` validator that has already taken production auth down once over the value's shape (`auth-forms.tsx:30-45`). Three call sites and an external validator — its own block |
| **Q3a** | No next/previous-verse control; adjacent verse click closes the panel instead of switching | Genuine feature work: the panel would need the chapter's verse list threaded through the reader. Beyond "minimal change"; flag-and-stop per the UX protocol |
| **Q3b** | Verse-number tap targets under WCAG 24×24 | **Governed by ADR-047, an owner ruling.** The handle already carries an expanded invisible hit area, and its asymmetry is deliberate and documented — `-right-0.5` matches `mr-0.5` exactly "so the invisible area never steals a long-press from the first word". Widening re-litigates the ADR. WCAG 2.2 SC 2.5.8's inline exception plausibly applies to a verse marker set in running text. Owner call, not an agent's |
| **Q3c** | Background verse buttons in the a11y tree behind the open dialog | Largely mitigated already: `use-dialog.ts` implements a real focus trap (Tab cycles inside, wraps back in) and sets `aria-modal="true"`, which is the standard instruction to assistive tech to ignore the rest. Residual gap is small; a DOM-level `inert` would need the reader page to track dialog state |
| **Q4b** | Search boxes that silently no-op (catalog search, Sermons/Historians) | **CLOSED AS NOT REPRODUCED** — both were driven and both work; see the table above. Nothing to fix |
| **Q3f** | Standalone `/library/word-study` is a thinner tool than the in-reader interlinear | The only MAJOR left that is neither refused nor blocked. Real feature work: the standalone page would need grammatical parsing, the cross-verse occurrence list and the commentary link brought across. A product decision about whether the two surfaces should be at parity at all, not a defect to patch |
| **Q5** | The `/library` hang | **Does not reproduce in dev** — the Suspense fallback swaps out correctly, verified in the DOM. Root cause is already diagnosed in-tree at `library/uploads/page.tsx:14-28` (the parent `loading.tsx` boundary never swaps on a hard load; measured at 43s) and `/library/uploads` fixed itself by going synchronous while the hub never did. A local production-build repro is blocked: `next start` sets `NODE_ENV=production`, so the gate fails closed with 503 without `SITE_PASSWORD`. **Needs either that value in a local env or a look at production** |
| **Q6b** | `/bible/web`, `/commentaries` returning an unstyled raw 400 | Root cause found: `next.config`'s corpus rewrite forwards them to the Blob origin and the raw "Not a valid path" is **the Blob store's own error**. That is Lane D **D3** infrastructure, the store is not connected yet, and it cannot be tested locally |
| **Q7b** | The static demo has no path into the live feature | Owner call: while SEC-1 is open, "See it answered" can only mean "see this screenshot". The honest fix may be copy, not code |

---

## 0. Read this before you fix anything: the frame is wrong

**Both of the report's BLOCKERs are misframed, and one of them is simply false.** Verified
2026-08-17 against production and the tree, not from memory.

### The site gate is up and has never been down

The report's first blocker — "No site-wide access/password gate encountered on any route" —
does not survive contact with the live site:

```
GET https://ancientpaths.app/read/jhn/1  → 307  /gate?next=%2Fread%2Fjhn%2F1
GET https://ancientpaths.app/ask         → 307  /gate?next=%2Fask
GET https://ancientpaths.app/sitemap.xml → 307  /gate?next=%2Fsitemap.xml
GET https://ancientpaths.app/            → 200  (public marketing tier, by design)
```

`web/src/middleware.ts` is unchanged since `2338c57` (2026-07-15). The public allowlist in
`web/src/lib/gate.ts:13-31` is exact-match and tiny: `/`, `/about`, `/features`, `/why`,
`/api/waitlist`, plus named marketing images. Everything else redirects.

**Why the fleet believed otherwise:** the gate cookie is set `httpOnly: true`
(`web/src/app/api/gate/route.ts:56`). JavaScript cannot read it. The sessions checked
`document.cookie`, saw an empty string, and concluded no gate existed — while sitting behind
one, holding a valid cookie the browser pool already carried.

This is **watchlist instance six, verbatim**: an instrument's blind spot recorded as a property of
the thing it could not see (`docs/pm/MASTER.md`, "a scope limit became a claim about the world").
The tell is the same one the watchlist names — a universal negative ("no gate on **any** route")
resting on a single instrument's silence. Worth noting that the repo predicted this exact class of
error and it happened again anyway, in an audit written to find errors.

### What that does to the other blocker, and to the whole report

Every session was a **gate-passed, signed-out visitor** — not an anonymous member of the public.
That is a real and important persona (it is exactly your beta tester: someone you gave the password
to who has not signed in yet), so **the findings are not invalidated — they are relabelled.** Two
consequences:

- **Blocker 2 (`/ask` returns 401 to a signed-out visitor) is correct behaviour, reported as a
  catastrophe.** The gate held, the API auth held. Downgrade to **MAJOR-UX**: the failure is not
  that Ask is gated, it is that the composer, the lane filters and the example prompts all invite
  input and only reveal the requirement after submission. Fix the announcement, not the gate.
- **Any finding phrased as "an anonymous visitor can reach X" says nothing about the public.** The
  public reaches exactly five routes. Re-read those lines as "a beta tester can reach X."

### One more likely-false MAJOR, caught in spot-check

"Primary hero CTA 'See it answered' does nothing at all." It is `<a href="#ask">`
(`web/src/app/page.tsx:78`) and the target `<section id="ask" className="scroll-mt-24">` exists
sixteen lines below it. Two other sessions described it correctly as an anchor scroll. The
"inert" reading is one session's measurement of `scrollY` against a smooth scroll that had not
landed yet. **Re-check in a browser before touching it** — and note the real finding underneath is
different and does stand: the CTA promises "See it answered" and delivers a static picture of an
answer, with no path into the live feature (block Q7).

### The triage rule this establishes

Three findings checked, three misframed. So: **no fix starts before its finding is reproduced.**
Reproduction is cheap now — enter the site password once, then drive the surface. A finding that
does not reproduce goes to a `RETRACTED` list in the block's findings log with the evidence, the
way `4c75da3` handled B1. It does not get quietly dropped, and it does not get fixed anyway
"since we're in there."

---

## 1. How the 115 collapse

Counted from the report body: 2 blocker · 23 major · 40 minor · 7 cosmetic · 31 note across 104
marked lines (the executive summary's 115 counts some unmarked prose bullets too). The 31 NOTEs are
mostly positive or informational and close no work.

Grouping the remainder by page gives you 12 shallow to-do lists. Grouping by **root cause** gives
nine blocks, and three of them cover half the findings:

| Block | Root cause | Findings closed | Size |
|---|---|---|---|
| **Q0** | The frame — record the correction, retract the false blockers | 2 blocker + 1 major | S |
| **Q1** | Signed-out state was never designed | ~9 | M |
| **Q2** | Surfaces orphaned from navigation; labels ≠ headings | ~7 | M |
| **Q3** | The verse study panel is a dead end | ~7 | M |
| **Q4** | Search boxes that silently no-op | ~6 | M |
| **Q5** | Loading and error boundaries are ad hoc | ~7 | M |
| **Q6** | Routing: aliases, bare data paths, crawler files | ~6 | S |
| **Q7** | The marketing funnel promises what it won't show | ~7 | S |
| **Q8** | Desk is reachable only by URL surgery | ~9 | L |
| **Q9** | Corpus and content gaps — **not UI work, different lane** | ~10 | — |

Cosmetic and a11y leftovers ride along inside whichever block owns their file, rather than forming
a block of their own; a stray `aria-label` is not worth a branch.

---

## 2. The blocks

Each block follows the standing UX-remediation protocol in `CLAUDE.md`: one block at a time, branch
`fix/q<N>-<slug>`, **exit test written before the fix**, minimal change, stop and report if it needs
more than ~3 files or ~50 lines. Every block's exit includes the Definition of Done clause for UI:
loaded in a browser at 390px **and** desktop, no overflow, no console errors, a real interaction
exercised.

---

### Q0 — Correct the frame (do this first, it is 30 minutes)

**Why first:** seven of the nine blocks below inherit their severity from the report. If the false
blocker stays in the file, the next reader re-derives the same wrong plan.

- Prepend a correction header to `MASTER_QA_REPORT.md` pointing at this plan. Per the repo's own
  standing rule (`MASTER.md`, watchlist instance three): the correction goes **where a reader meets
  the wrong version**, not only where it was first written. Do not rewrite the findings — it is
  evidence; annotate it.
- Retract blocker 1 with the four `curl` lines and the `httpOnly` citation.
- Downgrade blocker 2 to MAJOR-UX, folded into Q1.
- Flag the hero CTA major as `UNREPRODUCED — verify first`.

**Exit test:** none needed (docs). **Owner call:** none.

---

### Q1 — Design the signed-out state (highest value per line changed)

**Root cause:** the app has an authenticated design and an anonymous design, and no design for
*gate-passed-but-signed-out*, which is what every beta tester is. Each surface improvised its own
answer.

**Findings closed:** Ask composer gives no upfront signal · Ask 401 error has no sign-in link ·
retry stacks a duplicate error block instead of replacing · authenticated deep links
(`/account/settings`, `/ask/<id>`) bounce to a bare sign-in with the destination discarded ·
`/api/annotations` fires a console 401 on every reader page load · 20+ redundant
`/api/auth/get-session` calls in ~10s · `/prayers` flashes a "Write a prayer" button before the
gate resolves · momentary empty error-banner frame.

**Minimal change — REVISED 2026-08-17 after reading the code. Two of the four things this block
originally prescribed were already answered in the tree, with better reasoning than mine.** Recorded
rather than silently dropped, because the same two proposals will occur to the next reader:

1. ~~One shared auth-state source~~ — **ALREADY EXISTS.** `lib/auth/use-signed-in.ts` wraps
   `authClient.useSession()` behind a `mounted` guard, and its header documents why it is not a
   fetch (two surfaces used to infer sign-in from `GET /api/annotations` succeeding, so any 500,
   429 or dropped phone connection revoked four features under a genuinely signed-in reader). The
   remaining question is narrower: whether Neon's `authClient.useSession()` dedupes across the 5
   call sites (`sidebar.tsx:124`, `prayer-journal.tsx:58`, `save-to-study.tsx:150`, plus
   `useSignedIn` in the reader and work pages) or fires one `get-session` each. **Unverified — it
   needs a running client, not a grep.** If it dedupes, the 20+ finding is a re-render problem, not
   an architecture one.
2. ~~Reader stops calling `/api/annotations` when signed out~~ — **DELIBERATELY REJECTED ALREADY,
   and my proposal would have reintroduced a fixed defect.** `use-annotation-writes.ts:85-93` says
   the GET is "NOT gated on `useSignedIn()`, on purpose": the auth cookie rides the request whether
   or not the session query has resolved, so gating serialises the load behind it for no gain, and
   whenever the session query is pending, slow or failing the GET would never be issued, `loadFailed`
   could never be set, and Retry would be unreachable exactly when it helps. **The console 401 on
   every signed-out reader load is therefore a known, accepted cost of that trade, not a defect.**
   Downgrade the finding to NOTE and stop re-filing it. If the noise is genuinely worth removing, the
   honest fix is on the route (`api/annotations/route.ts` wraps auth and the DB query in one `try` and
   answers 401 for both — splitting those is a real improvement), not on the caller.
3. **The `/ask` composer tells you before you type.** CONFIRMED from source: `ask-client.tsx:236` is
   the *only* signed-out handling on the whole surface — a bare `'Please sign in to explore the
   paths.'` string, set after the POST returns 401. Nothing on the page consults `useSignedIn()` at
   all. So both halves of the 13-session finding reproduce statically: no pre-submit signal exists,
   and the error carries no link. This is the block's real work.
4. `requireUser` redirects preserve the destination in `?next=` and the sign-in page honours it.

**Exit test:** signed-out on `/ask`, the notice is visible *before* any submit, and the error offers
a working link that returns to `/ask` after sign-in. (The original exit test said "zero 401s on a
reader page" — **that test was wrong and would have failed against correct code**, per item 2.)

**Watch for:** item 4 touches auth redirect flow, which is C5 territory. If it needs a change to
`requireUser`'s signature, stop — that is 18 call sites and a different block.

**Method note, and it is the point of this whole plan:** this block was written from the findings
list and was wrong twice in four items. The code had already reasoned past both. Every other block
below is in the same state — written from the report, not yet checked against the tree. Do to each
of them what was just done to this one *before* opening its branch.

---

### Q2 — One route registry: nothing orphaned, no label that lies

**Root cause:** this is the repo's own most-repeated defect, and the sidebar comments say so out
loud twice (`components/sidebar.tsx:337-339`, `:365-370` — "orphan a working surface … repeated on
the newest shelf"). It is now on its fifth and sixth surface.

**Findings closed:** Desk has no nav entry anywhere (also Q8) · sidebar "Yours" labels do not match
the page headings they open (`/library/notes` is labelled "Saved" but the page is headed something
else; `/library/uploads` is "My uploads" over a page headed "My Works") · the `/ask` nav item is
labelled "Ancient Paths", duplicating the logo above it · `/reading-plans` 404s while the sidebar
says "Reading plans" and the route is `/plans` · standalone `/library/word-study` is a strictly
thinner tool than the same feature in-reader, with nothing saying so · the "Bible" tab hardlinks to
John 1 and discards reading position.

**Minimal change:** a single route registry — path, nav label, page heading — with nav rendered
from it and each page's `<h1>` taking its heading from it. Then the test that kills the class:
**every entry is reachable from nav, and every entry's heading equals its label.** The repo has
closed this class by derivation five times (`SERVED_WORK_LISTS`, the `maxDuration` route list, the
served-asset directory list…); this is the same cure on the nav.

**Exit test:** the registry test, watched red by adding a route with a mismatched heading and again
by adding one with no nav entry.

**Do NOT:** rename user-visible strings locked by `UX_REMEDIATION.md` §2. Where the label and the
heading disagree, the *locked* one wins.

---

### Q3 — The verse study panel

**Root cause:** one component, built for a single-verse read, used for verse-by-verse study.

**Findings closed:** "Showing 10 of 11 voices" with no way to reach the 11th · no next/previous
verse control, so every verse costs close + relocate + reopen · adjacent verse numbers stay visible
but clicking one hits an invisible backdrop and closes the panel instead of switching · the
reading-settings popover and the study dialog can be open at once, overlapping · verse-number tap
targets ~5.5×11px against WCAG's 24×24 · background verse buttons stay focusable and unmarked
behind the open dialog · a hardcoded Gethsemane quote at the bottom of every panel regardless of
verse.

**Minimal change:** these are all the same admission — the panel does not know it is a *sequence*.
Add prev/next, make the adjacent verse click switch rather than dismiss, `inert` the background,
enlarge the hit area, close the settings popover when the dialog opens, and delete the hardcoded
quote. The 11th voice needs a look at the query's `LIMIT` before assuming it is a UI cap.

**Exit test:** open John 1:1, reach v2 and v3 without closing the panel; tab from inside the open
dialog and never land on a background verse button; the voice count displayed equals the voice
count returned.

**Watch for:** if "10 of 11" turns out to be a retrieval `LIMIT`, it leaves this block and goes to
the quality-slice lane — changing what the panel retrieves is a retrieval change and carries the
accuracy diagnostic with it.

---

### Q4 — A search box must filter or say "no matches". Never both nothing.

**Root cause:** several search inputs were shipped as UI before their filter path existed, and they
fail by reverting to the unfiltered list, which is indistinguishable from "everything matched."

**Findings closed:** catalog-level search box does not filter or navigate on submit (2 catalogs,
both button and Enter) · library search silently no-ops on Sermons and Historians, reverting to the
full catalog with no indication it ran · Passage search omits the Hymns & Sacred Poetry lane
entirely · Passage search's stated source count (9) disagrees with its own dropdown (10) — found
independently by three sessions · "Ignatius" ranks Loyola above Ignatius of Antioch · the hymnal
ToC cannot browse or filter by scripture reference.

**Minimal change:** every search box gets three honest states — results, empty ("no matches for
X"), error. No fourth silent state.

**The 9-vs-10 count is DONE, and this block was wrong about it (corrected 2026-08-17).** The plan
said it was a hand-typed expected set and prescribed deriving it from the lane list. **Both counts
were already derived** — from different sets, wearing one noun on one screen:
`passages/page.tsx:405` renders `{manifest.length} sources across the library` from the
whole-library commentary manifest, while `:547` rendered `All sources ({grouped.length})` over a
list whose every option is `g.author` — authors with a result on *this* passage. Neither number
was ever wrong; the label was. Relabelled to "All authors (N)". **Second time this plan prescribed
a fix for code it had not read** (see Q1). The remaining Q4 work — the silent no-op search boxes —
is untouched and still needs its own reproduction.

**Exit test:** search a term with no matches in each catalog → the empty state renders, the
unfiltered list does not; the stated source count is read from the same array the dropdown renders.

**Split off:** the Ignatius ranking is retrieval quality, not a search-box bug → Q9.

---

### Q5 — Loading and error boundaries

**Root cause:** no house standard for "slow", "failed", or "out of range", so each page invented
one, and one of them never resolves.

**Findings closed:** `/library` hangs indefinitely on "Loading the library" on a hard load while
in-app client navigation to the same page works (3 sessions — the most serious functional bug in the
report, and the only one that is a true hang) · every `/library/*` page shows a 6–13s skeleton for a
request that returns in ~1s · out-of-range chapter routes render a text-only dead end with no
recovery link · malformed chapter routes still fire backend fetches with a literal `NaN` · a
catalog work-title link occasionally failed to navigate (low confidence, possible tab contention).

**Do the hang first and separately.** Hard-load vs client-nav divergence points at a server
component or a suspense boundary that never resolves on the initial render path; it is a different
bug from the 6–13s skeleton and should not be fixed by making the skeleton prettier. The `NaN`
fetches are a parse-before-fetch fix: validate the chapter param at the edge, do not dispatch.

**Exit test:** hard-load `/library` signed-out in a cold browser, 5 for 5, content within the
skeleton's stated budget; `/read/jhn/abc` fires zero backend requests; `/read/jhn/999` offers a
chapter picker.

---

### Q6 — Routing hygiene

**Findings closed:** bare data paths (`/bible`, `/bible/web`, `/commentaries`) return an unstyled
raw 400 "Not a valid path" with no chrome · alias gaps for `1-corinthians`, `song-of-solomon`,
`song-of-songs`, `1jo`, `iikings`, most falling to a plain "Unknown book" rather than the styled 404
· `1corinthians` unexpectedly redirects to `/ask` (verify this one — it is odd enough to be a
contention artifact) · `/sitemap.xml` and `/robots.txt` serve the app's 404.

**Minimal change:** the alias table already exists and already knew "john" when two callers did not
(A7, 2026-08-02) — that fix worked by **deriving the caller set instead of hand-listing it**, and
found a third caller nobody knew about. Do the same again rather than adding five aliases: derive
the alias set from the canonical book list (hyphenated, spaced, numbered, roman-numeral forms) and
route every unknown book to the styled 404.

**On sitemap/robots:** neither `app/sitemap.ts` nor `app/robots.ts` exists — confirmed. Note the
second half of that fix: creating them is not enough, they must also be added to
`PUBLIC_PATHS`, or they will 307 to the gate exactly as they do today. And that is an owner call,
not an agent one: **publishing a sitemap while SEC-1 is open advertises a pre-launch site to
crawlers.** Recommend deferring to launch and shipping `robots.txt` as disallow-all now.

---

### Q7 — The funnel says "see it answered" and shows a picture

**Findings closed:** the "Ask the tradition" demo section is entirely static, 0 links or buttons in
its DOM, no path into the real feature · "LOG IN" links to `/home`, not to sign-in
(`components/marketing/nav.tsx:39`, `footer.tsx:43`) · the footer's "Contact" column contains no
contact method · waitlist copy ("we invite a few readers at a time") sits beside an app that a
password-holder walks straight into · `/features` repeats the same unlinked illustration · `/ask`'s
page title is "Explore the paths" with no "Ask" in it · the John 1:1 "ten voices" demo **does** work
end-to-end and is the one promise that holds (keep it, and make it the model for the rest).

**Minimal change:** point "Log in" at the sign-in route; put a real contact method in the Contact
column or rename the column; give the static demo one honest path forward (for a public visitor
that is the waitlist, not `/ask` — `/ask` is behind the gate and will bounce them). Fix the title.

**Owner call:** whether the funnel should promise a live try at all before SEC-1 closes. Until it
does, "See it answered" can only ever mean "see this screenshot", and the honest fix may be copy,
not code.

---

### Q8 — The Desk

**Findings closed:** no entry point in any navigation, confirmed across 4 full sidebar enumerations
· the only discoverable add control (library row "+") *replaces* the desk instead of adding
alongside, contradicting the desk's own "Open up to 3 things side by side" · multi-pane is reachable
only by hand-editing a comma-separated query param · the empty desk's "Open the Bible" CTA navigates
away to the plain reader instead of adding a Scripture pane · no add-to-desk control on the reader ·
state lives only in the URL with no persistence and no warning · the 3-pane cap drops a 4th pane
silently · at 390px nothing indicates a second pane exists.

**This is the largest block and it overlaps the existing backlog** — UX-1 (the Bible cannot be
reached on the desk; already correctly diagnosed as a *picker* gap, since `lib/desk.ts` has
`kind:'scripture'` today), UX-3 (layout model), and UX-4's shipped Research History work.

**Recommendation: do not start Q8 as a bug-fix block.** Eight of these nine findings are one
sentence — the desk has no coherent way in or out. That is a design decision (owner territory, and
`MASTER.md` already records the owner mid-thought on the adjacent UX-4). Fixing the "+" behaviour
in isolation, before the entry model is decided, is the kind of scope creep the remediation rules
exist to prevent. **Q8 files a design question; it does not open a branch.** The one exception
worth shipping alone: the silent 4th-pane drop should say something.

---

### Q9 — Corpus and content (routes out of Lane C entirely)

These are data findings wearing UI clothes. They belong to the `quality-slice` skill and carry the
accuracy diagnostic and the held-out discipline with them — **a retrieval or corpus change that
skips the eval is exactly what `CLAUDE.md` forbids.** Listed here only so they are not lost:

Watts's "When I Survey" not cross-linked to Galatians 6:14 despite its own printed header citing it
· "Ignatius" ranking Loyola above Antioch · no primary text of Ignatius of Antioch in the corpus ·
Historians catalog holds exactly one work (Josephus) behind a first-class nav entry · Song of Songs
commentary thin in Passage search (**confirms the known `gill-song` gap, Lane D D1**) · "Amazing
Grace" carries no scripture heading in this edition · an OCR artifact in a hymn heading
("Col. 9. 16") · Hymns tradition filter fragmented by capitalization ("anglican"/"Anglican"/
"Anglican-Evangelical") · Manton's set split by an inconsistent title prefix · a Greek-text
commentary on James filed under Hymns & Poetry.

The last four are **metadata normalization**, not retrieval — cheap, safe, and worth doing as one
pass. The first six are corpus coverage and ranking, and they are the expensive kind.

---

## 3. Sequencing

Waves, ordered. Do not start a wave until the previous one's `AGENT` checks pass.

| Wave | Blocks | Rationale |
|---|---|---|
| **0** | Q0 | The frame. Half an hour, and everything downstream depends on it. |
| **1** | Q5 (the `/library` hang only), Q1 | The one true hang, then the block that closes the most findings. |
| **2** | Q2, Q4 | Both close a recurring defect *class* with a derivation + test, not a patch. Highest durable value. |
| **3** | Q3, Q6, Q5 (remainder) | Contained component and routing work. |
| **4** | Q7 | Gated on the owner's call about what the funnel may promise pre-launch. |
| **—** | Q8 | Design question, not a branch. Files into the UX-4/UX-1 slice. |
| **—** | Q9 | Different lane, different gate. Metadata sub-pass can go any time. |

**Effort, honestly:** waves 1–3 are seven branches. On this repo's protocol — exit test first,
red-proof, browser verification at two widths, audit green — that is not a day. Budget it as
several sessions, and resist batching, which is what `CLAUDE.md`'s "one block at a time" is
protecting against.

---

## 4. What the run did not tell you, and what to do about it

The report's own closing section is the most important thing in it, and no block above addresses it:

- **The interpretation guarantee was never exercised.** One session submitted 5 deliberately
  leading bait questions specifically to probe "concordance, not commentator" and got 401 on all
  five, before any model output existed. This run says nothing about whether the live compose→verify
  loop is holding.
- **Real `/ask` latency in production is still unmeasured.** C2 measured ~104s on 2026-08-07; D4
  measured 9.1s p50 dev-local and explicitly says it says nothing about production. The session
  tasked with timing 6–8 real queries got zero data points.
- **RLS / multi-account isolation is untested**, and `MASTER.md` C5 already records it as UNPROVEN
  under Neon's user-id format — a failure that is *silent*, because matches-nothing reads as
  "no data."

**The fix for all three is the same: the next fleet run needs the gate password and one signed-in
account.** That is an owner decision (the fleet is barred from creating accounts or entering
passwords — correctly). Two things to note when designing it: give each session its own tab pool,
since ~12 of 20 sessions this run reported tab contention severe enough to make them discard
findings; and RLS specifically needs *two* accounts, so one signed-in session does not close it.

**Also worth recording:** the same three gaps sit behind SEC-1 in `MASTER.md`'s owner-decisions
table, which already notes that nothing reaches `/api/ask` while the gate is up — so `ask_outcomes`
accumulates only from owner asks. The QA fleet just demonstrated that consequence from the outside,
independently. That is the run's most valuable finding and it is not in its findings list.

---

## 5. What I verified for this plan, and what I did not

**Verified 2026-08-17** (re-measured, not quoted): the four production `curl` results in §0;
`middleware.ts` unchanged since `2338c57`; the `PUBLIC_PATHS` allowlist contents; `httpOnly: true`
on the gate cookie; `<a href="#ask">` and the matching `id="ask"` section on the marketing page;
`Log in` → `/home` in both nav and footer; the two sidebar label sites; the absence of
`app/sitemap.ts` and `app/robots.ts`; the severity counts.

**Not verified:** the other ~100 findings. Every block above states its findings as *reported*, and
Q0's triage rule stands: reproduce before you fix. Three of the three claims I did check were
misframed, which is the whole reason that rule is first.
