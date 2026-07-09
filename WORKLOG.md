# WORKLOG — Autonomous session 2026-07-08

## 2026-07-09 — Teacher landed + wired to web (`feat/teacher-pipeline` → `main`)

**Merged to `main`, audit green (95 tests, typecheck + lint + knip + deps all pass).**

- **Teacher pipeline (done-on-John):** `src/teacher/*` — retrieval → compose
  (Qwen3.5-35B-A3B via DeepInfra, `enable_thinking:false`) → V1 verifier →
  retry-with-feedback (×2) → fallback to raw retrieval. 6 orchestration tests.
  Verified live: "the Word became flesh" / "born again" / "living water" compose
  grounded voices across ≥2 traditions; the bait "Is Jesus really God? just tell me"
  holds shape (voices + passages, no verdict). A weaker model's fabricated Augustine
  quote was caught by `quote_verbatim` and rejected — the verifier earns its keep.
- **Extractive composer:** `voice.summary` made optional (contract widening, backward
  compatible); prompt tells the model to quote generously and omit the gloss. Interim
  drift mitigation until the V2 summary-faithfulness classifier exists.
- **Vector retrieval live:** commentary embedded with BGE (`bge-large-en-v1.5`, 1024-dim)
  into Neon pgvector; queried by `/ask` via app_runtime + RLS (`user_id IS NULL`).
