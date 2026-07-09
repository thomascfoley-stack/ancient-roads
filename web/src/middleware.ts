import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, gateToken } from '@/lib/gate';

// Site-wide password gate for the pre-launch deployment (SEC-1 in
// docs/SECURITY.md is open, so the public URL must not accept anonymous
// visitors). Active only when SITE_PASSWORD is set — local dev without the
// env var is unaffected. Remove the gate when SEC-1 closes.
//
// The Neon auth middleware stays out of here: /account auth is enforced by
// requireUser() in the page server component (Fix A — see WORKLOG.md). The
// middleware's Edge-runtime HTTP fallback to NEON_AUTH_BASE_URL silently
// failed, causing infinite redirect-to-login.

export default async function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get(GATE_COOKIE)?.value;
  if (cookie && cookie === (await gateToken(password))) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;
  if (req.method === 'GET' || req.method === 'HEAD') {
    const url = req.nextUrl.clone();
    url.pathname = '/gate';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return new NextResponse('Locked', { status: 401 });
}

export const config = {
  // Everything except the gate itself, Next internals, and the favicon.
  matcher: ['/((?!gate|api/gate|_next/|favicon.svg|manifest.webmanifest|icons/).*)'],
};
