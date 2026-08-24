// Campaign attribution, first-party and vendor-free (migration 130).
//
// THE ONLY THING THAT MAKES THIS WORK IS *WHEN* IT IS READ. A reader clicks the newsletter link,
// lands on `/?utm_source=newsletter`, reads /about and /why, comes back, and signs up. By then the
// address bar has no campaign on it at all. Reading `window.location` at submit time therefore
// records "came from nowhere" for most real signups — while looking like it works, which is worse
// than not measuring. So the campaign is captured on ARRIVAL and kept until the form is submitted.
//
// No vendor identifier is stored anywhere in this path. The owner's requirement was "should be
// ancient paths dependent"; a PostHog distinct_id in the schema would be a vendor key doing
// load-bearing work, and it also decays (Safari expires the cookie weekly, ad-blockers suppress it
// entirely, `person_profiles: 'identified_only'` means an anonymous visitor has no profile to point
// at). This keeps only what the campaign link itself carried.

/** Campaign keys worth keeping. ALLOWLIST, not a denylist: an unlisted parameter is dropped, so a
 *  key nobody anticipated costs a breakdown rather than becoming unbounded attacker-controlled
 *  text in a table that nothing can later read or clean. Mirrors the sanitizer in
 *  instrumentation-client.ts, and `mc_cid` is the Mailchimp one that matters for a newsletter. */
const CAMPAIGN_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'gad_source', 'fbclid', 'msclkid', 'twclid', 'ttclid', 'igshid',
  'li_fat_id', 'rdt_cid', 'mc_cid', 'mc_eid',
] as const;

/** Values are capped hard. This lands in a public, unauthenticated INSERT on a table the runtime
 *  cannot read or clean, so an unbounded string is a one-way problem. */
const MAX_VALUE = 200;
/** A referrer host, at most. Never the full referring URL — that can carry someone else's query
 *  string, which is their user's data, not ours to store. */
const MAX_HOST = 253;

export type Attribution = Record<string, string>;

/** Session key. `sessionStorage`, not `localStorage`: attribution belongs to THIS visit, and a
 *  campaign remembered for months would credit a newsletter for a signup that happened long after
 *  the reader forgot it. */
export const ATTRIBUTION_KEY = 'ap_attribution';

/** Parse an allowlisted, length-capped attribution bag out of a URL and a referrer. Pure, so the
 *  test can assert it without a browser. */
export function readAttribution(url: string, referrer: string | null | undefined): Attribution {
  const out: Attribution = {};
  try {
    const u = new URL(url);
    for (const key of CAMPAIGN_KEYS) {
      const v = u.searchParams.get(key);
      if (v) out[key] = v.slice(0, MAX_VALUE);
    }
    // The page they arrived on is genuinely useful ("which essay converts") and is our own path,
    // never a query string.
    if (u.pathname && u.pathname !== '/') out.landing_path = u.pathname.slice(0, MAX_VALUE);
  } catch {
    // Unparseable URL: no attribution rather than a guess.
  }
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      // Our own pages are not a referral source; recording them would drown the real ones.
      if (host && host !== new URL(url).hostname) out.referrer_host = host.slice(0, MAX_HOST);
    } catch {
      // Not a URL — drop it.
    }
  }
  return out;
}

/** Capture on arrival, once per session, and return whatever is stored. Browser-only. */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const existing = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    // FIRST touch of the session wins. A reader who lands from the newsletter and then navigates
    // internally must not have the campaign overwritten by an empty bag on the next page.
    if (existing) return JSON.parse(existing) as Attribution;
    const fresh = readAttribution(window.location.href, document.referrer);
    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    // Storage blocked (private mode, or a browser setting). Attribution is a nice-to-have; a
    // signup must still work, so fall back to whatever this page can see.
    try {
      return readAttribution(window.location.href, document.referrer);
    } catch {
      return {};
    }
  }
}
