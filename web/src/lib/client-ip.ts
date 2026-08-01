// THE CLIENT IP, RESOLVED ONCE, FROM THE HEADER THE PLATFORM CONTROLS.
//
// THE DEFECT (2026-08-02 deep audit, H13). Two routes each carried their own copy of:
//
//   const xff = req.headers.get('x-forwarded-for');
//   if (xff) return xff.split(',')[0]!.trim();
//   return req.headers.get('x-real-ip') ?? 'unknown';
//
// `x-forwarded-for` is CLIENT-SETTABLE. Nothing in this repo asserts the platform overwrites it,
// and behind any other proxy, in preview, or self-hosted it does not. So rotating one header
// defeated both throttles built on it: the public waitlist write cap, and — worse — the
// brute-force cap on the site password, which is the only barrier on the pre-launch site.
//
// Second defect in the same three lines: every genuinely header-less client shares the single
// `'unknown'` bucket, so real anonymous visitors throttle each other while a header-setting
// attacker gets a fresh bucket per value. The fallback is now a REFUSAL, not a shared key.
//
// Vercel sets `x-vercel-forwarded-for` itself and strips any inbound copy; that is the one this
// prefers. `x-forwarded-for` is accepted only as a fallback for non-Vercel deployments, and is
// read from the RIGHTMOST hop rather than the leftmost — the left is whatever the client sent,
// the right is what the nearest trusted proxy appended.

/**
 * @returns the client IP, or `null` when it cannot be determined from a trusted source.
 *   A caller that gets `null` must decide explicitly — deny, or throttle on a per-route
 *   constant — rather than silently sharing one bucket.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }): string | null {
  // 1. Platform-set, not client-settable. Vercel overwrites this on every inbound request.
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) {
    const ip = vercel.split(',')[0]?.trim();
    if (ip) return ip;
  }

  // 2. Non-Vercel deployments. RIGHTMOST hop: each proxy APPENDS the address it saw, so the
  //    last entry was written by the closest proxy and the first is attacker-controlled.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops.at(-1);
    if (last) return last;
  }

  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;

  return null;
}
