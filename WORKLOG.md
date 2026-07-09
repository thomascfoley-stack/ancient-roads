# WORKLOG — Autonomous session 2026-07-08

## Status summary

Working through prioritized task list. Tree is clean on `main`.

## Task 1: Diagnose logout/account-page bug (staging only)

**Status:** Complete — pre-existing, not flip-caused. Logged as auth-completion item.

### Diagnosis: PRE-EXISTING (not caused by SEC-2 flip)

**Evidence that SEC-2 is not involved:**

1. Auth is 100% HTTP-based, zero database involvement. Neither `DATABASE_URL` nor `APP_DATABASE_URL`
   participates in session validation.
2. `app_runtime` has full DML on ALL tables — no grant could be missing.

**Root cause — middleware vs. API route session validation divergence:**

The `@neondatabase/auth` library validates sessions via two different code paths that behave differently:

- **API routes** (`requireUser()` → `getAuth().getSession()`, `server/index.mjs:892`): Reads
  cookies via Next.js `cookies()` API. Checks the local `session_data` JWT cookie first (signed,
  validated locally with `cookieSecret` — zero HTTP calls). If valid AND `session_token` cookie
  exists → returns cached session immediately. **This is why annotations work.**

- **Middleware** (`getAuth().middleware()`, `server/index.mjs:1500`): Reads cookies from
  `request.headers.get("cookie")` in Edge Runtime. Also tries the JWT cache via `trySessionCache`,
  but if the `session_data` cookie is expired (5-minute TTL default) or absent, it falls back to
  `fetchSessionWithCookie(sessionTokenCookie, baseUrl)` — an HTTP call from Edge Runtime to
  `NEON_AUTH_BASE_URL`. If this HTTP call fails (network, timeout, auth service error), `sessionData`
  stays `{ session: null, user: null }` → `checkSessionRequired` returns `allowed: false` →
  redirect to `/auth/sign-in`.

The symptom — annotations work but `/account` redirects — is explained by the JWT cache being warm
for API routes (5-minute TTL, frequently refreshed by annotation calls) but cold or failing for the
middleware's HTTP fallback. Vercel Deployment Protection adds another layer that can interfere with
Edge→auth-service networking.

**Logout is unreachable as a consequence:** `SignOut` only renders inside `<AccountView>` (from
`@neondatabase/auth/react`). The account page can't load → no signout button → no logout path.
The `NeonAuthUIProvider` wrapper IS already in `layout.tsx` — that's not the fix.

### Proposed fixes (ranked)

**Fix A — Short-term (unblocks logout now):** Move `/account` out of middleware protection. Remove
`/account/:path*` from the middleware matcher. Add `requireUser()` guard in the account page's
server component (same path that works for annotations). The account page loads, `<AccountView>`
renders, logout becomes reachable.

**Fix B — Medium-term (debug the middleware):** Add structured logging to the middleware to capture:
does the session cookie arrive? Does `trySessionCache` find the JWT? Does the HTTP call to the auth
service succeed? This identifies the exact failure point but doesn't fix logout.

**Fix C — Long-term (SEC-1):** Migrate to Better Auth direct, removing the `@neondatabase/auth`
beta library entirely. This eliminates the middleware/API divergence, the CVEs, and the dependency
on the Neon Auth HTTP service.

**Recommendation:** Fix A first (10-minute change, unblocks logout), then Fix C on the SEC-1 timeline.

### Fix A applied

- `web/src/middleware.ts`: matcher changed from `['/account/:path*']` to `[]` (middleware no longer
  runs for any route; kept for future use)
- `web/src/app/account/[path]/page.tsx`: added `requireUser()` + `redirect('/auth/sign-in')` guard
  before rendering `<AccountView>`. Uses the same JWT-cache path as annotations.
- **Check 1 (logged-out redirect):** `requireUser()` throws → catch calls `redirect('/auth/sign-in')`.
  Same destination as the old middleware, enforced server-side.
- **Check 2 (subtree coverage):** The entire `/account` subtree is one dynamic `[path]/page.tsx` with
  `dynamicParams = false`. No other files under `/account/`. All 5 paths (settings, security, teams,
  api-keys, organizations) pass through the single `requireUser()` guard.
- **Logout needs Thomas's visual confirmation after deploy:** if `<AccountView>` now loads, the
  `<SignOut>` button rendered by the Neon Auth UI should be reachable.

## Task 2: V1 verifier reject-path tests

**Status:** Complete — v1.ts at 100% statement coverage, ROADMAP row upgraded to Done.

### Changes

