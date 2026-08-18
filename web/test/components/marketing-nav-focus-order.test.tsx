// @vitest-environment jsdom
//
// A098 — THE MARKETING HEADER'S KEYBOARD ORDER IS ITS VISUAL ORDER, AND THE CURRENT PAGE IS IN IT.
//
// Filed by the 2026-08-16 QA fleet as: "keyboard focus order in the header zigzags (logo → Log in
// on the far right → Features → Why) rather than following visual left-to-right order, and 'Home'
// is not itself focusable."
//
// TWO DEFECTS, ONE HEADER, and they have different causes:
//
//   1. THE ZIGZAG was a CSS reorder. The bar is a grid whose three children carried `sm:order-1`
//      (wordmark), `sm:order-3` (Log in) and `sm:order-2` (the links), while the DOM order was
//      wordmark → Log in → links. `order` moves the paint, never the tab stop, so a sighted
//      keyboard reader watched focus jump left edge → right edge → back to the middle. WCAG 2.4.3.
//      The fix is to author the DOM in the order the eye reads and place the cells explicitly —
//      NOT to reach for positive `tabindex`, which is an anti-pattern that fights every other
//      element on the page for position.
//
//   2. "HOME IS NOT FOCUSABLE" was a different thing entirely: the nav rendered the ACTIVE page as
//      a `<span aria-current="page">` rather than a link, so on `/` the Home item had no tab stop
//      at all. Dropping the current item is a defensible convention in general — but not here, for
//      two reasons this repo can point at. The app's OWN rail already made the opposite call
//      (`SidebarLink`, sidebar.tsx, renders every row as a `<Link>` and marks the current one with
//      `aria-current="page"`), so the two navigations in one product disagreed; and `aria-current`
//      exists precisely so the current item can STAY a link. The cost was concrete: a keyboard
//      reader on `/` could not tab back to the top of the site, and the header's tab-stop count
//      changed depending on which page they were on.
//
// WHAT THIS FILE CAN AND CANNOT SEE. jsdom has no layout engine: it cannot tell me where the
// "Log in" pill actually paints. So the visual half is pinned the only honest way available —
// by asserting the DOM/tab order directly (which IS the focus order, not a proxy for it) and by
// forbidding the one utility class family that can decouple the two. If a later change needs
// `order-*` here, it needs a browser check with it, and this test is where that argument happens.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketingNav, type MarketingPage } from '@/components/marketing/nav';

afterEach(cleanup);

/**
 * Every element a Tab press can land on, in DOM order — which, absent positive `tabindex`, IS the
 * order the browser walks them in. Deliberately a broad selector rather than "the anchors I expect
 * to find": a fix that satisfied this file by hiding a tab stop somewhere else would be caught.
 */
function focusOrder(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).map((el) => (el.textContent ?? '').trim());
}

describe('A098 — marketing header focus order', () => {
  it('walks skip link → wordmark → Home → Features → Why → Log in on the home page', () => {
    const { container } = render(<MarketingNav active="home" />);

    // SEED THE DEFECT: put the "Log in" <Link> back above the links <div> in nav.tsx (with its
    // `sm:order-3`) -> RED here, with "Log in" arriving second instead of last. That is exactly
    // the zigzag as filed.
    expect(focusOrder(container)).toEqual([
      'Skip to content',
      'Ancient Paths',
      'Home',
      'Features',
      'Why',
      'Log in',
    ]);
  });

  it('keeps that order on every marketing page, and the count never changes', () => {
    // The header must not gain or lose a tab stop depending on where the reader is standing.
    // SEED: revert the active item to a `<span aria-current="page">` -> RED on all three pages,
    // because the active label drops out of the list entirely.
    for (const page of ['home', 'features', 'why'] satisfies MarketingPage[]) {
      cleanup();
      const { container } = render(<MarketingNav active={page} />);
      expect(focusOrder(container), `focus order broke on the ${page} page`).toEqual([
        'Skip to content',
        'Ancient Paths',
        'Home',
        'Features',
        'Why',
        'Log in',
      ]);
    }
  });

  it('the current page is a focusable link that says it is current', () => {
    render(<MarketingNav active="home" />);

    // Both halves together. `getByRole('link')` will not match a <span>, so the first assertion is
    // the "Home is not focusable" finding stated as a property; the second keeps the state visible
    // to a screen reader, which the <span> version did get right and which must not be lost.
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home.getAttribute('href')).toBe('/');
    expect(home.getAttribute('aria-current')).toBe('page');

    // …and only the current one is marked. A blanket `aria-current` announces every item as the
    // page you are on, which is worse than none.
    expect(screen.getByRole('link', { name: 'Features' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Why' }).getAttribute('aria-current')).toBeNull();
  });

  it('reaches its order by DOM authoring, not by CSS reordering or positive tabindex', () => {
    const { container } = render(<MarketingNav active="home" />);

    // THE MECHANISM, not the symptom. `order-*` is what made the paint disagree with the DOM in
    // the first place; jsdom cannot see the paint, so the class is forbidden outright here.
    const reordered = Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter((el) =>
      el.className.split(/\s+/).some((c) => /(^|:)-?order-/.test(c)),
    );
    expect(
      reordered.map((el) => el.className),
      'a CSS `order-*` utility is back in the marketing header — it moves the paint but never the tab stop',
    ).toEqual([]);

    // The other way to "fix" a zigzag, and the reason it is not a fix: a positive tabindex hoists
    // these five above every other control in the document and has to be maintained page-wide.
    const positive = Array.from(container.querySelectorAll<HTMLElement>('[tabindex]')).filter(
      (el) => Number(el.getAttribute('tabindex')) > 0,
    );
    expect(positive, 'positive tabindex in the marketing header').toEqual([]);
  });
});
