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

// ── F-119 network-ordering race ──────────────────────────────────────────────────────────────
// A whole-verse recolour REPLACES the prior colour (clearVerse then POST). The POST is gated
// behind its own clear's DELETE round-trip (`await pendingClear.settled`), but a second rapid
// recolour's DELETE fires immediately and can land first, so the first POST then dispatches onto
// an empty verse and re-adds the intermediate colour — a stale server row the reader never sees
// while editing. These tests use a latency-modeling fetch (each POST/DELETE resolves only when
// `landNext()` is called) to assert the PERSISTED server state, not just the optimistic UI. Two
// taps are issued as separate `act()` calls = two React batches = the production path.
//
// SEED: remove the `activeHighlights` supersession guard in addHighlight (use-annotation-writes.ts)
// -> the "rapid separate-batch double recolour" test fails: server holds [blue, red], not [red].

interface ServerSpan { color: string; spanStart: number | null; spanEnd: number | null; }
interface DispatchedWrite { method: string; kind?: string; color?: string }

function createDeferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { resolve, promise };
}

/** A latency-modeling /api/annotations mock: GET returns the seeded chapter immediately; every
 *  POST/DELETE returns a deferred the test resolves with `landNext()`, so the test controls the
 *  ORDER in which writes land and can assert the final PERSISTED server state. `dispatchedWrites`
 *  records each fetch call at dispatch time (before it lands), proving which POSTs ever left the
 *  client at all. */
function createLatencyFetch(initial: ServerSpan[]) {
  const server: ServerSpan[] = [...initial];
  const pending: { method: string; body?: { kind?: string; color?: string; spanStart?: number | null; spanEnd?: number | null }; deferred: ReturnType<typeof createDeferred<Response>> }[] = [];
  const dispatched: DispatchedWrite[] = [];
  const VERSE_ID = 43003016; // encodeVerseId({ book: 43, chapter: 3, verse: 16 })
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as { kind?: string; color?: string; spanStart?: number | null; spanEnd?: number | null; verseId?: number }) : undefined;
    if (method === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          highlights: server.map((s, i) => ({
            id: `h${i}`,
            verse_id: VERSE_ID,
            span_start: s.spanStart,
            span_end: s.spanEnd,
            color: s.color,
            text_color: null,
            translation: 'kjv',
          })),
          notes: [],
          bookmarks: [],
        }),
      } as Response);
    }
    const d = createDeferred<Response>();
    pending.push({ method, body, deferred: d });
    dispatched.push({ method, kind: body?.kind, color: body?.color });
    return d.promise;
  });
  vi.stubGlobal('fetch', mock);

  async function landNext(): Promise<void> {
    const e = pending.shift();
    if (!e) return;
    if (e.method === 'DELETE' && e.body?.kind === 'highlight') {
      server.length = 0; // a verse-level highlight DELETE wipes every row for the verse
    } else if (e.method === 'POST' && e.body?.kind === 'highlight') {
      server.push({ color: e.body.color ?? '', spanStart: e.body.spanStart ?? null, spanEnd: e.body.spanEnd ?? null });
    }
    e.deferred.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
    // Let the resolver's .then chain (persistWrite → beginPersist → a gated POST's `await
    // pendingClear.settled` resuming → its fetch / skip) advance before the test inspects state.
    for (let i = 0; i < 30; i++) await Promise.resolve();
  }
  function pendingMethods(): string[] { return pending.map((p) => p.method); }
  function dispatchedWrites(): DispatchedWrite[] { return dispatched.filter((d) => d.method !== 'GET'); }

  return { server, landNext, pendingMethods, dispatchedWrites };
}

