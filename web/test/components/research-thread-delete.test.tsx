// @vitest-environment jsdom
//
// RESEARCH THREAD DELETE — the control, its two steps, and its rollback.
//
// Every /ask submission persists a thread and nothing could remove one: no control in the sidebar,
// none on the thread page, no endpoint. The 2026-08-17 authenticated QA pass left nine on the
// owner's real account and filed it as an outstanding action item.
//
// A SIGNED-IN BROWSER WALK IS NOT RUN and is recorded as such, the same way
// `pray-entry-point.test.tsx` records it: local sign-in needs Neon Auth credentials that are not
// in this working tree, and the Research history section renders nothing at all when signed out.
// These are the checks that walk would have made, at the level a jsdom render honestly can.
//
// WHAT IS PINNED, AND WHY EACH ONE:
//   * TWO STEPS. This is irreversible and it sits in a nav rail next to ordinary links. One stray
//     tap must not destroy a reader's work.
//   * OPTIMISTIC, WITH ROLLBACK. The row goes immediately; a spinner on a delete reads as "did
//     that work?". But a failed request that left the row gone would be a lie about the account's
//     contents, so the failure path is asserted, not assumed.
//   * THE RIGHT ID. A delete control that removes the wrong row is worse than none.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/ask' }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import { SidebarNavContent } from '../../src/components/sidebar';

const THREADS = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'What is grace?' },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Who is the good shepherd?' },
];

let deleteCalls: string[] = [];
let deleteOk = true;

beforeEach(() => {
  deleteCalls = [];
  deleteOk = true;
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') {
      deleteCalls.push(String(url));
      return new Response(null, { status: deleteOk ? 204 : 500 });
    }
    if (String(url).startsWith('/api/research')) {
      return Response.json({ threads: THREADS });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function firstDeleteButton() {
  return await screen.findByRole('button', { name: /Delete research thread: What is grace\?/i });
}

describe('the research-history delete control', () => {
  it('takes two taps: the first arms, the second deletes', async () => {
    // SEED: make the first tap call remove() directly -> RED. A single stray tap in a nav rail
    // would destroy a thread irreversibly.
    render(<SidebarNavContent />);
    const btn = await firstDeleteButton();

    fireEvent.click(btn);
    expect(deleteCalls, 'the FIRST tap issued a delete').toEqual([]);
    // Armed state announces itself rather than only changing colour.
    await screen.findByRole('button', { name: /Confirm delete: What is grace\?/i });

    fireEvent.click(screen.getByRole('button', { name: /Confirm delete: What is grace\?/i }));
    await waitFor(() => expect(deleteCalls).toHaveLength(1));
  });

  it('deletes the row it is on, by id', async () => {
    render(<SidebarNavContent />);
    const btn = await firstDeleteButton();
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete: What is grace\?/i }));
    await waitFor(() =>
      expect(deleteCalls[0], 'deleted the wrong thread').toBe(`/api/research/${THREADS[0]!.id}`),
    );
    // The other thread is untouched.
    expect(screen.getByText('Who is the good shepherd?')).toBeTruthy();
  });

  it('removes the row optimistically', async () => {
    render(<SidebarNavContent />);
    const btn = await firstDeleteButton();
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete: What is grace\?/i }));
    await waitFor(() => expect(screen.queryByText('What is grace?')).toBeNull());
  });

  it('puts the row BACK when the request fails — the list must not lie about the account', async () => {
    // SEED: drop the rollback in the catch -> RED. The thread would still exist on the account
    // while the product showed it gone, which is the failure mode this whole slice exists to fix,
    // inverted.
    deleteOk = false;
    render(<SidebarNavContent />);
    const btn = await firstDeleteButton();
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete: What is grace\?/i }));
    await waitFor(() => expect(deleteCalls).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('What is grace?')).toBeTruthy());
  });
});
