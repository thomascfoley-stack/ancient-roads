// Stable API error contract (docs/API_ERRORS.md). EVERY /api/* error response uses
// this envelope: a machine `code` the client branches on, a safe human `message`,
// and — critically — NEVER a leaked internal (no stack traces, DB/model errors,
// env var names, or secret values). Log the detail server-side; return the code.
//
// Uses the global Web `Response` (App Router route handlers accept it), NOT
// NextResponse — so this stays framework-free and unit-testable outside Next.
export type ApiErrorCode =
  | 'RATE_LIMIT_MINUTE'
  | 'RATE_LIMIT_DAY'
  | 'UNAUTHENTICATED'
  | 'GATE_LOCKED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'FORBIDDEN'
  | 'INTERNAL';

interface Spec {
  status: number;
  message: string; // safe-to-display; no internals
  retryAfterSec?: number;
}

const SPECS: Record<ApiErrorCode, Spec> = {
  RATE_LIMIT_MINUTE: { status: 429, message: 'You’ve reached the per-minute question limit. Please wait a moment and try again.' },
  RATE_LIMIT_DAY: { status: 429, message: 'You’ve reached today’s question limit. It resets at midnight UTC.' },
  UNAUTHENTICATED: { status: 401, message: 'Please sign in to continue.' },
  GATE_LOCKED: { status: 503, message: 'This site is temporarily unavailable.' },
  UPSTREAM_UNAVAILABLE: { status: 503, message: 'We couldn’t reach the study service just now. Please try again in a moment.', retryAfterSec: 30 },
  INVALID_REQUEST: { status: 400, message: 'That request wasn’t valid. Please try rephrasing your question.' },
  // 403, distinct from 401: the caller IS signed in, and is still not permitted. Used by the
  // gated-beta teacher gate (ADR-116 ruling 3). The message says what is true without hinting
  // at an allowlist — a beta user is not being told they are on the wrong side of a door.
  FORBIDDEN: { status: 403, message: 'The study assistant isn’t available on your account yet.' },
  INTERNAL: { status: 500, message: 'Something went wrong on our end. Please try again.' },
};

// Build the error response. `opts.message` overrides only for the same code's safe
// wording (e.g. a specific INVALID_REQUEST reason); it must never carry internals.
import { NextResponse } from 'next/server';

export function apiError(
  code: ApiErrorCode,
  opts: { message?: string; retryAfterSec?: number } = {},
): NextResponse {
  const spec = SPECS[code];
  const retryAfterSec = opts.retryAfterSec ?? spec.retryAfterSec;
  const headers: Record<string, string> = {};
  if (retryAfterSec != null) headers['Retry-After'] = String(retryAfterSec);
  return NextResponse.json(
    { error: { code, message: opts.message ?? spec.message, ...(retryAfterSec != null ? { retryAfterSec } : {}) } },
    { status: spec.status, headers },
  );
}
