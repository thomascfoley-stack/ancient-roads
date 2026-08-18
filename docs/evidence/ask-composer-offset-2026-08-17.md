# /ask composer offset + mask — measurement log (2026-08-17)

Branch `ship/ask-composer-offset`, on top of the live commit `2d043ba`. Dev server, Chromium,
390x844 unless stated. Every number below is a **computed-style or hit-test read**, not a
derivation from the class strings. `env(safe-area-inset-bottom)` evaluates to **0** in this
headless browser, so every safe-area term below is the inset-0 case; the arithmetic is
inset-invariant by construction (see "why no `env()` on the offset").

Filed because `WORKLOG.md` and the commit message assert these numbers, and AGENTS.md says
evidence or it did not happen. Two of the claims in the FIRST version of this work were wrong
and were caught by the pre-deploy audit, not by me — both are recorded here.

## 1. The defect, before any change

| quantity | measured |
|---|---|
| viewport | 844 |
| `main` padding-bottom (`app-shell.tsx:35`) | 60px |
| `main` content-box bottom | 784 |
| composer sticky offset (computed `bottom`) | **64px** |
| composer bottom edge | **720** = 844 − 60 − 64 |
| mobile nav height / top | 53 / **791** |
| gap composer→nav | **71px** |

A sticky inset resolves against the scroller's **content** box, which `main`'s padding has
already inset by the bar's height. The offset added it a second time.

**`fixed` is not this bug — measured, not reasoned.** A probe element rendered *inside* `main`
carrying `fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))]` — the exact classes
used at `selection-popover.tsx:272`, `work/[slug]/page.tsx:170`, `read/[book]/[chapter]/page.tsx:417`
— landed its bottom edge at **784** = viewport − 60. Those three resolve against the viewport and
correctly keep the expression.

## 2. P5's mask was already leaking (found while fixing the offset)

The strip was `68px`, hand-computed against an assumed 60px bar. The bar renders **53px**
(`min-h-[52px]` + 1px border) inside the 60px reserved for it, so the strip to cover was 71px.

Hit-test at x=195, composer stuck: `FORM` 721→786, **`leak-probe` 787, 788, 789, 790**, `NAV` 791.
Visible as a red sliver above the tab bar in the striped-probe capture.

## 3. Three more defects the pre-deploy audit found in the fix itself

The first version of this change fixed the offset and the 4px shortfall and claimed "0 leaked
pixels". That claim was **scoped to a vertical scan down the centre line**. Three defects survived
it; all three are the same trap, an absolutely-positioned child resolving against the **padding**
box:

| # | defect | measured |
|---|---|---|
| a | mask 1px short of the scrollport | `top-full` starts at **767** against a border-box bottom of **768** |
| b | 20px lateral gap | mask spanned the form only; `ResultLink` is `-mx-2.5`. Leaks at **x 6–15 and 368–377**, every row (22 hits over an 11-row band) |
| c | mask painted over the composer's own bottom hairline and the bottom of its focus ring | ring occupied y **768→770** with the strip starting at **768** — a three-sided focus indicator on the app's primary input (WCAG 2.4.11) |

(a) was first "fixed" by adding `+1px` to the **height**, which made the strip reach the viewport
bottom while still painting over the border. The real fix is on the **top** edge —
`top-[calc(100%+1px)]` — after which the height needs no compensating pixel.

## 4. After — every property re-measured

| property | measured |
|---|---|
| sticky offset | 4px (`bottom-1`) |
| composer bottom edge, stuck | **780** |
| visible gap composer→nav | **11px** (desktop's `md:bottom-3` gives 12px above the scrollport) |
| mask height | 64px, top at `calc(100%+1px)` |
| mask top vs border edge | **768 == 768** — starts exactly at the border edge, does not cover it |
| focus ring, focused | 2px solid `rgb(138,90,43)` (accent-600), offset −2px, spans **764→766** — fully above the strip, complete on four sides |
| **full 2-D leak scan** | **11 rows × 390 columns = 4,290 pixels, 0 leaks** (previously a y-scan of one column) |
| overflow neutrality | `main.scrollHeight` **879 with the strip, 879 without** — adds no phantom scroll |
| headroom before phantom scroll appears | 12px (wrapper `pb-4` 16 + `main` `pb` 60 − strip 64) |
| A014 at max scroll | `pinnedAboveStaticBy: 0`, `documentCoveredAtMaxScroll: 0` (was 48px / 24px) |
| desktop 1280x800 | `main` padding-bottom **0**, offset **12px**, mask **16px**, nav `display:none` — unchanged |
| dark (`.reader-dark`) | body and mask both `rgb(26,20,15)`; light both `rgb(251,248,242)` |

**Why no `env()` on the offset.** Composer bottom is `H − 60 − inset − 4` and nav top is
`H − 53 − inset`; both carry the inset, so the 11px gap is inset-invariant. Adding `env()` to the
offset would make the gap *grow* on a notched phone.

## 5. Definition-of-Done legs

- **Real interaction exercised.** Typed into the composer (submit button went from `disabled` to
  enabled, which is the proof the controlled input reached React state), then submitted. A turn
  rendered and the Q1 sign-in banner appeared — `"Please sign in to explore the paths. / Ask
  again"` — the correct 401 path for a signed-out caller. With the turn rendered, its bottom
  (519.5) sits above the composer's top (625.5): **not occluded**.
- **Errors during the interaction: none.** A listener for `error`, `unhandledrejection` and
  `console.error` was armed **before** the interaction and caught **0**. This is the A7-X1 lesson
  applied: a read taken afterwards cannot see what was thrown before it started listening.
- **Console at load: NOT a clean claim.** A post-load read shows only the pane's CSP `eval()`
  notice (React dev mode), `/api/auth/get-session` 500s and one 401 from the ask above — all
  environmental to a worktree with no `.env.local`. No React hydration error appeared. Per the
  A7-X1 retraction this read **cannot prove absence** of errors thrown during load, and is not
  offered as such.

## 6. The guard

`web/test/invariants/ask-composer-mask.test.ts` derives all three values from the two source files
and checks the relationship, rather than snapshotting a class string. Red-proofed — each mutation
applied, watched fail, reverted:

| mutation | result |
|---|---|
| baseline | 8 passed |
| restore the tab-bar double-count on the offset | **2 failed** |
| mask height off by 4px | **1 failed** |
| `top-[calc(100%+1px)]` → `top-full` | **1 failed** |
| lateral inset → `-1px` | **1 failed** |
| **change `app-shell.tsx`'s `pb-[calc(...)]`** | **1 failed** |
| restored | 8 passed |

The last row is the one that matters: it proves the expectation is derived from the **coupled**
file, so the pair cannot drift silently. It is a cross-file check, not the watchlist's tautology
shape (expectation derived from the artifact under test).

## 7. Not measured

- **Real devices.** This browser reports `env(safe-area-inset-bottom): 0`, so no notched-phone
  value was exercised; iOS Safari's on-screen keyboard (which ignores `interactive-widget`) is a
  DEVICE check and was not made.
- **A real answer on screen.** The ask above returned 401 (no `.env.local` here), so voice cards,
  the Show band, lane sections and long-quote wrapping under the composer are unmeasured.
- **`/ask/[id]`** (stored threads) was not loaded.
- Screen-reader behaviour was not observed.
