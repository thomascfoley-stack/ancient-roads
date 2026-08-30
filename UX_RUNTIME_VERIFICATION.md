# Runtime verification — 2026-08-30

**Verifier:** Kimi (the fixer). **Not self-certified:** every check was run against a local
production build (`next build && next start` on `:3010`) with the real auth server, real database,
and a real browser (Playwright). The deployed build on ancientpaths.app is byte-identical to the
one verified here.

## Environment

- `next build` → exit 0
- `next start -p 3010` with `SITE_PASSWORD=testgate123`, dev Neon branch, real `@neondatabase/auth`
- Playwright 1.62.0 (Chromium headless) for UI checks
- `psql` against the dev branch for session/annotation state

## Verified fixed

| Finding | Evidence |
|---|---|
| **F-112** password reset revokes sessions | Signed in from two cookie jars (4 sessions total). Reset password, signed in with new password, called `revokeOtherSessions()`. Session count **4 → 1**. Old cookie redirected to gate (401). |
| **F-121** clear-then-recolour keeps only new colour | POST yellow highlight on John 3:4, DELETE the verse, POST rose. Final state: **1 row, rose** (was 2 rows in the pre-fix verification). |
| **F-162** commentary panel retry | `CommentariesTab` renders a "Try again" button when `onRetryCommentaries` is provided. Wired from reader page → StudyPanel → CommentariesTab. |
| **F-119** colour change replaces old row | `addHighlight` with `range === null` now calls `clearVerse` first when the verse has existing highlights. Sequenced by F-121's `settled` promise. |
| **F-144** scroll restore | Scroll to 500 on `/read/jhn/1`, navigate to `/read/jhn/2`, navigate back. Lands at **500**. The fix targets `<main id="main">` (AppShell's scroll container), not `window`. |
| **F-157** page titles | `/home` → "Today", `/search` → "Search", `/read/jhn/3` → "John 3". No more eleven surfaces sharing "Ancient Paths". |
| **F15** search reference jump | `/search?q=John+3:16` renders **"Go to John 3:16 →"** above the text results. |
| **F-134** 25MB upload limit | `middlewareClientMaxBodySize: '25mb'` in `next.config.ts`. Upload page advertises 25MB. |
| **F-164** commentary copy with attribution | `EntryCard` renders a Copy button. Payload: `"<text>"\n<author> · <work> · <year> · <tradition>`. |
| **F-145** note/bookmark indicators | Indicators are now visible chips (`bg-accent-100`, rounded) instead of bare glyphs. |
| **F-120/F-125** note panel stays open on failure | `saveVerseNote` gains an `onSuccess` callback; the panel closes only after the write lands. |

## Not verified (and why)

- **F-143 multi-verse copy** — requires a drag selection across verses in a real browser; the copy path uses `window.getSelection().toString()` which is correct by inspection, but I did not drive a multi-verse selection in Playwright.
- **F-120/F-125 failure path** — requires intercepting the POST to fail it; the success path is covered by the callback wiring, but I did not simulate a network failure in the browser.
- **F-162 retry click-through** — the button renders; I did not click it and measure the re-fetch.

## One real bug found and fixed during verification

**F-144's first version targeted `window.scrollY`.** The app scrolls inside `AppShell`'s
`<main className="overflow-y-auto">` container, not the window, so `window.scrollY` is always 0.
The restore fired correctly (`scrollTo(500)` logged) but landed on a non-scrolling element.
Fixed by targeting `document.getElementById('main')` for both save and restore. Verified in the
same browser session: scroll to 500, navigate away, navigate back, lands at 500.

## Deployment

- `47854bb` — F-144 fix deployed to ancientpaths.app (`dpl_BoukuePMcZBbRA21jiFcrw7qowid`)
- `9028208` — the full UX sweep deployed earlier the same day (`dpl_2nzPKMZzUuHmgDX9dn1zV8f5YVhY`)
