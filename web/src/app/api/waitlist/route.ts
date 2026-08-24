import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { checkGateRateLimit } from '@/lib/rate-limit';
import { logEvent } from '@/lib/observability';
import { clientIp } from '@/lib/client-ip';
import { truncateCodePoints } from '@/lib/text';

// node runtime: the neon DB insert. This route is PUBLIC (gate.ts isPublicPath), so it must
// validate and rate-limit its own input, because nothing upstream gates it.
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Campaign keys the server will persist. The client sends an allowlisted bag already; this is the
 *  edge re-validating it anyway, because a public endpoint trusts nothing it is handed and these
 *  rows land in a table `app_runtime` can never read back or clean up. Same list as
 *  lib/attribution.ts, deliberately duplicated on the trust boundary rather than imported from the
 *  client module — the client's copy is a convenience, this one is the rule. */
const ALLOWED_ATTRIBUTION_KEYS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'gad_source', 'fbclid', 'msclkid', 'twclid', 'ttclid', 'igshid',
  'li_fat_id', 'rdt_cid', 'mc_cid', 'mc_eid',
  'landing_path', 'referrer_host',
]);
const MAX_ATTRIBUTION_VALUE = 200;
/** Bounds the whole bag, so a caller cannot post 16 keys of maximum length forever. */
const MAX_ATTRIBUTION_KEYS = 20;

/** Keep known keys with string values, capped; drop everything else. Never throws. */
function sanitizeAttribution(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_ATTRIBUTION_KEYS) break;
    if (!ALLOWED_ATTRIBUTION_KEYS.has(k)) continue;
    if (typeof v !== 'string' || v === '') continue;
    out[k] = truncateCodePoints(v, MAX_ATTRIBUTION_VALUE);
  }
  return out;
}


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
  let attribution: Record<string, string> = {};
  let consent: string | null = null;
  try {
    const body = (await req.json()) as { email?: unknown; attribution?: unknown; consent?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    attribution = sanitizeAttribution(body.attribution);
    consent = typeof body.consent === 'string' ? truncateCodePoints(body.consent, 500) : null;
  } catch {
    // fall through to validation
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ message: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    const sql = getDb();
    // ONE ROW PER SUBMISSION — the table is an append-only signup log as of migration 130.
    //
    // WHAT CHANGED, AND WHY IT IS A REPAIR. `waitlist` used to carry UNIQUE(email), and this
    // block caught the resulting 23505 to make a repeat signup look like success. That was
    // friendly to the visitor and silently destructive to the data: the second submission was
    // discarded WHOLE, including the campaign that produced it. Someone arriving from the
    // newsletter, signing up, then returning two weeks later via a Twitter ad recorded zero
    // conversions for Twitter. It was also unfixable in place — 033 revoked UPDATE and 034 grants
    // no UPDATE policy, so nothing could amend the row it had just refused.
    //
    // With no unique constraint there is no conflict to catch, so the 23505 branch is gone.
    // De-duplication moves to the owner-side export (DISTINCT ON (email)), which is where it
    // belongs: `app_runtime` cannot read this table at all, by design, and that stays true.
    //
    // Still no `RETURNING` and still no `ON CONFLICT`: both need the proposed row to be
    // SELECT-visible under RLS, and the INSERT-only policy deliberately withholds that.
    const attributionJson = JSON.stringify(attribution);
    await sql`INSERT INTO waitlist (email, source, attribution, consent_text)
              VALUES (${email}, 'landing', ${attributionJson}::jsonb, ${consent})`;
    // Observability only. Deliberately NO email in the log (PII stays out of logs) — the campaign
    // is safe to log because it describes the link, not the person.
    logEvent('waitlist_signup', {
      domain: email.split('@')[1] ?? 'unknown',
      utm_source: attribution.utm_source ?? 'none',
    });
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
