# Ancient Paths — UX fix brief

**For a fix pass. Written by the agent that ran the testing; independent eyes should fix.**
Branch `fix/ux-overnight-sweep`. Sources of truth behind every claim here:
[`UX_RESULTS.md`](UX_RESULTS.md) (full write-ups, one section per batch) and
[`UX_TRACKER.csv`](UX_TRACKER.csv) (all 918 test IDs with their status and evidence).
Owner-only calls are in [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md).

This brief is a *summary with pointers*. Before changing anything, open the finding's own write-up —
the repro steps and the measurements live there.

---

## 1. What was done

### 1.1 The environment, and why it matters for reproducing anything here

Nothing was tested against production. Everything ran against a **local production build of this
branch**:

```
cd web && npx next build
SITE_PASSWORD='<any>' \
USER_CORPUS_OWNER_IDS='<test user id>' \
TEACHER_ALLOWLIST='<test user email>' \
npx next start --port 3010
```

- `SITE_PASSWORD` is set so the **site gate is live exactly as in production**. Without it the built
  app fails closed with a 503 (`middleware.ts`), and every `/api/*` POST without the gate cookie
  returns the gate's own `401 Locked` — which looks exactly like an auth failure. **A rate-limit or
  auth test that does not carry the gate cookie is measuring the gate.** This produced one false
  result before it was caught.
- The database is the **dev** Neon branch (`ep-tiny-hat`, `NEON_BRANCH=dev`) — never production
  (`ep-odd-fog`). Two disposable accounts were created on it. Dev test accounts already existed from
  earlier sessions, so this is the established practice here.
- `USER_CORPUS_OWNER_IDS` and `TEACHER_ALLOWLIST` are the app's own documented switches
  (`lib/user-corpus/access.ts`, `lib/teacher-access.ts`). Uploads and `/ask` are gated behind them and
  are otherwise untestable.
- All test data was deleted afterwards; counts are recorded at the end of `UX_RESULTS.md`.

### 1.2 Coverage

**738 of 918 test IDs closed** (PASS / FAIL / NOT-APPLICABLE), up from 437 at the start of this pass.
`PENDING-SIGNIN` went from **126 to 4**. The signed-in surface — annotations, notes, studies, plans,
uploads, prayers, desk, Ask, History, account — was exercised for the first time.

Real interactions, not simulations, wherever possible: real uploads (including a 26 MB file and a
0-byte file), 12 real questions through the shipped compose→verify path, 24 real history queries, 100
shelf saves, 200 study blocks, 130 highlights in one chapter, two-tab conflict tests, and network
failures injected per write path.

### 1.3 Tooling limits — each proven, not assumed

These bound several rows and explain why some tests are marked BLOCKED rather than failed:

| limit | how it was proven |
|---|---|
| **No keyboard events reach the page** | A probe `<input>` with a `keydown` listener recorded **zero** events for Tab and Enter. `computer type` works (it inserts text); `computer key` does not. All 13 `KB-*` rows and several `AX-*` rows are blocked by this. |
| **`requestAnimationFrame` never fires** | Armed one rAF and one MessageChannel message together: the MessageChannel callback ran, the rAF callback did not (`document.visibilityState === "hidden"`). Animation, frame-rate and reveal-timing rows cannot be measured. **This also produced a false P1 — see §2.** |
| No network throttling | No CPU/network throttle available; slow-network rows were approximated by injecting fetch delays. |
| No screen reader, no mail access | `AX-002/005`, the verification-link rows, and several `*-SR` rows. |

### 1.4 Two method traps that produced wrong answers before being caught

Both are worth knowing before you write a test against this app:

1. **Scope every DOM query to the surface under test.** The sidebar mirrors study titles, thread
   titles and register names, so a page-wide `innerText` match finds the *navigation copy* of a
   control instead of the control. This produced a false P1 (retracted, §2).
2. **Composite the whole ancestor background stack when measuring contrast.** Compositing over a
   single opaque ancestor gave false failures (sidebar "1.79", an Ask label "2.00") that a screenshot
   immediately contradicted; done properly they are **4.54** and **6.17**. The one finding re-measured
   with the corrected method (F-131) *survived*.

---

## 2. Do not fix these — seven previously filed findings are wrong

**Read this section before touching anything.** These are all from the earlier pass and each was
re-tested with evidence. Chasing them wastes the fix pass.

