// @vitest-environment jsdom

// Reproduces the "addHighlight retry re-adds a stale whole-verse colour beside a newer one"
// bug — the symmetric counterpart of the clearVerse replay guard (d755da03). When a
// whole-verse highlight POST exhausts `persistWrite`'s backoff and settles as a failure,
// `addHighlight`'s `onSettled` unregisters it from `activeHighlights`, so a *later*
// whole-verse highlight on the same verse can no longer flip the failed write's `superseded`
// flag — the banner retains a live `retry` that, on a plain re-paint, re-adds the now-stale
// colour beside the newer one and re-POSTs it server-side (the route dedupes only an EXACT
// colour match, so a second whole-verse row is inserted rather than a replacement). Reachable
// via a manual Retry tap AND the browser `online` event (no user gesture).
//
// The fix mirrors `clearVerse`'s replay guard: snapshot the verse's spans at first paint and,
// on a retry, refuse to re-paint/re-POST when the verse now holds a span not in that snapshot,
// surfacing a no-retry "reload to refresh" banner instead.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';

interface RecordedCall {
  url: string;
  method: string;
  body?: { kind?: string; color?: string; [k: string]: unknown };
}

/** A controllable /api/annotations mock. GET always returns an empty chapter. Highlight POSTs
 *  for any colour in the `failColors` set fail with HTTP 500 (retryable); all other writes
 *  succeed. `attemptsByColor` counts every highlight POST dispatched per colour, so the test
 *  can prove retry exhaustion (3 attempts) BEFORE any replay and prove no re-POST after. */
function stubAnnotationsFetch() {
  const calls: RecordedCall[] = [];
  const attemptsByColor = new Map<string, number>();
  const failColors = new Set<string>();
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as RecordedCall['body']) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ highlights: [], notes: [], bookmarks: [] }),
      } as Response);
    }
    const color = method === 'POST' && body?.kind === 'highlight' ? body.color : undefined;
    if (color) attemptsByColor.set(color, (attemptsByColor.get(color) ?? 0) + 1);
    if (color && failColors.has(color)) {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock, failColors, attemptsByColor };
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

// Drives verse 16 through the failing-whole-verse-POST → settle → newer-whole-verse-write
// sequence that arms the bug. A blue whole-verse highlight fails HTTP 500 across persistWrite's
// full backoff (initial + 400ms + 1200ms = 3 attempts), rolls back, and arms a retry on the
// banner. The verse is empty at the start, so addHighlight(blue) issues NO internal clear —
// the blue POST itself is what fails. Then a red whole-verse highlight lands and succeeds.
async function seedFailedHighlightThenNewerHighlight() {
  const stub = stubAnnotationsFetch();
  const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
  await flushInitialLoad();

  // Blue whole-verse highlight on a fresh verse. Every blue POST fails 500 → retryable, so
  // persistWrite exhausts its backoff (3 attempts) and settles as a failure.
  stub.failColors.add('blue');
  act(() => result.current.addHighlight(16, null, 'blue'));
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  // The optimistic blue paint was rolled back to the (empty) prior state, and the banner is up
  // with a live retry — the exact armed-and-settled-failure window the bug lives in.
  expect(result.current.highlights.has(16)).toBe(false);
  expect(result.current.writeError?.message).toBe("Couldn't save your highlight");
  expect(result.current.writeError?.retry).toBeDefined();
  // Retry exhaustion, not a single non-retryable 400: persistWrite dispatched blue 3 times.
  const blueAttemptsBefore = stub.attemptsByColor.get('blue') ?? 0;
  expect(blueAttemptsBefore).toBe(3);

  // A red whole-verse highlight lands on the same verse and succeeds. The blue write has
  // already settled and unregistered, so the red write finds no prior highlight to mark
  // superseded — the F-119 in-flight guard is inert here; only the replay guard can protect.
  stub.failColors.delete('blue');
  act(() => result.current.addHighlight(16, null, 'red'));
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  // The red span is painted and saved; the blue banner is NOT cleared by red's success
  // (different id), so the armed blue retry is still live on it.
  expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['red']);
  expect(result.current.writeError?.message).toBe("Couldn't save your highlight");
  expect(result.current.writeError?.retry).toBeDefined();
  return { result, stub };
}

