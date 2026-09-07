// @vitest-environment jsdom
//
// /studies RENDERS A SIGNED-OUT STATE INSTEAD OF SLAMMING THE DOOR.
//
// `/studies` did `if (!user) redirect('/auth/sign-in')`. Every other LIST surface in the app
// renders what the surface IS plus an invitation — /library/books ("Sign in to keep a shelf of
// your own."), /library/notes, /search, /library/uploads, the verse panel ("Sign in to highlight
// and save notes to your account →"). A bare redirect throws the visitor at a login form for a
// page they have never seen, with no way to find out what they would be signing in FOR.
//
// The page already holds the nullable user: it calls `currentUser()`, the helper whose own
// docstring exists so a page need not use exceptions for control flow. Only the line that threw
// the null away needed to change.
//
// The three item pages that still redirect (/studies/[id], /ask/[id], /account/[path]) are a
// different class and are deliberately left alone: a redirect off a SPECIFIC record is
// defensible, because there is nothing to show a stranger.
//
// SEED: restore `redirect('/auth/sign-in')` at studies/page.tsx:42 and the first two cases go red
// — redirect() throws NEXT_REDIRECT, so the render never happens.

import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable holder so a case can sign in or out.
const session: { user: { id: string; email: string } | null } = { user: null };

// Spreads the REAL @/lib/auth-failure so this mock carries every export the module has, not just
// the ones this file thought of — held by test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')),
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

const listStudies = vi.fn(async () => []);
vi.mock('@/lib/studies', () => ({
  listStudies: (...args: unknown[]) => listStudies(...args),
  STUDIES_PAGE_LIMIT: 20,
}));

// The two client components the page composes; neither is the property under test.
vi.mock('@/components/study-editor', () => ({ NewStudyButton: () => <button type="button">New study</button> }));
vi.mock('@/components/study-delete-button', () => ({ DeleteStudyButton: () => <button type="button">Delete</button> }));

// A redirect must NOT happen. Next's real redirect() throws; this one records and throws too, so
// a regression is loud rather than silently rendering nothing.
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

import StudiesPage from '../../src/app/studies/page';

const renderPage = async () => render(await StudiesPage({ searchParams: Promise.resolve({}) }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  listStudies.mockResolvedValue([]);
});

describe('/studies for a signed-out visitor', () => {
  it('does not redirect', async () => {
    session.user = null;
    await expect(renderPage()).resolves.toBeTruthy();
    expect(redirect, 'a list page shows a stranger what it is, it does not bounce them').not.toHaveBeenCalled();
  });

  it('says what Studies IS, and invites the visitor to sign in', async () => {
    session.user = null;
    await renderPage();

    // The surface names itself and explains itself — the same header a signed-in reader sees.
    expect(screen.getByRole('heading', { name: /my studies/i })).toBeTruthy();
    expect(screen.getByText(/your own writing beside attributed passages/i)).toBeTruthy();

    // The invitation, in the house voice: names the capability, not the obstacle.
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link.getAttribute('href')).toBe('/auth/sign-in');
  });

  it('asks the database nothing for a visitor with no account', async () => {
    session.user = null;
    await renderPage();
    expect(listStudies, 'no user id means no query to run').not.toHaveBeenCalled();
  });

  it('still lists studies for a signed-in reader, with no sign-in invitation', async () => {
    session.user = { id: 'user-1', email: 'reader@example.test' };
    listStudies.mockResolvedValue([
      { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', title: 'On Romans 8', updated_at: '2026-09-01T00:00:00Z', pinned_at: null },
    ] as never);

    await renderPage();

    expect(screen.getByText('On Romans 8')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^sign in$/i }), 'no invitation for someone already in').toBeNull();
    expect(listStudies).toHaveBeenCalled();
  });
});
