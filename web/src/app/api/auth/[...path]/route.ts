import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/better-auth';

// Better Auth's own handler, mounted locally. Previously this proxied to a better-auth server
// hosted by Neon, which is why GHSA-g38m could not be closed from here (docs/SECURITY.md SEC-1).
//
// The handler is built per request rather than at module load for the same reason the auth
// instance is lazy: `next build` collects page data for this route with no APP_DATABASE_URL in the
// environment, and constructing eagerly is exactly how the previous wiring broke the build.

export const runtime = 'nodejs';

export function GET(req: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(req);
}

export function POST(req: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(req);
}
