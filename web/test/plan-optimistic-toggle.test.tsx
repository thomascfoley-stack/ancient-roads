// @vitest-environment jsdom
//
// L2 STEP 2 — THE MARK-AS-READ TOGGLE IS OPTIMISTIC, WITH ROLLBACK ON ERROR.
//
// MASTER.md C3 deferred step 2 to the next deploy: the tick used to wait for the POST AND the
// re-read before moving, which read as a dead tap on phones (the very complaint the pre-L2
// comments in plans-client.tsx record). The toggle now flips the instant it is tapped and
// reverts — with the standard error line — when the write fails. Both halves are driven
// against the REAL PlansClient: the POST is a deferred promise the test resolves when it
// chooses, so "flips before the server answers" is asserted, not narrated.
// SEED: drop the setFlips optimistic write (or the rollback) in PlanDetail -> RED.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// PlansClient routes now (/plans/[id]); outside the app router the hook throws.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';

afterEach(() => cleanup());

// jsdom ships no matchMedia and PlanDetail renders VerseRef, which asks `(hover: hover)` —
// the same parrot stub verse-ref-preview.test.tsx uses. Media queries are NOT this file's
// subject (the toggle is), so the fixed answer asserts nothing about them.
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
}));

const PLAN_ID = '11111111-2222-3333-4444-555555555555';
const OPEN_PLAN = {
  plan: { id: PLAN_ID, title: 'Romans' },
  days: [
    { day_index: 1, day_date: '2026-08-20', verse_start: 45001001, verse_end: 45001007, completed_at: null },
    { day_index: 2, day_date: '2026-08-21', verse_start: 45001008, verse_end: 45001016, completed_at: null },
  ],
  readings: [],
};

let postGate: { resolve: (r: unknown) => void } | null;

beforeEach(() => {
  postGate = null;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      // The server answer the test controls — deferred so the optimistic window is observable.
      return new Promise((resolve) => { postGate = { resolve }; });
    }
    if (u.startsWith(`/api/plans/${PLAN_ID}`)) {
      return Promise.resolve({ ok: true, status: 200, json: async () => OPEN_PLAN } as unknown as Response);
    }
    if (u.startsWith('/api/plans')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ plans: [{ id: PLAN_ID, title: 'Romans', total_days: 2, read_days: 0 }] }),
      } as unknown as Response);
    }
    throw new Error(`unstubbed fetch: ${u}`);
  }));
});

async function openPlan() {
  render(<PlansClient initialPlanId={PLAN_ID} />);
  await screen.findByRole('button', { name: 'Mark day 1 read' });
}

describe('the day toggle is optimistic (L2 step 2)', () => {
  it('flips the tick before the server answers, then keeps it once the write lands', async () => {
    await openPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 read' }));
    // POST is still in flight (postGate unresolved): the tick must ALREADY read as done.
    await screen.findByRole('button', { name: 'Mark day 1 unread' });
    expect(postGate).not.toBeNull();
    postGate!.resolve({ ok: true, status: 200, json: async () => ({}) });
    // After the write + re-read reconcile, the state holds.
    await screen.findByRole('button', { name: 'Mark day 1 unread' });
  });

  it('rolls the tick back and says so when the write fails', async () => {
    await openPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 read' }));
    await screen.findByRole('button', { name: 'Mark day 1 unread' }); // optimistic flip
    postGate!.resolve({ ok: false, status: 500, json: async () => ({}) });
    await screen.findByRole('button', { name: 'Mark day 1 read' }); // rolled back
    await waitFor(() => expect(screen.getByText(/could not be saved/i)).toBeTruthy());
  });
});