- **Web feature `/ask` ("Ask the voices"):** `web/src/lib/teacher/*` (native to web —
  Next can't bundle root `src/`), authed-only `api/ask`, quote-forward UI, sidebar entry.
  Contract + V1 verifier copied into `web/src` and locked byte-identical to `src/` via a
  new sync-guard test (`test/web-core-sync.test.ts`), matching the bible-sync convention.
- **Ingest resilience:** a batch that fails all retries is skipped (idempotent upserts
  fill it on re-run) instead of crashing the multi-hour job; embedder now 5 retries / 60s.
  (The first Gospels run had died on a DeepInfra timeout at 6,943 chunks.)
- **/audit + /security before merge — clean.** Fixed dead code + the `verseExists` stub
  (web path now checks real WEB versification, so `passage_exists` binds). Security review
  of the teacher surface confirmed: DeepInfra key is header-only + `server-only` + never
  logged; no path where unverified LLM text reaches the user (composed is V1-gated,
  fallback renders corpus only, violations sent-but-not-rendered).
- **Cost note:** full-corpus embedding ≈ **$0.6–1.0 one-time** (627k chunks); the real
  recurring cost is **Neon Large ~$110/mo** to hold the index in RAM — so full-corpus +
  HNSW tuning (the HNSW index already exists at default params) + hybrid/rerank are
  parked until dogfooding justifies them.

**Audit follow-ups (post-merge):**
- Fixed embedder retry (no backoff after the final attempt; `e instanceof TypeError`
  for network errors) + corrected the HNSW docs.
- **Prompt is now sync-guarded.** `src/teacher/prompt.ts` ↔ `web/src/lib/teacher/prompt.ts`
  are byte-identical and enforced by `test/web-core-sync.test.ts` (prompt.ts refactored to
  a local structural `PromptSource` type so neither copy imports a package-specific one —
  that's what lets them stay identical). The composer's behavioural spec can no longer drift
  between CLI and web.
- **Two items promoted to the pre-signup gate** (see ROADMAP "Pre-signup gate"), alongside
  V2 summary-faithfulness: (1) rate-limit `/api/ask`; (2) guarantee `createPgStore`'s
  `rejectUnauthorized:false` never reaches a runtime path.

**Deferred cosmetic nit:** `/ask` passage-range label (`ask-client.tsx`) is approximate for
cross-chapter ranges (repeats the chapter on the end ref). Fix when labels matter.

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
-- 004_highlight_text_color.sql
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

## Standalone logout (replaces Fix A)

**Status:** Complete — needs Thomas's visual confirmation after deploy.

Fix A (server-component `requireUser()` guard on account page) failed through three iterations —
the `@neondatabase/auth` beta library's session handling is too unreliable in the Edge/serverless
environment. Thomas directed: stop patching account page, wire standalone logout, mark account UI
broken-until-Fix-C.

### Changes

- `web/src/app/api/auth/sign-out/route.ts`: POST handler that clears all `__Secure-neon-auth.*`
  cookies (session token, JWT cache, challenge) by setting `maxAge: 0`. Returns JSON `{ ok: true }`.
  Takes precedence over the catch-all `[...path]` route. No dependency on `<AccountView>` or the
  Neon Auth library.
- `web/src/components/sidebar.tsx`: Uses `authClient.useSession()` to detect auth state.
  Shows "Sign out" button (with log-out icon) when session is active, "Sign in" link when not.
  Sign-out POSTs to `/api/auth/sign-out` then hard-navigates to `/`.
- Account management UI (teams/api-keys/orgs/security) is marked broken-until-Fix-C (SEC-1 Better
  Auth migration). No further fixes will be deployed for `<AccountView>`.
- `web/src/middleware.ts`: matcher stays empty (unchanged from prior commit).

### What to verify after deploy

1. Sign in works (via sidebar "Sign in" → `/auth/sign-in`)
2. After sign-in, sidebar shows "Sign out" button instead of "Sign in"
3. Clicking "Sign out" clears session and returns to home
4. Reader + annotations still work while signed in

## Full-text commentary search

**Status:** Implemented — code complete, audit green. Needs migration + ingestion run against Neon.

**Thomas's decisions (approved):**
- Q1 (cost): Proceed. May bump Neon to Launch plan (~$0.16/mo storage).
- Q2 (tsvector scope): Body text only. Author/tradition stay as WHERE filter columns, not in tsvector.
- Q3 (panel search): Deferred.
- Q4 (snippet): 50-word snippets, fine.
- Pagination: capped at max 100 results per request, default 20.
- Idempotency: UNIQUE constraint on natural key `(book, chapter, verse_start, verse_end, author, source_title)`, ingestion uses `ON CONFLICT DO NOTHING`.
- Migration numbering: commentary FTS = 003, text/highlight color separation = 004.

### Problem

371k commentary entries from 401 sources exist as static JSON on the CDN. Users can browse by
book+chapter+author but cannot search the text. "What did Chrysostom say about baptism?" requires
manually opening every chapter of every book and scrolling. The omnibox only resolves verse
references — no free-text search exists anywhere in the product.

### Why not use the existing `embeddings` table?

The `embeddings` table has tsvector/GIN and `hybrid_search()` already, but it's wrong for this:

1. **RLS blocks it.** `embeddings` has RLS enabled with `user_id = current_setting(...)`. Commentary
   rows have `user_id IS NULL` — invisible to `app_runtime`. Fixing this requires either a policy
   change, SECURITY DEFINER, or a separate read path. All are worse than a clean table.
2. **Data is chunked, not structured.** The embedding pipeline splits entries at 1200 chars for
   vector quality. Search results would be fragments, not complete commentary entries with metadata.
3. **Not all commentary is embedded.** Embedding requires DeepInfra API calls per book. The ingestion
   status is unknown and completing it has a cost.
4. **Vector search is unnecessary.** Keyword search ("chrysostom baptism") is BM25's strength.
   Semantic search adds latency and cost (query embedding API call) with no benefit for structured
   text lookup.

### Approach: new `commentary_entries` table with tsvector/GIN

Same pattern as `embeddings.tsv` + `idx_embeddings_fts`. Public data, no RLS, no vector column.
Ingested from the same static JSON files the CDN serves.

### Schema (migration 003)

See `db/migrations/003_commentary_fts.sql`. Key points:
- tsvector on `body` only (author/tradition are WHERE filters, not in the tsvector)
- GIN index for `@@` queries
- B-tree index on `(book, chapter, verse_start)` for passage browsing
- UNIQUE index on `(book, chapter, verse_start, verse_end, author, source_title)` for idempotent ingestion

### Ingestion script

`src/ingest/ingest-commentary-fts.ts` — reads all 1,212 chapter JSON files from
`web/public/commentaries/`, batch-inserts into `commentary_entries`.

```
DATABASE_URL=<owner-url> pnpm ingest:commentary-fts
```

- Reads the same JSON files the CDN serves — single source of truth
- Batch INSERT (200 rows per transaction) via neon tagged template literals
- Idempotent: `ON CONFLICT (natural key) DO NOTHING` — safe to re-run
- Expected: ~371k rows, ~300 MB text + ~150 MB indexes ≈ 450 MB in Postgres

### Search query function

`web/src/lib/commentary-search.ts` — no `runAsUser` needed (public data, no RLS):

```typescript
export interface CommentarySearchResult {
  id: number;
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
  year: number | null;
  tradition: string | null;
  source_title: string;
  snippet: string;          // ts_headline highlighted excerpt
  rank: number;
}

export async function searchCommentaries(opts: {
  query: string;
  book?: number;
  tradition?: string;
  author?: string;
  limit?: number;
  offset?: number;
}): Promise<{ results: CommentarySearchResult[]; total: number }>
```

SQL core (using `ts_rank_cd` + `websearch_to_tsquery`, same as `hybrid_search()`):

```sql
SELECT
  id, book, chapter, verse_start, verse_end,
  author, year, tradition, source_title,
  ts_headline('english', body, query,
    'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS snippet,
  ts_rank_cd(tsv, query) AS rank
FROM commentary_entries, websearch_to_tsquery('english', $1) AS query
WHERE tsv @@ query
  AND ($2::smallint IS NULL OR book = $2)
  AND ($3::text IS NULL OR tradition = $3)
  AND ($4::text IS NULL OR author = $4)
ORDER BY rank DESC
LIMIT $5 OFFSET $6
```

`websearch_to_tsquery` handles natural language well: `chrysostom baptism` → AND semantics,
`"iron sharpens"` → phrase match, `baptism OR immersion` → OR. No query sanitization needed.

### API route

`GET /api/search/commentaries?q=<query>&book=<num>&tradition=<str>&author=<str>&limit=<n>&offset=<n>`

- Returns `{ results: CommentarySearchResult[], total: number }`
- No auth required (public data)
- Rate-limited by Vercel's edge (no custom rate limit needed at this scale)
- `q` is required, all other params are optional filters
- Default limit: 20, max: 100

### UI: commentary library page

Add a search input to the existing `library/commentaries/page.tsx`. Two modes:

**Browse mode** (current behavior, default): book/chapter/author dropdowns, passage-by-passage view.

**Search mode** (activated when user types in the search input): replaces the passage view with
ranked search results. Each result shows:

```
┌─────────────────────────────────────────────────────────────┐
│  John Chrysostom · 407 · Patristic                         │
│  Homilies on Matthew                                       │
│  John 3:5                                                  │
│                                                            │
│  "...the water of <mark>baptism</mark> is the entrance     │
│  to the kingdom, for unless one is born of water..."       │
│                                                            │
│  Open in reader →                                          │
└─────────────────────────────────────────────────────────────┘
```

- Clicking "Open in reader" navigates to `/read/{bookSlug}/{chapter}` with the verse in view
- Tradition/era badges use the same styling as the existing commentary panel
- Facet chips above results: All / Patristic / Reformed / Methodist / Presbyterian / etc.
  (derived from the result set's tradition values, not hardcoded)
- Pagination at bottom (20 results per page)
- Debounced search input (300ms) to avoid hammering the API on every keystroke

### Files to create/modify

| File | Action | What |
|---|---|---|
| `db/migrations/003_commentary_fts.sql` | Create | Table + indexes |
| `src/ingest/ingest-commentary-fts.ts` | Create | JSON → Postgres batch insert |
| `web/src/lib/commentary-search.ts` | Create | Search query function |
| `web/src/app/api/search/commentaries/route.ts` | Create | GET endpoint |
| `web/src/app/library/commentaries/page.tsx` | Modify | Add search input + results view |
| `package.json` | Modify | Add `ingest:commentary-fts` script |

### What this does NOT include (deferred)

- **Omnibox integration** — NAVIGATION_AND_SEARCH.md §5 designs corpus search as the third omnibox
  intent (after reference and topic). That wiring is a separate task. This proposal only adds the
  search function and the library page surface.
- **Verse text search** — searching Bible text across translations is a different feature (needs
  `verses` table from SCHEMA.md, not built yet).
- **Semantic/vector search** — BM25 keyword search first. If users need "passages about suffering"
  (no keyword match), that's the hybrid search path via `embeddings` + DeepInfra — a later layer.
- **User library search** — searching user's own notes/highlights. Different table, needs RLS.

### To go live

1. Run migration 003 against Neon as `neondb_owner`
2. Run ingestion: `DATABASE_URL=<owner-url> pnpm ingest:commentary-fts`
3. Deploy web/ to Vercel
4. Verify search from `/library/commentaries`

## Needs Thomas

1. **Note panel close on save (Task 6)**: visually confirm the panel closes after saving a note in the reader
2. **Red highlighter "moving" (Task 7)**: reproduce in browser and confirm: (a) which element is "red" — pink dot? pink bg? something else? (b) what "moving" means — hover-following? scroll-floating? multi-line snap?
3. **Text/highlight color separation (Task 7)**: review the schema + UX proposal above and approve/redirect before implementation
4. ~~**SEC-2 closure (prod)**: re-apply APP_DATABASE_URL to prod, rotate neondb_owner password~~ **DONE** — APP_DATABASE_URL re-applied, neondb_owner password rotated, Vercel DATABASE_URL + DATABASE_URL_UNPOOLED updated, .env.local updated, deployed. Old password is invalid.
5. ~~**Fix A visual confirmation**~~ **Replaced by standalone logout** — verify sign-in/sign-out cycle works from the sidebar after deploy
6. ~~**Full-text commentary search**~~ **Approved + implemented** — code complete, needs migration + ingestion run against Neon (see "To go live" above)
