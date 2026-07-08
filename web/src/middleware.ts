import type { NextRequest } from 'next/server';
import { getAuth } from '@/lib/auth/server';

// Defer auth construction to request time (see lib/auth/server.ts) so the build
// does not require NEON_AUTH_* env.
export default function middleware(req: NextRequest) {
  return getAuth().middleware({ loginUrl: '/auth/sign-in' })(req);
}

export const config = {
  matcher: ['/account/:path*'],
};
