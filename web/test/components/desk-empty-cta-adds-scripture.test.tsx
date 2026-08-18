// @vitest-environment jsdom
//
// A075 — REPORTED AS: "the empty desk's own 'Open the Bible' CTA navigates away to the plain reader
// instead of putting a Scripture pane on the desk, despite the empty-state copy promising exactly
// that" (docs/evidence/qa-fleet-2026-08-16/MASTER_QA_REPORT.md:374).
//
// MEASURED FALSE. The CTA has not been a link since `5760eec` (2026-08-02, "Desk panes navigate
// themselves; the Bible can be added"), which replaced a `<Link href="/desk?p=scripture:jhn/1">`
// — note: to a DESK, not to the reader — with a button that opens BookPicker in pick mode. Driven
// against the running app at 390px on 2026-08-17: clicking it left the URL on `/desk`, opened the
// dialog, and picking John 3 produced `/desk?p=scripture%3Ajhn%2F3` with one Scripture pane.
//
// SO WHY A TEST FOR A DEFECT THAT DOES NOT EXIST. Because "measured false" decays: the next person
// to touch this empty state has nothing telling them the button is load-bearing, and a `<Link
// href="/read/jhn/1">` is the obvious-looking thing to write there — it is shorter, it needs no
// state, and the page would still look right. This file is the difference between a finding that
// was closed and one that stays closed. It is a guard, NOT a fix: nothing in the product changed
// for A075.
//
// THE TWO LEGS ARE DELIBERATELY DIFFERENT IN KIND. The first is the finding's own words negated —
// no route out of the empty desk goes to the reader. On its own that is satisfied by a button that
// does nothing at all, so the second leg DRIVES the whole path and asserts the desk URL that comes
// out the far end. Neither leg alone is the check.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Same stub shape as desk-cap-notice.test.tsx: the desk reads `?p=` through useSearchParams and
// rewrites it through router.replace, so `replace` IS the observable outcome of adding a pane.
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: () => {} }),
  useSearchParams: () => params.current,
}));

import DeskPage from '@/app/desk/page';

beforeEach(() => {
  params.current = new URLSearchParams();
  // No pane is rendered on an empty desk, but the picker's own imports are happier with a fetch
  // that exists; a promise that never settles cannot resolve into anything this file asserts on.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('the empty desk keeps Scripture ON the desk', () => {
  it('offers no route to the plain reader — the Scripture call to action is not a link away', () => {
    const { container } = render(<DeskPage />);

    // The finding's claim, stated as the thing that would have to be in the DOM for it to be true.
    // Scoped to the desk's own markup: the app shell's nav has its own /read entry (mobile-nav's
    // "Bible"), which is a different control on a different surface and is not this page's to own.
    expect(
      container.querySelector('a[href^="/read"]'),
      'the empty desk links out to the plain reader — A075 would be real again',
    ).toBeNull();

    const cta = screen.getByRole('button', { name: 'Open the Bible' });
    expect(cta.getAttribute('href'), 'the CTA is a button; an href on it means it navigates').toBeNull();
  });

  it('picking a book and chapter puts a Scripture pane on the desk, in place', () => {
    render(<DeskPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the Bible' }));

    // Pick mode: the picker's cells hand the choice back instead of linking to /read. Driven
    // through the real two-stage flow (book, then chapter) rather than by calling onPick, because
    // the stage that could regress into a link is the one being exercised.
    const dialog = screen.getByRole('dialog', { name: /choose a book or chapter/i });
    expect(
      dialog.querySelector('a[href^="/read"]'),
      'the picker is not in pick mode — its cells still navigate to the reader',
    ).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'John' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '3' }));

    // The desk the reader ends on, not merely "something was called": a Scripture pane, on /desk.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]?.[0])).toBe('/desk?p=scripture%3Ajhn%2F3');
  });
});
