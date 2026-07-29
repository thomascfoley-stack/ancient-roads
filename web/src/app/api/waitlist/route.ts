import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { checkGateRateLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/observability';

// node runtime: the neon DB insert. This route is PUBLIC (gate.ts isPublicPath), so it must
// validate and rate-limit its own input, because nothing upstream gates it.
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// First hop of x-forwarded-for is the client IP on Vercel; fall back to x-real-ip.
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: NextRequest) {
  // Per-IP throttle before any work. A public write endpoint with no gate in front.
  const limit = await checkGateRateLimit(clientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { message: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) } },
    );
  }

  let email = '';
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    // fall through to validation
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ message: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    const sql = getDb();
    await sql`
      INSERT INTO waitlist (email, source) VALUES (${email}, 'landing')
      ON CONFLICT (email) DO NOTHING
    `;
    // Observability only. Deliberately NO email in the log (PII stays out of logs).
    logEvent('waitlist_signup', { domain: email.split('@')[1] ?? 'unknown' });
    return NextResponse.json({ message: "You're on the list. We'll be in touch." });
  } catch (e) {
    // Fail-soft: never leak DB internals to a visitor; keep the message friendly.
    console.error('[waitlist] insert failed:', (e as Error).message);
    return NextResponse.json(
      { message: "We couldn't reach the list just now. Please try again soon." },
      { status: 503 },
    );
  }
}
