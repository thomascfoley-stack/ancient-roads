import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { GATE_COOKIE, gateToken } from '@/lib/gate';
import { checkGateRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';
import { apiError } from '@/lib/api-error';

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


// Checks the site password and sets the gate cookie (see middleware.ts).
export async function POST(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.redirect(new URL('/', req.url));

  // Brute-force throttle BEFORE touching the password — the gate had none, so a wordlist
  // could pick the shared password with no signal (LONG_NIGHT H1). Per-IP, fail-open.
  // No trusted IP means no per-client throttle is possible. On the site-password gate that is
  // a REFUSAL, not a shared 'unknown' bucket: this is the only barrier on the pre-launch site,
  // and an unthrottled password check is exactly what the throttle exists to prevent
  // (2026-08-02 deep audit, H13).
  const ip = clientIp(req);
  if (ip === null) return apiError('GATE_LOCKED', { message: 'Could not verify the request origin.' });
  const limit = await checkGateRateLimit(ip);
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
      : '/home';

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
