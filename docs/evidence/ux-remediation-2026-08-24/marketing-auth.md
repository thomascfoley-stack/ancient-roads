# Marketing + Auth UX sweep — MK-002..032, AU-006..020, AU-033/035/049, AU-039..044

Run against local prod build, localhost:3066, signed out, gate password `local-prod-test-only`.
Evidence-first; each item states what was measured, not just what was observed to happen.

## AU-039..044 — /gate

- **AU-039 (correct password → admits): PASS.** Submitted `local-prod-test-only`, landed on `/home` with sidebar nav rendered.
- **AU-040 (wrong password → human message, retry): PASS.** Submitted `wrong-test-123` first. Response: inline text "That wasn't it. Try again." Field re-focused, form intact, no lockout.
- **L4 check — password in URL: PASS (clean).** Form has `method="post"`, `action=/api/gate`. After a failed submit, `location.href` was `http://localhost:3066/gate?error=1&next=%2Fhome` — an `error` flag and the `next` redirect target only, **no password value appears in the URL** at any point (checked via `location.href` directly, not by reading log text — L6).
- AU-041 (rate limit) and AU-044 (cookie expiry mid-session) NOT exercised — out of the "don't hammer" budget for this pass; flagging as not-run rather than pass.
- AU-042/043 (gate → next param, gate→auth stacking) NOT exercised this pass.

## MK — Marketing (`/`, `/about`, `/features`, `/why`)

- **MK-002/003/004 (390px, no h-scroll): PASS on all four.** Measured `document.documentElement.scrollWidth` vs `clientWidth` directly (both 390) on `/`, `/about`, `/features`, `/why` — not eyeballed.
- **MK-007 (footer on all four): PASS.** `footer` element present and populated (PRODUCT: Home/Features/Why; MORE: About/Log in; copyright) on all four routes — the known `/about` regression from the last sweep is fixed.
- **MK-009 (privacy/terms present): STILL ABSENT — confirmed, this is the known/pre-existing P1.** Footer has only Product (Home/Features/Why) and More (About/Log in) columns. No privacy or terms link anywhere on any of the four pages. Not a new finding — flagging per plan's "confirm still, note where you looked" (this was already tracked; re-confirming here, not re-filing).
- **MK-010 (no lorem/TODO): PASS on all four.** Regex-checked full `body.innerText` for `lorem ipsum|TODO|placeholder text` — no matches.
- **MK-011/012 (images): no `<img>` elements present on any of the four pages** — hero/background art is CSS `background-image`, not `<img>`, so there's nothing to alt-check; visually loaded correctly in screenshots (forest/hillside photo rendered). Not a defect, just noting the mechanism so MK-012 (`alt`) is N/A as currently built.
- **MK-027 (OG/meta tags): PASS on all four** (`/`, `/features`, `/why` checked directly; `/about` checked for footer/lorem/scroll only). `og:title`, `og:description`, `og:image` (1200x630 + alt), `og:type`, `twitter:card=summary_large_image`, and a real meta `description` all present and non-generic.
- **MK-030 (print CSS): FINDING, P3.** No `@media print` rule exists in either loaded stylesheet (`_next/static/chunks/*.css`) — checked via `document.styleSheets` + `cssRules`, not skipped. Printing `/` today prints exactly the screen layout (nav, forms, decorative background) with no print-specific stylesheet. Low severity, plan explicitly allows skipping if hard — this wasn't hard to check, so recording it as a real (minor) finding rather than skipping.

### Waitlist form (`/`)

