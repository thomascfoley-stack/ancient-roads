// @vitest-environment jsdom
//
// THE ICON RAIL'S /ask LINK IS "Ask", NOT "Ancient Paths".
//
// `IconRailLinks` (sidebar.tsx:1110) is the icon-only rail rendered by the sidebar's two mutually
// exclusive narrow states — the prayer-writing rail and the collapsed-tablet rail. Each entry
// binds its `label` to BOTH `aria-label` (the screen-reader accessible name) and `title` (the hover
// tooltip) and renders NO visible text — so the label string is the entire identification of the
// link to a screen reader AND the entire text a hover shows. There is no visible-text fallback to
// override a wrong label.
//
// Until this fix the rail's /ask entry read `label: 'Ancient Paths'` — the product's bare brand
// wordmark — while every other persistent navigation surface read "Ask": the same file's expanded
// `<SidebarLink href="/ask" label="Ask" ...>` (sidebar.tsx:202) and `mobile-nav.tsx:75`'s bottom
// tab (`{ href: '/ask', label: 'Ask' }`). dce4401b ("Give /ask one name instead of four")
// established that two nav labels for one destination is not normal; the rail was the lone surface
// it never reached — `5ffe57f0` introduced the rail with the stale string, `600d639b` carried it
// verbatim into the shared component. The `IconRailLinks` doc block itself names label drift
// "the failure mode this repo keeps a running count of," and the shared component exists to keep
// the TWO RAILS one list — but it stops at rail-vs-rail; rail-vs-full-nav drift is unguarded, which
// is the gap the legs below close.
//
// NOT dce4401b'S SAME-DOM COLLISION — A STALE STRING ON A SURFACE THE FIX NEVER REACHED, PLUS A
// CROSS-STATE COLLISION. The wordmark "Ancient Paths" → /home lives only in the expanded branch;
// the rail renders in two separate if-returns that contain no wordmark, so when the rail is up the
// wordmark is out of the DOM. The geometry dce4401b removed (the app's name twice in one column
// leading to two places) does not exist on the rail. What carried over is a stale string a screen
// reader hears as the Ask destination's only name and a sighted reader sees on every hover — plus
// a cross-state collision (expanded: "Ancient Paths" → /home; rail: "Ancient Paths" → /ask) the
// relabel closes: after it, the wordmark owns the string alone and the rail's /ask glyph says
// "Ask" to both kinds of reader.
//
// WHAT IS GUARDED HERE THAT THE PARITY TEST IS NOT. `sidebar-tablet-default.test.tsx` compares the
// collapsed rail against the writing rail — both render the same `IconRailLinks` list, so a wrong
// label is identical on both sides and equality holds trivially. That test catches rail-vs-rail
// drift; nothing in the suite compared the rail's /ask name against the expanded SidebarLink's
// /ask name, and nothing pinned the /ask rail accessible name at all. The legs below pin the name
// AND assert the rail agrees with the full nav.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/sidebar';
import { stubMatchMedia } from '../helpers/match-media';

// The two things the shell needs from outside itself, stubbed at their least interesting value —
// same reasoning (and the same ResizeObserver note) as sidebar-tablet-default.test.tsx.
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
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

/**
 * The /ask link in whatever rail/sidebar state is currently rendered, found by its accessible
 * name. Testing Library's `getByRole('link', { name })` matches the COMPUTED accessible name (the
 * rail's `aria-label`, or the expanded SidebarLink's visible text), so resolving by name 'Ask'
 * both LOCATES the /ask destination and ASSERTS the name is "Ask" (an exact match). Resolving by
 * 'Ask' rather than by href means a mislabel back to "Ancient Paths" makes the query throw —
 * which is RED, and is the point.
 */
function askLink(): HTMLAnchorElement {
  return screen.getByRole('link', { name: 'Ask' }) as HTMLAnchorElement;
}
/** The accessible-name string of the /ask link, pulled raw for the cross-surface equality leg. */
function askName(): string {
  const el = askLink();
  return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
}
/** Every rail link's announced name — used to check the bare brand never rides an icon glyph.
 *  `getAttribute` returns `string | null` (the expanded SidebarLink carries no `aria-label`); on
 *  either rail every link has one, but the type is kept honest rather than asserted at the call. */
function railLinkNames(): (string | null)[] {
  return screen.getAllByRole('link').map((el) => el.getAttribute('aria-label'));
}

describe('the icon rail labels the /ask destination "Ask" — one name, like the full nav and mobile tab', () => {
  it('the collapsed-tablet rail announces "Ask" and tooltips "Ask" on the /ask glyph', () => {
    // SEED THE DEFECT: in sidebar.tsx's `IconRailLinks`, set the /ask entry's label back to
    // 'Ancient Paths' -> RED here. The accessible name reverts to the bare brand, the hover tooltip
    // with it, and the only identification a screen reader and a hovering sighted reader get on an
    // icon-only link is wrong — the bug 5ffe57f0 carried in and 600d639b carried verbatim into the
    // shared component. (A tablet boots into this rail at 768–1023.98px; SR-reachable by Tab.)
    // The collapsed rail is the SR-reachable surface; the writing rail renders the SAME list, so
    // `sidebar-tablet-default.test.tsx`'s parity leg keeps the other rail honest without re-pinning
    // the literal here.
    stubMatchMedia(768);
    render(<Sidebar />);

    expect(askLink().getAttribute('href'), 'the "Ask" name is on the wrong destination').toBe('/ask');
    expect(askLink().getAttribute('aria-label'), 'the rail named /ask with the bare brand').toBe('Ask');
    expect(askLink().getAttribute('title'), 'hovering the /ask glyph shows the bare brand').toBe('Ask');

    // The wordmark string belongs to the /home wordmark — which the rail branch does NOT render —
    // so if "Ancient Paths" appears here at all it is a /ask (or other) entry stealing the brand.
    expect(railLinkNames(), 'the bare brand wordmark leaked onto the rail').not.toContain('Ancient Paths');
  });

  it('the rail /ask name matches the expanded full nav /ask name (rail-vs-full-nav, not just rail-vs-rail)', () => {
    // The parity test in sidebar-tablet-default.test.tsx compares collapsed-rail vs writing-rail —
    // both the SAME `IconRailLinks` list, so a wrong label is equal on both sides and the test
    // stays green. This leg compares the rail against a DIFFERENT list: the expanded sidebar's
    // `<SidebarLink href="/ask" label="Ask">`. SEED THE DEFECT: change ONE surface's /ask label
    // (the rail's back to 'Ancient Paths', OR the expanded SidebarLink's) -> RED here — the name a
    // reader hears at tablet/writing width differs from the name they hear on the full sidebar.

    // Expanded full sidebar (1280px, not writing) — the /ask SidebarLink with the visible "Ask".
    stubMatchMedia(1280);
    render(<Sidebar />);
    const expandedName = askName();
    expect(expandedName, 'precondition: the expanded sidebar names /ask something').toBeTruthy();
    cleanup();

    // Collapsed-tablet rail (768px) — the icon-only /ask rail link.
    stubMatchMedia(768);
    render(<Sidebar />);
    const railName = askName();

    expect(railName, 'the rail no longer names /ask "Ask"').toBe('Ask');
    expect(expandedName, 'the expanded full nav no longer names /ask "Ask"').toBe('Ask');
    expect(railName, 'rail and full nav disagree on the /ask name').toBe(expandedName);
  });
});
