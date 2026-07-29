# OBSERVABILITY — honest current state

Design of record: `docs/OBSERVABILITY_DESIGN.md` (built 2026-07-11). This doc
records what **exists** today, what does **not**, and how a human actually
looks at logs right now. Anything aspirational is labeled as such.

## What EXISTS: structured JSON event logging

`web/src/lib/observability.ts` exports `logEvent(evt, fields)` — one
single-line JSON object per event to **stdout** (`{"evt","ts",...fields}`),
verified in code. It is deliberately Edge- and Node-safe (console only), so the
same logger works in middleware (edge) and the API routes (node). If a field
fails to serialize, the event is emitted without fields rather than throwing.

The event vocabulary (`ObsEvent`):

| Event | Emitted from | Carries |
|---|---|---|
| `rate_limit_hit` | `web/src/lib/rate-limit.ts` | `userId`, `cap` (`min`/`day`), `count`, `limit` |
| `rate_limit_fail_open` | `web/src/lib/rate-limit.ts` | `userId`, `error` (limiter DB error → request allowed) |
| `gate_rate_limit_hit` | `web/src/lib/rate-limit.ts` (site-gate limiter) | `ip`, `cap` (`min`/`hour`), `count`, `limit` |
| `gate_locked` | `web/src/middleware.ts` | `path`, `method` (prod gate misconfigured / locked) |
| `ask_outcome` | `web/src/app/api/ask/route.ts`, `.../ask/stream/route.ts` | `kind` (`composed`/`fallback`/`empty`), `ms` — this is what makes the verifier fallback rate visible in prod |
| `waitlist_signup` | `web/src/app/api/waitlist/route.ts` | `domain` only (email domain, not the address) |
| `error` | the ask routes' catch blocks | `where`, `message` |

`teach()` itself is **not** instrumented — `ask_outcome` is read from its
return value in the route, so the verifier/compose path is untouched (by
design, per `docs/OBSERVABILITY_DESIGN.md`).

**No-secrets contract (hard rule):** callers must never pass secrets, tokens,
passwords, cookie values, or **raw question text**. Log codes, counts,
outcomes, and the opaque internal `userId`. The logger adds nothing but `evt` +
`ts` of its own, and `test/observability.test.ts` asserts exactly that (it
cannot smuggle ambient fields). Note the boundary honestly: the test guards
the *logger*; the field values are caller discipline — e.g. `error` events log
the exception `message` string.

## What does NOT exist

- **No external observability provider.** No Sentry/PostHog/axiom, no DSN, no
  log drain to a third-party sink. Nothing leaves Vercel's own logging.
- **No alerting. Nothing pages a human.** `docs/PRODUCTION_AUDIT.md` flags this
  verbatim as **item 4 — "Observability has no provider/DSN — `logEvent` emits
  JSON to stdout; nothing is paged" — severity HIGH, verdict BLOCKER** (the
  audit grades every deferral against production-launch criteria, "alerting a
  human can be paged on" among them): a prod incident (gate-503 spike, fallback
  spike, errors) is invisible until someone goes and looks.
  `docs/LONG_NIGHT.md` records the same state.
- No dashboards, no request tracing, no metrics backend (explicitly out of
  scope in the design doc).

## Where the logs go

- **Dev:** stdout of the `next dev` process — the terminal you started it in.
- **Prod:** stdout of the serverless functions, captured by Vercel as
  **function logs** on the `web` project (Vercel dashboard → `web` → Logs).
  They are queryable there.

## How a human reviews them today

Manually. There is no other mechanism: someone opens the Vercel dashboard logs
for the `web` project and reads/searches the JSON lines (e.g. filtering on
`"evt":"gate_locked"` or `"kind":"fallback"`). There is no schedule, no
on-call, and no automated tripwire — which is exactly why the audit calls a
silent incident "invisible until someone looks."

## ASPIRATIONAL — not built (parked, needs owner input)

Per `docs/OBSERVABILITY_DESIGN.md` §Parked and `docs/PRODUCTION_AUDIT.md`
item 4, the intended next step is:

- **Error tracking:** Sentry (or equivalent) — needs an owner-provisioned
  account + DSN.
- **Alerting:** a Vercel log-drain alert on `evt:"gate_locked"` and on a spike
  in `kind:"fallback"` `ask_outcome` events.

The structured events above are the substrate any such provider ingests, so
this is additive when it lands. Until it does, treat "we have observability"
as false: we have **logs**, not observability.
