// D43 (DEEP_SWEEP) — telling an auth-SERVICE outage apart from "nobody is signed in".
//
// `session()` used to discard the `error` half of Neon Auth's `{ data, error }`, and requireUser
// threw plain `Unauthorized` whenever `data` was null. The SDK returns `{ data: null, error }` on
// an upstream fetch failure, so an outage surfaced from every route as 401: clients rendered
// signed-out UI and bounced users to a sign-in page that could not work either. The same
// auth-failure/server-failure conflation the annotations route names and fixed for itself
// (A1-16), one layer further down, under all 18 callers of requireUser.
//
// Deliberately a module of its OWN, importing nothing but api-error: session.ts pulls in the Neon
// Auth SDK, and a test that only wants to construct this error should not have to load it.
import { apiError } from './api-error';

export class AuthServiceUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('auth service unavailable');
    this.name = 'AuthServiceUnavailableError';
    this.cause = cause;
  }
}

/** True when this failure was the auth SERVICE, not a missing session. */
export function isAuthServiceUnavailable(e: unknown): boolean {
  return e instanceof AuthServiceUnavailableError
    || (e instanceof Error && e.name === 'AuthServiceUnavailableError');
}

/**
 * The right response for a requireUser() failure. Routes wrote
 * `catch { return apiError('UNAUTHENTICATED') }`, which is correct for a missing session and
 * WRONG for an outage. Use this instead of a bare UNAUTHENTICATED.
 */
export function authFailureResponse(e: unknown): Response {
  return isAuthServiceUnavailable(e) ? apiError('UPSTREAM_UNAVAILABLE') : apiError('UNAUTHENTICATED');
}
