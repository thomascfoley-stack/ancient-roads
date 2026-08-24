# Keyboard (KB) + Performance (PF) — signed-out, local prod build (localhost:3066)

Tested 2026-08-24 against a local production build, signed out, via browser automation
(`document.activeElement` inspection + real `Tab`/`Enter`/`Escape` keypresses). Gate password
accepted via mouse/type as instructed (one-time bootstrap only).

---

## KB-013 / KB-014 — Tab order from the top of `/`, 15 stops

Method: fresh nav to `/`, one click on non-focusable body text to reset the focus-navigation
starting point to BODY (verified via `document.activeElement.tagName === 'BODY'` before each
Tab), then real `Tab` keypresses one at a time, recording `activeElement` tag/text and
page-absolute position (`scrollY + rect.top`) after each.

| # | Element | Page-absolute top |
|---|---|---|
| 1 | A "Skip to content" | -80 (off-screen until focused) |
| 2 | A "Ancient Paths" (logo) | 10 |
| 3 | A "Home" | 10 |
| 4 | A "Features" | 10 |
| 5 | A "Why" | 10 |
| 6 | A "Log in" | 10 |
| 7 | A "See it answered" (hero CTA) | 542 |
| 8 | BUTTON "Augustine" (example-question chip) | 3656 |
| 9 | BUTTON "Chrysostom" | 3656 |
| 10 | BUTTON "Calvin" | 3656 |
| 11 | BUTTON "Wesley" | 3656 |
| 12 | BUTTON "Matthew Henry" | 3704 |
| 13 | BUTTON "Adam Clarke" | 3704 |
| 14 | BUTTON "Catena Aurea" | 3704 |
| 15 | BUTTON "Hodge" | 3704 |

**Result: order matches visual top-to-bottom / left-to-right order, no traps, nothing skipped.**
Positions are monotonically non-decreasing. The big jump from #7 (542px) to #8 (3656px) is real
page whitespace (large hero section), not a skip — a DOM query of all 25 focusable elements on
the page confirmed no focusable element exists in that gap other than the sticky header (already
visited at #1-6, which re-reports its own position at the current scroll offset because it's
`position: sticky` — not a duplicate/skip artifact).

**Caveat on method:** clicking anywhere on the page (even a non-focusable text node) sets the
browser's internal "sequential focus navigation starting point" to that click's DOM position, so
a click lower on the page makes the *next* Tab start mid-page, not from the true top. Confirmed
this artifact directly: clicking on the hero heading before Tabbing produced "See it answered" as
the first stop, and clicking at (2,2) produced the logo link as the first stop — neither is the
real first-Tab-after-page-load behavior. The only clean way to test "first Tab from a fresh load"
is to **not click at all** before the first Tab (see KB-016 below, which used this clean method).

---

## KB-016 — Skip-to-content link

Method: fresh nav to `/`, **no click** (confirmed `activeElement` is `BODY` immediately after
load with no interaction other than a screenshot call), then one real `Tab`, then one real
`Enter`.

- **First Tab stop is the skip link.** `document.activeElement` → `<a href="#main" class="skip-link ...">Skip to content</a>`. PASS on "is it the first stop."
- **Activating it is broken.** Pressing `Enter` on the focused skip link changed the URL to
  `http://localhost:3066/#main` (so the click/navigation fired) but **focus did not move to
  `#main`** — `document.activeElement` after activation is `BODY`, not the `<main id="main">`
  element. The `<main>` element does exist and has `tabindex="-1"` (correctly set up to *accept*
  programmatic focus), but nothing calls `.focus()` on it. **Finding (P2, keyboard/screen-reader
  friction):** a keyboard user who activates "Skip to content" gets the URL hash updated and the
  page visually scrolled by the browser's native anchor behavior, but their focus stays on `BODY`
  — so the *next* Tab press starts back near the top of the page again, defeating the purpose of
  the skip link. Route: `/`. Repro: fresh load → Tab → Enter → check `document.activeElement`.

---

## KB-011 — Translation switcher dropdown, `/read/jhn/3`

The switcher is the "KJV" button in the reader toolbar (top right).

