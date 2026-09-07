// @vitest-environment jsdom

// Reproduces the "clearVerse retry destroys a newer, already-saved highlight" bug. The failed
// clear settles and unregisters from `activeClears`, so a subsequent successful addHighlight on
// the same verse can no longer mark it `superseded`. The banner keeps a live, destructive
// `retry` that re-runs `paint()` (re-snapshotting the verse — now including the newer span — and
// deleting the whole verse) and re-issues the verse-level DELETE, wiping the newer highlight from
// both client and server. Reachable via a manual Retry tap AND the browser `online` event.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';

function stubAnnotationsFetch() {
  const calls: { url: string; method: string; body?: { kind?: string; [k: string]: unknown } }[] = [];
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as { kind?: string; [k: string]: unknown }) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ highlights: [], notes: [], bookmarks: [] }),
      } as Response);
    }
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

async function flushInitialLoad() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Drives one verse through the failing-clear → settle → newer-highlight sequence that arms the
// bug: a sub-verse highlight is added (range !== null, so clearVerse is NOT re-invoked).
async function seedFailedClearThenNewerHighlight(verse: number) {
  const stub = stubAnnotationsFetch();
  const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
  await flushInitialLoad();

  // Seed an existing highlight so clearVerse has something to clear. POST succeeds.
  act(() => result.current.addHighlight(verse, { start: 0, end: 4 }, 'green'));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.highlights.get(verse)).toHaveLength(1);

  // Make every subsequent write fail, and clear the verse. The clear's DELETE fails (after
  // persistWrite's retries), rollback restores the green span, and onSettled unregisters the
  // clear from activeClears — leaving the banner with a live retry.
  stub.mock.mockImplementation(() =>
    Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
  );
  act(() => result.current.clearVerse(verse));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.highlights.get(verse)).toEqual([
    { start: 0, end: 4, color: 'green', translation: 'kjv' },
  ]);
  expect(result.current.writeError?.message).toBe("Couldn't clear the highlight");

  // A newer highlight lands on the same verse and succeeds. The clear has already settled and
  // unregistered, so addHighlight finds no pendingClear to mark superseded.
  stub.mock.mockImplementation(() =>
    Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response),
  );
  act(() => result.current.addHighlight(verse, { start: 5, end: 9 }, 'yellow'));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  // The yellow span is painted and saved.
  expect(result.current.highlights.get(verse)?.some((s) => s.color === 'yellow')).toBe(true);
  return { result, verse };
}

describe('useAnnotationWrites — clearVerse retry must not destroy a newer saved highlight', () => {
  it('retrying a failed clear does not wipe a newer, saved highlight', async () => {
    const { result, verse } = await seedFailedClearThenNewerHighlight(1);

    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The yellow span must survive the retry.
    expect(result.current.highlights.get(verse)?.some((s) => s.color === 'yellow')).toBe(true);
  });

  it('online event auto-retries the failed clear without a tap and must not wipe the newer highlight', async () => {
    const { result, verse } = await seedFailedClearThenNewerHighlight(1);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The yellow span must survive the automatic online retry — this path is the silent one
    // (no user tap, no dismissWrite), so the banner must also be replaced with a reload hint.
    expect(result.current.highlights.get(verse)?.some((s) => s.color === 'yellow')).toBe(true);
    expect(result.current.writeError?.message).toBe(
      "Couldn't clear the highlight — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('legitimate clearVerse retry (no newer span arrived) still re-clears and clears the banner', async () => {
    // Regression guard: the newer-span check must NOT refuse a replay when the verse is unchanged
    // since the original clear — the normal retry path for a failed clear must keep working.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => result.current.addHighlight(16, { start: 0, end: 4 }, 'green'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.get(16)).toHaveLength(1);

    // The clear's DELETE keeps failing; no newer write lands on the verse.
    stub.mock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
    );
    act(() => result.current.clearVerse(16));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.get(16)).toEqual([
      { start: 0, end: 4, color: 'green', translation: 'kjv' },
    ]);
    expect(result.current.writeError?.message).toBe("Couldn't clear the highlight");
    expect(result.current.writeError?.retry).toBeDefined();

    // Now the DELETE succeeds on retry — the clear should redo the wipe and clear the banner.
    stub.mock.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response),
    );
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.highlights.has(16)).toBe(false);
    expect(result.current.writeError).toBeNull();
  });
});
