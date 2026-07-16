import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, gateToken, gateDecision, isPublicPath } from '@/lib/gate';
import { logEvent } from '@/lib/observability';

// Site-wide password gate for the pre-launch deployment (SEC-1 in
// docs/SECURITY.md is open, so the public URL must not accept anonymous
// visitors). FAILS CLOSED: in production an unset/empty SITE_PASSWORD denies
// (503), it does NOT expose the app — one missing env var must never drop the
// whole wall (the 2026-07-09 public-prod incident). Local dev (NODE_ENV!=
// 'production') keeps running gate-free. Remove the gate when SEC-1 closes.
//
// The Neon auth middleware stays out of here: /account auth is enforced by
// requireUser() in the page server component (Fix A — see WORKLOG.md). The
// middleware's Edge-runtime HTTP fallback to NEON_AUTH_BASE_URL silently
// failed, causing infinite redirect-to-login.

export default async function middleware(req: NextRequest) {
  // Public tier (marketing landing + waitlist) bypasses the password wall entirely.
  // Exact-match allowlist in gate.ts — the app routes below stay gated.
  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  const password = process.env.SITE_PASSWORD;
  const cookie = req.cookies.get(GATE_COOKIE)?.value;
  const cookieValid = !!password && !!cookie && cookie === (await gateToken(password));

  const action = gateDecision({
    password,
    isProd: process.env.NODE_ENV === 'production',
    method: req.method,
    cookieValid,
  });

  switch (action) {
    case 'allow':
      return NextResponse.next();
    case 'deny503':
      // Loud in logs, vague to the client (docs/API_ERRORS.md GATE_LOCKED): a prod
      // deploy without SITE_PASSWORD is a misconfiguration that must scream at us
      // and reveal nothing to a visitor. Fail closed.
      console.error('[gate] SITE_PASSWORD is not set in production — failing CLOSED (503). Set SITE_PASSWORD to unlock the site.');
      logEvent('gate_locked', { path: req.nextUrl.pathname, method: req.method });
      return new NextResponse('This site is temporarily unavailable.', { status: 503 });
    case 'redirect': {
      const { pathname, search } = req.nextUrl;
      const url = req.nextUrl.clone();
      url.pathname = '/gate';
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    case 'locked401':
      return new NextResponse('Locked', { status: 401 });
  }
}

export const config = {
  // Everything except the gate itself, Next internals, and the favicon.
  matcher: ['/((?!gate|api/gate|_next/|favicon.svg|manifest.webmanifest|icons/).*)'],
};
