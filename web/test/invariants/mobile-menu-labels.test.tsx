// @vitest-environment jsdom

// B044 (label half) — "An unlabeled Menu button silently signed the account out mid-task."
//
// The DIAGNOSIS half (why a tap on Menu reached sign-out at all) needs a real authenticated
// session and is not this file's job. This file holds the LABEL half: the Menu trigger and every
// control inside the sheet it opens must announce themselves — an accessible name, plus a visible
// label or a title — because the sheet contains Sign out (sidebar.tsx renders it via
// `<SidebarNavContent />` at mobile-nav.tsx's MenuSheet), an unconfirmed, immediately-destructive
// control styled identically to the nav rows around it.
//
// WHAT IS RENDERED AND WHY. The shipped `<MobileNav />`, driven through a real click — not a grep
// for attribute strings, which would pass on a button that never renders. The session mock is a
// SIGNED-IN one on purpose: Sign out only renders for a signed-in reader, and sweeping the sheet's
// controls with it absent would be checking the safe half of the finding.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
// Signed IN — see the header. bible-position.test.tsx doubles the same module signed-out.
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u1' } } }) },
}));

import { MobileNav } from '@/components/mobile-nav';

beforeEach(() => {
  window.localStorage.clear();
  // jsdom implements no ResizeObserver; the sheet's nav content constructs one for its scroll
  // fade. These legs assert names, not fades (same reasoning as bible-position.test.tsx).
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // Signed-in nav content fetches /api/studies and /api/research; 401 is those components' own
  // "no data" branch, so the sheet renders its empty states with no network.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function menuTrigger(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Open menu' }) as HTMLButtonElement;
}

describe('B044 — the Menu trigger announces itself and its state', () => {
  it('carries a title that cannot disagree with its accessible name', () => {
    // SEED: remove the title attribute -> RED (this is the state the finding was filed against).
    render(<MobileNav />);
    const btn = menuTrigger();
    expect(btn.getAttribute('aria-label')).toBe('Open menu');
    expect(btn.getAttribute('title'), 'the trigger has no tooltip').toBe(btn.getAttribute('aria-label'));
    // The visible caption stays: aria-label alone would leave a sighted reader with a bare glyph.
    expect(btn.textContent).toContain('Menu');
  });

  it('exposes open/closed through aria-expanded, the channel screen readers announce', () => {
    // The label deliberately does NOT flip to "Close menu" on open: while the sheet is up its
    // z-50 scrim covers the z-40 tab bar, so the trigger cannot be pressed and a "Close" label
    // would name an action the control cannot perform. State rides aria-expanded instead.
    render(<MobileNav />);
    const btn = menuTrigger();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('B044 — every control inside the Menu sheet has a name', () => {
  it('the sheet is a named dialog whose X carries a name AND a title', () => {
    // SEED: drop the X's title -> RED. It is the one icon-only control mobile-nav owns inside
    // the sheet that also contains Sign out; a control that says nothing on hover next to one
    // that signs you out is the exact shape the blocker described.
    render(<MobileNav />);
    fireEvent.click(menuTrigger());
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const close = within(dialog).getByRole('button', { name: 'Close menu' });
    expect(close.getAttribute('title'), 'the close X has no tooltip').toBe(close.getAttribute('aria-label'));
  });

  it('no control in the sheet is nameless — Sign out included, and visibly labelled', async () => {
    render(<MobileNav />);
    fireEvent.click(menuTrigger());
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    // Sign out renders one effect after mount (the sidebar holds its first client render to the
    // server's — see sidebar.tsx's hydration comment), hence the waitFor.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /sign out/i })).toBeTruthy(),
    );
    const signOut = within(dialog).getByRole('button', { name: /sign out/i });
    // A VISIBLE label, not an aria-only name: the reader who mis-taps is sighted.
    expect(signOut.textContent).toMatch(/sign out/i);
    // The sweep. Anything tappable in the sheet must announce itself one way or the other.
    for (const el of Array.from(dialog.querySelectorAll<HTMLElement>('button, a'))) {
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
      expect(
        name,
        `nameless control in the Menu sheet: <${el.tagName.toLowerCase()} class="${el.className}">`,
      ).not.toBe('');
    }
  });
});
