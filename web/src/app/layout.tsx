import type { Metadata, Viewport } from 'next';
import { NeonAuthUIProvider } from '@neondatabase/auth/react';
import { authClient } from '@/lib/auth/client';
import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';
import { Omnibox } from '@/components/omnibox';
import './globals.css';

export const metadata: Metadata = {
  // The site's canonical origin — used to resolve OG/Twitter/canonical URLs to absolute.
  // Overridable in Vercel via NEXT_PUBLIC_SITE_URL (set it if the public domain ever differs
  // from the default below, e.g. Vercel appended a suffix or a custom domain is added later).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ancient-paths.vercel.app'),
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
            __html: `(function(){try{var d=document.documentElement;if(localStorage.getItem('reader-theme')==='dark')d.classList.add('dark');var s=localStorage.getItem('reader-size');if(s)d.style.setProperty('--reading-size',s);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-stone-50 font-sans text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-200">
        <NeonAuthUIProvider
          authClient={authClient}
          social={{ providers: ['google', 'github'] }}
        >
          <div className="flex h-dvh overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>
          </div>
          <MobileNav />
          <Omnibox />
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
