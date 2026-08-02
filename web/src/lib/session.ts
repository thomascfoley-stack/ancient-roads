import { getAuth } from './auth/server';

export async function requireUser(): Promise<{ id: string; email: string }> {
  const result = await getAuth().getSession();
  const data = 'data' in result ? result.data : null;
  if (!data?.user) {
    throw new Error('Unauthorized');
  }
  return { id: data.user.id, email: data.user.email };
}

/**
 * The signed-in user, or null. Does NOT throw.
 *
 * `requireUser` throws for API routes, which want a 401. A PAGE that merely wants to know whether
 * someone is signed in should not have to use exceptions for control flow — and if it wraps
 * `requireUser` in a try/catch it swallows real auth failures as "signed out" too. This returns
 * null only for the absence of a session; anything else propagates.
 */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const result = await getAuth().getSession();
  const data = 'data' in result ? result.data : null;
  return data?.user ? { id: data.user.id, email: data.user.email } : null;
}
