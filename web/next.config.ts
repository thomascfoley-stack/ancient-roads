import type { NextConfig } from 'next';

// SECURITY HEADERS. This file was `{}` — no CSP, no framing policy, no nosniff, nothing
// (2026-08-02 deep audit, H12), while two `dangerouslySetInnerHTML` sinks are live and every
// authenticated write UI (note delete, highlight clear, sign-out) was framable by anyone.
//
// CSP notes, because the exact directives here are load-bearing and one of them is a compromise:
//
//   script-src 'self' 'unsafe-inline'  — the theme script in layout.tsx runs inline before paint
//     to avoid a flash of the wrong theme, and Next's App Router streams inline bootstrap. A
//     nonce would be stricter and needs the script moved onto a nonce-aware path; that is a
//     separate slice, and shipping a policy with a real frame-ancestors and nosniff today beats
//     shipping nothing while the perfect one is designed. STATED, not hidden: 'unsafe-inline' on
//     script-src means this CSP is not an XSS backstop. The XSS defence remains sanitizeSnippet
//     (snippet.ts escapes everything and restores only <mark>), which the audit verified clean.
//
//   frame-ancestors 'none'             — this is the directive that actually closes something
//     today. Clickjacking reached destructive authenticated actions.
//
//   connect-src includes the Neon Auth origin; without it sign-in breaks. It is read from the
//     same env var the client uses, so the two cannot drift.
const NEON_AUTH_ORIGIN = (() => {
  const raw = process.env.NEON_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

// PostHog reverse proxy (owner ruling O-2). The client inits with api_host '/ingest'
// (src/instrumentation-client.ts) so connect-src stays 'self' — see the CSP note above.
// Two legs per PostHog's proxy guide: static assets come from the `-assets` subdomain,
// everything else (events, decide, replay) from the ingest host. Host is env-driven so
// a US→EU region move is a var change, not a code change.
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/+$/, '');
const POSTHOG_ASSETS = POSTHOG_HOST.replace(/^(https:\/\/[a-z]+)\.i\.posthog\.com$/, '$1-assets.i.posthog.com');

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${NEON_AUTH_ORIGIN ? ` ${NEON_AUTH_ORIGIN}` : ''}`,
].join('; ');

const nextConfig: NextConfig = {
  // PDFJS MUST NOT BE BUNDLED, and this is the root of the PDF-upload outage.
  //
  // Bundling rewrites pdfjs's module graph, and pdfjs does two things at RUNTIME that only work
  // from a real node_modules:
  //   1. `createRequire(import.meta.url)("@napi-rs/canvas")` — its optional native dependency, and
  //      the only source it polyfills DOMMatrix from. Bundled, that require cannot resolve, so
  //      every PDF died on `new DOMMatrix()` with "DOMMatrix is not defined" while docx and
  //      markdown indexed normally.
  //   2. reading `standard_fonts/*.pfb` off disk beside itself, which is why a PDF using a base-14
  //      font (Helvetica) then failed to open at all even after DOMMatrix was polyfilled.
  //
  // Both are the same bug wearing two masks: a package that resolves things at runtime cannot be
  // bundled. Externalising it makes production behave like local, where it always worked.
  serverExternalPackages: ['pdfjs-dist'],

  // ...and externalising alone is still not enough, which the third deploy is what proved:
  //
  //   Setting up fake worker failed: "Cannot find module
  //   '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"
  //
  // pdfjs loads its worker, and its base-14 font data, by PATH at runtime. Vercel's tracer follows
  // imports, so it shipped pdf.mjs and neither of those. They have to be named.
  //
  // This is the third mask on one bug: a package that resolves files at runtime is invisible to
  // static analysis, and every layer of the fix (polyfill, externalise, trace) was uncovering the
  // same fact one error at a time. It was only diagnosable because parse failures now carry the
  // reader's own message rather than "that PDF may be damaged".
  outputFileTracingIncludes: {
    '/api/user-corpus/**': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/standard_fonts/**',
    ],
  },

  // IMAGE QUALITY. The hero was served at 198 KB from a 966 KB source. Next's default quality
  // is 75, and in Next 16 the optimizer only serves qualities DECLARED here, so 75 was the only
  // one reachable: requesting q=90 returned zero bytes. On the single full-bleed photograph
  // that carries the landing page, discarding 80% of the file is the wrong trade, and it
  // compounded a source that is already being upscaled.
  //
  // 75 stays and remains the default for every other image; 90 is opted into by the hero alone.
  //
  // THIS DOES NOT FIX RESOLUTION. hero-road.jpg is 1376x768. A full-bleed hero wants ~2560px
  // wide on a retina laptop and ~5120px on a 4K display, so it is upscaled roughly 2x and no
  // quality setting recovers detail the file does not contain. A 3840px-wide source is the fix.
  images: {
    qualities: [75, 90],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          // Redundant with frame-ancestors for modern browsers, kept for older ones.
          { key: 'X-Frame-Options', value: 'DENY' },
          // The search routes reflect user input into JSON error bodies; without this a
          // content-type sniff could reinterpret one as HTML.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },

  // CORPUS CDN (docs/CORPUS_CDN_DESIGN.md §4.2). When CORPUS_CDN_BASE is set, the static corpus
  // paths are edge-rewritten to the public Blob store; unset, the local public/ files serve as
  // they always did (dev needs no network; rollback is unsetting the env var and redeploying).
  // beforeFiles so the rewrite wins even while the files are still in the bundle (step A5 of
  // the rollout, where both exist and the CDN takes precedence). The /gate middleware runs
  // BEFORE rewrites, so the site password still fronts these paths; the raw Blob URLs are
  // public, which is stated and acceptable — every byte here is Gate-B-verified PD/permissive
  // text, and the gates run on the local copies these were synced from.
  // `/reading-plans` 404'd while the sidebar's own visible label reads "Reading plans" — a
  // reader who types what the nav says lands on an error (2026-08-16 QA fleet). The route is
  // `/plans`; this is the redirect that makes the guessable spelling work. Permanent, because the
  // canonical URL is not changing.
  async redirects() {
    return [{ source: '/reading-plans', destination: '/plans', permanent: true }];
  },

  // The /ingest legs are UNCONDITIONAL — they cost nothing when PostHog is unconfigured and
  // gating them on the key would make next.config dependent on a NEXT_PUBLIC_ var being
  // present at build time. /ingest/static/ must be listed first: it also matches /ingest/:path*.
  // skipTrailingSlashRedirect is set (below) because posthog-js POSTs to /ingest/e/ WITH the
  // slash, and a 308 in front of a beacon POST is an avoidable failure mode per PostHog's docs.
  async rewrites() {
    const ingest = [
      { source: '/ingest/static/:path*', destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: '/ingest/:path*', destination: `${POSTHOG_HOST}/:path*` },
    ];
    const base = process.env.CORPUS_CDN_BASE;
    if (!base) return { beforeFiles: ingest, afterFiles: [], fallback: [] };
    const origin = base.replace(/\/+$/, '');
    return {
      beforeFiles: [
        ...ingest,
        ...['bible', 'commentaries', 'original'].map((root) => ({
          source: `/${root}/:path*`,
          destination: `${origin}/${root}/:path*`,
        })),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // See the rewrites note — posthog-js beacons carry a trailing slash.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
