# W-SEC-CSRF — CSRF Content-Type floor across cookie-authenticated mutating routes

**Status:** CLAIMED (2026-08-22)
**Worktree:** /tmp/swarm-W-SEC-CSRF · **Branch:** swarm/W-SEC-CSRF-csrf-floor · **Base:** 9dce273ef09dffb03bc547cead0431f48fb71ffe (origin/main)

## Policy (stated before touching code, per the item brief)

Mutating handlers (POST/PUT/PATCH/DELETE) on **cookie-authenticated** API routes that **parse a
JSON body** must reject any request whose `Content-Type` is not `application/json`, with **400
`INVALID_REQUEST`** in the repo's standard error envelope (docs/API_ERRORS.md), via ONE shared
guard helper. Rationale: a cross-origin `<form>` or no-cors fetch can only send the three
CORS-safe "simple" Content-Types (`text/plain`, `application/x-www-form-urlencoded`,
`multipart/form-data`); requiring `application/json` forces a preflight the browser refuses
cross-origin. The session cookie's SameSite posture is recorded as unaudited (2026-08-02 deep
audit, noted in plans/[id]/route.ts), so the routes do not lean on it.

400 vs 415: the API_ERRORS registry has no 415 code and the one existing precedent (the inline
floor in `web/src/app/api/plans/[id]/route.ts`, shipped 2026-08-21) returns 400 INVALID_REQUEST
with message "Content-Type must be application/json". The brief allows "415/400 per the repo's
standard error shape" — the repo's shape is the registry, so the guard matches the existing
precedent exactly and adds no new registry entry.

## Enumeration (derived: glob of web/src/app/api/**/route.ts with mutating exports)

### In scope — cookie-auth (requireUser/guardUser) + strict JSON body: 16 files / 18 handlers

| Route file | Floored handlers |
|---|---|
| annotations/route.ts | POST, DELETE (this surface's DELETE carries a JSON body, so it is floored like any JSON parse) |
| ask/route.ts | POST |
| ask/stream/route.ts | POST |
| channels/route.ts | POST |
| chats/route.ts | POST |
| history/search/route.ts | POST |
| messages/route.ts | POST |
| plans/route.ts | POST |
| plans/[id]/route.ts | POST (inline floor from 2026-08-21 refactored onto the shared guard) |
| prayers/route.ts | POST |
| studies/route.ts | POST |
| studies/[id]/route.ts | PATCH |
| studies/[id]/blocks/route.ts | POST, PATCH |
| user-corpus/draft-check/route.ts | POST |
| work/[slug]/progress/route.ts | POST |
| work/[slug]/shelf/route.ts | PUT |

All first-party client call sites verified to already send `Content-Type: application/json`
(grep of web/src fetch() calls, plus scripts/cutover-regression-gate.mts G7 live probe), so the
floor changes no legitimate traffic.

### HELD-FOR-OWNER — heterogeneous (the brief's ambiguity stop; per-route reasons)

- **user-corpus/documents/[id]/readings — POST**: a no-body POST is a *designed* valid request
  ("re-run with whatever the document already had"; the route catches the JSON parse failure and
  falls back to stored categories). A strict JSON floor would change product behavior; needs an
  owner ruling (e.g. Origin/Sec-Fetch-Site check or a required custom header for bodyless
  mutations). NOTE: this POST kicks a ~300 s metered corpus scan.
- **user-corpus/documents/[id] — POST (retry) + DELETE**: no body parsed. The retry is metered
  like an upload (H5a) and a no-body cross-origin POST is a *simple* request, so this is arguably
  the most CSRF-exposed mutation in the app — and a Content-Type floor cannot fix it (nothing to
  require). Same owner ruling needed as readings.
- **user-corpus/upload — POST**: parses `multipart/form-data` (file upload).
- **gate — POST**: parses form data by design; it is the endpoint that *issues* the cookie.
- **auth/[...path]**: the auth handler itself; heterogeneous methods/content-types across its
  subpaths (login, callback, session). Floor policy there is auth-library territory.
- **No-body DELETEs** (plans/[id], studies/[id], studies/[id]/blocks, research/[id],
  work/[slug]/shelf): cross-origin DELETE is never a CORS-simple request, so there is no CSRF
  exposure to floor; listed for completeness. (annotations DELETE is NOT in this class — it
  parses a JSON body, so it is floored.)

### Out of scope — no ambient cookie authority

- **waitlist — POST**: public, unauthenticated (email signup); no cookie to ride.
- **eval/bait — POST**: bearer-secret authenticated, not cookie.

## Transitions

- 2026-08-22 **CLAIMED** — worktree + branch created from origin/main 9dce273; bootstrap per
  §2.7 plus web/node_modules; both env files silently verified clean (booleans only) and copied.
  Policy stated above pre-code.
