// Shared pieces of the pre-launch site password gate (see middleware.ts).
// Edge- and Node-safe: uses WebCrypto only.

export const GATE_COOKIE = 'site_gate';

export async function gateToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`ancient-paths-gate:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type GateAction = 'allow' | 'deny503' | 'redirect' | 'locked401';

// Pure, edge-safe gate decision (unit-tested in test/gate-decision.test.ts). The
// key rule: a MISSING gate password FAILS CLOSED in production (deny503) — one
// unset/typo'd SITE_PASSWORD must never silently expose the whole app (the
// 2026-07-09 incident). Local dev (isProd=false) keeps running gate-free.
export function gateDecision(opts: {
  password: string | undefined;
  isProd: boolean;
  method: string;
  cookieValid: boolean;
}): GateAction {
  const { password, isProd, method, cookieValid } = opts;
  if (!password) return isProd ? 'deny503' : 'allow';
  if (cookieValid) return 'allow';
  return method === 'GET' || method === 'HEAD' ? 'redirect' : 'locked401';
}
