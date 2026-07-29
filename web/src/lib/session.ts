import { getAuth } from './auth/server';

export async function requireUser(): Promise<{ id: string; email: string }> {
  const result = await getAuth().getSession();
  const data = 'data' in result ? result.data : null;
  if (!data?.user) {
    throw new Error('Unauthorized');
  }
  return { id: data.user.id, email: data.user.email };
}
