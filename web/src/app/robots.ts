import type { MetadataRoute } from 'next';

// /robots.txt — it did not exist, so the path fell through to the app's HTML 404 (2026-08-16 QA
// fleet, filed alongside /sitemap.xml).
//
// WHY THIS IS NOT IN gate.ts's PUBLIC_PATHS, WHICH IS A DELIBERATE HALF-FIX.
//
// While SEC-1 is open, `middleware.ts` redirects every non-marketing path to /gate, so this file
// is unreachable to a crawler and the rules below do nothing yet. That is the correct state and
// not worth widening the wall for: nothing is crawlable while the gate is up, because every URL a
// crawler could follow also 307s to /gate. The allowlist is the only lock on a copyrighted corpus
// (`test/middleware-gate.test.ts` calls it "airtight"), and one exact path is still one hole.
//
// The rejected alternative was allowlisting this file with `disallow: '/'` today. It buys nothing
// over the redirect, and it leaves a live footgun: launch is "remove the gate", and a disallow-all
// robots.txt left behind would deindex the entire site at exactly the moment it went public. The
// policy below is therefore the POST-LAUNCH one, and it starts working by itself the moment the
// gate comes down — no second edit, nothing to remember.
//
// The corpus is not enumerated here and must not be: `/bible` and `/commentaries` hold licensed
// text, and a robots file is a published list of paths.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing that is per-user, credentialed, or an API surface.
      disallow: ['/api/', '/account/', '/auth/', '/gate', '/desk', '/studies/', '/study/', '/prayers'],
    },
    sitemap: 'https://ancientpaths.app/sitemap.xml',
  };
}
