import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

import { EB_Garamond, Literata, Source_Sans_3 } from 'next/font/google';

// ── THE FONT STACK IS SELF-HOSTED. DO NOT PUT IT BACK ON A CDN. ─────────────────────────────────
// Block `F1-fonts`. These three families were loaded from `fonts.googleapis.com` with a <link>,
// while this app's own CSP header (next.config.ts) is `style-src 'self' 'unsafe-inline'` and
// `font-src 'self' data:`. The browser BLOCKED that stylesheet, and not one of the three faces was
// ever downloaded — every reader saw the fallback chain (Georgia / Times) instead of the
// typography the product was designed in.
//
// It survived every audit because the fallback hides it on precisely the machines that would catch
// it: the people auditing tend to have these faces installed locally, so the page renders
// correctly and the block shows only as console noise.
//
// `next/font/google` downloads the faces at BUILD time and serves them from `/_next` — so
// everything is `'self'` and the CSP passes untouched. Widening the CSP was the rejected remedy
// (owner ruling 2026-08-08): it loosens a security header for a problem self-hosting solves
// outright, and puts a third-party request on the critical path of every page load.
//
// `display: 'swap'` keeps text readable while a face loads, which is what the old `&display=swap`
// query parameter was for.
//
// ── WHY THESE ARE `--font-*-FACE`, NOT `--font-*` ──────────────────────────────────────────────
// MEASURED, not assumed. Binding next/font directly to `--font-display` made its class WIN over
// globals.css's `@theme` block, and the computed value became `"EB Garamond", "EB Garamond
// Fallback"` — the Georgia / Times chain was gone at runtime, while still sitting in the
// stylesheet looking present. The block says "Do NOT drop the CSS fallback chains", and that
// would have dropped them invisibly.
//
// So next/font owns a `-face` variable, and globals.css COMPOSES it into the chain:
//     --font-display: var(--font-display-face), Georgia, 'Times New Roman', serif;
// which keeps both — next/font's metric-compatible fallback (it prevents layout shift, which
// Georgia alone does not) AND the original chain behind it.

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display-face',
});

const literata = Literata({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif-face',
});

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-sans-face',
});

export const metadata: Metadata = {
  // The site's canonical origin, used to resolve OG/Twitter/canonical URLs to absolute.
  // ancientpaths.app is the purchased production domain (2026-07-16). Overridable in
  // Vercel via NEXT_PUBLIC_SITE_URL if the public domain ever changes.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ancientpaths.app'),
  title: {
    default: 'Ancient Paths',
    template: '%s · Ancient Paths',
  },
  description:
    'A Bible study tool that never interprets scripture. Read diverse commentaries from the early church through the Reformation and beyond, then pray on it.',
  openGraph: {
    title: 'Ancient Paths',
    description:
      'Learn the Word alongside theologians and church fathers who span the past 2,000 years. A tool designed to lead you to the Holy Spirit, not to be the Holy Spirit.',
    siteName: 'Ancient Paths',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Ancient Paths',
    description:
      'A Bible study tool that never interprets scripture.',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ancient Paths',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Safe-area insets (notch / Dynamic Island / home indicator) and
  // keyboard-aware layout on Android Chrome.
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#221d16',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ebGaramond.variable} ${literata.variable} ${sourceSans3.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            // TWO FIXES, and the second is the one that mattered.
            //
            // (1) This was add-only: `if (stored === 'dark') add('dark')`, with no removal branch,
            //     so it could only ever turn the theme ON. A "restore my preference" script that
            //     cannot restore "light" is a one-way latch. Now it toggles.
            // (2) It toggled `.dark`, a class next-themes owns (see globals.css). Measured: our
            //     class was being stripped on every load. The marker is `.reader-dark` now, which
            //     nothing else manages.
            //
            // Still inline and still in <head>: it must run BEFORE first paint or the reader sees
            // a flash of the wrong theme. That is also why `<html suppressHydrationWarning>` is on
            // the element below — this script mutates it before React arrives, by design.
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('reader-theme');d.classList.toggle('reader-dark',t==='dark');var s=localStorage.getItem('reader-size');if(s)d.style.setProperty('--reading-size',s);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-stone-50 font-sans text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-200">
        {/* The NeonAuthUIProvider that wrapped this is gone with the rest of the beta SDK
            (SEC-1). It declared social={{ providers: ['google','github'] }}; the cutover ships
            email/password only, which is what closes GHSA-g38m structurally rather than by
            configuration. See docs/AUTH_CUTOVER_DESIGN.md §2. */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
