// @vitest-environment jsdom
//
// L2 STEP 2 — THE MARK-AS-READ TOGGLE IS OPTIMISTIC (MASTER.md C3: "Step 2 (optimistic
// toggle) deferred to the next deploy"; it never shipped — verified absent at the deployed
// 2611e1f and at origin/main before this change). Before: the tick waited on the POST AND a
// full re-fetch, so on a phone on low signal a tap read as dead for seconds — this app's
// core use context (CLAUDE.md). After: the day flips immediately, the write goes through
// persistWrite (L1's retry policy, unit-tested in persist-write-retry.test.ts), and a failed
// write ROLLS THE DAY BACK and surfaces the component's standard error — the
// optimistic-rollback contract the annotation writes already keep
// (use-annotation-writes.ts).
//
// RED-PROOF: the first case fails against the pre-fix toggle (it awaits the POST before
// anything repaints); the rollback case is seeded by deleting the rollback line.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom ships no matchMedia and VerseRef consults one on mount (hover/pointer capability);
// the same inline stub shape verse-ref-preview.test.tsx uses — the gap is jsdom's, not the
// product's, so it is stubbed here rather than guarded in the component.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});

const ID = '11111111-2222-4333-8444-555555555555';

const DAYS: { day_index: number; day_date: string; verse_start: number; verse_end: number; completed_at: string | null }[] = [
  { day_index: 1, day_date: '2020-01-01', verse_start: 1001001, verse_end: 1001025, completed_at: null },
  { day_index: 2, day_date: '2020-01-02', verse_start: 1002001, verse_end: 1002025, completed_at: null },
];

/** A fetch stub whose POST response the test controls, backed by a faithful fake server:
 *  a successful POST flips the day in the stub's own state, so a later GET returns it. */
function stubFetch(post: (body: { dayIndex?: number; completed?: boolean }) => Promise<Response>) {
  const serverDays = DAYS.map((d) => ({ ...d }));
  const calls: { url: string; method: string }[] = [];
  const stub = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: String(url), method });
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { dayIndex?: number; completed?: boolean };
      return post(body).then((res) => {
        if (res.ok && typeof body.dayIndex === 'number') {
          const day = serverDays.find((d) => d.day_index === body.dayIndex);
          if (day) day.completed_at = body.completed ? '2020-01-01T12:00:00.000Z' : null;
        }
        return res;
      });
    }
    if (String(url) === '/api/plans') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ plans: [] }) } as unknown as Response);
    }
    // GET one plan — the fake server's current truth.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ plan: { id: ID, title: 'Test plan' }, days: serverDays, readings: [] }),
    } as unknown as Response);
  });
  vi.stubGlobal('fetch', stub);
  return calls;
}

async function openPlan(): Promise<void> {
  render(<PlansClient initialPlanId={ID} />);
  await screen.findByRole('button', { name: 'Mark day 1 read' });
}

describe('the day toggle is optimistic with rollback on error (L2 step 2)', () => {
  it('paints the tick BEFORE the network answers — not after the re-fetch', async () => {
    // A POST that never settles within the assertion window: any paint that waits on it
    // (the pre-fix shape) cannot appear in time.
    let settle: ((r: Response) => void) | null = null;
    stubFetch(() => new Promise<Response>((resolve) => { settle = resolve; }));
    await openPlan();

    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 read' }));

    // The observable flip: completed_at became non-null in the rendered plan, while the
    // POST is STILL in flight. Pre-fix this label only appears after POST + re-fetch.
    await screen.findByRole('button', { name: 'Mark day 1 unread' }, { timeout: 400 });

    // Let the write land so the test exits clean.
    settle!({ ok: true, status: 200, json: async () => ({}) } as unknown as Response);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark day 1 unread' })).toBeTruthy());
  });

  it('rolls the day back and says so when the write fails', async () => {
    // 400: not retryable under persistWrite's policy (5xx/network only), so the rollback
    // is immediate and this test stays fast; the retry policy has its own unit tests.
    stubFetch(() => Promise.resolve({ ok: false, status: 400, json: async () => ({}) } as unknown as Response));
    await openPlan();

    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 read' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toMatch(/could not be saved/i);
    // Rolled back: the day reads as unread again, not stuck mid-flip.
    expect(screen.getByRole('button', { name: 'Mark day 1 read' })).toBeTruthy();
  });

  it('keeps the paint and re-reads the plan when the write lands', async () => {
    const calls = stubFetch(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as unknown as Response));
    await openPlan();

    fireEvent.click(screen.getByRole('button', { name: 'Mark day 1 read' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark day 1 unread' })).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    // The write went out with the right intent, and the plan was re-read to converge.
    expect(calls.some((c) => c.method === 'POST' && c.url.includes(`/api/plans/${ID}`))).toBe(true);
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.url.includes(`/api/plans/${ID}`)).length).toBeGreaterThan(1));
  });
});