describe('useAnnotationWrites — F-119 network-ordering race (separate-batch double recolour)', () => {
  it('rapid separate-batch double recolour persists only the latest colour on the server', async () => {
    const f = createLatencyFetch([{ color: 'yellow', spanStart: null, spanEnd: null }]);
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await act(async () => { await flushInitialLoad(); });

    // Tap 1 — a separate DOM event = a separate React batch (the production path).
    await act(async () => { result.current.addHighlight(16, null, 'blue'); });
    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['blue']);
    expect(f.pendingMethods()).toEqual(['DELETE']); // only the first clear's DELETE dispatched; the blue POST is gated behind it

    // Tap 2 — a second DOM event, milliseconds later.
    await act(async () => { result.current.addHighlight(16, null, 'red'); });
    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['red']); // UI: red only
    expect(f.pendingMethods()).toEqual(['DELETE', 'DELETE']); // both clears' DELETEs dispatched; both POSTs still gated

    // FIFO landing = realistic: the first-tap DELETE resolves first and releases the blue POST.
    await f.landNext(); // DELETE 1 -> server: []. The gated blue POST checks its superseded flag.
    await f.landNext(); // DELETE 2 -> server: []. The gated red POST dispatches.
    await f.landNext(); // POST red -> server: [red].
    await f.landNext(); // any trailing microtask (the blue POST was skipped, so this is a no-op).

    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['red']); // UI: red only
    expect(f.server).toEqual([{ color: 'red', spanStart: null, spanEnd: null }]); // server: red only — not [blue, red]
  });

  it('the superseded intermediate POST never reaches the server (no fetch is issued for it)', async () => {
    const f = createLatencyFetch([{ color: 'yellow', spanStart: null, spanEnd: null }]);
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await act(async () => { await flushInitialLoad(); });

    await act(async () => { result.current.addHighlight(16, null, 'blue'); });
    await act(async () => { result.current.addHighlight(16, null, 'red'); });

    for (let i = 0; i < 6; i++) await f.landNext(); // drain everything

    // Exactly one highlight POST was ever dispatched (red's). The intermediate blue POST was
    // suppressed before it left the client — the fix prevents dispatch, it does not just
    // tolerate a late landing. Two DELETEs: one per whole-verse recolour's internal clear.
    expect(f.dispatchedWrites().filter((w) => w.method === 'POST' && w.kind === 'highlight').map((w) => w.color))
      .toEqual(['red']);
    expect(f.dispatchedWrites().filter((w) => w.method === 'DELETE' && w.kind === 'highlight')).toHaveLength(2);
    expect(f.server).toEqual([{ color: 'red', spanStart: null, spanEnd: null }]);
  });

  it('a clear while a recolour is in flight leaves the verse empty, not the recoloured colour', async () => {
    const f = createLatencyFetch([{ color: 'yellow', spanStart: null, spanEnd: null }]);
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await act(async () => { await flushInitialLoad(); });

    await act(async () => { result.current.addHighlight(16, null, 'blue'); }); // blue POST gated on its clear of yellow
    await act(async () => { result.current.clearVerse(16); });                 // the reader changes their mind: clear

    for (let i = 0; i < 6; i++) await f.landNext(); // drain

    expect(result.current.highlights.has(16)).toBe(false); // UI: cleared
    expect(f.server).toEqual([]); // server: empty — the in-flight blue POST was suppressed by the clear
    expect(f.dispatchedWrites().filter((w) => w.method === 'POST' && w.kind === 'highlight')).toHaveLength(0);
  });

  it('a single whole-verse recolour persists that colour (control)', async () => {
    const f = createLatencyFetch([{ color: 'yellow', spanStart: null, spanEnd: null }]);
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await act(async () => { await flushInitialLoad(); });

    await act(async () => { result.current.addHighlight(16, null, 'blue'); });
    await f.landNext(); // DELETE the old yellow
    await f.landNext(); // POST blue

    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['blue']);
    expect(f.server).toEqual([{ color: 'blue', spanStart: null, spanEnd: null }]);
    expect(f.dispatchedWrites().filter((w) => w.method === 'POST' && w.kind === 'highlight').map((w) => w.color))
      .toEqual(['blue']); // the non-superseded POST is NOT skipped
  });
});

describe('useAnnotationWrites — F-119 fix does not regress sub-verse spans (append semantics)', () => {
  it('two sub-verse spans both persist (the supersession guard never engages for range !== null)', async () => {
    const f = createLatencyFetch([]); // empty verse
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await act(async () => { await flushInitialLoad(); });

    await act(async () => { result.current.addHighlight(16, { start: 0, end: 4 }, 'green'); });
    await act(async () => { result.current.addHighlight(16, { start: 5, end: 9 }, 'blue'); });

    for (let i = 0; i < 6; i++) await f.landNext();

    expect(result.current.highlights.get(16)?.map((h) => h.color)).toEqual(['green', 'blue']);
    expect(f.server).toEqual([
      { color: 'green', spanStart: 0, spanEnd: 4 },
      { color: 'blue', spanStart: 5, spanEnd: 9 },
    ]);
  });
});
