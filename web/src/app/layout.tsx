import type { Metadata, Viewport } from 'next';
import { NeonAuthUIProvider } from '@neondatabase/auth/react';
import { authClient } from '@/lib/auth/client';
import { Sidebar } from '@/components/sidebar';
import { Omnibox } from '@/components/omnibox';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ancient Roads',
    template: '%s · Ancient Roads',
  },
  description:
    'A Bible study tool that never interprets scripture. Read diverse commentaries from the early church through the Reformation and beyond, then pray on it.',
  openGraph: {
    title: 'Ancient Roads',
    description:
      'Learn the Word alongside theologians and church fathers who span the past 2,000 years. A tool designed to lead you to the Holy Spirit, not to be the Holy Spirit.',
    siteName: 'Ancient Roads',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Ancient Roads',
    description:
      'A Bible study tool that never interprets scripture.',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1c1917',
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
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Inter:wght@400;500;600;700&display=swap"
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
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
          <Omnibox />
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
