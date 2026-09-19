// @vitest-environment jsdom
//
// SaveToShelf's cross-account staleness guard (work-header.tsx).
//
// `SaveToShelf` reads the signed-in reader's shelf via GET /api/work/[slug]/shelf and toggles it
// optimistically. Its effect used to key only on the boolean `signedIn`, never on the IDENTITY of
// the signed-in user, so when the signed-in account changed while /work/[slug] stayed mounted —
// the cross-tab sign-out / sign-in-as-a-different-reader flow on a shared device — `shelf` was
// never reset and NO fresh GET was dispatched for the new account (because `signedIn` never goes
// through `false` on that path: the session atom transitions A -> B directly via a fresh
// `/get-session` refetch). Account A's "Saved" then rendered as a lie about account B's stored
// state, and did not self-correct until the user interacted or navigated.
//
// This pins the guard at the COMPONENT level — the effect's dependency on `userId`. It drives the
// identity change directly via props so it is independent of the cross-tab auth mechanics that
// deliver the A -> B transition to a backgrounded tab (exercised through the real auth client in
// the session suite). SEED: drop `userId` from the effect's dep array (or revert the guard to
// `if (!signedIn) return` with `setShelf(undefined)` removed) and the "control hidden while
// account B's GET is in flight" and "a fresh GET was dispatched for account B" assertions go red
// while every test in work-header-save-shelf.test.tsx stays green — which is exactly the gap the
// old `[url, signedIn]` deps left open.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/reader-settings', () => ({ ReaderSettings: () => null }));

import { WorkHeader } from '@/components/work-header';

const SOURCE = {
  slug: 'qa-account-switch',
  title: 'A work',
  author: 'QA',
  tradition: 'qa',
  era: 'qa',
  license: 'Public Domain',
  source_type: 'sermon',
};

/** Each GET /api/work/[slug]/shelf resolves to the matching entry here (1-indexed per GET). */
let shelfResponses: ({ shelf: string | null } | undefined)[];
/** When set, that GET (1-indexed) is held until `releaseGet` fires it, so the in-flight "control
 *  hidden" state is observed rather than raced past. */
let holdGet: number | null;
let releaseGet: (() => void) | null;
let fetchMock: ReturnType<typeof vi.fn>;

function shelfGETs(): string[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => {
      const isShelf = String(url).includes('/shelf');
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      return isShelf && method === 'GET';
    })
    .map(([url]) => String(url));
}

