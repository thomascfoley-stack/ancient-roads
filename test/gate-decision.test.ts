// Guards the fail-CLOSED site gate decision (web/src/lib/gate.ts, used by
// middleware.ts). The critical property: a missing SITE_PASSWORD must DENY in
// production, never expose — while local dev keeps running gate-free.

import { describe, expect, it } from 'vitest';
import { gateDecision, isPublicPath } from '../web/src/lib/gate';

describe('gateDecision (fail-closed site gate)', () => {
  it('FAILS CLOSED in production when the password is unset/empty', () => {
    expect(gateDecision({ password: undefined, isProd: true, method: 'GET', cookieValid: false })).toBe('deny503');
    expect(gateDecision({ password: '', isProd: true, method: 'POST', cookieValid: false })).toBe('deny503');
  });
  it('allows in dev when the password is unset (does not brick local dev)', () => {
    expect(gateDecision({ password: undefined, isProd: false, method: 'GET', cookieValid: false })).toBe('allow');
    expect(gateDecision({ password: undefined, isProd: false, method: 'POST', cookieValid: false })).toBe('allow');
  });
  it('allows any method with a valid gate cookie', () => {
    expect(gateDecision({ password: 'p', isProd: true, method: 'POST', cookieValid: true })).toBe('allow');
    expect(gateDecision({ password: 'p', isProd: false, method: 'GET', cookieValid: true })).toBe('allow');
  });
  it('redirects GET/HEAD without a valid cookie', () => {
    expect(gateDecision({ password: 'p', isProd: true, method: 'GET', cookieValid: false })).toBe('redirect');
    expect(gateDecision({ password: 'p', isProd: true, method: 'HEAD', cookieValid: false })).toBe('redirect');
  });
  it('401s a non-GET without a valid cookie (e.g. POST /api/ask through the wall)', () => {
    expect(gateDecision({ password: 'p', isProd: true, method: 'POST', cookieValid: false })).toBe('locked401');
  });
});

// The public tier (marketing landing + waitlist) sits OUTSIDE the SITE_PASSWORD wall. The
// hazard is over-exposure: a too-broad allowlist would leak the gated app. These pin the
// carve-out to EXACTLY the marketing root + the waitlist endpoint — every app route stays
// gated. Seed a bug (return true broadly, or add a prefix match) and the app-route cases go RED.
describe('isPublicPath (the marketing carve-out — must stay tiny + exact)', () => {
  it('serves the marketing root, /about, and the waitlist endpoint publicly', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isPublicPath('/about')).toBe(true);
    expect(isPublicPath('/api/waitlist')).toBe(true);
  });
  it('keeps EVERY app route gated (no prefix leak)', () => {
    for (const p of ['/home', '/read/jhn/1', '/ask', '/settings', '/api/ask', '/api/gate', '/read', '/homepage']) {
      expect(isPublicPath(p), `${p} must stay behind the wall`).toBe(false);
    }
  });
});
