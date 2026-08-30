// @vitest-environment jsdom

// THE READER'S WRITES USED TO BE FIRE-AND-FORGET: every highlight/note/bookmark POST or DELETE
// in read/[book]/[chapter]/page.tsx ended in `.catch(() => {})`. On a dropped mobile connection —
// this app's core use context is phones on low signal (CLAUDE.md) — the optimistic UI painted the
// change, the request failed, nothing retried, nobody was told, and the annotation was gone on
// reload. Fixed by extracting the write path into `useAnnotationWrites` (src/lib/use-annotation-
// writes.ts): `persistWrite` retries a transient failure a couple of times
// (test/invariants/persist-write-retry.test.ts covers that policy in isolation), and if it still
// fails the optimistic paint is rolled back and ONE error banner appears with a Retry.
//
// Tested against the REAL hook the reader page mounts, with a mocked `fetch` — never a lib-only
// stand-in — the same pattern as test/invariants/work-reader-paging.test.tsx.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';

interface RecordedCall {
  url: string;
  method: string;
  body?: { kind?: string; [k: string]: unknown };
}

/** A controllable /api/annotations mock: GET always returns an empty chapter; POST/DELETE writes
 *  fail with `writeStatus` until the `writeSucceedsAfter`-th write call (1-based, across ALL
 *  writes this stub has seen), then succeed. */
function stubAnnotationsFetch(opts: { writeStatus?: number; writeSucceedsAfter?: number } = {}) {
  const { writeStatus = 500, writeSucceedsAfter = 1 } = opts;
  let writeAttempt = 0;
  const calls: RecordedCall[] = [];
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
    writeAttempt++;
    if (writeAttempt >= writeSucceedsAfter) {
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: false, status: writeStatus, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

/** Flushes the mount-time GET /api/annotations effect. Pure microtask chaining — safe under fake
 *  timers, which only fake setTimeout/Date, not the promise microtask queue. */
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

describe('useAnnotationWrites — optimistic paint', () => {
  it('addHighlight paints synchronously, before the request resolves', async () => {
    stubAnnotationsFetch({ writeSucceedsAfter: 1 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => {
      result.current.addHighlight(16, null, 'yellow');
    });
    // Painted before any network round trip has had a chance to complete.
    expect(result.current.highlights.get(16)).toEqual([
      { start: null, end: null, color: 'yellow', translation: 'kjv' },
    ]);
  });
});

describe('useAnnotationWrites — failure rolls back and surfaces one error', () => {
  it('a highlight write that keeps failing rolls back the paint and reports it', async () => {
    // SEED: drop the `rollback()` call in runPersist's failure branch -> the highlight stays
    // painted after every retry failed, which is exactly the "looks saved, isn't" bug this fixes.
    stubAnnotationsFetch({ writeStatus: 500, writeSucceedsAfter: Infinity });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => result.current.addHighlight(16, null, 'yellow'));
    expect(result.current.highlights.get(16)).toHaveLength(1); // painted

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.highlights.has(16)).toBe(false); // rolled back
    expect(result.current.writeError?.message).toBe("Couldn't save your highlight");
  });

  it('clearing a verse restores its EXACT prior spans on failure, not a blank verse', async () => {
    // First write (the highlight itself) must succeed so there's something to clear.
    const stub = stubAnnotationsFetch({ writeSucceedsAfter: 1 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();
    act(() => result.current.addHighlight(16, { start: 0, end: 4 }, 'green'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.get(16)).toHaveLength(1);

    // Now make every subsequent write fail, and clear the verse.
    stub.mock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
    );
    act(() => result.current.clearVerse(16));
    expect(result.current.highlights.has(16)).toBe(false); // painted: cleared immediately

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.highlights.get(16)).toEqual([{ start: 0, end: 4, color: 'green', translation: 'kjv' }]);
    expect(result.current.writeError?.message).toBe("Couldn't clear the highlight");
  });

  it('a note write that fails restores the verse to having NO note (not a stale one)', async () => {
    stubAnnotationsFetch({ writeStatus: 500, writeSucceedsAfter: Infinity });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => result.current.saveVerseNote(16, 'For God so loved the world.'));
    expect(result.current.notes.get(16)).toBe('For God so loved the world.');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.notes.has(16)).toBe(false);
    expect(result.current.writeError?.message).toBe("Couldn't save your note");
  });

  it('bookmark failure messages say ADD or REMOVE correctly, not a generic string', async () => {
    stubAnnotationsFetch({ writeStatus: 500, writeSucceedsAfter: Infinity });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => result.current.toggleBookmark(16)); // adding
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.bookmarks.has(16)).toBe(false);
    expect(result.current.writeError?.message).toBe("Couldn't save your bookmark");
  });
});

