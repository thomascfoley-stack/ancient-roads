import { headers } from 'next/headers';
import { getAuth } from './auth/better-auth';

// Sessions now resolve against Better Auth running in THIS app rather than Neon's hosted service
// (docs/AUTH_CUTOVER_DESIGN.md, SEC-1). Both functions keep their old signatures on purpose: 15
// files call them, and a cutover that also changed the shape of `requireUser` would have mixed an
// auth migration into a refactor of every route that consumes it.

async function session() {
  // `headers()` rather than a request object, because most callers are server components that
  // never see one. Better Auth reads the session cookie off these.
  return getAuth().api.getSession({ headers: await headers() });
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
