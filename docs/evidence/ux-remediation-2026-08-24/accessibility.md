# Accessibility spot-audit (AX-006–AX-011, AX-016/017/019)

Method: production build, signed out (gate password only), DOM inspection via `javascript_tool`
manual scripts (no axe-core). Pages: `/` (redirects to `/home`), `/read/jhn/3`, `/search`,
`/auth/sign-in`. Tab-order/focus checked with real `Tab` keypresses + `document.activeElement`
inspection, not simulated.

## AX-006 — image alt text
- `/home`: 0 `<img>` elements. N/A.
- `/read/jhn/3`: 0 `<img>` elements. N/A.
- `/search`: 0 `<img>` elements. N/A.
- `/auth/sign-in`: 1 `<img>` — `/_next/image?url=%2Fmarketing%2Fforest-dusk-2.jpg...`, decorative
  background photo. `alt=""` present but **no `aria-hidden="true"`**. Fails the letter of AX-006
  as specified (needs both `alt=""` AND `aria-hidden="true"` to count as correctly-decorative) —
  low severity in practice since `alt=""` alone already removes it from the accessibility tree for
  most screen readers, but flagging per the test's own bar.
  **FINDING (P3):** 1/1 images on `/auth/sign-in` missing `aria-hidden="true"` companion.

## AX-007 — icon-only buttons have accessible name
- `/home`: 4 buttons total, 0 unlabeled-icon-only failures (all have text, `aria-label`, or `title`).
  The sidebar-collapse icon button (24×24, empty text content) DOES carry an `aria-label` — passes.
- `/read/jhn/3`: 9 buttons, 0 failures.
- `/search`: 4 buttons, 0 failures.
- `/auth/sign-in`: 5 buttons, 0 failures.
**No AX-007 violations found on any of the 4 pages.**

## AX-008 — form controls have a label
- `/home`, `/read/jhn/3`: 0 input/textarea elements. N/A.
- `/search`: 1 input (`type=search`, `aria-label="Search the library"`, also has placeholder) — pass.
- `/auth/sign-in`: 2 inputs (`#email`, `#password`) — both have `label[for=...]` matches (verified via
  `document.querySelector('label[for=...]')` — not relying on placeholder). Pass.
**No AX-008 violations found — every field has a real label, not just a placeholder.**

## AX-009 — heading structure (DOM order)
- `/home`: H1 "Morning" → H2 "Daily Light · Morning" → H2 "Micah 2:13" → H2 "How the church has
  read Micah 2:13". One H1, no skipped levels. Clean.
- `/read/jhn/3`: H1 "John 3" only. Clean (single heading, trivially no skip).
- `/search`: H1 "Search" only. Clean.
- `/auth/sign-in`: H1 "Ancient Paths" → H2 "Sign in". One H1, no skip. Clean.
**No heading-order violations on any of the 4 pages.**

## AX-010 — landmarks (main/nav uniqueness)
- `/home`: 1 `<main>` (pass), 2 `<nav>` — one unlabeled (`class="flex-1 overflow-y-auto..."`, the
  sidebar library nav), one `aria-label="Primary"` (bottom mobile nav bar). **Two `<nav>` landmarks
  and only one is named — a screen-reader user gets two unlabeled/ambiguous "navigation" regions in
  the landmark list.** FINDING (P3): sidebar `<nav>` has no `aria-label` to distinguish it from
  "Primary".
- `/read/jhn/3`: same pattern — 1 main, 2 nav (1 unlabeled).
- `/search`: same pattern — 1 main, 2 nav (1 unlabeled).
- `/auth/sign-in`: **2 `<main>` elements** — nested/duplicate, both containing the same page content
  (`overflow-y-auto bg-stone-50...` outer shell main, and `min-h-dvh flex flex-col items-center...`
  inner sign-in-card main). **FINDING (P2): duplicate `<main>` landmark on `/auth/sign-in`** — violates
  "exactly one main per page." Same nav pattern (2 nav, 1 unlabeled) also present.
**Violations: duplicate `<main>` on `/auth/sign-in`; unlabeled secondary `<nav>` on all 4 pages.**