describe('useAnnotationWrites — Retry replays the whole action, not just the request', () => {
  it('a manual retryWrite() that now succeeds re-paints AND clears the banner', async () => {
    // Fails 3 times (persistWrite's own internal budget), then the retry's first attempt succeeds.
    stubAnnotationsFetch({ writeStatus: 500, writeSucceedsAfter: 4 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => result.current.addHighlight(16, null, 'yellow'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.has(16)).toBe(false);
    expect(result.current.writeError).not.toBeNull();

    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.writeError).toBeNull();
    // SEED: have retryWrite replay only `request`, not `paint` -> this assertion fails, because
    // the write would have landed on the server with nothing painted back on screen.
    expect(result.current.highlights.get(16)).toHaveLength(1);
  });

  it('regaining connectivity (the "online" event) retries automatically, no tap needed', async () => {
    stubAnnotationsFetch({ writeStatus: 500, writeSucceedsAfter: 4 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => result.current.addHighlight(16, null, 'yellow'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.writeError).not.toBeNull();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.writeError).toBeNull();
    expect(result.current.highlights.get(16)).toHaveLength(1);
  });
});

describe('useAnnotationWrites — a failed rollback must not clobber a newer write', () => {
  it('clearVerse restores the cleared spans WITHOUT dropping one added during the retry window', async () => {
    // First write (the highlight itself) must succeed so there's something to clear.
    const stub = stubAnnotationsFetch({ writeSucceedsAfter: 1 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();
    act(() => result.current.addHighlight(16, { start: 0, end: 4 }, 'green'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.highlights.get(16)).toHaveLength(1);

    // The clear's DELETE keeps failing; a highlight POSTed meanwhile succeeds.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
    });

    act(() => result.current.clearVerse(16));
    expect(result.current.highlights.has(16)).toBe(false); // clear painted

    // A new highlight lands while the clear's DELETE is still retrying.
    act(() => result.current.addHighlight(16, { start: 5, end: 9 }, 'blue'));
    expect(result.current.highlights.get(16)).toHaveLength(1); // only the new span painted

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // SEED: restore the blind `new Map(cur).set(verse, previous!)` rollback in clearVerse ->
    // the rollback overwrites the verse with only the pre-clear spans and the blue span is gone.
    expect(result.current.highlights.get(16)).toEqual([
      { start: 0, end: 4, color: 'green', translation: 'kjv' },
      { start: 5, end: 9, color: 'blue', translation: 'kjv' },
    ]);
    expect(result.current.writeError?.message).toBe("Couldn't remove the old highlight — both colours are saved.");
  });

  it('a failed note save does not roll back a NEWER save that landed during the retry window', async () => {
    const stub = stubAnnotationsFetch({ writeSucceedsAfter: 1 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    // The first save's POST keeps failing; the second one's succeeds.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { body?: string }) : {};
      const fail = body.body === 'first';
      return Promise.resolve({
        ok: !fail,
        status: fail ? 500 : 201,
        json: () => Promise.resolve({}),
      } as Response);
    });

    act(() => result.current.saveVerseNote(16, 'first'));
    expect(result.current.notes.get(16)).toBe('first');
    // A newer save lands while the first one's POST is still retrying.
    act(() => result.current.saveVerseNote(16, 'second'));
    expect(result.current.notes.get(16)).toBe('second');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // SEED: restore the unconditional rebuild-from-`previous` in saveVerseNote's rollback ->
    // the first save's rollback deletes the entry (its `previous` was undefined), erasing 'second'.
    expect(result.current.notes.get(16)).toBe('second');
    expect(result.current.writeError?.message).toBe("Couldn't save your note");
  });

  it('a failed note delete does not resurrect the old note over one re-saved meanwhile', async () => {
    // Seed a note (the save succeeds).
    const stub = stubAnnotationsFetch({ writeSucceedsAfter: 1 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();
    act(() => result.current.saveVerseNote(16, 'old'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.notes.get(16)).toBe('old');

    // The delete's DELETE keeps failing; a note POSTed meanwhile succeeds.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
    });

    act(() => result.current.deleteVerseNote(16));
    expect(result.current.notes.has(16)).toBe(false); // delete painted

    // The reader re-saves the note while the delete's DELETE is still retrying.
    act(() => result.current.saveVerseNote(16, 'new'));
    expect(result.current.notes.get(16)).toBe('new');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // SEED: restore the blind `new Map(cur).set(verse, previous!)` rollback in deleteVerseNote ->
    // the delete's rollback resurrects 'old' over the newer 'new'.
    expect(result.current.notes.get(16)).toBe('new');
    expect(result.current.writeError?.message).toBe("Couldn't delete your note");
  });
});

describe('useAnnotationWrites — bookmark double-tap safety survives the refactor', () => {
  it('two rapid toggles send POST then DELETE, never POST twice', async () => {
    // SEED: read `bookmarks.has(verse)` from the hook's closure instead of inside the `setBookmarks`
    // updater -> both taps would see the same stale "not bookmarked" state and both POST.
    const { calls } = stubAnnotationsFetch({ writeSucceedsAfter: 1 });
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    act(() => {
      result.current.toggleBookmark(16);
      result.current.toggleBookmark(16);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const writes = calls.filter((c) => c.method !== 'GET' && c.body?.kind === 'bookmark');
    expect(writes.map((c) => c.method)).toEqual(['POST', 'DELETE']);
  });
});
