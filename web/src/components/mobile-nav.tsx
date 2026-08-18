'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarNavContent } from './sidebar';
import { OMNIBOX_OPEN_EVENT } from './omnibox';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import { useDialog } from '@/lib/use-dialog';
import { DEFAULT_BIBLE_HREF, bibleTabHref } from '@/lib/bible-position';

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

  // A034 — THE BIBLE TAB USED TO HARDLINK `/read/jhn/1`, so a reader in Psalm 23 who tapped Home
  // and then Bible landed in John, having done nothing to ask for that. The record it consults now
  // is `lib/bible-position.ts`, written by the reader page; A040 (position lost across a tab close)
  // is the same missing record seen from the other side, and this is the same fix.
  //
  // INITIALISED TO THE DEFAULT AND ADOPTED IN AN EFFECT — NOT read in the `useState` initializer.
  // An initializer runs during the FIRST client render, and the server has no localStorage, so the
  // server would emit `/read/jhn/1` and the browser `/read/psa/23`: a server/client attribute
  // mismatch, i.e. the React #418 hydration error this repo has already paid for twice (the
  // reader's translation badge, `read/[book]/[chapter]/page.tsx:38-51`, which threw on EVERY reader
  // page load in production until 2026-08-02; and the session, `lib/auth/use-signed-in.ts`).
  //
  // KEYED ON `pathname`, not `[]`: this nav stays mounted across client navigations, so a one-shot
  // mount effect would freeze the tab at wherever the reader was when the app booted. Re-reading on
  // each navigation costs one localStorage get. While the reader is ON a chapter the value may lag
  // by one chapter — this effect and the reader page's save effect both fire on the same navigation
  // and their relative order is not guaranteed — which is harmless, because tapping Bible from
  // inside the Bible is not the journey either finding is about, and the next navigation corrects it.
  const [bibleHref, setBibleHref] = useState(DEFAULT_BIBLE_HREF);
  useEffect(() => setBibleHref(bibleTabHref()), [pathname]);

  if (pathname === '/gate') return null;

  const tabs = [
    // → /home (the app's Today screen), NOT '/'. The marketing landing is CHROME_FREE
    // (app-shell.tsx), so the Home tab used to drop a reader out of the app onto a page
    // with no nav back. The active test matched '/' too, where this nav never renders,
    // so the tab could also never light up.
    { href: '/home', label: 'Home', active: pathname === '/home', icon: <HomeIcon /> },
    // A034: the destination is the reader's last position, defaulting to John 1. `active` still
    // keys off the /read prefix, so it lights up for whatever chapter they are actually in.
    { href: bibleHref, label: 'Bible', active: pathname.startsWith('/read'), icon: <BookIcon /> },
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
              // KEYED ON THE LABEL, NOT THE HREF: since A034 the Bible tab's href changes after
              // mount, and a changing key would unmount and remount that anchor on every
              // navigation. The labels are the stable identity of these five tabs.
              key={t.label}
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
          {/* B044 (label half) — the blocker was a stray tap out of this trigger's sheet reaching
              Sign out. The trigger already had an accessible name and a visible "Menu" caption;
              what it lacked was a tooltip and any exposed open/closed state. `aria-label` and
              `title` come from ONE binding (the sidebar collapse chevron's A095 lesson: two
              hand-typed strings is how a tooltip drifts from the announced name). The label does
              NOT flip to "Close menu" while open, because that would name an action this control
              cannot perform — the sheet's z-50 scrim covers this z-40 bar, so the trigger is
              unreachable until the sheet closes. Open/closed rides `aria-expanded`, the channel
              screen readers actually announce for a disclosure. */}
          <button
            onClick={() => setMenuOpen(true)}
            className={tabClass(menuOpen)}
            aria-label={MENU_TRIGGER_LABEL}
            title={MENU_TRIGGER_LABEL}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <MenuIcon />
            Menu
          </button>
        </nav>
      )}
    </>
  );
}

// B044 (label half) — one binding feeds the Menu trigger's aria-label AND title (see the button
// in the tab bar); module scope because the trigger's label carries no state.
const MENU_TRIGGER_LABEL = 'Open menu';

function MenuSheet({ onClose }: { onClose: () => void }) {
  const drag = useDragDismiss(onClose);
  const dialog = useDialog(onClose, 'Menu');
  // B044 (label half) — the X is the one icon-only control this file owns inside the sheet that
  // also carries Sign out (rendered by SidebarNavContent below). It had an aria-label and no
  // title, so hovering it said nothing. One binding for both attributes, same reason as above.
  const closeLabel = 'Close menu';
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
            aria-label={closeLabel}
            title={closeLabel}
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
