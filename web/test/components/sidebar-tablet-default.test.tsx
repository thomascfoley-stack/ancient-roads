// @vitest-environment jsdom
//
// A093 — THE TABLET GETS THE ICON RAIL, NOT A THIRD OF THE SCREEN.
//
// Filed by the 2026-08-16 QA fleet as: "No dedicated tablet nav treatment — 768px renders the full
// 256px desktop sidebar with full text labels (consuming a third of the screen); one pixel
// narrower flips entirely to the phone bottom-nav layout."
//
// THE CLIFF IS REAL AND IT IS EXACTLY ONE PIXEL WIDE. `mobile-nav.tsx:93` is `md:hidden`, and the
// sidebar's `<aside>` is `hidden … md:flex`. So at 767px the reader has a bottom tab bar and no
// rail; at 768px they have a 256px rail and no tab bar — 33% of the viewport spent on chrome, with
// nothing in between.
//
// WHY THIS SHAPE OF FIX. `Sidebar` already owns a collapse mechanism (a `collapsed` state, a
// chevron, and — from the writing-mode work — an icon rail with real destinations on it). A
// tablet-only breakpoint system would be a second mechanism doing the first one's job. So the
// treatment is: BOOT collapsed inside the tablet band, and leave the chevron exactly where it was.
//
// AND WHY THE COLLAPSED RAIL HAD TO GROW LINKS FIRST. Before this change the collapsed state was
// a 48px strip containing ONE control: the chevron that undoes it. On desktop that is the
// reader's own choice and they can undo it. Making it the tablet DEFAULT would have handed a
// tablet a screen with no navigation at all — no rail links, and no bottom tab bar either, because
// that is `md:hidden`. So the collapsed rail now renders the same destinations the writing-mode
// rail does, FROM THE SAME LIST; the third case below is the check that keeps those two rails one
// list rather than two that agree today.
//
// The four cases are the four ways this can be wrong: it does not fire, it fires everywhere, it
// leaves the reader stranded, or it overrides a reader who has said otherwise.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/sidebar';
import { setPrayerWriting } from '@/lib/prayer-writing-mode';
import { stubMatchMedia } from '../helpers/match-media';

// The two things the shell needs from outside itself, stubbed at their least interesting value —
// same reasoning (and the same ResizeObserver note) as sidebar-writing-rail.test.tsx.
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

afterEach(() => {
  act(() => setPrayerWriting(false));
  cleanup();
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

/** The full 256px sidebar is the only state that offers to collapse itself. */
const fullNav = () => screen.queryByRole('button', { name: 'Collapse sidebar' });
/** …and the icon rail is the only one that offers to expand. */
const railToggle = () => screen.queryByRole('button', { name: 'Expand sidebar' });

/** Every destination reachable from whichever rail is currently rendered, in order. */
const railDestinations = () => screen.getAllByRole('link').map((el) => el.getAttribute('aria-label'));

describe('A093 — the sidebar boots to the icon rail at tablet widths', () => {
  it('renders the rail at 768px and the full sidebar at 1280px', () => {
    // SEED THE DEFECT: delete the tablet effect in sidebar.tsx (i.e. restore `useState(false)` as
    // the only word on the matter) -> RED here, with the 256px nav up at 768px. That is A093 as
    // filed, measured at the width it was filed at.
    stubMatchMedia(768);
    render(<Sidebar />);
    expect(fullNav(), 'the 256px sidebar is still up at tablet width').toBeNull();
    expect(railToggle(), 'no rail rendered at tablet width').toBeTruthy();

    // The control leg, and it is load-bearing: a query that matched everything would satisfy the
    // assertion above while collapsing every desktop reader's sidebar.
    cleanup();
    stubMatchMedia(1280);
    render(<Sidebar />);
    expect(fullNav(), 'the desktop sidebar came up collapsed').toBeTruthy();
  });

  it('does not fire on the phone side of the cliff either', () => {
    // 767px is the bottom tab bar's width. The aside is `hidden` there, so nothing is visible
    // either way — but the state must not be "collapsed" on the way back up, or a phone rotated
    // into tablet width would find a rail it never asked for AND no way to reason about it.
    stubMatchMedia(767);
    render(<Sidebar />);
    expect(fullNav(), 'the tablet default reached below the md breakpoint').toBeTruthy();
  });

  it('the rail a tablet boots into carries the SAME destinations as the writing-mode rail', () => {
    // Not "the rail has some links": the two rails must be one list. If someone re-types the
    // destinations into the collapsed branch, they agree on the day it is written and drift after.
    //
    // SEED: hardcode a different list (or drop the links, which is what the collapsed rail was
    // before A093) in either branch -> RED.
    stubMatchMedia(768);
    render(<Sidebar />);
    const collapsed = railDestinations();

    expect(collapsed.length, 'the tablet rail has no destinations on it at all').toBeGreaterThan(4);
    expect(collapsed, 'the tablet rail cannot reach the Bible').toContain('Bible');
    expect(collapsed, 'the tablet rail cannot reach Home').toContain('Home');

    act(() => setPrayerWriting(true));
    expect(railDestinations(), 'the two icon rails have drifted apart').toEqual(collapsed);
  });

  it('the reader can expand it, and a resize inside the band does not undo them', () => {
    const viewport = stubMatchMedia(768);
    render(<Sidebar />);

    // Still user-toggleable — the whole treatment is a DEFAULT, not a lockout.
    fireEvent.click(railToggle() as HTMLElement);
    expect(fullNav(), 'the tablet rail could not be expanded').toBeTruthy();

    // A resize that stays inside the tablet band must not re-apply the default over the top of a
    // reader who has just said what they want. SEED: re-read `mq.matches` on every resize instead
    // of listening for `change` -> RED, the sidebar snaps shut under them.
    act(() => viewport.setWidth(900));
    expect(fullNav(), 'a resize inside the tablet band re-collapsed the reader’s sidebar').toBeTruthy();

    // Crossing OUT of the band is a different event: the layout the default was chosen for is
    // gone, so the default for the new layout applies.
    act(() => viewport.setWidth(1280));
    expect(fullNav(), 'crossing to desktop width lost the full sidebar').toBeTruthy();
    act(() => viewport.setWidth(800));
    expect(fullNav(), 'crossing back into the tablet band did not restore the rail').toBeNull();
  });
});

// ── the band's ceiling ──────────────────────────────────────────────────────────────────────
//
// ADDED 2026-08-17 after the pre-deploy audit. The original legs asserted 768 and 1280 and nothing
// between, so a ceiling of `1279.98px` — 256px past the bound this file's own header states — was
// invisible to them: every laptop window from 1024px up booted into the 48px rail, and the suite
// stayed green. A two-point test cannot see a wrong bound that lies between its two points.
describe('A093 — the band stops at lg, so a desktop reader never boots collapsed', () => {
  it('1024px (lg) gets the full sidebar', () => {
    // SEED: restore the 1279.98px ceiling -> RED. This is the width the wrong constant broke.
    stubMatchMedia(1024);
    render(<Sidebar />);
    expect(fullNav(), 'a desktop-width reader booted into the icon rail').toBeTruthy();
  });

  it('1100px — mid-band under the wrong ceiling — gets the full sidebar', () => {
    stubMatchMedia(1100);
    render(<Sidebar />);
    expect(fullNav(), 'the commonest laptop window booted into the icon rail').toBeTruthy();
  });

  it('1023px still gets the rail — the ceiling moved, it did not vanish', () => {
    stubMatchMedia(1023);
    render(<Sidebar />);
    expect(fullNav(), 'the tablet band stopped firing inside its own range').toBeNull();
  });
});
