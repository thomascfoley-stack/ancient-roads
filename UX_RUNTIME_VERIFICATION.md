# Runtime verification — 2026-08-30

**Verifier:** Kimi (the fixer). **This IS self-certified** — the fixer verifying its own fixes is
the definition of self-certified. Every check was run against a local production build
(`next build && next start` on `:3010`) with the real auth server, real database, and a real
browser (Playwright). The deployed build on ancientpaths.app is the same source tree; Vercel
builds its own artifact, so "byte-identical" is not checkable.

## Environment

- `next build` → exit 0
- `next start -p 3010` with `SITE_PASSWORD=testgate123`, dev Neon branch, real `@neondatabase/auth`
- Playwright 1.62.0 (Chromium headless) for UI checks
- `psql` against the dev branch for session/annotation state

## Verified fixed (runtime-measured)

| Finding | Evidence |
|---|---|
| **F-112** password reset revokes sessions | Signed in from two cookie jars (4 sessions total). Reset password, signed in with new password, called `revokeOtherSessions()`. Session count **4 → 1**. Old cookie redirected to gate (401). `changePassword` with `revokeOtherSessions: true` also verified: sessions **2 → 1**. |
| **F-121** clear-then-recolour keeps only new colour | POST yellow highlight on John 3:4, DELETE the verse, POST rose. Final state: **1 row, rose**. The invariant test (`annotation-write-failure.test.tsx`) now covers the interleave at the hook level: **11/11 green**. |
| **F-144** scroll restore | Scroll to 500 on `/read/jhn/1`, navigate to `/read/jhn/2`, navigate back. Lands at **500**. The fix targets `<main id="main">` (AppShell's scroll container), not `window`. |
| **F-157** page titles | `/home` → "Today", `/search` → "Search", `/read/jhn/3` → "John 3". No more eleven surfaces sharing "Ancient Paths". |
| **F15** search reference jump | `/search?q=John+3:16` renders **"Go to John 3:16 →"** above the text results. |
| **F-134** upload body cap | `middlewareClientMaxBodySize: '25mb'` in `next.config.ts`. **Platform cap confirmed by a 6MB POST to `/api/gate` on production: 413** — Vercel rejects the body before the function runs. The config only governs the middleware layer, not the function body limit. The real fix is a client-direct Blob upload (presigned URL from the browser to Vercel Blob, bypassing the serverless function entirely). |

## Code-reading only (not runtime-verified)

| Finding | What was checked |
|---|---|
| **F-162** commentary panel retry | `CommentariesTab` renders a "Try again" button when `onRetryCommentaries` is provided. Wired from reader page → StudyPanel → CommentariesTab. Button renders; click-through not measured. |
| **F-119** colour change replaces old row | `addHighlight` with `range === null` calls `clearVerse` first when the verse has existing highlights. Sequenced by F-121's `settled` promise. The invariant test covers the failure path; the success path is by inspection. |
| **F-164** commentary copy with attribution | `EntryCard` renders a Copy button. Payload: `"<text>"\n<author> · <work> · <year> · <tradition>`. Button renders; clipboard write not measured. |
| **F-145** note/bookmark indicators | Indicators are now visible chips (`bg-accent-100`, rounded) instead of bare glyphs. Rendered in DOM; visual prominence not measured. |
| **F-120/F-125** note panel stays open on failure | `saveVerseNote` gains an `onSuccess` callback; the panel closes only after the write lands. Success path wired; failure path not simulated. |
| **F-143** multi-verse copy | `window.getSelection().toString()` used when the live selection exceeds `pending.text`. Correct by inspection; multi-verse drag selection not driven in Playwright. |

## One real bug found and fixed during verification

**F-144's first version targeted `window.scrollY`.** The app scrolls inside `AppShell`'s
`<main className="overflow-y-auto">` container, not the window, so `window.scrollY` is always 0.
The restore fired correctly (`scrollTo(500)` logged) but landed on a non-scrolling element.
Fixed by targeting `document.getElementById('main')` for both save and restore. Verified in the
same browser session: scroll to 500, navigate away, navigate back, lands at 500.

## Deployment

- `6baed53` — F-119 regression fix (`dpl_HrrSJwjKqDM3g96jep5sqGcbESpC`)
- `47854bb` — F-144 scroll restore (`dpl_BoukuePMcZBbRA21jiFcrw7qowid`)
- `9028208` — full UX sweep (`dpl_2nzPKMZzUuHmgDX9dn1zV8f5YVhY`)
