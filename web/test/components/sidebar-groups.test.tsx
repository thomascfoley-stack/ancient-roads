// @vitest-environment jsdom
//
// THE RAIL AS A SET OF GROUPS YOU OPEN AND CLOSE — Sidebar C (owner: "#1 do it", 2026-09-07).
//
// The rail before this file: five links, then Research history (5 threads, a delete control on
// each), then My studies (5), then Prayer journal, then eleven Library rows, then Settings —
// every one of them always visible, nothing closable, ~30 rows on a signed-in desktop. The
// owner's instruction (2026-09-06): cap the lists at three or four, make each group expandable
// and collapsible, and do it for research, studies, prayers, uploads and plans alike.
//
// What this file pins, in the owner's words and the two amendments they accepted:
//   1. FIVE PLACES NEVER MOVE: Home · Bible · Ask · Desk · Library. Reading plans is no longer one
//      of them — it is a group like the others.
//   2. A GROUP SHOWS THREE. Its most recent three, then a way to all of them — and "all of them"
//      is a PAGE, never an inline list of everything (the amendment: forty threads in a rail is
//      the mess being removed). The one exception is research, which has no list page yet: it
//      alone may unfold further in place, because the alternative is threads 4..N being
//      unreachable from anywhere.
//   3. THE PAGE'S OWN GROUP OPENS ITSELF; THE REST REMEMBER. Land on /ask and Research is open
//      without a click. Open My studies by hand on /ask and it is still open on /home tomorrow.
//      But Research being open on /ask is NOT remembered — otherwise every group ends up open
//      within a week and the rail is busy again.
//   4. THE LIBRARY SHELVES FOLD BEHIND LIBRARY. The eleven rows appear only while you are in the
//      library; elsewhere "Library" is one row.
//   5. SIGNED OUT, NOTHING IS LOST: Reading plans and the Prayer journal stay reachable as plain
//      links, because they were before.
//
// Every list here is capped at THREE by the component, so the fixtures return FIVE of each — a cap
// that merely matches the fixture size proves nothing.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_IDS } from '@/lib/catalog-defs';

const session = vi.hoisted(() => ({ current: { user: { id: 'u-test' } } as { user: { id: string } } | null }));
const pathname = vi.hoisted(() => ({ current: '/ask' }));

vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: session.current }) },
}));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import { SidebarNavContent } from '@/components/sidebar';