| finding | verdict and evidence |
|---|---|
| **F-011 (the only P0)** — "the core journey has no discoverable UI to add a commentary pane" | **WRONG.** Walked end to end: `/desk` → *Open the Bible* → John 3 → **`+`** (`aria-label="Add a work from the library"`, 44×44px, also `title`) → `/library?desk=…` → Commentaries → **`+ Add Adam Clarke's Commentary…`** → two panes side by side, 494×644 each. The desk-grid commit `e7dbe20` is an ancestor of the **live** sha, so this is production behaviour. **The real defect is F-158 below** — the pane opens at Genesis 1. |
| **F-012 / F-102 / F-104** — "`/library/*` hangs on Loading the library" | **A hidden-tab artifact.** The resolved content is already in the DOM in a `div[hidden]`; React's streaming reveal (`$RC`) is queued with `requestAnimationFrame`; rAF never fires in a hidden tab. Calling `window.$RV(window.$RB)` by hand reveals the page instantly. In-app navigation renders in 1,377ms every time. A visible tab gets its frame in ~16ms. |
| **F-051 / F-077** — "no rate limiting on the gate or on login" | **WRONG.** Gate: `303 ×10` then `429 ×4` (cap `GATE_LIMIT_PER_MIN=10`). Sign-in: `401 ×5` then `429 ×7` (cap `AUTH_EMAIL_LIMIT_PER_MIN=5` per address). Both earlier tests stopped below the cap. *(But F-168 is real and new — `/search` has no limiter at all.)* |
| **F-050** — "text size / column width may not affect the reader" | **WRONG.** Font-size 18 → 20 → 22.4 → **25.6px** (ceiling) and down to **16px** (floor); container 620 → 715 → **827px**. Both persist and both survive a fresh chapter load. |
| **F-037** — "the skip link never moves focus" | **WRONG.** `<a href="#main">`, `#main` has `tabindex="-1"`, and after activation `document.activeElement` is `MAIN#main`. The reveal rule is `.skip-link:focus { top: 1rem }` (`globals.css:284`) — plain `:focus`, correct; it cannot be *observed* in an unfocused window. |
| **F-105** — "study export returns 503" | **DOES NOT REPRODUCE.** `?format=docx` → **200**, correct MIME, **9,455 bytes**, valid docx. `?format=pdf` → 200, print-styled HTML with attribution. The route's only failure path is `apiError('INTERNAL')` = **500** (`lib/api-error.ts:35`); the two codes that map to 503 are the middleware's `GATE_LOCKED` and `UPSTREAM_UNAVAILABLE`. A production 503 is the gate or the platform, not this handler. *(The second half of F-105 does stand — see F-180 below.)* |
| **F-044** — "invalid plan id falls back silently" | **HALF WRONG.** It says *"This plan could not be opened. It may have been removed."* The **doubled `<title>`** ("Reading plan · Ancient Paths · Ancient Paths") is real and still there. |

### Retracted from *this* pass

**F-177 was my own error and is withdrawn.** "Save to study silently does nothing when you pick an
existing study" was a selector mistake — a page-wide text match clicked the **sidebar link** with the
same study title. Scoped to `[role=dialog][aria-label="Choose a study"]`, choosing an existing study
fires `POST /api/studies/<id>/blocks`, stays on the thread, and reports *"Saved to <study>. Change?"*
in a live region; the clipping is in `study_blocks`. **Save to study works.**

---

## 3. Findings, by severity

Severity is the effect on a reader, not the size of the diff. Every row links to the write-up in
`UX_RESULTS.md`.

### 3.1 P1 — fix first

#### F-162 · A failed commentary fetch is reported as "No commentary on this verse yet."
**What.** With `/commentaries/*` failing, the verse panel on John 8:5 shows *"No commentary on this
verse yet."* and the Commentaries tab loses its count. Unblocked, the same verse shows
**"Commentaries5"** and five entries. No error, no retry, no way to tell a network failure from an
empty verse.
**Why it is P1 here.** This product's promise is reporting what commentators said. A dropped fetch
makes it say they said nothing.
**Where.** `web/src/components/study-panel.tsx:435` — the empty-state `<p>` is returned for both the
"no entries" case and the "load failed" case.
**Suggested fix.** Distinguish the two states in the panel's data model: `entries === null` (not
loaded / failed) vs `entries.length === 0` (genuinely none). Render the existing sentence only for the
second; for the first render an error with a retry, in the shape `RD-065` already uses
(*"Failed to load chapter"* + an action). Add a `role="alert"` so it is announced — the reader's own
failure state is not in a live region either (`AX-020`).

