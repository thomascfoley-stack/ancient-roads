import type { MetadataRoute } from 'next';
import { PUBLIC_MARKETING_ROUTES } from '@/lib/gate';

// /robots.txt — it did not exist, so the path fell through to the app's HTML 404 (2026-08-16 QA
// fleet, filed alongside /sitemap.xml).
//
// ── ALLOWLIST, NOT BLOCKLIST, AND THAT IS THE WHOLE DESIGN ────────────────────────────────────
//
// The first version of this file was `allow: '/'` plus a hand-typed list of disallowed prefixes.
// The 2026-08-17 pre-deploy audit called it correctly: that is a hand-maintained expected set —
// the artefact at the top of this repo's own watchlist — and it was ALREADY incomplete, omitting
// `/read/`, `/work/`, `/library/`, `/bible` and `/commentaries`. Those are the licensed corpus.
//
// Worse, it was written to "start working by itself the moment the gate comes down, no second
// edit, nothing to remember". That property is precisely what made it dangerous: SEC-1's closure
// would have silently published crawl permission over copyrighted text, with nothing prompting a
// review. A file that needs no decision at launch is a file that makes the decision for you.
//
// So it is inverted. `Disallow: /` is the default, and only the marketing tier is allowed —
// DERIVED from the same `PUBLIC_MARKETING_ROUTES` the sitemap uses, which is itself derived from
// `gate.ts`'s allowlist. Adding a crawlable page is therefore one edit, in the file that already
// governs what the wall serves, and a page cannot become crawlable by being forgotten.
//
// Licensing is the existential rule (CLAUDE.md): ingest only PD/CC content, never store or serve
// the full text of a copyrighted translation. A robots file that invites indexing of `/read/` is
// not itself a licensing breach, but it is the mechanism by which one becomes discoverable and
// permanent, and it fails in the direction that cannot be undone — a crawl that already happened.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Order matters to crawlers only as specificity; stating the deny first is for the reader.
        disallow: '/',
        allow: [...PUBLIC_MARKETING_ROUTES],
      },
    ],
    sitemap: 'https://ancientpaths.app/sitemap.xml',
  };
}
