import type { MetadataRoute } from 'next';
import { PUBLIC_MARKETING_ROUTES } from '@/lib/gate';

// /sitemap.xml — it did not exist, so the path served the app's HTML 404 (2026-08-16 QA fleet).
//
// SCOPE: THE PUBLIC MARKETING TIER, AND NOTHING ELSE. The list is derived from `gate.ts`'s own
// allowlist rather than typed here, so a sitemap entry cannot name a page the gate does not serve
// — the failure would be publishing a URL that answers 307, or worse, advertising a gated route.
// Deriving it also means the two can never drift, which is the class this repo's watchlist names
// most often (a hand-maintained expected set that nothing enforces).
//
// The corpus is deliberately absent and must stay absent while SEC-1 is open. `/read/*`,
// `/library/*` and `/work/*` are licensed text behind the password wall; a sitemap is a published
// index, and enumerating them would hand a crawler the map to content the wall exists to protect.
// When the gate comes down, adding them is a deliberate act with a licensing question attached,
// not a mechanical extension of this file.
//
// Like `robots.ts`, this is unreachable until the gate is removed — `/sitemap.xml` is not in
// PUBLIC_PATHS, on purpose. See the note in robots.ts for why that half-fix is the right one.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_MARKETING_ROUTES.map((path) => ({
    url: `https://ancientpaths.app${path === '/' ? '' : path}`,
    changeFrequency: 'monthly' as const,
    priority: path === '/' ? 1 : 0.7,
  }));
}
