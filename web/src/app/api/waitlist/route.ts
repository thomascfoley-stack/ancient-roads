import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { checkGateRateLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/observability';
import { clientIp } from '@/lib/client-ip';

// node runtime: the neon DB insert. This route is PUBLIC (gate.ts isPublicPath), so it must
// validate and rate-limit its own input, because nothing upstream gates it.
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


export async function POST(req: NextRequest) {
  // Per-IP throttle before any work. A public write endpoint with no gate in front.
  // A public write with no trusted origin: throttle it on one shared bucket rather than
  // refusing, because a legitimate visitor behind an unusual proxy should still be able to
  // leave an email — but they share a cap rather than each getting a free one.
  const limit = await checkGateRateLimit(clientIp(req) ?? 'no-trusted-ip');
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
