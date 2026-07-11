// Guards the fail-CLOSED site gate decision (web/src/lib/gate.ts, used by
// middleware.ts). The critical property: a missing SITE_PASSWORD must DENY in
// production, never expose — while local dev keeps running gate-free.

import { describe, expect, it } from 'vitest';
import { gateDecision } from '../web/src/lib/gate';

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
