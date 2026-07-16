// Shared pieces of the pre-launch site password gate (see middleware.ts).
// Edge- and Node-safe: uses WebCrypto only.

export const GATE_COOKIE = 'site_gate';

// The PUBLIC tier — paths served OUTSIDE the SITE_PASSWORD wall (the front-facing
// marketing site). Everything else (the reader, /ask, library, settings) stays gated.
// ★ Keep this set TINY and EXACT-MATCH: every entry is a hole in the wall, and a broad
// prefix could accidentally expose the app. `/` is the marketing landing; `/api/waitlist`
// is the public waitlist capture. Exact match only — '/' never matches '/read'.
const PUBLIC_PATHS = new Set(['/', '/api/waitlist']);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

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
