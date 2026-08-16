import { getAuth } from '@/lib/auth/neon-auth';
import { checkAuthRateLimit, isAuthLimitedPath } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';

// Neon Auth's own proxy handler, mounted locally (ADR-107/108). It forwards to the hosted
// better-auth server at NEON_AUTH_BASE_URL -- see docs/AUTH_CUTOVER_V2_NEON.md for why that
// reopens SEC-1.
//
// The handler is built per request rather than at module load for the same reason the auth
// instance is lazy: `next build` collects page data for this route with no auth env in the
// environment, and constructing eagerly is exactly how the previous wiring broke the build.

export const runtime = 'nodejs';

type Params = { params: Promise<{ path: string[] }> };

// Rate limiting sits IN FRONT OF the proxy, not inside better-auth — the hosted instance
// is a process we do not run, so A1-2's storage adapter had no plugin point (the finding
// in docs/UX_REMEDIATION.md §9). This is the route-wrapper placement, matching how
// /api/gate and /api/ask already throttle in-handler; middleware.ts stays Edge-light and
// DB-free by its own declared contract.
//
// Returns the 429 to short-circuit with, or null to forward. Same response shape as the
// site gate's throttle: loud Retry-After, nothing about internals in the body.
async function denied(req: Request): Promise<Response | null> {
  if (req.method !== 'POST') return null;
  if (!isAuthLimitedPath(new URL(req.url).pathname)) return null;

  // clientIp can return null off-platform (no trusted header). On the auth path that is
  // NOT a refusal (local dev and previews must keep working — unlike the pre-launch site
  // gate, the credential itself is the barrier here), so headerless clients share one
  // constant bucket: a headerless attacker throttles himself, and the shared bucket is
  // the deliberate trade, per client-ip.ts's contract that callers choose explicitly.
  const ip = clientIp(req) ?? 'no-trusted-ip';

  // The body is read ONLY to key the per-email bucket (credential stuffing rotates IPs
  // behind one account). clone() leaves the real body untouched for the proxied handler;
  // a non-JSON body is not an error here — it just means no email to key on.
  let email: string | null = null;
  try {
    const body: unknown = await req.clone().json();
    if (body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string') {
      email = (body as { email: string }).email;
    }
  } catch {
    email = null;
  }

  const limit = await checkAuthRateLimit(ip, email);
  if (limit.ok) return null;
  return new Response('Too many attempts. Try again later.', {
    status: 429,
    headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) },
  });
}

export function GET(req: Request, ctx: Params): Promise<Response> {
  return getAuth().handler().GET(req, ctx);
}

export async function POST(req: Request, ctx: Params): Promise<Response> {
  const limited = await denied(req);
  if (limited) return limited;
  return getAuth().handler().POST(req, ctx);
}
