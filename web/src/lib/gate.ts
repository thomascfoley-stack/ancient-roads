// Shared pieces of the pre-launch site password gate (see middleware.ts).
// Edge- and Node-safe: uses WebCrypto only.

export const GATE_COOKIE = 'site_gate';

// The PUBLIC tier — paths served OUTSIDE the SITE_PASSWORD wall (the front-facing
// marketing site). Everything else (the reader, /ask, library, settings) stays gated.
// ★ Keep this set TINY and EXACT-MATCH: every entry is a hole in the wall, and a broad
// prefix could accidentally expose the app. `/` + `/about` are the marketing pages;
// `/api/waitlist` is the public waitlist capture. Exact match only — '/' never matches
// '/read', and no entry may be a prefix of a corpus/app route. Guarded by
// test/middleware-gate.test.ts (corpus stays gated) — DO NOT widen without that staying green.
const PUBLIC_PATHS = new Set([
  '/',
  '/about',
  '/features',
  '/why',
  '/api/waitlist',
  // The marketing hero image. Static assets the PUBLIC pages render must be listed here
  // too: dev runs gate-free so a missing entry only breaks in production (the photo 307'd
  // to /gate on the live site, 2026-07-16). Corpus data (/bible, /commentaries) stays gated.
  '/hero-road.jpg',
  // The 2026-08-08 marketing redesign's photography. hero-path.jpg is iStock #1337429689
  // (owner-purchased, standard license, no credit required — see app/page.tsx). The
  // other three are AI-generated. Exact-match entries, same rule as above.
  '/marketing/hero-path.jpg',
  '/marketing/hero-ground.jpg',
  '/marketing/steps-fog.jpg',
  '/marketing/forest-dusk-1.jpg',
  '/marketing/forest-dusk-2.jpg',
]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

// The human-facing subset of PUBLIC_PATHS: the marketing PAGES, without the waitlist API or the
// image assets. DERIVED, never typed — `app/sitemap.ts` publishes this list, and a hand-kept copy
// would eventually advertise a URL the gate answers with a 307, or worse, name a gated route.
// Adding an entry to PUBLIC_PATHS above is the only way to add one here, which is the intent:
// the sitemap can never claim more than the wall actually serves.
export const PUBLIC_MARKETING_ROUTES: string[] = [...PUBLIC_PATHS].filter(
  (p) => !p.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(p),
);

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
