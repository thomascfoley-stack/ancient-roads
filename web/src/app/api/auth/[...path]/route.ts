import { getAuth } from '@/lib/auth/neon-auth';

// Neon Auth's own proxy handler, mounted locally (ADR-107/108). It forwards to the hosted
// better-auth server at NEON_AUTH_BASE_URL -- see docs/AUTH_CUTOVER_V2_NEON.md for why that
// reopens SEC-1.
//
// The handler is built per request rather than at module load for the same reason the auth
// instance is lazy: `next build` collects page data for this route with no auth env in the
// environment, and constructing eagerly is exactly how the previous wiring broke the build.

export const runtime = 'nodejs';

type Params = { params: Promise<{ path: string[] }> };

export function GET(req: Request, ctx: Params): Promise<Response> {
  return getAuth().handler().GET(req, ctx);
}

export function POST(req: Request, ctx: Params): Promise<Response> {
  return getAuth().handler().POST(req, ctx);
}