- **Opens on activation:** clicking it (confirmed via DOM diff — translation option buttons
  "World English Bible / WEB", "American Standard Version / ASV", "Webster's Bible Translation /
  WBT", "American King James Version / AKJV", "Revised Webster Version / RWB", "Updated King
  James Version / UKJV", "Bible in Basic English / BBE" etc. appeared and are visible/
  `offsetParent !== null`) — opens correctly. No `aria-expanded` or `aria-haspopup` attribute on
  the trigger button, though (accessibility gap, not this section's scope — flagging for AX).
- **Escape does NOT close it.** Pressed `Escape` twice, focus remained on the "KJV" trigger both
  times, and the translation option buttons stayed visible in the DOM (`offsetParent !== null`)
  after each press. **Finding (P1/P2 — B3 "nothing dead" / keyboard control missing its most basic
  affordance):** the dropdown has no keyboard-close path via Escape. Route:
  `/read/jhn/3`. Repro: click "KJV" → dropdown opens → press `Escape` → dropdown is still open.

---

## KB-010 — Focus containment while the translation dropdown is open

Continuing from the still-open dropdown above (Escape didn't close it): pressed `Tab` repeatedly.

- Tab 1 from the trigger moved into the dropdown ("World English Bible / WEB").
- Continued tabbing through further translation options ("Bible in Basic English / BBE" etc.).
- After ~21 total Tabs from the trigger, focus **left the dropdown entirely** and landed on
  `<sup role="button" tabindex="0" aria-label="Verse 3, read commentary">` — a verse-number
  control in the reader body, behind/below the still-open dropdown panel (dropdown option buttons
  were still present and visible at this point).

**Finding: no focus trap — but combined with the missing Escape-close (KB-011), this dropdown is
not behaving like a modal/popover at all.** It stays visibly open while keyboard focus moves past
it into the page content behind it, which is exactly the "focus escapes to page-behind elements"
condition KB-010 asks about, and it leaves the UI in a confusing state (dropdown open, focus deep
in the reader, no way to close via keyboard except tabbing back and clicking or navigating away).
Route: `/read/jhn/3`. Severity: P2, filed alongside KB-011 (same control, same root cause: no
close/dismiss handling on this popover).

---

## KB-015 — Positive tabindex

`Array.from(document.querySelectorAll('[tabindex]')).map(e=>e.tabIndex).filter(t=>t>0)`

- `/` → `[]`
- `/read/jhn/3` → `[]`

**PASS on both routes.** No positive tabindex found.

---

# PF — Performance, fresh navigation, signed out

Method: `navigate` (fresh, uncached — first load of that tab into the URL) then
`performance.getEntriesByType('navigation')[0]` + `performance.getEntriesByType('resource')`,
summing `transferSize`.

| Route | domContentLoadedEventEnd | loadEventEnd | TTFB | resource count | total transferSize |
|---|---|---|---|---|---|
| `/` | 26 ms | 54.5 ms | 9.8 ms | 38 | 22 KB |
| `/read/jhn/3` | 45.2 ms | 92.9 ms | 14.7 ms | 31 | 34 KB |
| `/search?q=shepherd` | 632.2 ms | 660.9 ms | 614.6 ms | 25 | 0 KB (all `transferSize: 0`) |

**No single resource over 500KB on any of the three routes** (`bigResources: []` each time).

**Caveats — read these numbers as optimistic, not representative:**
- This is `localhost` (loopback network, no real latency/bandwidth) — these numbers say nothing
  about real-world load time on a phone over LTE. Treat them as a smoke test only (nothing is
  egregiously bloated), not a performance verdict.
- `/` and `/read/jhn/3` total transfer sizes (22KB, 34KB) are implausibly small for a full page
  load and likely reflect the Next.js production build's aggressive caching / the resources
  already being warm in the browser's disk cache from the gate-password bootstrap navigation
  moments earlier — cached resources report `transferSize: 0` in the Resource Timing API. This is
  **not a reliable "cold cache" measurement** despite `navigate` producing a fresh top-level
  document load each time; sub-resources (JS/CSS chunks shared across routes) were very likely
  served from HTTP cache, not network. A true cold-cache number would need cache clearing between
  runs, which wasn't done.
- `/search?q=shepherd`'s much higher TTFB (614.6ms) and `totalTransferKB: 0` is notable — the
  slow TTFB suggests real server-side work (a live search query), and the 0KB total suggests
  either everything for that route actually was cache, or `transferSize` under-reports here
  (e.g. same-origin resources without `Timing-Allow-Origin` can report 0 even on a real fetch).
  Worth a dedicated PF-007/PF-008-style measurement (this task didn't have the query budget to
  chase it further) rather than treating 614ms as fully understood.

---

# Summary of findings

| ID | Severity | What |
|---|---|---|
| KB-016 | P2 | Skip-to-content link updates URL hash but never moves keyboard focus to `#main`; next Tab starts back at the top. |
| KB-011 | P1/P2 | Translation switcher ("KJV" button, `/read/jhn/3`) does not close on Escape. |
| KB-010 | P2 | Same translation dropdown has no focus containment — Tab eventually carries focus past it into the reader body while the panel is still visibly open. |
| KB-013/014 | PASS | Tab order on `/` matches visual order for 15 stops, nothing skipped or trapped. |
| KB-015 | PASS | No positive tabindex on `/` or `/read/jhn/3`. |
| PF | informational | Loopback timings only (DCL/load under 100ms for `/` and `/read/jhn/3`, ~660ms for `/search`), no resource over 500KB — but likely cache-warmed, not a true cold-cache measurement; not independently reproduced/verified beyond this single pass per plan's P0/P1 rule. |
