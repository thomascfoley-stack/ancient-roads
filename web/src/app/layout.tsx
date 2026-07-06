import type { Metadata, Viewport } from 'next';
import { Omnibox } from '@/components/omnibox';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'What Others Have Said',
    template: '%s — What Others Have Said',
  },
  description:
    'A Bible study tool that never interprets scripture. Read diverse commentaries from the early church through the Reformation and beyond, then pray on it.',
  openGraph: {
    title: 'What Others Have Said',
    description:
      'Read what theologians across 2,000 years have written about every verse. Reformed, patristic, puritan, evangelical — side by side.',
    siteName: 'What Others Have Said',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'What Others Have Said',
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
    <html lang="en">
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
      </head>
      <body className="bg-stone-50 font-sans text-stone-900 antialiased">
        {children}
        <Omnibox />
      </body>
    </html>
  );
}
