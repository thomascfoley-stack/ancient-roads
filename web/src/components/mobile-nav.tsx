'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarNavContent } from './sidebar';
import { OMNIBOX_OPEN_EVENT } from './omnibox';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import { useDialog } from '@/lib/use-dialog';

// Phone navigation: a bottom tab bar for the primary destinations (thumb
// zone) plus a Menu sheet carrying the full sidebar content (Home, study
// sections, library, settings, sign in/out). Search opens the omnibox.
// Hidden on md+ where the sidebar rail renders, on the password gate, and
// while the on-screen keyboard is open.
export function MobileNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Treat a substantially shrunken visual viewport as "keyboard open" so the
  // tab bar doesn't float above (or fight with) the on-screen keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboardOpen(vv.height < window.innerHeight - 150);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Lock background scroll while the menu sheet is open.
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (pathname === '/gate') return null;

  const tabs = [
    // → /home (the app's Today screen), NOT '/'. The marketing landing is CHROME_FREE
    // (app-shell.tsx), so the Home tab used to drop a reader out of the app onto a page
    // with no nav back. The active test matched '/' too, where this nav never renders,
    // so the tab could also never light up.
    { href: '/home', label: 'Home', active: pathname === '/home', icon: <HomeIcon /> },
    { href: '/read/jhn/1', label: 'Bible', active: pathname.startsWith('/read'), icon: <BookIcon /> },
    { href: '/ask', label: 'Ask', active: pathname.startsWith('/ask'), icon: <AskIcon /> },
    // → the hub, not /library/commentaries: that slug is shadowed by the old
    // passage-browse page, so the tab labelled "Library" landed on the one catalog
    // that does not render (ship-committee LENS 1, BROKEN #1/#2).
    { href: '/library', label: 'Library', active: pathname.startsWith('/library'), icon: <LibraryIcon /> },
  ];
  const tabClass = (active: boolean) =>
    `flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-micro font-semibold tracking-wide transition-colors ease-gentle active:bg-stone-200/50 dark:active:bg-stone-800/70 ${
      active ? 'text-accent-700 dark:text-accent-300' : 'text-stone-500 dark:text-stone-400'
    }`;

  return (
    <>
      {menuOpen && <MenuSheet onClose={() => setMenuOpen(false)} />}

      {!keyboardOpen && (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t edge bg-stone-50 pb-[env(safe-area-inset-bottom)] md:hidden dark:bg-stone-950"
        >
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? 'page' : undefined}
              className={tabClass(t.active)}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
          <button
            onClick={() => window.dispatchEvent(new Event(OMNIBOX_OPEN_EVENT))}
            className={tabClass(false)}
            aria-label="Search passages"
          >
            <SearchIcon />
            Search
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            className={tabClass(menuOpen)}
            aria-label="Open menu"
          >
            <MenuIcon />
            Menu
          </button>
        </nav>
      )}
    </>
  );
}

function MenuSheet({ onClose }: { onClose: () => void }) {
  const drag = useDragDismiss(onClose);
  const dialog = useDialog(onClose, 'Menu');
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/[0.32] animate-fade-in md:hidden dark:bg-stone-50/[0.08]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog.ref}
        {...dialog.dialogProps}
        className="flex max-h-[85dvh] w-full flex-col border-t edge bg-stone-50 pb-[env(safe-area-inset-bottom)] animate-slide-up dark:bg-stone-900"
        style={drag.style}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-3" {...drag.handleProps}>
          <span aria-hidden className="w-9" />
          <span className="h-1.5 w-10 rounded-full bg-stone-300/80 dark:bg-stone-700" />
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center text-stone-500 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <SidebarNavContent touch onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg className="h-[22px] w-[22px]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="h-[22px] w-[22px]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg className="h-[22px] w-[22px]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.13L3 21l1.87-6.4A8 8 0 1121 12z" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg className="h-[22px] w-[22px]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-[22px] w-[22px]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-[22px] w-[22px]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