#### F-151 · 88% of Jamieson's sections have their scripture references stripped to bare punctuation
**What.** Counted over the served corpus:

| work | sections | with an empty `( )` | with a bare `; ;` |
|---|---|---|---|
| **jamieson-jfb** | 1,258 | **1,110 (88%)** | **716** |
| augustine-homilies | 3,723 | 85 (2%) | 0 |
| adam-clarke / matthew-henry | 12,693 / 4,210 | 0 | 0 |

A reader sees *"The strong man armed / Galilee / **; ; , .**"* and, in prose, *"…every kind of idol or
false god **( )**."*
**Why it is P1.** Jamieson is **served in Ask answers** — it supplied the fallback sources for the
interpretation-bait question in this pass. Citations with their references deleted are reaching
readers.
**Where.** This is stored data, not render code. The K-2 ingest fix (`1cef7e8`, CCEL adapter dropping
`scripRef` display text) is on this branch but governs *ingest*, so already-ingested rows still carry
the damage.
**Suggested fix.** A data repair, not a code change: re-ingest `jamieson-jfb` (and check
`augustine-homilies`) through the fixed adapter, and add a corpus check that fails when a work's
sections contain `\(\s*\)` or `(^|\s);\s;` above a small threshold — the same shape as the existing
corpus-surface matrix. This is owner-gated work on production data.

#### F-158 · The commentary you add to the desk lands at Genesis 1, with no way to bring it to the passage
**What.** Adding Adam Clarke's commentary *beside John 3* opens the pane at **Genesis 1**
(*"God in the beginning created the heavens and the earth…"*). There is **no follow control, no sync
toggle, no jump-to-passage**; the pane's only navigation is its own Contents, which opens at
"Genesis 1 / Part 1 of 19" over a **12,693-section** work.
**Why it is P1.** This *is* the app's core described journey. It is reachable in five clicks and then
unusable: two panes showing John 3 and Genesis 1. Swapping the commentary for a sermon costs **four
moves** (`✕` → `+` → register → work) and the replacement also lands at its own beginning.
**Suggested fix.** When a work pane is added while a scripture pane is open, resolve the work's
section for that passage and open there (the data exists — Ask answers already anchor corpus sections
to verse ids, and `/api/work/[slug]/sections` is addressable). Then either make panes follow the
scripture pane by default with an opt-out, or add a single "go to this passage" control in the pane
header. Also worth a single-action **swap** on a pane, since the current cost is four moves.

#### F-116 · Every highlight colour fails AA contrast in dark mode
**What.** Measured by compositing each `/70` wash over the real page background:

| | light | dark |
|---|---|---|
| all ten colours | **11.82 – 13.84** | **1.69 – 2.05** (AA floor 4.5) |

Confirmed by looking at a dark-mode screenshot: highlighted verses are visibly *harder* to read than
unhighlighted ones, which inverts what a highlight is for.
**Where.** `web/src/lib/highlight-colors.ts` — the palette has **zero `dark:` variants**; the same
`bg-<colour>-200/70` classes are used in both themes.
**Suggested fix.** Add a dark variant per colour (a darker, more saturated wash, or the same hue at
lower alpha over the dark ground) and/or set the per-highlight `text_color` — the column already
exists in the schema and the API already accepts it, and the colour buttons simply never set it. The
file's own header warns that ids are persisted and append-only, so add variants rather than renaming.

#### F-112 · Password **reset** does not revoke existing sessions
**What.** Sessions created *before* a forgot-password reset are still in `neon_auth.session`
afterwards and still authenticate. Browser session `Tnp9d3IG` and curl session `88liMPe2` both
survived a reset, and the browser session continued to render `/account/settings` as signed in.
**Why it matters.** A reset is the flow someone uses when they think their account is compromised.
**Where.** `web/src/components/auth-forms.tsx` — the reset path calls `authClient.resetPassword({...})`
with no session revocation, while `account-settings.tsx:40` correctly passes
`revokeOtherSessions: true` to `changePassword`.
**Suggested fix.** Revoke other sessions on the reset path too, matching the change-password path.
See also **F-110** below: revocation is not immediate either.

