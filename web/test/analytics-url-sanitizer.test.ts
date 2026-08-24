// The URL sanitizer is the single point where analytics could leak what a reader typed, and the
// single point where campaign attribution could be lost. Both properties are pinned here.
//
// WHY THIS FILE EXISTS AT ALL. The 2026-08-18 audit found `$current_url` shipping the reader's
// question verbatim (`/ask?q=…`), and the fix was to drop every query string. That was safe and it
// also made the owner's 2026-08-24 ask — attribute newsletter and social campaigns — impossible
// from the URL. The replacement is an ALLOWLIST, and an allowlist is only trustworthy if something
// proves BOTH halves: that the campaign keys survive, and that everything else dies.
//
// Seeds that turn these red:
//   * make CAMPAIGN_PARAMS empty → the "utm survives" tests go red.
//   * change the filter to a denylist (`k !== 'q'`) → the "unknown params are dropped" test goes
//     red, which is the whole point: a denylist admits every parameter nobody thought of.
//   * delete the `u.hash = ''` line → the fragment test goes red.

import { describe, expect, it } from 'vitest';
import { sanitizeUrl, stripProductText } from '@/instrumentation-client';

describe('sanitizeUrl — the reader’s words never leave, the campaign does', () => {
  it('drops the question from /ask and /search', () => {
    expect(sanitizeUrl('https://ancientpaths.app/ask?q=What%20did%20Calvin%20say%20about%20grace'))
      .toBe('https://ancientpaths.app/ask');
    expect(sanitizeUrl('https://ancientpaths.app/search?q=infant%20baptism&catalog=sermons'))
      .toBe('https://ancientpaths.app/search');
  });

  it('drops a question smuggled through the gate’s next parameter', () => {
    // The nested-encoding case the original audit called out by name.
    expect(sanitizeUrl('https://ancientpaths.app/gate?next=%2Fask%3Fq%3Dis%2520God%2520cruel'))
      .toBe('https://ancientpaths.app/gate');
  });

  it('KEEPS utm parameters — this is what campaign attribution reads', () => {
    const out = sanitizeUrl('https://ancientpaths.app/?utm_source=newsletter&utm_medium=email&utm_campaign=launch');
    expect(out).toContain('utm_source=newsletter');
    expect(out).toContain('utm_medium=email');
    expect(out).toContain('utm_campaign=launch');
  });

  it('keeps the ad/newsletter click ids (mailchimp, google, meta)', () => {
    for (const [k, v] of [['mc_cid', 'abc123'], ['gclid', 'xyz'], ['fbclid', 'fb1']] as const) {
      expect(sanitizeUrl(`https://ancientpaths.app/?${k}=${v}`)).toContain(`${k}=${v}`);
    }
  });

  it('keeps campaign params AND drops product params in the same URL', () => {
    // The mixed case is the one a denylist gets wrong.
    const out = sanitizeUrl('https://ancientpaths.app/ask?utm_source=twitter&q=secret%20question');
    expect(out).toContain('utm_source=twitter');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('q=');
  });

  it('drops UNKNOWN parameters — the allowlist property, not a denylist', () => {
    // `note` is not on any list. An allowlist drops it; a denylist would ship it.
    expect(sanitizeUrl('https://ancientpaths.app/study?note=my%20private%20title'))
      .toBe('https://ancientpaths.app/study');
  });

  it('drops the fragment, which is also reader-controlled', () => {
    expect(sanitizeUrl('https://ancientpaths.app/read/john/3#my-note')).toBe('https://ancientpaths.app/read/john/3');
  });

  it('handles a relative pathname without throwing (the $pathname property)', () => {
    expect(sanitizeUrl('/ask?q=hidden')).toBe('/ask');
  });
});

describe('stripProductText — applied to every event, not just pageviews', () => {
  it('sanitizes every URL-bearing property', () => {
    const out = stripProductText({
      $current_url: 'https://ancientpaths.app/ask?q=leak&utm_source=newsletter',
      $referrer: 'https://ancientpaths.app/search?q=leak',
      $pathname: '/ask?q=leak',
      $initial_current_url: 'https://ancientpaths.app/?q=leak&utm_campaign=spring',
      $initial_referrer: 'https://news.example.com/post?q=leak',
    });
    expect(JSON.stringify(out)).not.toContain('leak');
    // …while the campaign keys on those same URLs survive.
    expect(out.$current_url).toContain('utm_source=newsletter');
    expect(out.$initial_current_url).toContain('utm_campaign=spring');
  });

  it('deletes the autocapture element properties even though autocapture is off', () => {
    const out = stripProductText({
      $el_text: 'My private study title',
      $elements: [{ text: 'x' }],
      $elements_chain: 'div>span',
      $selected_content: 'a quoted passage',
    });
    expect(Object.keys(out)).toEqual([]);
  });

  it('leaves posthog’s own top-level campaign properties untouched', () => {
    // These are what the UTM dashboards actually read: posthog-js sends them as separate
    // properties, independent of the URL. If a future edit started filtering unknown keys
    // wholesale, this would go red.
    const out = stripProductText({ utm_source: 'newsletter', utm_campaign: 'launch', mc_cid: 'abc' });
    expect(out).toEqual({ utm_source: 'newsletter', utm_campaign: 'launch', mc_cid: 'abc' });
  });
});
