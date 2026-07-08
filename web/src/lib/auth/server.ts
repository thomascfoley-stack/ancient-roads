import { createNeonAuth } from '@neondatabase/auth/next/server';

// Lazily construct the auth client. createNeonAuth() requires NEON_AUTH_* env at
// construction time; if it runs at module load, `next build` fails while
// collecting page data for API routes when those env vars aren't present in the
// build environment. Deferring to first request keeps the build independent of
// runtime secrets (which are set in the Vercel project for runtime use).
let _auth: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    _auth = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      },
    });
  }
  return _auth;
}
