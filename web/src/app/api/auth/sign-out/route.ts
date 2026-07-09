import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const NEON_AUTH_COOKIE_PREFIX = '__Secure-neon-auth';

export async function POST() {
  const jar = await cookies();
  for (const c of jar.getAll()) {
    if (c.name.startsWith(NEON_AUTH_COOKIE_PREFIX)) {
      jar.set(c.name, '', { path: '/', maxAge: 0 });
    }
  }
  return NextResponse.json({ ok: true });
}
