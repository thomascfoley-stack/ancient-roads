# Observability — design (beta wall 3)

**Status:** built 2026-07-11 (structured logging layer). External error-tracking + alerting provider is a
PARKED fork (needs an owner account/DSN — see §Parked). Owner is away; this records the approach.

## Goal
See what the gated beta is doing, and catch failures, without leaking anything. Concretely, log **every**:
1. **rate-limit hit** (which user, which cap),
2. **limiter fail-open** (limiter DB error → request allowed),
3. **gate 503** (prod misconfigured, SITE_PASSWORD unset),
4. **verifier fallback** (so the ~14% fallback rate is visible in production),
plus generic request **errors**.

## Approach — structured single-line JSON events
`web/src/lib/observability.ts` exports `logEvent(evt, fields)` → one JSON line to stdout
(`{"evt","ts",...fields}`). The platform log drain (Vercel) captures stdout; JSON lines are queryable and
alertable there. Edge- and Node-safe (console only), so it works in both middleware (edge) and the API
routes (node).

**No-secrets contract (hard rule):** never log secrets, tokens, passwords, cookie values, or **raw question
text** (privacy). Log codes, counts, outcomes, and the internal `userId` (an opaque id, needed per the
error contract's "log which user hit which limit"). A unit test asserts the logger only emits the fields it
is given and carries no ambient secrets.

## Wiring (no verifier/compose path touched)
- `rate_limit_hit`, `rate_limit_fail_open` → `rate-limit.ts` (replaces the Wall-1 `console.warn/error`).
- `gate_locked` → `middleware.ts` (alongside the loud gate log).
- `ask_outcome` → the `/api/ask` + `/api/ask/stream` routes, AFTER `teach()` returns, logging
  `{ kind: composed|fallback|empty, ms }`. **`teach.ts` is NOT modified** — the fallback signal is read from
  its return value in the route, so the verifier/compose path stays untouched. This is what surfaces the
  production fallback rate.
- `error` → the routes' catch blocks (generic; the user still gets the safe `apiError('INTERNAL')`).

## Parked fork (needs owner input)
**Error-tracking + alerting provider (Sentry / PostHog / Vercel log-drain alerts).** Requires an account +
DSN/API key I don't have, and a choice of vendor. Recommendation: **Sentry** for error tracking (generous
free tier, good Next.js SDK) + a **Vercel log-drain alert** on `evt:"gate_locked"` and a spike in
`kind:"fallback"`. Deferred until the owner provisions credentials; the structured events above are the
substrate any provider ingests, so this is additive when it lands.

## Out of scope
Dashboards/analytics UI; request tracing; metrics backend. The JSON events are the foundation for all of
these later.
