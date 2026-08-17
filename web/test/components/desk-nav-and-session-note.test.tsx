// @vitest-environment jsdom
//
// R1 PARTS 1 AND 3 — THE DESK BECOMES FINDABLE, AND SAYS WHAT IT DOES NOT KEEP.
// (ruling: docs/pm/orders/2026-08-17-three-ux-rulings.md)
//
// THREE FINDINGS, ONE FILE, because they are one defect seen from three sides: the Desk is a real
// feature that behaves like a scratch surface nobody can find and nobody can trust.
//
//   A072 — the Desk has NO entry point in any of the app's own navigation. Confirmed by four
//          separate enumerations of the sidebar's links. The only routes to `/desk` that exist in
//          the shipped app are the library row's "+" (an affordance whose meaning is itself a
//          filed finding, UX-2) and ask-client's per-result link — both of which put a pane on a
//          desk. NOTHING went to the desk itself, so a reader could not reach an empty one at all.
//   B043 — the same absence at mobile width. `mobile-nav.tsx` renders the SAME `SidebarNavContent`
//          inside its menu sheet, so one entry closes both. That sharing is the load-bearing fact
//          and it is asserted below by DRIVING the mobile menu, not by trusting the import.
//   A080 — the Desk never says its state is session-only. Desk state lives entirely in the URL
//          (`lib/desk.ts`), signed in or out alike (B007 confirmed login changes nothing), and the
//          page said nothing about it — while the Library, one route over, states its anon/account
//          boundary inline. R1 sequences persistence AFTER the nav entry, and rules that until it
//          lands "the Desk must SAY its state is session-only rather than implying otherwise".
//
// THE CONTROL LEG IS AS LOAD-BEARING AS THE POSITIVE ONES. `/desk` already carries a `role="status"`
// cap notice (A078), and `test/components/desk-cap-notice.test.tsx` asserts a two-pane desk has NO
// status role and a full desk has EXACTLY one. A session-only line implemented as a second status
// would pass every "says something" assertion here while breaking that file — so the absence of a
// status role on the new line is asserted here too, at the point where it would be wrong.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One navigation mock for all three subjects: the rail and the mobile nav read `usePathname`, the
// desk reads `useSearchParams` and rewrites through `useRouter().replace`. Nothing here navigates.
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
const pathname = vi.hoisted(() => ({ current: '/home' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => params.current,
}));
// A signed-out visitor: the Desk entry must be there for everyone, and the rail's fetch-backed
// sections (My studies, Research history) are gated on a session and are not the subject here.
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

// jsdom has no ResizeObserver; the rail's `useMoreBelow` constructs one on mount. Same stub and
// same reasoning as sidebar-catalog-nav.test.tsx — the gap is in this environment, not the product.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

import { SidebarNavContent } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';
import DeskPage from '@/app/desk/page';

/** Render the desk at a given `?p=` query. */
function renderDesk(query: string) {
  params.current = new URLSearchParams(query);
  return render(<DeskPage />);
}

beforeEach(() => {
  pathname.current = '/home';
  // Work panes fetch their metadata on mount; a promise that never settles holds them in their
  // loading state, which is all this file needs from them.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  params.current = new URLSearchParams();
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

describe('A072 — the Desk is reachable from the app’s own navigation', () => {
  it('the rail renders a link to /desk, with a label', () => {
    // SEED: delete the Desk SidebarLink from sidebar.tsx -> RED here. That is the whole finding:
    // the surface exists, works, and cannot be reached by anyone navigating the app.
    const { container } = render(<SidebarNavContent />);
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/desk');
    expect(link, 'no sidebar link to /desk — the Desk is unreachable from the shell (A072)').toBeTruthy();
    expect(
      (link?.textContent ?? '').trim().length,
      'the /desk link renders no label — a nameless link is not an entry point',
    ).toBeGreaterThan(0);
  });

  it('the link is marked as the current page while on /desk, and not elsewhere', () => {
    // A nav entry that never lights up is the B023 defect class (a control whose label does not
    // follow its state). Both directions, because a hardcoded `true` would satisfy one of them.
    pathname.current = '/desk';
    const onDesk = render(<SidebarNavContent />).container;
    expect(onDesk.querySelector('a[href="/desk"]')?.getAttribute('aria-current')).toBe('page');

    cleanup();
    pathname.current = '/home';
    const elsewhere = render(<SidebarNavContent />).container;
    expect(elsewhere.querySelector('a[href="/desk"]')?.getAttribute('aria-current')).toBeNull();
  });
});

describe('B043 — the same entry exists at mobile width', () => {
  it('the mobile menu sheet carries the /desk link', () => {
    // Driven, not inferred. The claim "one entry closes both" rests on mobile-nav.tsx rendering
    // the SAME SidebarNavContent; if it ever stops doing so, B043 reopens and this goes red.
    render(<MobileNav />);
    fireEvent.click(screen.getByLabelText('Open menu'));
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(
      within(sheet).getByRole('link', { name: /desk/i }).getAttribute('href'),
      'the mobile menu has no Desk entry — the Desk is unreachable on a phone (B043)',
    ).toBe('/desk');
  });
});

describe('A080 — the Desk states that its state is session-only', () => {
  it('an empty desk says so before anything is put on it', () => {
    // The honest moment is BEFORE the reader invests: an empty desk is where every desk starts.
    renderDesk('');
    const note = screen.getByText(/not saved to your account/i);
    expect(note.textContent, 'the note must name the remedy, not just the limitation').toMatch(/bookmark/i);
  });

  it('a populated desk says so too — the state that can be lost is the one already built', () => {
    renderDesk('p=work:a&p=work:b');
    expect(screen.getAllByRole('region'), 'expected two panes').toHaveLength(2);
    expect(screen.getByText(/not saved to your account/i)).toBeTruthy();
  });

  it('the note is NOT a status role — it must not collide with the A078 cap notice', () => {
    // The control that keeps desk-cap-notice.test.tsx honest: that file asserts a two-pane desk
    // has no status role at all, and reads `getByRole('status')` as THE cap notice on a full one.
    renderDesk('p=work:a&p=work:b');
    expect(screen.queryByRole('status'), 'the session note must not announce itself as a status').toBeNull();
  });

  it('a full desk carries BOTH lines, and they say different things', () => {
    renderDesk('p=work:a&p=work:b&p=work:c');
    const cap = screen.getByRole('status');
    expect(cap.textContent, 'the cap notice is about right now').toMatch(/full/i);
    const note = screen.getByText(/not saved to your account/i);
    expect(note, 'the session note is a standing fact and must survive a full desk').toBeTruthy();
    expect(note).not.toBe(cap);
  });
});
