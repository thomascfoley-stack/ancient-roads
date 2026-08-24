# MOB slice — mobile/tablet checks (localhost:3066, signed out, prod build)

Tested via `mcp__Claude_Browser` on tab-4. Gate password submitted via
`document.querySelector('button[type=submit]').click()` after `form_input` filled the field —
`computer.left_click` consistently timed out with "Browser pane is currently hidden" (shared pane
contention with other concurrent agent tabs, tabs seed/tab-1..6 all present). Keyboard `key` events
worked directly but JS `.click()` was needed for the gate submit button specifically. All
`scrollWidth`/`innerWidth` numbers below are read via `document.documentElement.scrollWidth` /
`window.innerWidth` directly on the live DOM, not screenshots.

## MOB-001/002/003 — horizontal overflow, 375px and 320px

Check: `scrollWidth <= innerWidth + 1`.

| Page | 375px (scrollWidth/innerWidth) | Pass | 320px (scrollWidth/innerWidth) | Pass |
|---|---|---|---|---|
| `/` | 375 / 375 | PASS | 320 / 320 | PASS |
| `/about` | 375 / 375 | PASS | 320 / 320 | PASS |
| `/read/jhn/3` | 375 / 375 | PASS | 320 / 320 | PASS |
| `/search` | 375 / 375 | PASS | 320 / 320 | PASS |
| `/library/notes` | 375 / 375 | PASS | 320 / 320 | PASS |

**Result: 10/10 pass, no horizontal overflow found on any page/width combo tested.**

Note: `/` at signed-out state renders the marketing landing page, not the app shell (confirmed via
screenshot — hero image, "See it answered" CTA, footer author grid). `/library/notes` and
`/read/jhn/3` render the real app shell.

## Sign-in form vs viewport (375px)

`/auth/sign-in`, signed out. Field/button rects (`getBoundingClientRect()`), `innerHeight` 812:

| Element | top | bottom | height |
|---|---|---|---|
| email input | 289 | 331 | 42 |
| password input | 369 | 411 | 42 |
| submit button | 435 | 481 | 46 |

All three sit in the top 60% of the 812px viewport (email top=289, submit bottom=481), nowhere near
the bottom edge. A software keyboard (typically covering the bottom ~40-45% on a 812px-tall device,
~325-365px) would not reach the submit button (bottom=481, well above the keyboard's likely top
edge). No conflict observed. The persistent bottom tab bar (Home/Bible/Ask/Library/Search/Menu) sits
below the form and would be the first thing covered by a keyboard, not the form itself.

## Tap target sizing — `/` at 375px

All visible `<a>`/`<button>` rects, flagging any dimension < 44px on elements that read as primary
navigation/interactive (not decorative icons):

| Element | w×h | Flag |
|---|---|---|
| "Skip to content" | 123×36 | height 36 < 44 (a11y skip-link, low visibility impact but still under 44) |
| "Ancient Paths" (logo) | 97×44 | OK |
| "Home" (top nav) | 35×44 | width 35 < 44 |
| "Features" (top nav) | 50×44 | OK |
| "Why" (top nav) | 25×44 | width 25 < 44 |
| "LOG IN" (top nav) | 103×44 | OK |
| "See it answered" (hero CTA) | 171×52 | OK |
| "AUGUSTINE" / "CHRYSOSTOM" / "CALVIN" / "WESLEY" / "MATTHEW HENRY" / "ADAM CLARKE" / "CATENA AUREA" / "HODGE" / "WATTS" / "BARNES" (footer author grid, 10 links) | widths 71–129, **all height 40** | height 40 < 44 on all 10 |
| "Request access" (footer CTA) | 285×52 | OK |
| "Ancient Paths" (footer logo) | 151×44 | OK |
| "HOME" (footer nav) | 36×40 | width 36 <44, height 40 <44 |
| "FEATURES" (footer nav) | 61×40 | height 40 <44 |
| "WHY" (footer nav) | 27×40 | width 27 <44, height 40 <44 |
| "ABOUT" (footer nav) | 42×40 | width 42 <44, height 40 <44 |
| "LOG IN" (footer nav) | 41×40 | width 41 <44, height 40 <44 |

**Finding:** the entire footer — 10 author links + 5 nav links, 15 tap targets — is sized at
exactly 40px height, uniformly 4px under the 44px minimum. Top-nav text links ("Home" 35w, "Why"
25w) are 44px tall but well under 44px wide. This is a systemic sizing choice (footer link
component), not a one-off.

## Reader at mobile (375px), `/read/jhn/3`

Screenshot confirmed: serif body text, generous line height, ~40px side margins, drop-cap "T" on
verse 1, verse-number superscripts in brown — reads as deliberately typeset, not cramped or
overflowing. No overflow (`scrollWidth` 375 = `innerWidth` 375, before and after toggles).

Header control row ("John 3" chip, `Aa` / `HL` / `אα` / `KJV`) rects at 375px, **after** clicking
both HL and the interlinear (`אα`) toggle:

| Control | left–right | top–bottom | w×h |
|---|---|---|---|
| Aa | 167–206 | 10–54 | 39×44 |
| HL | 212–256 | 10–54 | 44×44 |
| אα | 262–306 | 10–54 | 44×44 |
| KJV | 312–357 | 10–54 | 45×44 |

All four sit inside the 375px viewport with `right`=357 (18px clear of the 375px edge), no wrap, no
overflow either before or after toggling. `scrollWidth` stayed 375 through both toggles. Controls
remain usable and tappable at this width; `Aa` is the one under-44-wide target (39px) but height is
44px on all four.

## Tablet (820×1180)

`/read/jhn/3`: renders a genuinely different layout, not a stretched phone view — a collapsed icon
rail down the left edge (Home/Bible/Ask/Search/Plans/Study/Library/Settings icons), header controls
moved to the top-right, and body text in a centered column with real margins on both sides (~120px
left of text to icon rail, breathing room right) rather than edge-to-edge. Reads as designed for the
width.

`/`: renders the desktop-style marketing nav (Home/Features/Why + Log In button) instead of a mobile
hamburger, full-bleed hero image, and centered hero copy with sensible max-width — same verdict,
looks like a deliberate breakpoint rather than a squeeze of the desktop layout or a stretch of the
phone layout.

## Summary

- No horizontal overflow anywhere tested (10/10 page×width combos, plus reader before/after toggles).
- Sign-in form fields/button are all in the upper 60% of the viewport; no obvious keyboard conflict.
- Tap targets: the footer (10 author links + 5 nav links = 15 targets) is uniformly 40px tall,
  4px under the 44px minimum — the one systemic finding. Top-nav text links are 44px tall but as
  narrow as 25px wide.
- Reader typography/margins at 375px read as intentional; HL/interlinear toggles do not break the
  header row at 375px.
- Tablet layout (820px) is a real designed breakpoint on both `/` and `/read/jhn/3`, not a naive
  stretch/squeeze.
