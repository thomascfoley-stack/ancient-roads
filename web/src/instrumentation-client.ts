// PostHog — AFTER-THE-FACT ANALYTICS ONLY, deliberately not embedded in the product.
//
// Owner ruling 2026-08-18: "It shouldn't be deeply embedded in the product at all. It should be
// after-the-fact analytics. If PostHog doesn't work, I don't care, but it should never be embedded
// in the product or any of our product docs."
//
// WHAT THAT RULED OUT, and why each was a real exposure rather than a style preference. The
// 2026-08-18 pre-deploy audit found four HIGHs in the previous shape, all of which came from the
// same root — analytics wired *through* the product instead of beside it:
//
//   1. The same-origin `/ingest` reverse proxy put a third-party tunnel on our own domain, inside
//      our own gate. Next proxies external rewrites through `http-proxy`, whose `setupOutgoing`
//      copies EVERY request header verbatim (only `host` is replaced). Beacons were same-origin, so
//      the browser attached `site_gate` — the bearer credential for the entire pre-launch wall —
//      and the Neon Auth session cookie to every event. Removed: PostHog now talks to its own
//      origin, cross-origin, where the browser sends no cookies of ours.
//   2. That same proxy made `connect-src 'self'` a wildcard tunnel to a third party, i.e. an
//      exfiltration channel that CSP could not see. Removed with it. CSP now names the PostHog
//      origin explicitly — a narrow, auditable allowance instead of a hole in `'self'`.
//   3. `capture_pageview` shipped `$current_url` verbatim, and the readers navigate to
//      `/ask?q=What have commentators said about "<up to 220 chars of the reader's selection>"`.
//      The reader's question left the page as a URL. Off, and belt-and-braces stripped below.
//   4. `autocapture` shipped `$el_text` — the user's own study titles and the filenames of
//      documents they uploaded privately under Lane B. Off.
//
// WHAT IS LEFT is the smallest thing that is still analytics: explicit events, sent to PostHog's
// own host, carrying no product text. Nothing here reads a page, a selection, a query or a title.
//
// If it does not work — blocked by an ad-blocker, a missing key, a CSP the owner later narrows —
// the product is unaffected by design. `posthog-js` is loaded for its side effect only; no product
// code imports it, and nothing awaits it.
import posthog from 'posthog-js';

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Strip anything that could carry product text off an event before it leaves the browser.
 *
 *  `$current_url` is attached to EVERY event, not only pageviews — turning `capture_pageview` off
 *  is necessary and not sufficient. The query string is where the reader's question lives
 *  (`/ask?q=…`, `/search?q=…`, and `/gate?next=%2Fask%3Fq%3D…`), so it is dropped rather than
 *  trusted, on every event, including ones added later by someone who has not read this file. */
function stripProductText(properties: Record<string, unknown>): Record<string, unknown> {
  const out = { ...properties };
  for (const k of ['$current_url', '$referrer', '$pathname', '$initial_current_url', '$initial_referrer']) {
    const v = out[k];
    if (typeof v === 'string') out[k] = v.split('?')[0]!.split('#')[0]!;
  }
  // Autocapture is off, so these should never appear; deleted anyway, because "should never" is
  // not a mechanism and a future config change is exactly how they would come back.
  for (const k of ['$el_text', '$elements', '$elements_chain', '$selected_content']) delete out[k];
  return out;
}

if (key) {
  posthog.init(key, {
    // PostHog's OWN origin. Not '/ingest' — see the header. Cross-origin means our cookies stay ours.
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_HOST,
    // Anonymous stays anonymous: no person record until identify(), which nothing in this tree calls.
    person_profiles: 'identified_only',
    // The three product-content channels, all explicitly off rather than left at their defaults —
    // every one of them defaults to ON in posthog-js.
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    // Error tracking is the one thing the observability gap actually asked for. Kept, and still
    // filtered by the sanitiser below, because an exception message can quote user input.
    capture_exceptions: true,
    sanitize_properties: stripProductText,
  });
}
