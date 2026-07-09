import type { NextRequest } from 'next/server';
import { getAuth } from '@/lib/auth/server';

// Defer auth construction to request time (see lib/auth/server.ts) so the build
// does not require NEON_AUTH_* env.
export default function middleware(req: NextRequest) {
  return getAuth().middleware({ loginUrl: '/auth/sign-in' })(req);
}

// /account/:path* was removed: its auth is enforced by requireUser() in the
// account page server component (Fix A — see WORKLOG.md). The middleware's
// Edge-runtime HTTP fallback to NEON_AUTH_BASE_URL silently failed, causing
// infinite redirect-to-login. The server component uses the local JWT cache
// (same path as annotations), which works reliably.
export const config = {
  matcher: [] as string[],
};
