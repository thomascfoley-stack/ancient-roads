// Neon Auth, replacing self-hosted Better Auth. See docs/AUTH_CUTOVER_V2_NEON.md and ADR-107/108.
//
// `createNeonAuth` is Neon's own hosted proxy to a better-auth server we do not control the
// version of -- the opposite of why `better-auth.ts` existed. ADR-107 accepts that cost for
// database-native auth data and Neon branch support.
//
// ── BOTH ENV VARS MUST FAIL CLOSED ──────────────────────────────────────────────────────────────
// `createNeonAuth`'s types require `baseUrl: string`, but `process.env.X` is `string | undefined`.
// If Neon's SDK were ever handed an empty baseUrl, resolving it from the request `Host` header
// would be a password-reset poisoning vector (pre-deploy audit A1-6). Throw here instead of
// letting `undefined` reach the SDK.
//
// ── LAZY CONSTRUCTION, FOR THE SAME REASON better-auth.ts WAS LAZY ──────────────────────────────
// `next build` collects page data for the auth route with no auth env in scope. Constructing at
// module load is exactly how the previous wiring broke the build. Do not "simplify" this to a
// top-level const.

import { createNeonAuth, type NeonAuth } from '@neondatabase/auth/next/server';
import {
  createAuthServer,
  extractNeonAuthCookies,
  resolveNeonAuthLogging,
  type NeonAuthServer,
  type RequestContext,
  type SessionCookieConfig,
} from '@neondatabase/auth/server';
import { cookies, headers } from 'next/headers';

// Typed as the SDK's full cookie config so both instances below read every cookie setting from this
// one object: a `domain` added here reaches the session instance too, instead of it writing a
// host-only cookie beside the proxy's domain cookie.
function config(): { baseUrl: string; cookies: SessionCookieConfig } {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl) throw new Error('NEON_AUTH_BASE_URL is not set');
  if (!secret) throw new Error('NEON_AUTH_COOKIE_SECRET is not set');
  return { baseUrl, cookies: { secret } };
}

let _auth: NeonAuth | null = null;

export function getAuth(): NeonAuth {
  _auth ??= createNeonAuth(config());
  return _auth;
}

// ── SESSION CHECKS USE THEIR OWN INSTANCE, BECAUSE PAGES CANNOT WRITE COOKIES ───────────────────
// When the auth server's getSession answer carries a Set-Cookie (a stale token being cleared, a
// session being refreshed), createNeonAuth writes it through `cookies().set()`. Session checks run
// inside page renders, and there Next's cookie store is read-only and throws. Every page that asks
// who the reader is failed for a reader in that state — /auth/sign-in included, so a stale cookie
// locked the reader out of the one page that fixes it (production, 2026-09-13).
//
// This is the SDK's own Next.js context (`createNextRequestContext` in
// @neondatabase/auth/dist/next/server) with one change: a write refused because we are rendering a
// page is skipped. The page still gets the session answer. Route handlers calling requireUser()
// write exactly as before, and any other write failure still throws.
//
// What a skipped write costs, by case:
//   * stale token: nothing. The auth server sends the deletion on every call, so the browser's own
//     session check (/api/auth, a route handler) clears the cookie a moment later.
//   * session refresh: the refresh is sent ONCE per update window, so when it lands on a page render
//     the browser cookie keeps its old expiry until a later refresh reaches a route handler. A reader
//     can be signed out earlier than the server-side session says. Before this, the same case showed
//     the error page instead. It also costs one extra get-session call: the SDK mints the
//     session_data cache cookie from it, and that write is skipped too.
const READ_ONLY_COOKIES = 'Cookies can only be modified in a Server Action or Route Handler';

async function sessionContext(): Promise<RequestContext> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return {
    getCookies: () => extractNeonAuthCookies(headerStore),
    setCookie(name, value, options) {
      try {
        cookieStore.set(name, value, options);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith(READ_ONLY_COOKIES)) return;
        throw e;
      }
    },
    getHeader: (name) => headerStore.get(name),
    getOrigin: () =>
      headerStore.get('origin') || headerStore.get('referer')?.split('/').slice(0, 3).join('/') || '',
    getFramework: () => 'nextjs',
  };
}

let _sessionAuth: NeonAuthServer | null = null;

/** The instance session.ts reads the session through. Safe inside a Server Component. */
export function getSessionAuth(): NeonAuthServer {
  if (!_sessionAuth) {
    const { baseUrl, cookies: c } = config();
    _sessionAuth = createAuthServer({
      baseUrl,
      context: sessionContext,
      cookieSecret: c.secret,
      sessionDataTtl: c.sessionDataTtl,
      domain: c.domain,
      sameSite: c.sameSite,
      // createNeonAuth passes this too; without it the SDK's upstream warnings go nowhere.
      log: resolveNeonAuthLogging(),
    });
  }
  return _sessionAuth;
}
