'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Omnibox } from './omnibox';

// The app chrome (sidebar + mobile nav + omnibox) wraps the gated app, but NOT the public
// tier. The marketing landing (/) and the password gate (/gate) render full-bleed and
// chrome-free — a stranger must not see the app's navigation, and the gate must not leak the
// app's structure to someone who hasn't entered the password yet.
const CHROME_FREE = new Set(['/', '/about', '/gate']);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (CHROME_FREE.has(pathname)) return <>{children}</>;

  return (
    <>
      {/* Without this, reaching page content by keyboard means tabbing through the entire
          library rail (Home, Bible, every catalog, Passage search, Word study, Settings)
          on every single navigation. First focusable element in the document, visible only
          when focused. */}
      <a
        href="#main"
        className="skip-link rounded-lg bg-accent-700 px-4 py-2 text-sm font-semibold text-stone-50 shadow-float"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          {children}
        </main>
      </div>
      <MobileNav />
      <Omnibox />
    </>
  );
}
