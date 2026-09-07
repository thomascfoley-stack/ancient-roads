// @vitest-environment jsdom
//
// The "Change?" MOVE race: the 6s toast timer used to keep running after "Change?" opened the
// picker, nulling `saved` mid-pick so `onPick` computed `moveFrom = undefined` and the move's
// DELETE was silently dropped — the clipping ended up duplicated across both studies with no
// on-screen signal. The fix snapshots the move-from block on "Change?" tap (`pendingMove`) and
// reads that back in `onPick`, so the delete half no longer depends on the toast surviving the
// timer. These drive a save → Change? → pick round-trip under fake timers and pin that the old
// block is deleted even when the toast timer fires while the picker is still open.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Session state is per-test; the name satisfies vitest's mock-hoisting rule.
let mockSession: { data: { user: { id: string } } | null } = { data: { user: { id: 'u-test' } } };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ask' }));

import { SaveToStudy, LAST_TARGET_KEY_PREFIX } from '@/components/save-to-study';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

const STUDIES = [
  { id: 's-recent-1', title: 'Perseverance', pinned_at: null, updated_at: '2026-08-12T10:00:00Z' },
  { id: 's-pinned-1', title: 'Rahab', pinned_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-11T09:00:00Z' },
  { id: 's-recent-2', title: 'John 1', pinned_at: null, updated_at: '2026-08-10T08:00:00Z' },
  { id: 's-pinned-2', title: 'Sermon on the Mount', pinned_at: '2026-07-30T00:00:00Z', updated_at: '2026-08-09T07:00:00Z' },
];

const clip = { sourceId: 'commentary:jhn:1:1-5:Matthew Henry' };

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

/** A fetch stub dispatching on METHOD + URL; every call is recorded as `${method} ${url}`.
 *  Longest-prefix first, so 'POST /api/studies' does not swallow 'POST /api/studies/<id>/blocks'. */
function stubFetch(routes: Record<string, Response>) {
  const calls: { key: string; body?: unknown }[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${String(input)}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const hit = Object.entries(routes)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([k]) => key === k || key.startsWith(k));
    if (!hit) throw new Error(`unexpected fetch: ${key}`);
    return hit[1];
  });
  vi.stubGlobal('fetch', mock);
  return calls;
}

/** Pure microtask chaining — safe under fake timers, which only fake setTimeout/Date, not the
 *  promise microtask queue. Resolves the async fetch + setState chain WITHOUT advancing the 6s
 *  toast timer, so the race window is controlled by the explicit `advanceTimersByTime` below. */
async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

const KEY = `${LAST_TARGET_KEY_PREFIX}:u-test`;