#### F-088 / F-155 · Every in-app deep link into a work loses its anchor
**What.** A search result linked to `/work/calvin-calcom21#s8` lands at `#s1` with
`main.scrollTop === 0` and the cited section **504,073px** below the fold. A history result linked to
`#s14` lands at `#s1` with the section 8,793px down. Still true 6 seconds later, so not a timing
artifact. **Loading the same URL directly works** — `#s8`, `scrollTop` 503,977, the section 96px from
the top.
**Why it is P1.** It breaks the payoff of both search surfaces: "History points you into the sources"
delivers you to the start of a very long book instead.
**Suggested fix.** Something rewrites the hash to the first visible section before the fragment scroll
happens — a scroll-spy racing the navigation. Suppress the spy's hash write until after the initial
anchor scroll settles (a mounted-and-scrolled flag), and scroll the anchor explicitly on route change
rather than relying on the browser, since the work scrolls an inner container rather than the document.

---

### 3.2 P2 — the substantial list

Grouped so related work can be batched. Full write-ups in `UX_RESULTS.md`.

**Silent data loss on the annotation write paths** *(one root cause, three findings)*
- **F-120** A highlight that fails to save is painted anyway, the panel starts offering "clear", and
  nothing is shown — no error, no `role=alert`. On reload it is simply gone. (Two POST attempts *are*
  made; the failure after them is what is silent.)
- **F-125** A note that fails to save is discarded **and the panel closes as though it saved** — the
  same thing it does on success. The typed prose is not preserved anywhere.
- **F-121** Clear-then-recolour: clearing a verse (DELETE held 4s) then picking a new colour leaves
  the verse **empty** — the late verse-level DELETE removes the highlight the reader just asked for.
  The older intent wins.
- **Suggested fix.** These three share a shape. `SE-012` (the study editor) is the model already in
  this codebase and should be copied: *"Save failed — Retry"*, text preserved, retry works. Concretely:
  surface a persistent failed state per annotation write; do not close the panel on a failed save; and
  make verse-level delete scoped to the span it was issued for, or cancel it when a newer write for
  the same verse starts.

**Errors that are announced generically instead of specifically**
- **F-113** A tab whose session ended reports *"That change could not be saved. Please try again."*
  for a **401** — no mention of the session, no route to sign in, and retrying can never work.
