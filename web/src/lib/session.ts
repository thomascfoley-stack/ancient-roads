import { getAuth } from './auth/neon-auth';
import { markActiveDay } from './active-day';
import { AuthServiceUnavailableError, isAuthServiceUnavailable, authFailureResponse } from './auth-failure';
export { AuthServiceUnavailableError, isAuthServiceUnavailable, authFailureResponse };

// Sessions now resolve against Neon Auth (ADR-107/108, docs/AUTH_CUTOVER_V2_NEON.md). Both
// functions keep their old signatures on purpose: 18 files call them, and a cutover that also
// changed the shape of `requireUser` would have mixed an auth migration into a refactor of every
// route that consumes it.

async function session() {
  // NOT `.api.getSession({ headers })` -- that was Better Auth's shape. Neon Auth's `getSession()`
  // reads the request cookie itself (via next/headers under the hood) and returns `{ data }`,
  // not the session directly.
  // D43: an errored call is NOT an absent session. Two shapes have to be caught, and the first
  // version of this fix only caught one:
  //   * `{ data: null, error }` — the SDK's normalised upstream failure;
  //   * a THROW — getAuth() itself raises on misconfiguration ("NEON_AUTH_BASE_URL is not set"),
  //     which is not a session state at all. Observed in the browser leg for this branch: with
  //     that variable unset every route answered 401, i.e. told the reader they were signed out
  //     because the SERVER was misconfigured. Exactly the conflation D43 exists to end.
  let data: unknown;
  try {
    const res = (await getAuth().getSession()) as { data: unknown; error?: unknown };
    if (res.error) throw new AuthServiceUnavailableError(res.error);
    data = res.data;
  } catch (e) {
    if (e instanceof AuthServiceUnavailableError) throw e;
    throw new AuthServiceUnavailableError(e);
  }
  const resolved = data as { user?: { id: string; email: string } } | null;

  // THE ONE CHOKE POINT FOR "was this person here today" (migration 130). Every authenticated API
  // route and every page that asks who the reader is comes through here, so one call gives
  // complete coverage -- including the reader who spends an hour in Scripture and never searches,
  // whom the ask/search logs would score as absent.
  //
  // Deliberately here rather than in requireUser/currentUser separately: those are two doors to
  // the same room, and instrumenting one of them is how coverage silently becomes partial.
  //
  // MERGE UNION 2026-08-24: this sits AFTER D43's error handling on purpose. An auth outage now
  // throws before reaching here, so a server misconfiguration can never be recorded as a reader
  // being active — the activity ledger only ever sees a genuinely resolved session.
  //
  // markActiveDay never throws, never awaits, and writes at most once per user per day per warm
  // instance. If it ever costs a reader their request, that is a bug in active-day.ts, not a
  // tuning question.
  if (resolved?.user?.id) markActiveDay(resolved.user.id);
  return resolved;
}

export async function requireUser(): Promise<{ id: string; email: string }> {
  const data = await session();
  if (!data?.user) {
    throw new Error('Unauthorized');
  }
  return { id: data.user.id, email: data.user.email };
}

/**
 * The signed-in user, or null. Does NOT throw.
 *
 * `requireUser` throws for API routes, which want a 401. A PAGE that merely wants to know whether
 * someone is signed in should not have to use exceptions for control flow - and if it wraps
 * `requireUser` in a try/catch it swallows real auth failures as "signed out" too. This returns
 * null only for the absence of a session; anything else propagates.
 */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const data = await session();
  return data?.user ? { id: data.user.id, email: data.user.email } : null;
}