const THREADS = [1, 2, 3, 4, 5].map((n) => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`,
  title: `Thread ${n}`,
}));
const STUDIES = [1, 2, 3, 4, 5].map((n) => ({
  id: `study-${n}`,
  title: `Study ${n}`,
  pinned_at: null,
  updated_at: `2026-09-0${n}T00:00:00Z`,
}));
const PRAYERS = [1, 2, 3, 4, 5].map((n) => ({
  id: `prayer-${n}`,
  body: `Prayer ${n} — for the day`,
  verse_id: null,
  created_at: `2026-09-0${n}T08:00:00Z`,
  updated_at: `2026-09-0${n}T08:00:00Z`,
}));
const PLANS = [1, 2, 3, 4, 5].map((n) => ({ id: `plan-${n}`, title: `Plan ${n}` }));
const DOCS = [1, 2, 3, 4, 5].map((n) => ({ id: `doc-${n}`, title: `Sermon ${n}`, status: 'ready' }));

let fetchCalls: string[] = [];

beforeEach(() => {
  session.current = { user: { id: 'u-test' } };
  pathname.current = '/ask';
  fetchCalls = [];
  window.localStorage.clear();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    fetchCalls.push(u);
    if (u.startsWith('/api/research')) return Response.json({ threads: THREADS });
    if (u.startsWith('/api/studies')) return Response.json({ studies: STUDIES });
    if (u.startsWith('/api/prayers')) return Response.json({ prayers: PRAYERS });
    if (u.startsWith('/api/plans')) return Response.json({ plans: PLANS });
    if (u.startsWith('/api/user-corpus/documents')) return Response.json({ documents: DOCS, queue: [] });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const group = (name: RegExp) => screen.getByRole('button', { name });
const links = (container: HTMLElement, prefix: string) =>
  [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith(prefix));

describe('Sidebar C — five places, and everything of yours as a group', () => {
  it('the five places are links; Reading plans is a group, not a place', () => {
    render(<SidebarNavContent />);
    for (const name of [/^Home$/, /^Bible$/, /^Ask$/, /^Desk$/, /^Library$/]) {
      expect(screen.getByRole('link', { name }), `no place link ${name}`).toBeTruthy();
    }
    // A group header is a BUTTON with aria-expanded; a place is a link. Reading plans moved.
    expect(screen.queryByRole('link', { name: /^Reading plans$/ })).toBeNull();
    expect(group(/Reading plans/).getAttribute('aria-expanded')).toBe('false');
  });

  it('on /ask the Research group opens itself, shows THREE of five threads, and every other group is closed', async () => {
    const { container } = render(<SidebarNavContent />);
    expect(group(/Research history/).getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(links(container, '/ask/')).toHaveLength(3));
    expect(screen.getByText('Thread 1')).toBeTruthy();
    expect(screen.queryByText('Thread 4'), 'the cap is three').toBeNull();
    for (const name of [/My studies/, /Prayer journal/, /Reading plans/]) {
      expect(group(name).getAttribute('aria-expanded'), `${name} should be closed on /ask`).toBe('false');
    }
    expect(links(container, '/studies/'), 'a closed group renders no items').toHaveLength(0);
    // A closed group has not even been fetched — bounded network, and prayers are full texts.
    expect(fetchCalls.some((u) => u.startsWith('/api/studies'))).toBe(false);
    expect(fetchCalls.some((u) => u.startsWith('/api/prayers'))).toBe(false);
  });

  it('research alone unfolds further in place — there is no list page for it yet', async () => {
    const { container } = render(<SidebarNavContent />);
    await waitFor(() => expect(links(container, '/ask/')).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /More research/ }));
    await waitFor(() => expect(links(container, '/ask/')).toHaveLength(5));
    fireEvent.click(screen.getByRole('button', { name: /Fewer/ }));
    await waitFor(() => expect(links(container, '/ask/')).toHaveLength(3));
  });

  it('opening My studies fetches it once, shows three, and "All studies" is a page', async () => {
    const { container } = render(<SidebarNavContent />);
    fireEvent.click(group(/My studies/));
    expect(group(/My studies/).getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(links(container, '/studies/')).toHaveLength(3));
    expect(fetchCalls.filter((u) => u.startsWith('/api/studies'))).toHaveLength(1);
    const all = screen.getByRole('link', { name: /All studies/ });
    expect(all.getAttribute('href')).toBe('/studies');
    // Closing hides the items and does not refetch on reopen.
    fireEvent.click(group(/My studies/));
    expect(links(container, '/studies/')).toHaveLength(0);
    fireEvent.click(group(/My studies/));
    await waitFor(() => expect(links(container, '/studies/')).toHaveLength(3));
    expect(fetchCalls.filter((u) => u.startsWith('/api/studies'))).toHaveLength(1);
  });

  it('a group opened by hand is remembered across pages; one the page opened is not', async () => {
    render(<SidebarNavContent />);
    fireEvent.click(group(/My studies/));
    await waitFor(() => expect(screen.getByText('Study 1')).toBeTruthy());
    const raw = window.localStorage.getItem('rail-groups:v1:u-test');
    expect(raw, 'the hand-opened group was not persisted').toBeTruthy();
    const stored = JSON.parse(raw ?? '{}') as Record<string, boolean>;
    expect(stored.studies).toBe(true);
    expect(stored.research, 'the page-opened group must NOT be persisted — every group ends up open').toBeUndefined();

    cleanup();
    pathname.current = '/home';
    render(<SidebarNavContent />);
    await waitFor(() => expect(group(/My studies/).getAttribute('aria-expanded')).toBe('true'));
    expect(group(/Research history/).getAttribute('aria-expanded')).toBe('false');
  });

  it("the page's own group opens itself even when nothing was stored", async () => {
    pathname.current = '/studies/study-2';
    const { container } = render(<SidebarNavContent />);
    expect(group(/My studies/).getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(links(container, '/studies/')).toHaveLength(3));
    expect(group(/Research history/).getAttribute('aria-expanded')).toBe('false');
    // The row for the page you are on is marked current.
    expect(container.querySelector('a[href="/studies/study-2"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('each of the other groups opens to three and a page: prayers, works, plans', async () => {
    pathname.current = '/home';
    const { container } = render(<SidebarNavContent />);
    fireEvent.click(group(/Prayer journal/));
    await waitFor(() => expect(links(container, '/prayers')).toContain('/prayers'));
    expect(screen.getByRole('link', { name: /All prayers/ }).getAttribute('href')).toBe('/prayers');
    // Prayer rows are the prayer's opening words, not an id.
    expect(screen.getByText(/Prayer 1/)).toBeTruthy();
    expect(screen.queryByText(/Prayer 4/)).toBeNull();

    fireEvent.click(group(/Reading plans/));
    await waitFor(() => expect(links(container, '/plans/')).toHaveLength(3));
    expect(screen.getByRole('link', { name: /All plans/ }).getAttribute('href')).toBe('/plans');

    fireEvent.click(group(/My Works/));
    await waitFor(() => expect(links(container, '/library/uploads/')).toHaveLength(3));
    expect(screen.getByRole('link', { name: /All My Works/ }).getAttribute('href')).toBe('/library/uploads');
  });

  it('an empty group says so quietly instead of rendering a header over nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/research')) return Response.json({ threads: [] });
      return Response.json({});
    }));
    render(<SidebarNavContent />);
    await waitFor(() => expect(screen.getByText(/nothing yet/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /More research/ })).toBeNull();
  });

  it('the library shelves appear only while you are in the library', () => {
    pathname.current = '/ask';
    const { container: onAsk } = render(<SidebarNavContent />);
    for (const id of CATALOG_IDS) {
      expect(onAsk.querySelector(`a[href="/library/${id}"]`), `${id} shelf leaked onto /ask`).toBeNull();
    }
    cleanup();
    pathname.current = '/library';
    const { container: onLibrary } = render(<SidebarNavContent />);
    for (const id of CATALOG_IDS) {
      expect(onLibrary.querySelector(`a[href="/library/${id}"]`), `${id} shelf missing on /library`).toBeTruthy();
    }
  });

  it('signed out: the five places, plain links to Reading plans and the Prayer journal, no groups', () => {
    session.current = null;
    pathname.current = '/home';
    const { container } = render(<SidebarNavContent />);
    expect(screen.getByRole('link', { name: /^Reading plans$/ }).getAttribute('href')).toBe('/plans');
    expect(screen.getByRole('link', { name: /^Prayer journal$/ }).getAttribute('href')).toBe('/prayers');
    expect(container.querySelectorAll('[aria-expanded]'), 'a signed-out visitor has no groups to open').toHaveLength(0);
    expect(screen.getByRole('link', { name: /^Sign in$/ })).toBeTruthy();
    expect(fetchCalls, 'nothing is fetched for a visitor with no account').toHaveLength(0);
  });

  it('the research delete control survives the move into a group', async () => {
    render(<SidebarNavContent />);
    const del = await screen.findByRole('button', { name: /Delete research thread: Thread 1/ });
    expect(del).toBeTruthy();
    // The control sits IN THE ROW of the thread it names — beside that thread's own link, not
    // somewhere in the panel. (The first draft searched an ancestor of `del` for `del`, which
    // could not fail — deep audit, 2026-09-07.)
    const row = del.parentElement!;
    expect(within(row).getByRole('link', { name: /Thread 1/ }).getAttribute('href')).toBe(`/ask/${THREADS[0]!.id}`);
    expect(within(row).queryByRole('link', { name: /Thread 2/ })).toBeNull();
  });
});
