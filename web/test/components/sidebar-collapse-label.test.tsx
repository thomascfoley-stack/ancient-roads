// @vitest-environment jsdom
//
// A095 — THE SIDEBAR COLLAPSE CONTROL SAYS WHICH WAY IT WILL GO, TO BOTH KINDS OF READER.
//
// The 2026-08-17 QA pass filed the chevron as "an unlabeled, undiscoverable chevron with no
// tooltip". Half was already false: both branches of `Sidebar` carried a state-correct
// `aria-label`. The true half was the tooltip — a sighted reader hovering a bare `<` or `>` got
// nothing back, so the control was discoverable only to a screen reader.
//
// WHY THIS FILE IS SHAPED THE WAY IT IS. The cheap version of this test — "the button has an
// aria-label" — passes against a hardcoded label and therefore proves nothing; that is exactly
// the defect B023 found on the bookmark control, which read "Bookmark" whether or not the verse
// was already bookmarked. So every assertion here is a TRANSITION, driven by clicking the real
// control: the name must CHANGE when the state changes, and the old name must be GONE. A fixed
// string in either branch fails on the second half of that pair no matter which string it is.
//
// Both directions are exercised (open → collapsed → open) because a control can be correct on the
// state it ships in and wrong on the one nobody looked at, and both attributes are asserted
// because a tooltip that disagrees with the accessible name is its own defect.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/sidebar';

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
  cleanup();
  vi.restoreAllMocks();
});

/** The one toggle in the rail, found by role alone — deliberately NOT by name, since the name is
 *  the thing under test and querying by it would assume the answer. */
function toggle(): HTMLElement {
  const buttons = screen.getAllByRole('button');
  expect(buttons, 'expected exactly one button in the collapsed/expanded rail chrome').toHaveLength(
    1,
  );
  return buttons[0];
}

describe('A095 — the sidebar collapse control names the state it will move to', () => {
  it('offers to COLLAPSE while open, and to EXPAND once collapsed', () => {
    render(<Sidebar />);

    // Open: the control must offer the action available from HERE.
    expect(toggle().getAttribute('aria-label')).toBe('Collapse sidebar');
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
      'the open sidebar offered to expand itself',
    ).toBeNull();

    fireEvent.click(toggle());

    // SEED THE DEFECT: hardcode `aria-label="Collapse sidebar"` on the collapsed-branch button in
    // sidebar.tsx (i.e. what a fixed label looks like) -> RED here. The control would still work
    // and would still announce the wrong direction, which is A095's class as filed.
    expect(toggle().getAttribute('aria-label')).toBe('Expand sidebar');
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
      'the collapsed sidebar still offered to collapse',
    ).toBeNull();

    // And BACK — a label that only follows the state on the way out is half a control.
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-label')).toBe('Collapse sidebar');
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
  });

  it('carries a hover tooltip that follows the state too', () => {
    render(<Sidebar />);

    // SEED: drop either `title` from sidebar.tsx -> RED. This is the half of A095 that was
    // genuinely broken; the aria-label half was already correct when the finding was filed.
    expect(toggle().getAttribute('title')).toBe('Collapse sidebar');

    fireEvent.click(toggle());
    expect(toggle().getAttribute('title')).toBe('Expand sidebar');
  });

  it('the tooltip and the accessible name never disagree', () => {
    render(<Sidebar />);

    // The property, not the strings: whatever the control is called, hovering it says the same
    // thing the screen reader does. Two hand-typed attributes are how that stops being true.
    for (const _pass of [0, 1]) {
      const el = toggle();
      expect(el.getAttribute('title')).toBe(el.getAttribute('aria-label'));
      fireEvent.click(el);
    }
  });
});
