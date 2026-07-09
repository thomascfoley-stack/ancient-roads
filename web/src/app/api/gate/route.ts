import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, gateToken } from '@/lib/gate';

// Checks the site password and sets the gate cookie (see middleware.ts).
export async function POST(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.redirect(new URL('/', req.url));

  const form = await req.formData();
  const attempt = form.get('password');
  const rawNext = form.get('next');
  const next =
    typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/';

  if (typeof attempt !== 'string' || attempt !== password) {
    const url = new URL('/gate', req.url);
    url.searchParams.set('error', '1');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
