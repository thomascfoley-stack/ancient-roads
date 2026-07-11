# Beta wall 1 — fail-closed site gate + rate-limit `/api/ask` — design (for approval)

**Status:** DRAFT — awaiting owner approval before code (design-before-code rail; touches auth + API + DB,
so `/security` runs after build). Smallest, highest-safety beta wall. Two related sub-slices below.

## Why (the exposure)
- **Gate fails OPEN.** `web/src/middleware.ts:16` — `if (!password) return NextResponse.next();`. One unset or
  typo'd `SITE_PASSWORD` in prod silently drops the entire wall (exactly the 2026-07-09 incident where prod
  ran fully public, `/api/ask` included). A missing gate config must **deny, not expose**.
- **`/api/ask` is unthrottled.** Authed-only, but a beta tester (or any gate-bypass path) can hammer the
  paid embed+rerank+Qwen endpoint — wallet-DoS. Needs a per-user limit independent of the gate.

## Sub-slice A — fail the gate CLOSED (without bricking local dev)
The tension: "unset password ⇒ deny" must not break `next dev` (which intentionally runs gate-free).
Reconcile by environment:

- **Production** (`process.env.NODE_ENV === 'production'` — set by `next build`/Vercel): `SITE_PASSWORD`
  unset/empty ⇒ **DENY** every matched route. Serve a hard **`503 "Locked — gate not configured"`** for BOTH
  GET and non-GET (NOT a redirect to `/gate` — the gate can't validate against a missing password, so a
  redirect would loop / dead-end). A misconfigured prod deploy is locked, never public.
- **Development** (`NODE_ENV !== 'production'`): unset password ⇒ **allow** (current dev convenience,
  unchanged).
- **Password SET** (any env): unchanged behavior — valid cookie ⇒ `next()`; else GET → redirect `/gate`,
  non-GET → `401 Locked`.

Net change: one branch in `middleware.ts` — replace the unconditional `!password ⇒ next()` with
`!password ⇒ (prod ? deny503 : next())`. Edge-safe (no new imports). The matcher already excludes
`gate|api/gate|_next|favicon|manifest|icons` — unchanged, so the unlock flow still works when a password IS
set.

## Sub-slice B — per-user rate limit on `/api/ask`
Per **authenticated user** (`requireUser()` → `id`); `/api/ask` always has a user, so per-user is the right
key (per-IP is unnecessary here and IP is unreliable behind Vercel).

- **Store: Postgres (existing Neon), fixed-window counter.** New migration `008`:
  `api_rate_limit(user_id text, window_start timestamptz, count int, primary key(user_id, window_start))`.
  One **atomic upsert per request**:
  `INSERT ... (user_id, floor(now) to the minute, 1) ON CONFLICT (user_id, window_start) DO UPDATE SET
  count = api_rate_limit.count + 1 RETURNING count`. If `count > LIMIT_PER_MIN` ⇒ **429** (with
  `Retry-After`). A second bucket keyed to the hour (or day) enforces a daily cap. Old rows swept by a
  cheap `DELETE WHERE window_start < now() - interval` piggybacked occasionally (or a scheduled task).
- **Limits (env-tunable):** default **`ASK_LIMIT_PER_MIN=10`**, **`ASK_LIMIT_PER_DAY=100`** — generous for
  invited testers, hard stop on a runaway loop. Tunable without deploy via env.
- **Placement:** in `POST /api/ask`, immediately AFTER `requireUser()` and BEFORE `teach()` (the spend).
  Runs on the Node runtime (route already `runtime='nodejs'`), via `getDb()`.
- **RLS:** the table is app-internal counts, not user content. app_runtime gets `INSERT/UPDATE/SELECT`;
  optional defense-in-depth RLS-to-`current_user` (each user touches only their own rows). Recommend the
  simple grant for beta; note RLS as a follow-up.
- **Fail-closed vs fail-open on limiter ERROR:** if the DB check itself throws, **allow the request**
  (fail-open on the *limiter*) — a rate-limiter outage must not take down the product; the gate + auth still
  protect it. (Distinct from the site gate, which fails closed.) This is a deliberate, stated asymmetry.

## Why not the alternatives
- **In-memory rate limit:** Vercel is multi-instance + cold-starts → counters don't share; ineffective.
  Rejected.
- **Upstash/Vercel KV sliding window (`@upstash/ratelimit`):** the standard, more accurate, but adds a
  dependency + new infra for beta-scale traffic. Postgres fixed-window is proportionate now; revisit at GA.
- **Redirect-to-`/gate` on unset password:** dead-ends (no password to match). Rejected for a hard 503.

## Verification (a green check is not proof — seed the bad config)
- **Gate:** prod-like build (`NODE_ENV=production`) with `SITE_PASSWORD` **unset** ⇒ `GET /` and
  `POST /api/ask` both **503/denied** (not 200). With it **set**: no/!bad cookie ⇒ redirect/401; correct
  cookie ⇒ 200. Dev (`next dev`) unset ⇒ still 200 (not bricked).
- **Rate limit:** as one user, fire `LIMIT_PER_MIN+1` in a minute ⇒ last is **429 + Retry-After**; a
  **second user** in the same window is unaffected; next minute resets. Seed a forced limiter DB error ⇒
  request still succeeds (limiter fail-open).
- `/security` on the diff (auth + API + DB); `npm run audit` green; sync guards intact.

## Scaling risks (named)
- +1 indexed upsert per `/api/ask` — negligible beside embed+rerank+compose; the PK makes it O(1).
- Table growth → the periodic sweep / scheduled cleanup keeps it bounded.
- Fixed-window edge burst (2× at a window boundary) — acceptable for wallet-DoS defense; sliding window is a
  GA refinement.

## Out of scope
- Sliding-window / KV backend (GA). Per-IP limiting on public (post-SEC-1) routes. Gate UX changes.
- The other two walls (migrate/publish corpus; observability) — their own slices, in order.

## Approval asks
1. **Gate fail-closed signal = `NODE_ENV==='production'`** (vs `VERCEL==='1'`)? — recommend NODE_ENV.
2. **Unset-password-in-prod response = hard `503`** (vs redirect-to-/gate)? — recommend 503.
3. **Rate-limit store = Postgres fixed-window `008`** (vs Upstash KV)? — recommend Postgres for beta.
4. **Default limits 10/min, 100/day per user**, env-tunable? — sane for invited beta?
5. **Limiter fails OPEN on its own DB error** (product stays up; gate+auth still protect)? — recommend yes.
