# API Error Contract

**Status:** Approved. Implement alongside beta wall 1 (`SITE_GATE_RATELIMIT_DESIGN.md`). Every error response from `/api/*` conforms to this envelope. Extend the registry, never invent ad-hoc shapes.

## Why

A raw `429` with no body is a dead end for the user and untypeable for the client. Errors need a **stable machine code** (so the UI can render the right thing), a **human message** (so the user knows what to do), and **never a leaked internal** (no stack traces, no secret values, no DB errors surfaced).

## Envelope

Every error response, all endpoints:

```json
{
  "error": {
    "code": "RATE_LIMIT_MINUTE",
    "message": "You've reached the limit of 10 questions per minute. Please wait 42 seconds and try again.",
    "retryAfterSec": 42
  }
}
```

- `code` — stable `SCREAMING_SNAKE` identifier from the registry below. The client branches on this, never on the message string.
- `message` — human-readable, safe to display verbatim. Neutral and gracious in tone; no jargon, no blame, no cuteness.
- Optional fields per code (`retryAfterSec`, `resetsAt`). Never include internals.

## Registry

| Code | HTTP | Headers | User-facing message |
|---|---|---|---|
| `RATE_LIMIT_MINUTE` | 429 | `Retry-After: <sec>` | "You've reached the limit of {n} questions per minute. Please wait {sec} seconds and try again." |
| `RATE_LIMIT_DAY` | 429 | `Retry-After: <sec>` | "You've reached today's limit of {n} questions. Your limit resets at {time}. If you need more during the beta, let us know." |
| `UNAUTHENTICATED` | 401 | — | "Please sign in to continue." |
| `GATE_LOCKED` | 503 | — | "This site is temporarily unavailable." *(Fires when `SITE_PASSWORD` is unset in production — a misconfigured deploy. Log LOUDLY server-side; never reveal the cause to the client.)* |
| `UPSTREAM_UNAVAILABLE` | 503 | `Retry-After: 30` | "We couldn't reach the study service just now. Please try again in a moment." |
| `INVALID_REQUEST` | 400 | — | "That request wasn't valid. Please try rephrasing your question." |
| `INTERNAL` | 500 | — | "Something went wrong on our end. Please try again." *(Generic by design — never surface the underlying error.)* |

## Rules

- **Never leak internals.** No stack traces, DB errors, model errors, env var names, or secret values in any `message`. Log the detail server-side; return the generic code.
- **`Retry-After` is required** on every 429 and on `UPSTREAM_UNAVAILABLE`, so clients back off instead of hammering a paid endpoint.
- **The day-limit message invites contact.** During beta, a capped tester is lost feedback — tell them how to ask for more rather than walling them silently.
- **Every 429 is logged** (which user, which limit) so we can see whether the caps are frustrating real testers and tune them (they're env-tunable).
- **`GATE_LOCKED` is deliberately vague to the client and deliberately loud in logs.** A misconfigured production deploy must scream at us and reveal nothing to a visitor.

## Not an error: the verifier fallback

When the verifier rejects composed text, the API still returns **200** with the retrieved sources (the fail-closed safe path — roughly 1 in 7 requests today). This is a **valid degraded response, not an error.** Do not map it to an error code. The UI should render it gracefully (sources shown directly, with a brief neutral note) rather than as a failure.
