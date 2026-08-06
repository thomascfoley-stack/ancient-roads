import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&family=Source+Sans+3:ital,wght@0,400..700;1,400..700&display=swap"
          rel="stylesheet"
        />
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
