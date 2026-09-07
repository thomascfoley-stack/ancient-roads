// @vitest-environment jsdom
//
// NOT AN ASSERTION FILE — a render-to-HTML harness for the browser leg of Sidebar C's Definition of
// Done. The groups are signed-in only and the teacher-era sign-in is owner-only, so no agent can
// load them in a live session. This renders the REAL component with fixture data at three states
// and writes the markup out; a script then wraps it in the app's compiled stylesheet and
// screenshots it with headless Chrome. The result is a faithful composite (real markup, real CSS,
// no live session) and is labelled as such in the evidence. Skipped unless asked for by env, so
// the suite never pays for it.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.SIDEBAR_RENDER_OUT;

const session = vi.hoisted(() => ({ current: { user: { id: 'u-owner' } } as { user: { id: string } } | null }));
const pathname = vi.hoisted(() => ({ current: '/ask' }));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: session.current }) } }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }

import { SidebarNavContent } from '@/components/sidebar';

const THREADS = [
  'whats the difference between wisdom and understanding',
  'How have commentators understood being born again?',
  'the good shepherd',
  'Herod and the church at Ephesus',
  'What does “the Word became flesh” mean to the Fathers?',
].map((title, i) => ({ id: `${i + 1}`.repeat(8) + '-1111-4111-8111-111111111111', title }));
const STUDIES = [
  { id: 'romans-8', title: 'Romans 8 — no condemnation', pinned_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-05T00:00:00Z' },
  { id: 'good-shepherd', title: 'The Good Shepherd', pinned_at: null, updated_at: '2026-09-04T00:00:00Z' },
  { id: 'smt-3', title: 'Sermon on the Mount, week 3', pinned_at: null, updated_at: '2026-09-03T00:00:00Z' },
  { id: 'psalm-23', title: 'Psalm 23 for the funeral', pinned_at: null, updated_at: '2026-09-01T00:00:00Z' },
];
const PRAYERS = [
  { id: 'p1', body: 'For Sarah, before Tuesday', created_at: '2026-09-06T08:00:00Z' },
  { id: 'p2', body: 'Gratitude — the move is done', created_at: '2026-09-05T08:00:00Z' },
  { id: 'p3', body: "Wisdom for the elders' meeting", created_at: '2026-09-03T08:00:00Z' },
  { id: 'p4', body: 'Older one', created_at: '2026-08-30T08:00:00Z' },
];

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/api/research')) return Response.json({ threads: THREADS });
    if (u.startsWith('/api/studies')) return Response.json({ studies: STUDIES });
    if (u.startsWith('/api/prayers')) return Response.json({ prayers: PRAYERS });
    if (u.startsWith('/api/plans')) return Response.json({ plans: [{ id: 'pl1', title: 'John in 30 days' }] });
    if (u.startsWith('/api/user-corpus/documents')) return Response.json({ documents: [{ id: 'd1', title: 'Whitsun sermon 2026', status: 'ready' }, { id: 'd2', title: 'Notes on Hebrews', status: 'embedding' }], queue: [] });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function emit(name: string, html: string) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), html);
}

describe.skipIf(!OUT)('render Sidebar C states to HTML for the browser leg', () => {
  it('on /ask — research open by itself, the rest closed', async () => {
    pathname.current = '/ask';
    const { container } = render(<SidebarNavContent />);
    await waitFor(() => screen.getByText(THREADS[0]!.title));
    emit('rail-ask', container.innerHTML);
  });

  it('on /studies — studies open by itself; prayers opened by hand', async () => {
    pathname.current = '/studies/romans-8';
    const { container } = render(<SidebarNavContent />);
    await waitFor(() => screen.getByText(STUDIES[0]!.title));
    fireEvent.click(screen.getByRole('button', { name: /Prayer journal/ }));
    await waitFor(() => screen.getByText(/For Sarah/));
    emit('rail-studies', container.innerHTML);
  });

  it('on /library — the shelves, everything of yours closed', async () => {
    pathname.current = '/library';
    const { container } = render(<SidebarNavContent />);
    await waitFor(() => screen.getByText('Commentaries'));
    emit('rail-library', container.innerHTML);
  });

  it('mobile sheet on /ask — touch rows', async () => {
    pathname.current = '/ask';
    const { container } = render(<SidebarNavContent touch />);
    await waitFor(() => screen.getByText(THREADS[0]!.title));
    emit('sheet-ask', container.innerHTML);
  });
});
