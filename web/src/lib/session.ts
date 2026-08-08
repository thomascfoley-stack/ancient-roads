import { getAuth } from './auth/neon-auth';

// Sessions now resolve against Neon Auth (ADR-107/108, docs/AUTH_CUTOVER_V2_NEON.md). Both
// functions keep their old signatures on purpose: 18 files call them, and a cutover that also
// changed the shape of `requireUser` would have mixed an auth migration into a refactor of every
// route that consumes it.

async function session() {
  // NOT `.api.getSession({ headers })` -- that was Better Auth's shape. Neon Auth's `getSession()`
  // reads the request cookie itself (via next/headers under the hood) and returns `{ data }`,
  // not the session directly.
  const { data } = await getAuth().getSession();
  return data;
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