describe('useAnnotationWrites — addHighlight retry must not re-add a stale colour beside a newer one', () => {
  it('retrying a failed (500-exhausted) whole-verse highlight refuses once a newer one has landed', async () => {
    const { result, stub } = await seedFailedHighlightThenNewerHighlight();

    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The newer red span must survive; the stale blue must NOT be re-added. The guard refuses
    // the replay before paint runs, so the verse stays [red].
    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['red']);

    // And the stale blue was NOT re-POSTed: the attempt count is unchanged from retry exhaustion.
    expect(stub.attemptsByColor.get('blue')).toBe(3);
    expect(stub.calls.filter((c) => c.method === 'POST' && c.body?.kind === 'highlight' && c.body?.color === 'blue')).toHaveLength(3);

    // The banner is replaced with a no-retry "reload to refresh" message — re-running would
    // refuse again, and the verse has moved on from what this write was supposed to add.
    expect(result.current.writeError?.message).toBe(
      "Couldn't save your highlight — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('the silent online auto-retry (no user tap) refuses the same way and re-POSTs nothing', async () => {
    const { result, stub } = await seedFailedHighlightThenNewerHighlight();

    // The reader regains signal — the hook's free online retry fires with no user gesture.
    // Red has already settled before this fires (the online test's ordering invariant), so the
    // newer colour is persisted by the time the blue retry lands.
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['red']);
    expect(stub.attemptsByColor.get('blue')).toBe(3);
    expect(result.current.writeError?.message).toBe(
      "Couldn't save your highlight — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('control: with NO newer write, retrying the failed highlight correctly re-adds it and clears the banner', async () => {
    // Regression guard: the newer-span check must NOT refuse a replay when the verse is unchanged
    // since the original write — the normal retry path for a failed highlight must keep working.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    stub.failColors.add('blue');
    act(() => result.current.addHighlight(16, null, 'blue'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.has(16)).toBe(false);
    expect(result.current.writeError?.message).toBe("Couldn't save your highlight");
    expect(result.current.writeError?.retry).toBeDefined();
    expect(stub.attemptsByColor.get('blue')).toBe(3);

    // Connectivity returns: the next blue POST succeeds, so a retry that ISN'T guarded (the
    // control) would re-paint and succeed. The guard must see no newer span and let it through.
    stub.failColors.delete('blue');
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['blue']);
    expect(stub.attemptsByColor.get('blue')).toBe(4); // one more POST on the successful retry
    expect(result.current.writeError).toBeNull();
  });

  it('control: a failed SUB-VERSE highlight still retries-and-recovers even after a newer sibling sub-verse span landed (append semantics preserved)', async () => {
    // The replay guard is scoped to whole-verse (range === null) on purpose. A sub-verse write
    // APPENDS — a newer sub-verse span (different range) is a sibling the reader still wants,
    // not a replacement — so its failed retry MUST stay free to re-paint and recover. Refusing
    // it would silently drop the reader's intended highlight on a "reload to refresh" banner
    // (the row was never persisted), which is the silent-loss bug this hook exists to close.
    // This test pins that scoping: a future "generalize the guard to all addHighlight" change
    // (which the bug report's literal code snippet would suggest) would fail here.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    // First sub-verse span fails 500 across the full backoff (3 attempts) and rolls back.
    stub.failColors.add('green');
    act(() => result.current.addHighlight(16, { start: 0, end: 4 }, 'green'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.has(16)).toBe(false);
    expect(stub.attemptsByColor.get('green')).toBe(3);
    expect(result.current.writeError?.retry).toBeDefined();

    // A newer, DIFFERENT-range sibling span lands and succeeds. green's banner is not cleared
    // by it (different id), so green's armed retry is still live.
    stub.failColors.delete('green');
    act(() => result.current.addHighlight(16, { start: 5, end: 9 }, 'blue'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['blue']);
    expect(result.current.writeError?.retry).toBeDefined();

    // green's retry fires (connectivity returned). The guard does NOT engage for sub-verse, so
    // green re-paints ALONGSIDE blue and re-POSTs successfully — both sibling spans recover.
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['blue', 'green']);
    expect(stub.attemptsByColor.get('green')).toBe(4); // green was re-POSTed on the retry
    expect(result.current.writeError).toBeNull();
  });
});
