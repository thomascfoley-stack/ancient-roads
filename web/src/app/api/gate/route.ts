import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { GATE_COOKIE, gateToken } from '@/lib/gate';
import { checkGateRateLimit } from '@/lib/rate-limit';

// node runtime: timingSafeEqual (node:crypto) + the neon rate-limit DB call.
export const runtime = 'nodejs';

// Constant-time password compare — a plain `!==` leaks length/prefix timing about the ONLY
// secret guarding the pre-launch site. Unequal lengths short-circuit (timingSafeEqual throws
// on length mismatch), which is fine: it reveals only that the length was wrong, not content.
function passwordMatches(attempt: string, password: string): boolean {
  const a = Buffer.from(attempt);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

// First hop of x-forwarded-for is the client IP on Vercel; fall back to x-real-ip.
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// Checks the site password and sets the gate cookie (see middleware.ts).
export async function POST(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.redirect(new URL('/', req.url));

  // Brute-force throttle BEFORE touching the password — the gate had none, so a wordlist
  // could pick the shared password with no signal (LONG_NIGHT H1). Per-IP, fail-open.
  const limit = await checkGateRateLimit(clientIp(req));
  if (!limit.ok) {
    return new NextResponse('Too many attempts. Try again later.', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) },
    });
  }

  const form = await req.formData();
  const attempt = form.get('password');
  const rawNext = form.get('next');
  const next =
    typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/';

  if (typeof attempt !== 'string' || !passwordMatches(attempt, password)) {
    const url = new URL('/gate', req.url);
    url.searchParams.set('error', '1');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