- `test/verifier.test.ts`: Added 8 new tests (20 → 28 total):
  - `attribution_tradition`: wrong tradition in voice block
  - `anchor_valid`: structurally invalid anchor verse IDs on voice block
  - `anchor_order`: reversed anchor range on voice block
  - `reading_resolves`: reading block with unresolvable source_id
  - `reading_attribution`: reading block with mismatched author
  - `passage_exists`: verse not found in translation
  - I5 screen true-positive: doctrinal verdict in voice summary
  - Valid reading block acceptance (green-path)
- `test/fixtures.ts`: Added `missingVerses` to corpus fixture for `passage_exists` test
- Coverage: `v1.ts` 77.6% → **100%** statements; `screens.ts`, `normalize.ts`, `memory-corpus.ts` all 100%
- `/audit` passes green (28 verifier tests, 77 total, 0 errors)

## Task 3: Retrieval vertical slice (spine only)

**Status:** Already complete — all components exist and contract test passes (6/6).

### Verification

The retrieval spine was already built in a prior session:
- `types.ts`: Full boundary vocabulary (CorpusDoc, Embedder, EmbeddingStore, RetrievalResult)
- `embedder.ts`: `createDeepInfraEmbedder` (open-weight, no OpenAI/Anthropic)
- `store.ts`: `createNeonStore` (pgvector-backed)
- `retrieve.ts`: Public entrypoint, 100% coverage
- `ingest.ts`: Batch ingestion pipeline, 100% coverage
- `sources/commentary.ts`: Commentary corpus adapter
- `test/retrieval.fakes.ts`: `fakeEmbedder` (bag-of-words hashing) + `inMemoryStore` (brute-force cosine)
- `test/retrieval.contract.test.ts`: 6 tests pass (ranking, limit, hydration, idempotency, chunks, empty query)
- Integration test exists but gated behind `RUN_INTEGRATION` (correct — no paid API calls)

## Task 4: Extend /audit to web/

**Status:** Complete — web/ typecheck + lint added to audit, both pass green.

### Changes

- `scripts/audit.sh`: Added two new gates:
  - `typecheck — web/ tsc --noEmit` (strict mode, all web/ TypeScript)
  - `lint — web/ next lint --quiet` (Next.js ESLint integration)
- Both pass cleanly — no type errors, no lint errors in web/
- Note: `next lint` is deprecated in Next.js 16 (current is 15.5.20). When upgrading to
  Next.js 16, migrate to eslint CLI (`npx @next/codemod@canary next-lint-to-eslint-cli .`)

## Task 5: Fix drifted web ref-parse.ts

**Status:** Complete — files now byte-identical, audit green.

### Changes

- `web/src/bible/ref-parse.ts`: Removed unused `BOOK_BY_SLUG` import (the only difference from `src/bible/ref-parse.ts`)
- Verified with `diff`: files are now byte-identical
- Audit passes green (77 tests, 0 errors)

## Task 6: Note panel close on save

**Status:** Complete — panel closes after save. Needs Thomas's visual confirmation.

### Changes

- `web/src/app/read/[book]/[chapter]/page.tsx:251`: `onSaveNote` callback now calls `setStudy(null)` after `saveVerseNote`, closing the study panel on successful (optimistic) save
- Save is optimistic (local state updates immediately, fetch is fire-and-forget), so the panel closes instantly — no spinner needed
- Commentary panel sidebar's AnnotationBar is left unchanged: it collapses the note editor but keeps the sidebar open, which is the correct UX for a persistent sidebar vs. a popup panel
- Web typecheck passes

## Design proposals (no implementation)

### Red highlighter "moving" — investigation

**Status:** Analysis complete, awaiting Thomas's reproduction in browser.

There is NO red color in `HIGHLIGHT_COLORS` — the palette is yellow, green, sky, pink, amber. "Red" likely means the **pink dot** (`bg-pink-400`, which renders as a saturated rose/coral).

The "moving" behavior is almost certainly the **hover quick-menu** (`verse-display.tsx:87–140`):
- It's `position: fixed` with coordinates from `el.getClientRects()[0]`
- It follows the mouse across verses — each `onMouseEnter` repositions the menu to that verse's first line
- For multi-line verses, the menu snaps to the first line even when the mouse entered from a lower line, which could look like the menu "jumps"
- During scroll while the menu is visible, the menu stays viewport-fixed while text scrolls underneath (140ms dismiss timer may not fire fast enough)

**Three likely causes** (Thomas should confirm which):
1. **Normal hover-follow behavior** — the menu is designed to move verse-to-verse. If this feels wrong, the fix is debouncing or anchoring to click instead of hover.
2. **Multi-line snap** — verse spans can wrap; `getClientRects()[0]` always returns the first line rect, so the menu appears above where the mouse is.
3. **Scroll-during-hover** — `position: fixed` + stale coordinates = menu floats away from its verse during scroll.

