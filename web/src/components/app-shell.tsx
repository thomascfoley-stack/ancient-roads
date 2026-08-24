'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Omnibox } from './omnibox';
import { AnalyticsIdentity } from './analytics-identity';

// The app chrome (sidebar + mobile nav + omnibox) wraps the gated app, but NOT the public
// tier. The marketing landing (/) and the password gate (/gate) render full-bleed and
// chrome-free — a stranger must not see the app's navigation, and the gate must not leak the
// app's structure to someone who hasn't entered the password yet.
const CHROME_FREE = new Set(['/', '/about', '/features', '/why', '/gate']);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (CHROME_FREE.has(pathname)) return <>{children}</>;

  return (
    <>
      {/* Renders nothing; binds analytics to the signed-in reader so churn is measurable.
          Inside this branch on purpose — the public tier above has no session to read. */}
      <AnalyticsIdentity />
      {/* Without this, reaching page content by keyboard means tabbing through the entire
          library rail (Home, Bible, every catalog, Passage search, Word study, Settings)
          on every single navigation. First focusable element in the document, visible only
          when focused. */}
      <a
        href="#main"
        className="skip-link bg-accent-700 px-4 py-2 text-sm font-semibold text-stone-50 dark:bg-accent-500 dark:text-stone-950"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-stone-50 pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0 dark:bg-stone-950"
        >
          {children}
        </main>
      </div>
      <MobileNav />
      <Omnibox />
    </>
  );
}