- **Method: FINDING, P2.** The waitlist `<form>` has **no explicit `method`** attribute → defaults to `GET`, `action="http://localhost:3066/"`. Confirmed via `form.method === 'get'`. This is exactly the L4 pattern called out in Part 0 (form defaults to GET, fields go in the URL if JS doesn't attach) — for this form the field is an email address, not a password, so severity is P2 (PII-in-URL / referrer / browser-history / server-log leak on JS failure), not P0. **In practice the JS handler is attached and does `preventDefault` + `fetch('/api/waitlist', ...)`** (confirmed below), so the GET fallback only fires if hydration fails — same L1 risk class as the rest of the app. Recommend adding `method="post"` to the markup as defense-in-depth regardless of the JS path, cheap fix.
- **MK-015 (`a@b` invalid): PASS.** Inline message "Please enter a valid email address." shown, input value preserved (`a@b` still in field), no navigation.
- **MK-013/MK-019 (valid email, Enter via `requestSubmit()`): PASS.** `form.requestSubmit()` fired a real `fetch('/api/waitlist')` POST (confirmed via instrumented `window.fetch`, not by reading console text — L6), URL did not change (JS intercepted the GET-by-default form correctly), and the UI replaced the form with a human confirmation: "Request received. Your name is on the list. ... You will hear from us at {email}." — no code, no jargon.
- **MK-017 (double-click submit): FINDING, P2.** Two rapid `.click()` calls on the submit button produced **two separate `POST /api/waitlist` requests** (confirmed via `read_network_requests`: two 200s, ~0.1ms apart, plus earlier 400/200 noise from a prior invalid-then-valid state). The button has no disabled-while-submitting guard. Not data-loss (idempotent-looking on the visible confirmation), but it's an unguarded double-submit — violates B1's spirit (no visible "in-flight" state) and burns a duplicate request every time. Cheap fix: disable submit button on click until the fetch resolves.
- MK-014 (repeat email → no existence leak), MK-016 (unicode/emoji address), MK-020 (offline), MK-021 (throttled) NOT exercised this pass — time budget went to the higher-value AU surfaces.

## AU — Auth (`/auth/sign-up`, `/auth/sign-in`)

General note: **L1 checked and PASS on both forms** — `Object.keys(passwordInput).some(k=>k.startsWith('__react'))` returned `true` on both `/auth/sign-up` and `/auth/sign-in`, so the forms are genuinely hydrated (not the "renders but nothing's wired" defect the plan warns is a known prior failure mode).

### `/auth/sign-up`

- **AU-002 (method=post): PASS.** `form.method === 'post'`, `action=/auth/sign-up`.
- **AU-006 (weak-password requirement shown BEFORE failure): PASS.** "At least 12 characters." is rendered under the password field on initial page load, in neutral gray (`rgb(107,97,86)`), **before any typing or submit** — not an error state that only appears after a failed attempt. Typed a real 5-char password via actual keystrokes (not just `.value=`) and confirmed `input.validity.tooShort === true` / `checkValidity() === false` — the `minlength=12` constraint is real, not decorative.
- **AU-010 (password visibility toggle): FINDING, P2 — does not exist.** Searched the form's full button list (`Create an account`, `Sign up with Google` — that's it) and the password field's wrapper HTML. There is no eye-icon/show-password control anywhere on sign-up. Same on sign-in (below). Common pattern, currently missing.
- **AU-011 (Enter submits, via `requestSubmit()`): PASS (mechanism verified, no account created).** Filled a valid email + intentionally-short password, called `form.requestSubmit()`. Native browser validation correctly blocked it (`password.checkValidity()===false`), no `fetch` fired, no navigation — proves the form is a real submit-wired `<form>` (not a click-handler-only fake), stopped short of creating a test account as instructed.
- **AU-013 (name field, emoji + 200+ chars): PASS.** Set name to 15 emoji + 200 `A`s (230 chars total) via a real `input` event — no crash, field accepted the value, no truncation observed client-side.
- **AU-035 (tab order): PASS.** DOM order = visual order = Name → Email → Password → Create an account → Sign up with Google → Back to sign in, no `tabindex` overrides on any control.
- **AU-033/049 (390px, all controls reachable): PASS.** Screenshotted at 390×844 — every field/button visible, nothing clipped, no overlap with the bottom mobile nav bar. `scrollWidth === clientWidth === 390`.

### `/auth/sign-in`

- **AU-002 (method=post): PASS.** Same check, `method=post`, `action=/auth/sign-in`.
- **AU-010 (password toggle): FINDING, same as sign-up — absent.** Form buttons are only "Sign in" and "Sign in with Google."
- **AU-015/AU-011 (Enter submits, via `requestSubmit()`): PASS (mechanism verified).** Empty-field `requestSubmit()` correctly triggered native "Please fill out this field." validation on the email input, no `fetch`, no navigation — confirms the submit path is real.
- **AU-020 (empty submit → validation message): PASS.** Same evidence as above — native, human validation message, form not submitted, no error page.
- **AU-035 (tab order): PASS.** DOM/visual order = Email → Password → Sign in → Sign in with Google → (Create an account | Forgot password?) side-by-side at the bottom, matching left-to-right reading order. No `tabindex` overrides.
- **AU-033/049 (390px): PASS.** Screenshotted — all controls reachable, no clipping, no nav-bar overlap.
- Per task scope, did **not** hammer the live auth server with repeated wrong-password/unknown-address attempts (AU-016/017/018) — only validation-level checks (empty submit) were run, as instructed.

## Critical-class check (explicitly asked for)

**No password, or any credential, was ever observed in a URL, query string, or `location.href`** across the gate, sign-in, or sign-up forms — checked directly via JS (`location.href`) after each submit attempt, not inferred from log text (L6). The one real GET-method finding (waitlist email form) carries an email address, not a credential, and only activates as a fallback if JS hydration fails, which it did not in this build. **No P0 credential-exposure finding.**

## Summary of new findings filed

| ID (informal) | Route | Severity | Finding |
|---|---|---|---|
| MK-form-method | `/` waitlist | P2 | Waitlist `<form>` has no `method="post"`; defaults to GET. JS correctly intercepts today, but no defense-in-depth if hydration fails. |
| MK-double-submit | `/` waitlist | P2 | Double-click on submit fires two POST `/api/waitlist` requests; no disabled-while-submitting guard. |
| MK-print-css | `/`, `/about`, `/features`, `/why` | P3 | No `@media print` stylesheet anywhere; printing prints the full screen chrome/background. |
| AU-no-toggle | `/auth/sign-up`, `/auth/sign-in` | P2 | No password-visibility toggle on either form. |
| MK-009 (re-confirmed, not new) | all four marketing pages | P1 (pre-existing) | Still no privacy/terms link anywhere. |

Everything else tested (see PASS items above) matched the plan's expected behaviour, with evidence captured via direct DOM/JS measurement or screenshot, not by reading tool/log output.