## AX-011 — lang attribute
- `/home`: `documentElement.lang = "en"`. Pass.
- `/read/jhn/3`: `"en"`. Pass.
- `/search`: `"en"`. Pass.
- `/auth/sign-in`: `"en"`. Pass.
**All 4 pages set `lang="en"`.** (Out of scope for this slice: did not check whether original-language
Hebrew/Greek text spans anywhere in the app carry their own `lang` attribute — not encountered on
these 4 routes.)

## AX-016 — focus indicators (Tab through first 10 focusables)
`/home`: tabbed through 10 elements — "Read more" button, "Read Micah 2:13 in full" link, "Skip to
content" link (appeared 3rd, not 1st — order oddity, not itself an AX-016 failure), "Ancient Paths"
logo link, sidebar-collapse icon button, "Home"/"Bible"/"Ask"/"Desk" nav links. **All 10 showed
`outline-style: solid`, `outline-width: 2px` when focused** — visible focus ring on every one, no
`outline: none` anywhere in this sample.

`/auth/sign-in`: tabbed through 5 elements — "Ancient Paths" heading link, `#email` input,
`#password` input, "Sign in" button, "Sign in with Google" button. **All 5 showed the same
`outline-style: solid` / `2px` focus ring.**
**No AX-016 violations found in this sample (15 elements across 2 pages, 0 missing focus rings).**

## AX-019 — touch targets ≥44×44 (first 15 buttons/links on `/home`)
14 of 15 measured below 44px in height (all sidebar nav rows are 35px tall; header logo link 27px;
"Skip to content" 36px):
| # | Element | w×h | 
|---|---|---|
| 1 | "Skip to content" link | 123×36 |
| 2 | "Ancient Paths" logo link | 97×27 |
| 3 | sidebar-collapse icon button | 24×24 |
| 4 | "Home" nav link | 217×35 |
| 5 | "Bible" nav link | 217×35 |
| 6 | "Ask" nav link | 217×35 |
| 7 | "Desk" nav link | 217×35 |
| 8 | "Reading plans" nav link | 217×35 |
| 9 | "Sign in" nav link | 217×35 |
| 10 | "My prayers" nav link | 233×35 |
| 11 | "All items" nav link | 233×35 |
| 12 | "Commentaries" nav link | 233×35 |
| 13 | "Sermons" nav link | 233×35 |
| 14 | "Hymns & Poetry" nav link | 233×35 |
| 15 | "Historians" nav link | 233×35 |
**FINDING (confirms AX-019's "known 16-target failure — re-count"): 15/15 of the first 15
buttons/links on `/home` are under 44×44 in height** (widths are fine; every row is 35px or less
tall, the icon button is 24×24). This matches the spec's own note that this is a known failure —
re-counted here at 15/15 in this specific sample (desktop viewport, sidebar nav list).

## AX-017 — prefers-reduced-motion
- All 4 pages: `document.styleSheets` scan found **at least one `@media (prefers-reduced-motion...)`
  rule present** (`hasReducedMotionRule: true` on every page checked).
- `animate-*` class usage: 0 elements matched `[class*="animate-"]` on `/home` or `/read/jhn/3` in
  the current DOM snapshot (no animation classes actively applied on initial paint of these routes).
**No AX-017 gap found in this sample** — a reduced-motion media query exists in the shipped CSS on
every page tested. This does not prove every individual animation is gated (only that at least one
qualifying rule exists in the stylesheet) — a full CSS audit of every `animate-*` definition was out
of scope for a DOM spot-check.

## Summary of findings
| ID | Severity | Page(s) | Issue |
|---|---|---|---|
| AX-010a | P2 | `/auth/sign-in` | Duplicate `<main>` landmark (2 instead of 1) |
| AX-010b | P3 | all 4 | Secondary `<nav>` (sidebar library list) has no `aria-label`; only the mobile bottom nav is labeled "Primary" |
| AX-006 | P3 | `/auth/sign-in` | Decorative background image has `alt=""` but no `aria-hidden="true"` companion |
| AX-019 | P2 (pre-known) | `/home` | 15/15 of first 15 buttons/links under 44×44 height — re-confirms the spec's known 16-target failure |

No violations found for AX-007 (icon buttons), AX-008 (form labels), AX-009 (heading order),
AX-011 (lang attribute), or AX-016 (focus indicators) in this sample.