beforeEach(() => {
  mockSession = { data: { user: { id: 'u-test' } } };
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

// ── the move race and its controls ───────────────────────────────────────────────────────────

describe('SaveToStudy "Change?" move — the timer race', () => {
  it('deletes the old block even when the 6s toast timer fires while the picker is open', async () => {
    // SEED: revert onPick to read `saved` again (and drop the pendingMove snapshot on "Change?")
    // -> the DELETE below vanishes: the timer nulled `saved` mid-pick, so moveFrom = undefined.
    localStorage.setItem(KEY, JSON.stringify({ id: 's-pinned-1', title: 'Rahab' }));
    const calls = stubFetch({
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(201, { block: { id: 'b-1' } }),
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies/s-recent-1/blocks': jsonResponse(201, { block: { id: 'b-2' } }),
      'DELETE /api/studies/s-pinned-1/blocks': jsonResponse(204, {}),
    });
    render(<SaveToStudy clip={clip} />);

    // One-tap save to the stored default (Rahab) — arms the 6s toast timer.
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await flushMicrotasks();
    screen.getByText(/Saved to Rahab\./);
    screen.getByRole('button', { name: 'Change?' });

    // Open the picker — the move-from snapshot is taken here, before the timer can clear `saved`.
    fireEvent.click(screen.getByRole('button', { name: 'Change?' }));
    await flushMicrotasks();
    screen.getByRole('dialog'); // picker mounted

    // Stay in the picker past the 6s toast window. On the buggy code this nulled `saved`, so the
    // later pick computed moveFrom = undefined and skipped the DELETE — a silent duplicate.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6001);
    });
    screen.getByRole('dialog'); // picker still open after the toast timer fired

    fireEvent.click(screen.getByRole('button', { name: /Perseverance/ }));
    await flushMicrotasks();

    const keys = calls.map((c) => c.key);
    expect(keys).toEqual([
      'POST /api/studies/s-pinned-1/blocks',
      'GET /api/studies',
      'POST /api/studies/s-recent-1/blocks',
      'DELETE /api/studies/s-pinned-1/blocks?blockId=b-1',
    ]);
    // The move's new default is the picked study, and its toast is the one now showing.
    expect(localStorage.getItem(KEY)).toContain('s-recent-1');
    screen.getByText(/Saved to Perseverance\./);
  });

  it('deletes the old block on the happy path too (pick within the 6s window)', async () => {
    // The fix must not regress the move when the timer has NOT raced: a quick pick still moves.
    localStorage.setItem(KEY, JSON.stringify({ id: 's-pinned-1', title: 'Rahab' }));
    const calls = stubFetch({
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(201, { block: { id: 'b-1' } }),
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies/s-recent-1/blocks': jsonResponse(201, { block: { id: 'b-2' } }),
      'DELETE /api/studies/s-pinned-1/blocks': jsonResponse(204, {}),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: 'Change?' }));
    await flushMicrotasks();
    // Pick immediately — the 6s timer is still well short of firing.
    fireEvent.click(screen.getByRole('button', { name: /Perseverance/ }));
    await flushMicrotasks();

    expect(calls.map((c) => c.key)).toContain('DELETE /api/studies/s-pinned-1/blocks?blockId=b-1');
    screen.getByText(/Saved to Perseverance\./);
  });

  it('does not delete or re-save when the picker is closed without a pick', async () => {
    // Dismissal is not a move: no second POST, no DELETE — and that holds even when the toast
    // timer has already fired while the picker was open (the snapshot is cleared on close).
    localStorage.setItem(KEY, JSON.stringify({ id: 's-pinned-1', title: 'Rahab' }));
    const calls = stubFetch({
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(201, { block: { id: 'b-1' } }),
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: 'Change?' }));
    await flushMicrotasks();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6001);
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await flushMicrotasks();

    const keys = calls.map((c) => c.key);
    expect(keys.some((k) => k.startsWith('DELETE'))).toBe(false);
    expect(keys.filter((k) => k.startsWith('POST'))).toEqual(['POST /api/studies/s-pinned-1/blocks']);
  });

  it('a later save does not delete the old block from a completed move (no stale snapshot)', async () => {
    // After a move completes the snapshot is cleared, so a fresh no-default save that reopens
    // the picker and picks a third study must NOT carry over the previous move's delete-source.
    localStorage.setItem(KEY, JSON.stringify({ id: 's-pinned-1', title: 'Rahab' }));
    const calls = stubFetch({
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(201, { block: { id: 'b-1' } }),
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies/s-recent-1/blocks': jsonResponse(201, { block: { id: 'b-2' } }),
      'DELETE /api/studies/s-pinned-1/blocks': jsonResponse(204, {}),
      'POST /api/studies/s-recent-2/blocks': jsonResponse(201, { block: { id: 'b-3' } }),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: 'Change?' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: /Perseverance/ }));
    await flushMicrotasks();
    expect(calls.filter((c) => c.key.startsWith('DELETE'))).toHaveLength(1);

    // No stored target now -> the next tap opens the picker as a fresh save (no move).
    localStorage.removeItem(KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: /John 1/ }));
    await flushMicrotasks();

    // Still exactly one DELETE total — the move's; the later save added none.
    expect(calls.filter((c) => c.key.startsWith('DELETE'))).toHaveLength(1);
    expect(calls.some((c) => c.key === 'DELETE /api/studies/s-pinned-1/blocks?blockId=b-1')).toBe(true);
    screen.getByText(/Saved to John 1\./);
  });

  it('a repeated "Change?" on the new toast moves again and deletes the just-saved block', async () => {
    // Chaining Change?: A -> B, then Change? again on B's toast -> C, deletes B's block (not
    // A's — A's block is already gone). Guards against the snapshot pointing at a stale block.
    localStorage.setItem(KEY, JSON.stringify({ id: 's-pinned-1', title: 'Rahab' }));
    const calls = stubFetch({
      'POST /api/studies/s-pinned-1/blocks': jsonResponse(201, { block: { id: 'b-1' } }),
      'GET /api/studies': jsonResponse(200, { studies: STUDIES }),
      'POST /api/studies/s-recent-1/blocks': jsonResponse(201, { block: { id: 'b-2' } }),
      'DELETE /api/studies/s-pinned-1/blocks': jsonResponse(204, {}),
      'POST /api/studies/s-recent-2/blocks': jsonResponse(201, { block: { id: 'b-3' } }),
      'DELETE /api/studies/s-recent-1/blocks': jsonResponse(204, {}),
    });
    render(<SaveToStudy clip={clip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to study' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: 'Change?' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: /Perseverance/ }));
    await flushMicrotasks();
    screen.getByText(/Saved to Perseverance\./);

    // Change? again on the Perseverance toast, past the 6s window once more, then pick John 1.
    fireEvent.click(screen.getByRole('button', { name: 'Change?' }));
    await flushMicrotasks();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6001);
    });
    fireEvent.click(screen.getByRole('button', { name: /John 1/ }));
    await flushMicrotasks();

    // The second DELETE targets Perseverance's block (b-2) — the second move's source — not b-1.
    expect(calls.some((c) => c.key === 'DELETE /api/studies/s-recent-1/blocks?blockId=b-2')).toBe(true);
    expect(calls.filter((c) => c.key.startsWith('DELETE'))).toHaveLength(2);
    screen.getByText(/Saved to John 1\./);
  });
});