**Don't-guess-fix**: Thomas should reproduce and confirm which element is "red" (pink dot? pink highlight bg? something else?) and what "moving" means (hover-follow? scroll-float? something else?) before any code change.

### Text/highlight color separation — schema + UX proposal

**Status:** Proposal ready for Thomas's approval. DO NOT implement until approved.

#### Current state
- `highlights` table: `id, user_id, verse_id, verse_end, color, deleted_at, created_at, updated_at`
- `color` stores a string key (`'yellow'`, `'green'`, `'sky'`, `'pink'`, `'amber'`) mapping to a Tailwind bg class
- Text color is always the default (stone-800 / stone-200 in dark mode)
- One color axis, one row of dots in the UI

#### Proposed schema (migration 003)

```sql
-- 003_highlight_text_color.sql
-- Add independent text_color axis. Rename color → highlight_color for clarity.

ALTER TABLE highlights RENAME COLUMN color TO highlight_color;
ALTER TABLE highlights ADD COLUMN text_color TEXT DEFAULT NULL;

-- Backfill: nothing to do — NULL text_color means "use default text color"
-- (backward compatible: all existing highlights keep their bg color, no text override)
```

TypeScript interface change:
```typescript
export interface Highlight {
  id: string;
  verse_id: number;
  verse_end: number | null;
  highlight_color: string;      // was: color
  text_color: string | null;    // new — null means default
}
```

#### Proposed text color palette

```typescript
export const TEXT_COLORS = [
  { id: 'default', label: 'Default', class: null },          // stone-800 / stone-200
  { id: 'red',     label: 'Red',     class: 'text-red-700 dark:text-red-400' },
  { id: 'blue',    label: 'Blue',    class: 'text-blue-700 dark:text-blue-400' },
  { id: 'green',   label: 'Green',   class: 'text-green-700 dark:text-green-400' },
  { id: 'purple',  label: 'Purple',  class: 'text-purple-700 dark:text-purple-400' },
] as const;
```

#### Proposed UX (3 surfaces to update)

**1. Hover quick-menu** (`verse-display.tsx`):
- Keep the existing row of bg-color dots (unchanged)
- Add a second row below with smaller "A" letter swatches showing the text colors
- Separator between the two rows
- Compact: fits in the existing rounded-pill menu

**2. Study panel HighlightRow** (`study-panel.tsx`):
- Current: `Highlight [● ● ● ● ●] [clear]`
- Proposed: Two labeled rows:
  ```
  Background  [● ● ● ● ●]  [clear]
  Text color  [A  A  A  A  A]  [reset]
  ```

**3. Commentary panel AnnotationBar** (`commentary-panel.tsx`):
- Same two-row layout as study panel

**4. Verse rendering** (`verse-display.tsx`):
- The `<span>` wrapping verse text gets an additional class from `TEXT_COLOR_CLASS[textColor]` when `text_color` is non-null
- Falls through to the default `text-stone-800 dark:text-stone-200` when null

#### Queries to update (6 total)
- `getChapterAnnotations`: SELECT adds `text_color`
- `setHighlight`: INSERT/UPDATE adds `text_color` param
- `removeHighlight`: unchanged (soft-deletes whole row)
- `listHighlights`: SELECT adds `text_color`
- API route `POST /api/annotations` (highlight kind): accepts `textColor` field
- API route `GET /api/annotations/all`: returns `text_color`

#### Risks / open questions for Thomas
1. **Rename `color` → `highlight_color`?** This touches every query and UI reference. Alternative: keep `color` as-is and just add `text_color`. Less churn, slightly less clear naming.
2. **Palette size**: 5 text colors enough? Should it match the bg palette 1:1?
3. **Combinatorics UX**: With 5 bg × 5 text colors = 25 combos, is a two-row layout intuitive enough or should we use a grid/matrix?
4. **Default text color by bg**: Should certain bg colors auto-set a text color for readability (e.g., dark bg → light text)? Or always independent?

## Needs Thomas

1. **Note panel close on save (Task 6)**: visually confirm the panel closes after saving a note in the reader
2. **Red highlighter "moving" (Task 7)**: reproduce in browser and confirm: (a) which element is "red" — pink dot? pink bg? something else? (b) what "moving" means — hover-following? scroll-floating? multi-line snap?
3. **Text/highlight color separation (Task 7)**: review the schema + UX proposal above and approve/redirect before implementation
4. ~~**SEC-2 closure (prod)**: re-apply APP_DATABASE_URL to prod, rotate neondb_owner password~~ **DONE** — APP_DATABASE_URL re-applied, neondb_owner password rotated, Vercel DATABASE_URL + DATABASE_URL_UNPOOLED updated, .env.local updated, deployed. Old password is invalid.
5. **Fix A visual confirmation**: visit `/account/settings` — if `<AccountView>` loads and sign-out button is visible, Fix A works
