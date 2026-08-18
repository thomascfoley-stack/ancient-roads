// @vitest-environment jsdom
//
// B044 — SIGN OUT ARMS ON THE FIRST TAP AND FIRES ON THE SECOND.
//
// The authenticated QA fleet's one BLOCKER: "An unlabeled Menu button silently signed the account
// out mid-task" — ending its own session and, most likely, the two sessions that ran after it.
// The trigger was labelled all along (adjudicated separately); the real hazard is geometric: the
// Menu sheet slides up UNDER the finger, transform-animated rows hit-test at their animated
// position, and Sign out was a SINGLE-TAP row styled identically to the nav links sweeping past.
// The research-thread delete in the same rail already arms first for exactly this reason.
//
// Signing out is not data loss, but mid-task it destroys the reader's place and their session —
// and unlike a deleted thread there is no rollback: re-auth is the only path back.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn(async () => ({ error: null }));
vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }), signOut: () => signOut() },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));

import { SidebarNavContent } from '../../src/components/sidebar';

beforeEach(() => {
  signOut.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ threads: [], studies: [] })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('B044 — sign-out is a two-step control', () => {
  it('the first tap arms and does NOT sign out; the second signs out', async () => {
    // SEED: restore the single-tap onClick -> RED (signOut called on tap one).
    render(<SidebarNavContent />);
    const btn = await screen.findByRole('button', { name: /^Sign out$/i });

    fireEvent.click(btn);
    expect(signOut, 'the FIRST tap signed the reader out').not.toHaveBeenCalled();
    // Armed state announces itself in the label, like every other armed control in this rail.
    const armed = await screen.findByRole('button', { name: /Sign out\?/i });

    fireEvent.click(armed);
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it('disarms on blur — an armed row must not lie in wait for a later stray tap', async () => {
    render(<SidebarNavContent />);
    fireEvent.click(await screen.findByRole('button', { name: /^Sign out$/i }));
    const armed = await screen.findByRole('button', { name: /Sign out\?/i });
    fireEvent.blur(armed);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Sign out$/i })).toBeTruthy());
    expect(signOut).not.toHaveBeenCalled();
  });
});