beforeEach(() => {
  shelfResponses = [];
  holdGet = null;
  releaseGet = null;
  let getSeq = 0;
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/shelf') && method === 'GET') {
      getSeq += 1;
      const body = shelfResponses[getSeq - 1] ?? { shelf: null };
      if (holdGet === getSeq) {
        return new Promise<Response>((resolve) => {
          releaseGet = () => resolve(new Response(JSON.stringify(body), { status: 200 }));
        });
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SaveToShelf across a change of signed-in account', () => {
  it('resets, hides the control, and refetches when the account changes while signed-in stays true', async () => {
    // Account A has this work saved; account B does not — the disagreement that makes a stale
    // label a lie rather than a coincidence.
    shelfResponses = [{ shelf: 'saved' }, { shelf: null }];
    const { rerender } = render(
      <WorkHeader source={SOURCE} slug="qa-account-switch" signedIn userId="user-a" onOpenToc={() => {}} />,
    );
    const aBtn = await waitFor(() => screen.getByRole('button', { name: 'Saved' }));
    expect(aBtn.getAttribute('aria-pressed')).toBe('true');
    expect(shelfGETs()).toHaveLength(1);

    // The cross-tab account switch: same /work/[slug] tab, `signedIn` stays true, the identity
    // changes. Hold account B's GET so the in-flight state is observable.
    holdGet = 2;
    rerender(
      <WorkHeader source={SOURCE} slug="qa-account-switch" signedIn userId="user-b" onOpenToc={() => {}} />,
    );

    // A fresh GET for account B was dispatched (the old `[url, signedIn]` deps never changed on
    // this transition, so no GET ever fired for B)…
    await waitFor(() => expect(shelfGETs()).toHaveLength(2));
    // …and the control is hidden while B's GET is in flight: `shelf` reset to `undefined`, so
    // account A's "Saved" does not linger as a lie about B's stored state.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());

    // Release account B's GET (B never shelved this work) -> the truthful label renders.
    await act(async () => {
      releaseGet!();
    });
    const bBtn = await waitFor(() => screen.getByRole('button', { name: 'Save' }));
    expect(bBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not refetch or reset when the SAME signed-in user re-renders', async () => {
    // A parent re-render with the same identity must neither flicker the control nor spam the
    // route. The effect deps are unchanged, so the effect does not re-run. `props` is one stable
    // object and no `key` is set, so React reconciles in place rather than remounting.
    shelfResponses = [{ shelf: 'saved' }];
    const props = { source: SOURCE, slug: 'qa-account-switch', signedIn: true, userId: 'user-a', onOpenToc: () => {} };
    const { rerender } = render(<WorkHeader {...props} />);
    await waitFor(() => screen.getByRole('button', { name: 'Saved' }));
    expect(shelfGETs()).toHaveLength(1);

    rerender(<WorkHeader {...props} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(shelfGETs(), 'same userId -> deps unchanged -> no refetch').toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('hides on sign-out and does not flash the prior account on a later sign-in as someone else', async () => {
    shelfResponses = [{ shelf: 'saved' }, { shelf: null }];
    const { rerender } = render(
      <WorkHeader source={SOURCE} slug="qa-account-switch" signedIn userId="user-a" onOpenToc={() => {}} />,
    );
    await waitFor(() => screen.getByRole('button', { name: 'Saved' }));

    // A genuine sign-out: signedIn -> false (and userId -> undefined). The control disappears and
    // `shelf` resets, so the stale value is not lying in wait for the next sign-in.
    rerender(<WorkHeader source={SOURCE} slug="qa-account-switch" signedIn={false} onOpenToc={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();

    // Signing back in as a DIFFERENT account must not flash account A's "Saved" while B's GET is
    // in flight.
    holdGet = 2;
    rerender(
      <WorkHeader source={SOURCE} slug="qa-account-switch" signedIn userId="user-b" onOpenToc={() => {}} />,
    );
    await waitFor(() => expect(shelfGETs()).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull();
    await act(async () => {
      releaseGet!();
    });
    await waitFor(() => screen.getByRole('button', { name: 'Save' }));
  });

  it('refetches and resets when the WORK changes (the previous shelf does not cross over)', async () => {
    // The effect keys on `url` too: a different slug must not show the previous work's shelf while
    // the new work's GET is in flight.
    shelfResponses = [{ shelf: 'saved' }, { shelf: null }];
    const { rerender } = render(
      <WorkHeader source={SOURCE} slug="work-one" signedIn userId="user-a" onOpenToc={() => {}} />,
    );
    await waitFor(() => screen.getByRole('button', { name: 'Saved' }));
    expect(shelfGETs()).toHaveLength(1);

    holdGet = 2;
    rerender(<WorkHeader source={SOURCE} slug="work-two" signedIn userId="user-a" onOpenToc={() => {}} />);
    await waitFor(() => expect(shelfGETs()).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Saved' }), 'the previous work shelf must not linger').toBeNull();
    await act(async () => {
      releaseGet!();
    });
    await waitFor(() => screen.getByRole('button', { name: 'Save' }));
  });

  it('shows nothing and fetches nothing while signed out, even when a userId is present', async () => {
    // `signedIn` is the gate. A non-empty `userId` without `signedIn` (the brief window before
    // `mounted` flips, or any caller that has not yet committed to "signed in") must never paint a
    // signed-in surface or hit the route.
    render(<WorkHeader source={SOURCE} slug="qa-account-switch" signedIn={false} userId="user-a" onOpenToc={() => {}} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    expect(shelfGETs()).toHaveLength(0);
  });
});
