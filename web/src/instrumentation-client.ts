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
// WHAT IS LEFT is the smallest thing that is still analytics: pageviews and explicit events, sent
// to PostHog's own host, carrying no product text. Nothing here reads a selection or a title.
//
// If it does not work — blocked by an ad-blocker, a missing key, a CSP the owner later narrows —
// the product is unaffected by design. `posthog-js` is loaded for its side effect only; product
// code reaches it ONLY through lib/analytics.ts's closed event union, and nothing awaits it.
//
// ── PAGEVIEWS ARE ON AGAIN (2026-08-24, owner directive) ───────────────────────────────────────
// The owner asked for DAU, 7-day churn, and campaign attribution (newsletter / social → app).
// All three need one thing this file had switched off: an event per visit. So `capture_pageview`
// is back — but NOT as it was. Defect 3 above was real: `$current_url` shipped the reader's
// question verbatim. What changed is the MECHANISM, not the appetite for risk.
//
// The old fix dropped the whole query string. That was safe and it was also why campaign
// attribution could never work from the URL. The new fix is an ALLOWLIST: campaign parameters
// survive, everything else is dropped — `q` included, on every event, forever. An allowlist fails
// in the SAFE direction by construction: a parameter nobody thought about is dropped, not kept,
// so the worst case of an incomplete list is a missing dashboard breakdown, never a leaked
// question. A denylist would fail the other way, which is why this is not one.
import posthog from 'posthog-js';

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Campaign parameters that may survive into a URL property.
 *
 *  This mirrors posthog-js's own campaign-params list (it already sends these as SEPARATE
 *  top-level properties, which is what the UTM dashboards actually read) plus `mc_eid` for
 *  Mailchimp. Keeping them in the URL too is belt-and-braces: it makes "Current URL" breakdowns
 *  meaningful without adding a second source of truth.
 *
 *  It is HAND-TYPED, and that is a deliberate exception to this repo's rule against hand-kept
 *  expected sets, because it is a POLICY list rather than a guard: an entry missing here loses a
 *  breakdown, and can never leak anything. Nothing is asserted against it. */
const CAMPAIGN_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'gad_source', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'fbclid', 'msclkid', 'twclid', 'li_fat_id', 'igshid', 'ttclid', 'rdt_cid',
  'epik', 'qclid', 'sccid', 'irclid', 'mc_cid', 'mc_eid',
]);

/** Keep the path and the campaign parameters; drop every other parameter, and the fragment. */
export function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const kept = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (CAMPAIGN_PARAMS.has(k.toLowerCase())) kept.append(k, v);
    u.search = kept.toString();
    u.hash = '';
    return u.toString();
  } catch {
    // `$pathname` is relative, so `new URL` throws on it. Same policy, textually: no query at all.
    // (A relative path carries no campaign params worth keeping — the absolute URL beside it does.)
    return raw.split('?')[0]!.split('#')[0]!;
  }
}

/** Strip anything that could carry product text off an event before it leaves the browser.
 *
 *  `$current_url` is attached to EVERY event, not only pageviews, so this runs on all of them —
 *  including events added later by someone who has not read this file. posthog-js's
 *  `SessionPropsManager` re-emits the session's entry URL as `$session_entry_url` on every event
 *  in the same session too, carrying that entry page's query string verbatim, so the same
 *  sanitization runs on the whole `$session_entry_*` family. The reader's question lives in the
 *  query string (`/ask?q=…`, `/search?q=…`, `/gate?next=%2Fask%3Fq%3D…`) and never survives
 *  `sanitizeUrl` — on either key. */
export function stripProductText(properties: Record<string, unknown>): Record<string, unknown> {
  const out = { ...properties };
  // Match the SHAPE of a URL-bearing key rather than a hand-kept list. The list above this file
  // once named `$current_url`/`$referrer`/`$pathname`/`$initial_*` and nothing else, so
  // `$session_entry_url` — which SessionPropsManager attaches to every event with the entry
  // page's full `?q=<question>` for the whole session — slipped past it while `$current_url` next
  // to it was stripped. The `$session_entry_?` and `initial_` alternations cover posthog-js's own
  // prefixes, so a future rename cannot silently reopen the audit's defect #3.
  for (const k of Object.keys(out)) {
    // `title` is `document.title` on `$pageview`, not a URL; deleted outright because a future
    // dynamic <title> could otherwise quote the question, and the title carries no campaign value.
    if (k === 'title') { delete out[k]; continue; }
    const v = out[k];
    if (typeof v !== 'string') continue;
    if (/^\$(session_entry_)?(url|current_url|referrer|pathname|initial_(current_url|referrer))$/i.test(k)) {
      out[k] = sanitizeUrl(v);
    }
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
    // Anonymous stays anonymous: no person record until identify(), which now happens on sign-in
    // only (components/analytics-identity.tsx), with the OPAQUE user id and never an email.
    // A visitor who never signs in is still counted — trends count distinct ids, profile or not —
    // so DAU works without creating a person record for every stranger who reads the landing page.
    person_profiles: 'identified_only',
    // The two product-content channels stay off, explicitly rather than by default (both default
    // to ON in posthog-js). These were the real leaks: autocapture shipped `$el_text` (study
    // titles, uploaded filenames) and recording shipped the screen.
    autocapture: false,
    disable_session_recording: true,
    // ON as of 2026-08-24 (see the header): DAU, churn and campaign attribution all need an event
    // per visit. `history_change` also fires on App Router client-side navigation, which a plain
    // `true` would miss — this is a SPA, so most navigations never reload the document.
    capture_pageview: 'history_change',
    // Error tracking is the one thing the observability gap actually asked for. Kept, and still
    // filtered by the sanitiser below, because an exception message can quote user input.
    capture_exceptions: true,
    sanitize_properties: stripProductText,
  });
}
