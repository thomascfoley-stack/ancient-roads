// @vitest-environment jsdom
//
// L2 step 2 (MASTER.md C3): the mark-as-read toggle is OPTIMISTIC — the tick paints before the
// POST resolves, and a failed write ROLLS BACK the paint and names the failure. The shipped
// toggle awaited the POST and then the re-read before anything moved, which on a phone read as
// a dead tap; the pre-2026-08-07 shape flipped unconditionally and silently reverted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';

// jsdom ships no matchMedia; VerseRef consults `(hover: hover)` on mount. Stubbed here, not
// guarded in the component — the gap is in this environment (see test/helpers/match-media.ts).
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID = '11111111-2222-4333-8444-555555555555';
const LIST = { plans: [{ id: ID, title: 'Gospels', total_days: 2, read_days: 0 }] };
const OPEN_UNREAD = {
  plan: { id: ID, title: 'Gospels' },
  days: [{ day_index: 1, day_date: '2099-01-01', verse_start: 43001001, verse_end: 43001010, completed_at: null }],
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** fetch stub: list + detail served; the POST is a deferred promise the test resolves by hand. */
function stubFetchDeferred(post: { resolve: (res: Response) => void }) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      return new Promise<Response>((res) => { post.resolve = res; });
    }
    if (u === '/api/plans') return Promise.resolve(ok(LIST));
    return Promise.resolve(ok(OPEN_UNREAD));
  }));
}

describe('plan mark-as-read — optimistic toggle (L2 step 2)', () => {
  it('paints the tick BEFORE the write resolves, then keeps it on success', async () => {
    const post = { resolve: () => {} };
    stubFetchDeferred(post);
    render(<PlansClient initialPlanId={ID} />);
    const btn = await screen.findByRole('button', { name: 'Mark day 1 read' });

    fireEvent.click(btn);
    // The POST is still in flight — the paint must not wait for it.
    // SEED: restore the awaited-write toggle (no onPatchDay before fetch) -> RED here.
    await screen.findByRole('button', { name: 'Mark day 1 unread' });

    post.resolve(ok({}));
    // The success path re-reads; the stub serves the still-unread detail, but the write
    // succeeded, so no error and no rollback may appear.
    await waitFor(() => expect(screen.queryByText(/could not be saved/i)).toBeNull());
  });

  it('rolls the paint BACK and names the failure when the write fails', async () => {
    const post = { resolve: () => {} };
    stubFetchDeferred(post);
    render(<PlansClient initialPlanId={ID} />);
    const btn = await screen.findByRole('button', { name: 'Mark day 1 read' });

    fireEvent.click(btn);
    await screen.findByRole('button', { name: 'Mark day 1 unread' });

    post.resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    // SEED: drop the onPatchDay rollback from the !ok branch -> the tick stays painted -> RED.
    await screen.findByRole('button', { name: 'Mark day 1 read' });
    expect(screen.getByText(/could not be saved/i)).toBeTruthy();
  });
});
