// A PAGE RENDER CANNOT WRITE COOKIES, AND THE SESSION CHECK MUST NOT DIE TRYING.
//
// Production, 2026-09-13, digest 2518938149 on /auth/sign-in: pressing "Log in" showed the error
// page. The sign-in page calls currentUser() to bounce a signed-in reader to /home. Neon Auth's
// getSession() asks the hosted auth server, and when the answer carries a Set-Cookie (a stale
// session token being cleared, or a session being refreshed) the SDK writes it through
// `cookies().set()`. In a Server Component Next hands out a sealed store whose `set` throws
// "Cookies can only be modified in a Server Action or Route Handler", session() wrapped that as
// AuthServiceUnavailableError, and the page failed. Every server page that asks who the reader is
// had the same fault; the sign-in page is just the one a stale cookie sends you to.
//
// The cookie stores here are Next's own classes, so the read-only error is the real one Next
// throws, not a copy of its message: if a Next upgrade changes that error, this file goes red.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestCookies, ResponseCookies } from 'next/dist/server/web/spec-extension/cookies';
import { RequestCookiesAdapter } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

const request = vi.hoisted(() => ({ cookies: null as unknown, headers: new Headers() }));

vi.mock('next/headers', () => ({
  cookies: async () => request.cookies,
  headers: async () => request.headers,
}));
vi.mock('@/lib/active-day', () => ({ markActiveDay: vi.fn() }));

import { currentUser, AuthServiceUnavailableError } from '@/lib/session';

const TOKEN = '__Secure-neon-auth.session_token';
const SESSION_DATA = '__Secure-neon-auth.local.session_data';
const ENV_KEYS = ['NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET'] as const;
let saved: Record<string, string | undefined>;

/** What Next's cookies() returns during a Server Component render. */
function pageRenderCookies() {
  return RequestCookiesAdapter.seal(new RequestCookies(request.headers));
}

function upstream(body: unknown, setCookie: string) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: [['content-type', 'application/json'], ['set-cookie', setCookie]],
  }));
}

const USER = { id: 'u-1', email: 'reader@example.com' };
// Complete enough for the SDK's parseSessionData, so a refresh also takes the second write path
// (minting the session_data cache cookie), not just the session_token one.
const NOW = '2026-09-13T00:00:00.000Z';
const REFRESHED = {
  session: { id: 's-1', userId: USER.id, token: 'fresh', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: NOW, updatedAt: NOW },
  user: { ...USER, createdAt: NOW, updatedAt: NOW },
};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.NEON_AUTH_BASE_URL = 'https://auth.invalid/neondb/auth';
  process.env.NEON_AUTH_COOKIE_SECRET = 'x'.repeat(32);
  request.headers = new Headers({ cookie: `${TOKEN}=stale`, origin: 'https://ancientpaths.app' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('session check during a page render', () => {
  it('a stale session cookie reads as signed out, not as an auth outage', async () => {
    request.cookies = pageRenderCookies();
    vi.stubGlobal('fetch', upstream(null, `${TOKEN}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`));
    await expect(currentUser()).resolves.toBeNull();
  });

  it('a session refreshed mid-render still resolves to the reader', async () => {
    request.cookies = pageRenderCookies();
    vi.stubGlobal('fetch', upstream(REFRESHED, `${TOKEN}=fresh; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`));
    await expect(currentUser()).resolves.toEqual(USER);
  });

  it('any other cookie-write failure still surfaces', async () => {
    const boom = new Error('disk on fire');
    request.cookies = { set: () => { throw boom; } };
    vi.stubGlobal('fetch', upstream(REFRESHED, `${TOKEN}=fresh; Path=/`));
    const err = await currentUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthServiceUnavailableError);
    expect((err as Error).cause).toBe(boom);
  });

  // A guard, not a red-proof of this fix: it passes on the old instance too. It pins that the new
  // instance still turns an unreachable auth server into D43's outage error rather than null.
  it('an unreachable auth server is still an outage, not a signed-out reader (D43)', async () => {
    request.cookies = pageRenderCookies();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
    }));
    const err = await currentUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthServiceUnavailableError);
    expect((err as Error).cause).toMatchObject({ status: 502 });
  });
});

describe('session check in a route handler', () => {
  it('still writes the refreshed cookie and the session_data cache cookie', async () => {
    const jar = new ResponseCookies(new Headers());
    request.cookies = jar;
    vi.stubGlobal('fetch', upstream(REFRESHED, `${TOKEN}=fresh; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`));
    await expect(currentUser()).resolves.toEqual(USER);
    expect(jar.get(TOKEN)?.value).toBe('fresh');
    expect(jar.get(SESSION_DATA)?.value).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // a signed JWT
  });
});