- **F-142** An over-cap Ask question returns a precise server message (*"That question is too long
  (max 500 characters)."*) and the UI shows *"Something went wrong. Please try again."* The app **can**
  do better and does: with the network cut it correctly says *"Network error. Please try again."*
- **F-133** An over-length study block gives the same generic *"Save failed — Retry"*, and retrying can
  never succeed; the server's *"a text block holds at most 20000 characters"* is discarded. No
  `maxLength`, no counter.
- **Suggested fix.** One shared change: in the client error path, distinguish `401` (route to sign-in,
  keeping the destination) from `4xx` with a message (show the server's sentence) from network failure
  (the existing retry copy). Add `maxLength` + a counter where a server cap exists.

**Upload**
- **F-134** The limit is advertised as **25 MB** and is actually just under **10 MB**. Bisected:
  10,485,184 bytes → 201; **10,485,760 (10 MiB) → 400 `{"error":"Attach a file in the \"file\" field."}`**.
  Next.js names the cause in the server log: *"Request body exceeded 10MB … see
  `middlewareClientMaxBodySize`"* — the route sits behind middleware, the body is truncated, and
  `formData()` then finds no file.
  **Fix:** raise `middlewareClientMaxBodySize` in `next.config` to match the advertised cap, **and**
  make the advertised number and the enforced number come from one constant (`MAX_UPLOAD_BYTES`,
  `lib/user-corpus/sniff.ts:16`).
- **F-135** 3 of 10 simultaneous uploads lost their bytes (`status: failed`, *"The uploaded file was
  not stored"*) — the last three submitted. Single uploads either side succeeded. The **Try again**
  recovery works and heals the row; the ~30% failure rate on a batch the `multiple` input invites is
  the defect. Nothing appears in the server log — the blob failure is swallowed.
- **F-100 / F-101 confirmed, same string.** A 0-byte `.txt` returns `415` *"That file is not a PDF,
  Word document, or text file. **Slice 1** accepts .pdf, .docx, .txt and .md."* — factually wrong (it
  *is* a text file, it is empty) and it leaks the internal codename.
  **Where:** `lib/user-corpus/sniff.ts:67`, second copy at `lib/user-corpus/parse-docx.ts:215`.
  **Cause:** `looksTextual()` is false for zero bytes, so an empty file falls to the unsupported-type
  branch. **Fix:** an explicit zero-length branch with its own message, and drop "Slice 1" from both
  strings.
- **F-137** The server says *"Uploads are not enabled on this **deployment**"*
  (`lib/user-corpus/access.ts:89`); the screen says *"not available on this **account** yet"*
  (`my-works.tsx:619`). `access.ts` already has a separate, correct per-account string — the UI
  collapses both into the account wording.

**Search**
- **F-168** `/search` has **no rate limiter at all**: 35 queries in a burst, all 200, and
  `app/search/page.tsx` imports no limiter while running **six** searches per request
  (`searchSections`, `searchLexicons`, `searchNotes`, `searchPrayers`, `searchStudies`,
  `keywordSearch`). `checkCorpusSearchRateLimit` (30/min, 500/day) is imported by exactly three
  user-corpus routes. `/search` also answers **200 while signed out**, so anyone past the site
  password can run unlimited full-text queries over the corpus. **Fix:** apply the existing limiter.
- **F-170** At 390px, nine search-result heading paths extend past the viewport (as far as **640px**),
  `overflow: visible`, no truncation. An ancestor clips them, so there is no horizontal scroll and
  nothing *looks* broken — the text just stops. **Fix:** `truncate`/`line-clamp` on the heading path.
- **F-131** The match-count labels are `rgb(180,166,146)` at 11px: **2.25 light / 3.01 dark** against
  a 4.5 floor, six per results page. (Re-measured with corrected compositing; it survived.)

**Attribution and consistency** *(the product's core promise)*
- **F-165** Five surfaces render the same attribution five different ways, and **only the verse panel
  shows the year** — which also proves the year is available, narrowing the old F-064:

  | surface | rendered |
  |---|---|
  | library list | `ADAM CLARKE · METHODIST · COMMENTARY · 727` |
  | work page | `AUGUSTINE OF HIPPO · PATRISTIC · PATRISTIC · PUBLIC DOMAIN` (**F-154**: the word twice) |
  | desk pane | `Adam Clarke · methodist` (lower case) |
  | **verse panel** | **`Matthew Henry — 1710 — Nonconformist`** ✔ |
  | Ask answer | `Adam Clarke —, Adam Clarke's Commentary  Methodist` (**F-138**) |

- **F-138** Every Ask attribution renders an **em dash immediately followed by a comma**. The dash is
  an `aria-hidden` era swatch (`<span class="ml-1.5 text-xs text-era-modern">—</span>`) sitting
  exactly where a reader expects the name/date separator. **Fix:** render the year as the verse panel
  does, or move the era swatch out of the punctuation position.
- **F-164** Selecting text **inside a commentary entry** produces **no selection toolbar at all** — no
  Copy. Verified with the selection confirmed inside the dialog (`dialog.contains(anchorNode) === true`,
  zero visible Copy buttons). Scripture selections get an excellent one (`“…”` + `John 3:16 · ASV`,
  plus a styled `text/html` blockquote). So a commentator's words can only leave the app **unattributed**.
- **F-149 / F-010** Tradition labels are inconsistently cased (`METHODIST` / `methodist` / `Methodist`)
  and **`unassigned` reaches the reader**: **24 of 33 commentaries (73%)**, offered as a filter option
  and printed on shelf rows and in Ask attributions.

**Reader**
- **F-144** The reader **never restores scroll**: scrolled to 1400px, went to `/settings`, Back →
  `scrollTop 0`. Mechanism worth writing down: the reader scrolls an inner
  `<main class="flex-1 overflow-y-auto">` (scrollHeight 2562 / clientHeight 800) while
  `document.scrollingElement` never scrolls, so native scroll restoration cannot apply. Same root
  cause as the old F-058. **Fix:** save and restore the container's `scrollTop` per history entry.
- **F-145** **Notes and bookmarks are invisible in the reader.** Wrote a note on all 38 verses of John
  13 plus a bookmark; the verse markup is byte-identical to an unannotated verse and the `<sup>`
  accessible name is unchanged. Highlights render; notes and bookmarks render nothing.
- **F-143** A multi-verse selection copies **only the first verse** and captions it with that single
  verse's reference. 297 characters selected across John 13:16–18 → 137 characters copied, labelled
  `John 3:16 · ASV`. Nothing indicates the trim.
- **F-150** Interlinear glosses are broken or empty for about **1 word in 15** (4 of 60 sampled):
  `ἄνθρωπος → "from G3700 )"`, `ἐκ → "literal or figurative"`, and two with empty transliteration
  *and* gloss. (A `swarm/w-strongs-gloss-fix` branch exists, so the class is known.)
- **F-090 confirmed with the mechanism.** Interlinear ON replaces all 36 `<sup role="button"
  tabindex="0">` verse handles with inert `<span>`s — the verse-study panel has no entry point at all
  in that mode, and no keyboard path either.

**Lists that silently truncate** *(one habit, three surfaces)*
- **F-117** `/library/notes` prints the API page size as the total: **"HIGHLIGHTS (100)"** with 143 on
  the account, no pagination, nothing saying anything was omitted. Same for notes (`NOTES (100)` with 105).
- **F-152** The shelf renders **50** of 100 saved works with no count and no "load more".
- **F-136** 200 uploads render in one flat list with a search box but **no sort and no filter**.
- **F-118** The Saved overview has **zero `<button>` elements** — nothing there can be deleted.
- **F-126** The Saved list shows note bodies **in full** (2,519 characters rendered, `line-clamp: none`,
  400px tall for one note), with **no timestamps** and **no search**.

**Desk / plans / other surfaces**
- **F-123** Highlights do not render in reading-plan context (18 on John 3, 0 shown).
- **F-128** Plan-reading verse numbers are inert — no role, no tabindex, no label — so nothing can be
  annotated from inside a plan. Same family as F-109 (desk).
- **F-159** A desk scripture pane stops dead at the chapter end: no next-chapter control, no
  continuous read, only Contents.
- **F-161** Text size and column width apply only in `/read` — no `.reading-scale` container and no Aa
  control in desk panes or plan reading. *(In fairness: Settings attaches "Applies everywhere" to
  **theme**, which really does. Text size claims nothing.)*
- **F-141** History threads are saved forever with **no way to find them again**: 27 `chats` rows with
  `persona='history'` on this account, `/api/research` filters `persona='ask'`, and
  `lib/history-threads.ts` has **no list function** — so no list, no empty state, no delete.
- **F-139 / F-140** History searches the whole of church history against **one first-century work**
  (`coverage: {works: 1, sections: 4112}`). 24 queries: 22 returned exactly one result, all from
  `josephus-whiston`; entity recognition 9/24, every one first-century. The **framing is honest**
  ("No known people or places matched — showing text matches", "CLOSEST MATCH TO YOUR QUESTION") and
  the zero-result state is the best empty state in the app — but coverage is disclosed **only** when
  nothing is found. *(Also: "the 1 served history items", "Searched 1 items" — no singular form.)*
- **F-146** `1cor13` (no spaces) routes to **1 Corinthians 3**, not 13 (anchors 46003004/46003014).
  The other three spellings route correctly. The answer still reads plausibly, which is what makes it
  worth fixing.
- **F-147** There is no "we have nothing on that": *"what does the Bible say about cryptocurrency"*
  returns a composed answer about *"the spiritual dangers and proper ordering of wealth and gold"*.
  Nothing is invented and everything is attributed — but the reader is never told the answer is about
  a neighbouring subject. **The History surface gets this right; the teacher has no equivalent state.**
- **F-148** **3 of 12** questions returned `kind: "fallback"`, including two ordinary ones
  ("what does the Bible say about grief", "What did the church fathers say about the incarnation in
  John 1?"). Latency p50 **26.7s**, p95/max **63.2s**, 3 of 12 over 40s, against a promised "20–40
  seconds". The fallback copy itself is very good; the **rate** is the finding.
- **F-174** At 390px `/home` is **5,085px** tall and its first action sits at **4,218px** — five
  screens of devotional prose before anything actionable.
- **F-176** All four marketing pages (`/`, `/about`, `/features`, `/why`) still show **"LOG IN"** and
  **"Request access"** to a **signed-in** reader, and "Home" points at `/` rather than `/home`.
- **F-175** With `localStorage` blocked (Safari strict modes, enterprise policy), the reader crashes
  into the global error boundary — *"Something went wrong … Nothing you have saved is affected"* — 
  rather than rendering without preferences. Not a white screen, and the reassurance is true, but it
  does not degrade and never mentions storage.
- **F-153** A work has **no reading-progress display** — no progressbar, no percentage, no "section N
  of M". *(Progress is tracked and resumed correctly: reopening a work with no fragment returned to
  `#s37`. It is only the display that is missing — and `/library`'s "CONTINUE READING" row does show
  percentages, so the component exists.)*
- **F-110** *"Other sessions were signed out"* is true in the database and false in practice for up
  to ~5 minutes: the revoked session kept rendering `/account/settings` as signed in ~19s after
  revocation (dead by +110s), because `__Secure-neon-auth.local.session_data` is a signed ~5-minute
  cache trusted without re-checking the session row.
- **F-114** Email-verification tokens expire in **5 minutes** (`expiresAt - createdAt = 00:05:00`) and
  the screen states no expiry. The reset flow gets this right in both directions (1-hour TTL, and the
  copy says "expires in an hour").
- **F-119** Changing a highlight's colour leaves the old one behind as a **second row** — the reader
  looks right (last covering span wins) but `/library/notes` lists the verse twice and the counter
  inflates. Two tabs recolouring one verse is the same defect from the other end.
- **F-124** An unsaved note is lost on refresh or navigation: `beforeunload` is not prevented and
  there is no draft in `localStorage`/`sessionStorage`.
- **F-157** **Eleven** surfaces share the title "Ancient Paths", including **the reader** and **every
  work page** — the two you would most want to find in a tab strip. `/ask?mode=history` also reuses
  `/ask`'s title. *(Plus F-044's doubled title on `/plans/[id]`.)*
- **F-163** The verse panel declares `aria-modal="true"` and is not modal: `position: static`,
  672×704, no scrim anywhere, outside clicks do not close it. Either make it modal or drop the
  attribute.
- **F-171** Errors are announced (`role="alert"`) but never **attached to a field**: no
  `aria-describedby`, no `aria-invalid`, and the alert has no `id`.
- **F-180 (from F-105's surviving half)** Both study-export options are plain `<a href>` links with
  **no client-side error handling**, so any export failure of any kind is silent from the user's side.

### 3.3 P3 — small, cheap, worth batching

`F-111` (a used reset link explains itself but offers no "request a new one") ·
`F-115` (no-JS submit → raw `404 Server action not found.`, and no `<noscript>` on any auth page) ·
`F-122` (reading-plan disclosures never update `aria-expanded`, no `aria-controls`) ·
`F-127` (the note editor never resizes — 142px at 11 characters and at 5,000) ·
`F-129` (with 50 plans, "New plan" sits at y≈6,587px, below every row) ·
`F-130` (**the system dark-mode preference is ignored on a first visit** — the pre-hydration script
reads only `localStorage`, `layout.tsx:138`, with no `prefers-color-scheme` fallback) ·
`F-132` (settings do not sync between open tabs — nothing listens for `storage`) ·
`F-154` (the work header prints the tradition twice) ·
`F-156` (**six of seven malformed routes return HTTP 200** — soft 404s; only `/studies/[id]` answers
404. The *copy* is excellent: "Unknown book: 'notabook'", "John has 21 chapters", "That isn't a
Strong's number. A word page looks like /word/G2316…") ·
`F-166` (a refresh while reading a commentary loses it — the verse panel is not in the URL) ·
`F-167` (applying a translation silently closes the verse panel) ·
`F-169` (submitting a search is a full document navigation, so anything typed while it runs is
discarded; searches took 2.0–6s) ·
`F-172` (the **change-password** form reports *"Invalid email or password"* — it has no email field) ·
`F-173` (the office reads the clock once at mount with no timer, so a page held open past midnight or
noon shows the previous day until reload) ·
`F-179` (Voices / Commentary / sources / Commentaries — four words for one thing on one screen) ·
`CM-010` (one real instance of double-escaped entities: `&#38;&#35;183;` in `chatfield-greeksongs`).

### 3.4 Naming — flagged, not proposed

**F-178.** Four user-facing nouns for four overlapping things, two of them inverted:
**"My books"** = library works *you saved*; **"My Works"** = documents *you uploaded*;
**"All items"** = the corpus catalogue; **"Saved"** = your highlights/notes/bookmarks.
Underneath: `sources` vs `user_documents`. Routes disagree with labels in two more places
(`Saved → /library/notes`, `My Works → /library/uploads` titled "My uploads").

`CLAUDE.md` records that **naming is locked** and that the counted noun moved from "works" to "items"
— and the catalogue does say "33 items", so that part is honoured. **This is raised as an
observation, not a proposal**; the books/Works/Saved collision is not what that lock settles, and the
call is the owner's.

---

## 4. What the app does *well* — do not "fix" these

Worth knowing so a fix pass does not flatten them:

- **The product guarantee holds, and it is now measured.** Across 12 real answers there were 15
  non-voice blocks, **all neutral framing**, and a scan for first-person/verdict language
  (`I think`, `we believe`, `clearly`, `the truth is`, `you should`, `the correct…`) returned **zero
  hits**. One framing sentence reads *"…without resolving interpretive differences."* Every voice block
  carried author, work and a verbatim quote. The bait question ("Just tell me what you think") produced
  `kind: "fallback"` — zero composed voices, raw retrieval — which is the fail-closed contract working.
- **The licensing gate holds, checked three ways.** Quarantined and staged Chesterton is unavailable on
  the page, **404** from `/api/work/<slug>/sections`, and absent from search.
- **Accessibility structure is better than most production apps.** Across 12 surfaces: exactly one
  `<h1>` each, **zero** heading-level skips, **zero** unlabelled interactive controls, **zero** images
  missing `alt`, **zero** unlabelled inputs.
- **The study editor's write-failure handling is the model the rest should copy** (`SE-012`).
- **Error copy is specific and humane** where it exists — *"Today's reading could not be opened. The
  Scriptures are still there to search."*, *"John has 21 chapters"*, *"Nothing in the 1 served history
  items matches this."*
- **The design system is tight**: across six surfaces the entire inventory is border-width `1px`,
  radius `4px` (3px on highlight spans), and **no `box-shadow` anywhere**.
- **Desk panes are genuinely windowed**: Spurgeon's 118,371 sections render as **472 DOM nodes**.
- **Sub-verse highlights are handled thoughtfully**: they are translation-scoped, and a span from
  another translation renders as *"Highlighted in KJV."* rather than being dropped or mis-placed.
- **F-108's root cause is now known and the fix already exists in this repo:** `window.confirm` at
  `plans-client.tsx:762` — a native modal that blocks the renderer, which is why CDP hangs. The
  identical defect was already fixed in `prayer-journal.tsx:353` with a two-step in-page confirm, and
  its comment explains why. It is the **last `window.confirm` in `web/src`**.

---

## 5. What is untested, and why

**180 of 918 rows remain open.** Each row in `UX_TRACKER.csv` states its own limitation.

| status | count | why |
|---|---|---|
| PARTIAL | 102 | each states its specific limitation; many are runnable and simply not yet reached |
| NOT RUN | 25 | remaining `AS-*` / `HS-*` behaviours (streaming, follow-ups, rate-limit copy, thread lifecycle) plus the two open-ended query generators (`AS-044` 150 questions, `HS-030` 120 queries — 24 run) |
| PENDING-DEVICE | 25 | real iOS/Android hardware or a non-Chromium browser. `CLAUDE.md` forbids an agent closing these |
| BLOCKED | 18 | 13 keyboard rows (no key events reach the page), 3 verification-mail rows, 2 screen-reader rows |
| PENDING-SIGNIN | 4 | Google OAuth (needs the origin registered) and two screen-reader journeys |

**Nine owner decisions** are in `OWNER_DECISIONS.md` — a test mailbox; whether email verification is
required for beta; Google OAuth on a dev origin; real-device coverage; a screen reader; **Slice 4**
(uploads are indexed and searchable in My Works but never appear in an Ask answer — the lane was
reverted at `5c8ab31` under a withdrawal rule whose own commit calls the control bar "a defective
pin"); the one-work historians corpus; `unassigned` as a user-visible tradition; and the previous
pass's stranded plan on the production account.

---

## 6. If you fix nothing else

1. **F-162** — a network error must not be reported as the corpus being empty.
2. **F-151** — re-ingest Jamieson; its stripped citations are being served in Ask answers.
3. **F-158** — make the added desk pane land on the passage.
4. **F-116** — dark-mode highlight contrast.
5. **F-112** — revoke sessions on password reset.
6. **F-120 / F-125 / F-121** — stop losing annotation writes silently; copy `SE-012`.
7. **F-088 / F-155** — deep links into works must land on the passage.
8. **F-108** — replace the last `window.confirm` with the pattern `prayer-journal.tsx` already uses.
