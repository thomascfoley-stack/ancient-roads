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
};

export default nextConfig;
