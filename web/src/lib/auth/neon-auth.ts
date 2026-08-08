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

function config() {
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
