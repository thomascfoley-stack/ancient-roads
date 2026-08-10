// ★ THE FLIP GATE — this is the check that must pass BEFORE Vercel Deployment Protection is
// turned off. Once that SSO layer is gone, the SITE_PASSWORD middleware is the ONLY lock on the
// copyrighted corpus (public/bible, public/commentaries) and the whole gated app. This asserts
// the allowlist is AIRTIGHT: the public marketing tier is reachable, everything else redirects
// to /gate. A too-broad allowlist here = public copyright exposure on the next config click.
//
// Runs the ACTUAL middleware (not just isPublicPath) with the gate armed (SITE_PASSWORD set,
// prod mode, no cookie). Red-first proof: widen gate.ts PUBLIC_PATHS to a prefix match and the
// "corpus stays gated" cases go RED. NOTE: middleware can behave differently DEPLOYED — the
// live curl checks in docs/OWNER_ACTIONS.md §1 are the deployment-side twin of this test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from '@/middleware';

const saved = { pw: process.env.SITE_PASSWORD, env: process.env.NODE_ENV };
beforeAll(() => {
  process.env.SITE_PASSWORD = 'test-password'; // arm the gate
  (process.env as { NODE_ENV: string }).NODE_ENV = 'production'; // prod = gate enforced
});
afterAll(() => {
  process.env.SITE_PASSWORD = saved.pw;
  (process.env as { NODE_ENV: string | undefined }).NODE_ENV = saved.env;
});

// Returns '/gate' when the request is redirected to the gate, or null when it is allowed through
// (NextResponse.next() carries no Location header). Unauthenticated: no gate cookie is set.
async function gateOutcome(path: string, method = 'GET'): Promise<string | null> {
  const res = await middleware(new NextRequest(new URL(`http://localhost${path}`), { method }));
  const loc = res.headers.get('location');
  return loc ? new URL(loc).pathname : null;
}

describe('middleware allowlist — the marketing flip gate', () => {
  it('SERVES the public marketing tier unauthenticated (no redirect)', async () => {
    // hero-road.jpg is the marketing hero image: dev runs gate-free, so an asset missing
    // from the allowlist only breaks in PROD (it 307'd to /gate on the live site, 2026-07-16).
    for (const p of [
      '/', '/about', '/features', '/why', '/api/waitlist', '/hero-road.jpg',
      // The 2026-08-08 redesign's photography — same lesson as hero-road.jpg above.
      '/marketing/hero-path.jpg', '/marketing/hero-ground.jpg', '/marketing/steps-fog.jpg',
      '/marketing/forest-dusk-1.jpg', '/marketing/forest-dusk-2.jpg',
    ]) {
      expect(await gateOutcome(p), `${p} must be public`).toBeNull();
    }
  });

  it('GATES the copyrighted corpus (public/bible + public/commentaries)', async () => {
    for (const p of ['/commentaries/john.json', '/commentaries/x/y.json', '/bible/kjv/jhn.json', '/bible/lsv/gen.json']) {
      expect(await gateOutcome(p), `${p} must redirect to the gate`).toBe('/gate');
    }
  });

  it('GATES the app + user data + API (unauth GET redirects to /gate)', async () => {
    for (const p of ['/read/jhn/1', '/read', '/library/notes', '/home', '/settings', '/ask', '/api/ask', '/api/annotations']) {
      expect(await gateOutcome(p), `${p} must redirect to the gate`).toBe('/gate');
    }
  });
});
