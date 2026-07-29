import { getAuth } from '@/lib/auth/server';

// Defer auth construction to request time (see lib/auth/server.ts) so the build
// does not require NEON_AUTH_* env when collecting page data for this route.
type Handler = (req: Request, ctx: unknown) => Response | Promise<Response>;

export function GET(req: Request, ctx: unknown) {
  return (getAuth().handler().GET as unknown as Handler)(req, ctx);
}

export function POST(req: Request, ctx: unknown) {
  return (getAuth().handler().POST as unknown as Handler)(req, ctx);
}
