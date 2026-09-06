// @vitest-environment jsdom
//
// THE WRITING-MODE RAIL (owner direction 2026-08-12, mockup `journal-redesign-mockup_1.html`:
// "SIDEBAR — 300px → 58px rail while writing. Expands on hover or ⌘\.").
//
// The compose view signals writing mode through `lib/prayer-writing-mode.ts` (a body attribute +
// a window event, because the sidebar lives in the root layout, above the page). This file drives
// that exact signal — not an internal prop — so the test fails if either side of the contract
// drifts, which is the point of a contract.
//
// Asserted:
//   1. Writing mode swaps the full nav for the icon rail (the wordmark disappears; icon-only
//      links with aria-labels remain).
//   2. HOVERING the rail re-expands the full sidebar; leaving it restores the rail.
//   3. ⌘\ toggles the expansion from the keyboard.
//   4. Leaving writing mode restores the full sidebar unconditionally.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/sidebar';
import { setPrayerWriting } from '@/lib/prayer-writing-mode';
import { stubMatchMedia } from '../helpers/match-media';

// The two things the shell needs from outside itself, stubbed at their least interesting value —
// the same reasoning as sidebar-catalog-nav.test.tsx, whose ResizeObserver note applies here too.
vi.mock('next/navigation', () => ({ usePathname: () => '/prayers' }));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

// A THIRD browser API jsdom does not implement, added 2026-08-17 with A093: `Sidebar` now consults
// `matchMedia` on mount to decide whether it is booting on a tablet. Without this the effect
// throws and every case below goes red for a reason that has nothing to do with writing mode.
// 1280 = DESKTOP, and that is the point rather than an arbitrary number — this file describes the
// desktop rail, where the full 256px sidebar is the correct state at rest. The tablet band is
// `test/components/sidebar-tablet-default.test.tsx`'s subject.
stubMatchMedia(1280);

afterEach(() => {
  // Never leak writing mode into the next test — it is global document state by design.
  act(() => setPrayerWriting(false));
  cleanup();
  vi.restoreAllMocks();
});

// The full sidebar is the only state carrying a "Collapse sidebar" button: the rail does not,
// and neither does the manually-collapsed rail. ("Ancient Paths" is the wordmark → /home, not a
// state marker — and until the rail's /ask entry was relabeled "Ask" to match the full nav it
// named the rail's /ask link too, a cross-state collision that made the string useless as a
// marker; "Collapse sidebar" pins the expanded state alone, and does not ride a destination.)
const fullNav = () => screen.queryByRole('button', { name: 'Collapse sidebar' });

describe('the sidebar drops to an icon rail while a prayer is being written', () => {
  it('swaps the full nav for the rail on the writing signal, and back when it clears', () => {
    render(<Sidebar />);
    expect(fullNav(), 'the full sidebar did not render at rest').toBeTruthy();

    act(() => setPrayerWriting(true));
    // SEED: remove the `writing && !railOpen` branch in Sidebar -> RED. The 256px nav stays up
    // and the compose view is again a widget beside an admin panel.
    expect(fullNav(), 'the full nav is still up while writing').toBeNull();
    expect(screen.getByRole('link', { name: 'My prayers' }), 'the rail lost its destinations').toBeTruthy();

    act(() => setPrayerWriting(false));
    expect(fullNav(), 'the full sidebar did not come back after writing').toBeTruthy();
  });

  it('hover expands the rail, leaving it collapses it again', () => {
    render(<Sidebar />);
    act(() => setPrayerWriting(true));

    const rail = screen.getByRole('complementary', { name: 'Navigation' });
    fireEvent.mouseEnter(rail);
    expect(fullNav(), 'hover did not expand the rail').toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole('complementary'));
    expect(fullNav(), 'leaving the sidebar did not restore the rail').toBeNull();
  });

  it('⌘\\ toggles the expansion from the keyboard', () => {
    render(<Sidebar />);
    act(() => setPrayerWriting(true));

    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(fullNav(), '⌘\\ did not expand the rail').toBeTruthy();

    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(fullNav(), 'second ⌘\\ did not collapse back to the rail').toBeNull();
  });
});
