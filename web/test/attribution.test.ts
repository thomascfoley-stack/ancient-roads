// Campaign attribution — first-party, allowlisted, first-touch.
//
// Two properties, both red-provable:
//   1. THE ALLOWLIST HOLDS. Campaign keys survive; everything else is dropped. This lands in a
//      PUBLIC unauthenticated INSERT on a table `app_runtime` can never read back or clean, so an
//      unlisted key becoming unbounded attacker text is a one-way problem.
//      SEED: swap the filter for a denylist → the unknown-key tests go red.
//   2. FIRST TOUCH WINS. The campaign is on the URL when the reader ARRIVES and gone once they
//      navigate. If a later page overwrote it, most real signups would record "no campaign" while
//      appearing to work — the failure mode this whole module exists to prevent.
//      SEED: drop the `if (existing) return` branch in captureAttribution → the first-touch test
//      goes red.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTRIBUTION_KEY, captureAttribution, readAttribution } from '@/lib/attribution';

const SITE = 'https://ancientpaths.app';

describe('readAttribution — allowlist, not denylist', () => {
  it('keeps the utm family', () => {
    const a = readAttribution(`${SITE}/?utm_source=newsletter&utm_medium=email&utm_campaign=launch`, null);
    expect(a).toMatchObject({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'launch' });
  });

  it('keeps the newsletter and ad click ids', () => {
    expect(readAttribution(`${SITE}/?mc_cid=abc123`, null).mc_cid).toBe('abc123');
    expect(readAttribution(`${SITE}/?fbclid=fb1`, null).fbclid).toBe('fb1');
  });

  it('DROPS unknown parameters — the property a denylist would not give', () => {
    const a = readAttribution(`${SITE}/?note=something%20private&admin=1&utm_source=x`, null);
    expect(a.utm_source).toBe('x');
    expect(a.note).toBeUndefined();
    expect(a.admin).toBeUndefined();
  });

  it('caps values, so a public endpoint cannot be handed unbounded text', () => {
    const a = readAttribution(`${SITE}/?utm_source=${'x'.repeat(5000)}`, null);
    expect(a.utm_source!.length).toBeLessThanOrEqual(200);
  });

  it('records the landing path but never a query string', () => {
    const a = readAttribution(`${SITE}/why?utm_source=x`, null);
    expect(a.landing_path).toBe('/why');
    expect(JSON.stringify(a)).not.toContain('?');
  });

  it('stores only the referrer HOST — never someone else’s full URL', () => {
    // A referring URL can carry that site's own query string, which is their user's data.
    const a = readAttribution(`${SITE}/`, 'https://news.example.com/post?reader=secret');
    expect(a.referrer_host).toBe('news.example.com');
    expect(JSON.stringify(a)).not.toContain('secret');
  });

  it('ignores our own domain as a referrer', () => {
    expect(readAttribution(`${SITE}/`, `${SITE}/about`).referrer_host).toBeUndefined();
  });

  it('never throws on junk input', () => {
    expect(() => readAttribution('not a url', 'also not a url')).not.toThrow();
    expect(readAttribution('not a url', null)).toEqual({});
  });
});

describe('captureAttribution — first touch wins', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      location: { href: `${SITE}/?utm_source=newsletter`, hostname: 'ancientpaths.app' },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    vi.stubGlobal('document', { referrer: '' });
  });

  it('captures the campaign on arrival', () => {
    expect(captureAttribution().utm_source).toBe('newsletter');
    expect(JSON.parse(store.get(ATTRIBUTION_KEY)!).utm_source).toBe('newsletter');
  });

  it('KEEPS the arrival campaign after the reader navigates away from it', () => {
    captureAttribution(); // landed on /?utm_source=newsletter
    // …reads /about, where the URL carries no campaign at all, then returns and submits.
    (globalThis as unknown as { window: { location: { href: string } } }).window.location.href = `${SITE}/about`;
    expect(captureAttribution().utm_source, 'first touch must survive internal navigation').toBe('newsletter');
  });

  it('survives storage being unavailable (private mode) without throwing', () => {
    vi.stubGlobal('window', {
      location: { href: `${SITE}/?utm_source=twitter`, hostname: 'ancientpaths.app' },
      sessionStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
    });
    expect(() => captureAttribution()).not.toThrow();
    expect(captureAttribution().utm_source).toBe('twitter'); // degraded, but still correct on arrival
  });
});
