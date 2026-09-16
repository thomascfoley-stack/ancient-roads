// @vitest-environment jsdom

// Pins the post-fix outcome for the "stale note retry clobbers a newer note that matches the
// pre-write snapshot" bug in saveVerseNote / deleteVerseNote (use-annotation-writes.ts). The
// replay guard there previously decided "a newer write arrived" by comparing the verse's
// current note to the pre-write snapshot BY VALUE (`notesRef.current.get(verse) !== snapshot`).
// Because notes are primitive strings, a newer write that happened to produce the snapshot's
// exact value was indistinguishable from the post-rollback state, so the guard let a stale retry
// re-run `paint()` + the network call and clobber the newer note (overwritten by a failed save's
// POST body, or soft-deleted by a failed delete's `DELETE`). The fix replaces the value
// comparison with a per-verse monotonic generation counter (`notesGen`) bumped only on a
// successfully settled note write, so the guard refuses whenever a newer note committed —
// including the equal-snapshot corner — and the newer note survives.
//
// Four of the tests below (save/delete × manual Retry / `online` auto-retry) seed the
// equal-snapshot corner and assert the CORRECT outcome: the newer re-saved note survives, no new
// note network call is issued, and the banner is replaced with a no-retry "newer edit arrived;
// reload" hint. These fail against the pre-fix value-comparison guard and pass once the
// generation-counter guard lands. A fifth test pins the no-regression baseline: a retry with NO
// newer write in between must still re-save and clear the banner — the existing
// use-annotation-writes-note-retry.test.tsx already guards that with a different value, and this
// repeats it here so the file is self-contained.
//
// See the sibling use-annotation-writes-note-retry.test.tsx for the different-value case (which
// the value guard already handled) and use-annotation-writes-clearverse-retry.test.tsx for the
// highlight path (which used object identity and so never had this hole).

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';

function okJson(status: number, body: unknown): Response {
  return { ok: true, status, json: () => Promise.resolve(body) } as Response;
}
function failJson(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({}) } as Response;
}

function stubAnnotationsFetch() {
  const calls: { url: string; method: string; body?: { kind?: string; body?: string; [k: string]: unknown } }[] = [];
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as { kind?: string; body?: string; [k: string]: unknown }) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET') {
      return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    }
    return Promise.resolve(okJson(201, {}));
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

async function flushInitialLoad() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

// Count note POSTs/DELETEs the mocked fetch has seen so far. GET requests carry no init, so they
// are filtered out (on a truthy `init`) before the body is parsed.
function noteWriteCount(kind: 'POST' | 'DELETE'): number {
  return vi.mocked(fetch).mock.calls
    .filter(([, init]) => !!init && (init!.method ?? 'GET').toUpperCase() === kind)
    .map(([, init]) => JSON.parse(String(init!.body)) as { kind?: string })
    .filter((b) => b.kind === 'note').length;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Seeds the equal-snapshot corner for the SAVE path. The verse already holds `snap` (a real
// prior note saved on the server, so the failed save's snapshot is a populated string — not the
// empty-verse `undefined` case the value guard happens to handle). A save of `stale` 5xxs
// (snapshot `snap`, fails, rolls back to `snap`, banner armed with a live retry); then a newer
// re-save of `snap` — the snapshot's exact value — succeeds (the verse holds `snap`,
// indistinguishable from the post-rollback state by value alone). The stale `stale` retry is now
// armed against a verse that holds the re-saved `snap`.
async function seedFailedSaveThenEqualSnapshotResave(verse: number, stale = 'new', snap = 'old') {
  const stub = stubAnnotationsFetch();
  const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
  await flushInitialLoad();

  // Seed the verse with the snapshot value (a real prior note, not an empty verse).
  act(() => result.current.saveVerseNote(verse, snap));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe(snap);

  // `stale` keeps failing after persistWrite's retries; everything else succeeds.
  stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    const body = init?.body ? (JSON.parse(String(init.body)) as { body?: string }) : {};
    if (body.body === stale) return Promise.resolve(failJson(500));
    return Promise.resolve(okJson(201, {}));
  });

  act(() => result.current.saveVerseNote(verse, stale));
  expect(result.current.notes.get(verse)).toBe(stale); // optimistic paint
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  // Rolled back to the snapshot; the stale-save banner (with its live retry) is armed.
  expect(result.current.notes.get(verse)).toBe(snap);
  expect(result.current.writeError?.message).toBe("Couldn't save your note");
  expect(result.current.writeError?.retry).toBeDefined();

  // A newer re-save of the snapshot's exact value succeeds. Its success clears only its OWN
  // banner, so the stale `stale` banner (and its retry) stays armed.
  stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    return Promise.resolve(okJson(201, {}));
  });
  act(() => result.current.saveVerseNote(verse, snap));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe(snap);
  expect(result.current.writeError?.message).toBe("Couldn't save your note");
  expect(result.current.writeError?.retry).toBeDefined();

  return { result, verse, stale, snap };
}

// Seeds the equal-snapshot corner for the DELETE path. The verse holds `snap` (saved); a delete
// 5xxs (snapshot `snap`, fails, rolls back to `snap`, banner armed with a live retry); then a
// newer re-save of `snap` — the snapshot's exact value — succeeds (the verse holds `snap`). The
// stale delete retry is armed against a verse that holds the re-saved `snap`.
async function seedFailedDeleteThenEqualSnapshotResave(verse: number, snap = 'old') {
  const stub = stubAnnotationsFetch();
  const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
  await flushInitialLoad();

  // Seed the verse with the snapshot value.
  act(() => result.current.saveVerseNote(verse, snap));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe(snap);

  // The DELETE keeps failing; any POST succeeds.
  stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    if (method === 'DELETE') return Promise.resolve(failJson(500));
    return Promise.resolve(okJson(201, {}));
  });

  act(() => result.current.deleteVerseNote(verse));
  expect(result.current.notes.has(verse)).toBe(false); // delete painted
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  // Rolled back to the snapshot; the stale-delete banner (with its live retry) is armed.
  expect(result.current.notes.get(verse)).toBe(snap);
  expect(result.current.writeError?.message).toBe("Couldn't delete your note");
  expect(result.current.writeError?.retry).toBeDefined();

  // A newer re-save of the snapshot's exact value succeeds. Its success clears only its OWN
  // banner, so the stale-delete banner (and its retry) stays armed.
  stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    return Promise.resolve(okJson(201, {}));
  });
  act(() => result.current.saveVerseNote(verse, snap));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe(snap);
  expect(result.current.writeError?.message).toBe("Couldn't delete your note");
  expect(result.current.writeError?.retry).toBeDefined();

  return { result, verse, snap };
}

describe('useAnnotationWrites — note replay guard survives the equal-snapshot corner', () => {
  it('a stale SAVE retry does not overwrite a newer re-saved note that equals the snapshot (manual Retry)', async () => {
    const { result, verse, snap } = await seedFailedSaveThenEqualSnapshotResave(1);

    const notePostsBefore = noteWriteCount('POST');

    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The re-saved snapshot value survives — the stale `stale` body did not re-paint over it.
    expect(result.current.notes.get(verse)).toBe(snap);
    // No new note POST was issued (the guard refused before paint + request).
    expect(noteWriteCount('POST')).toBe(notePostsBefore);
    // The banner is replaced with a no-retry reload hint so the stale write cannot be re-fired.
    expect(result.current.writeError?.message).toBe(
      "Couldn't save your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('the `online` event must not auto-replay a stale SAVE over a newer re-saved note equal to the snapshot', async () => {
    const { result, verse, snap } = await seedFailedSaveThenEqualSnapshotResave(1);

    const notePostsBefore = noteWriteCount('POST');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.notes.get(verse)).toBe(snap);
    expect(noteWriteCount('POST')).toBe(notePostsBefore);
    expect(result.current.writeError?.message).toBe(
      "Couldn't save your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('a stale DELETE retry does not soft-delete a newer re-saved note that equals the snapshot (manual Retry)', async () => {
    const { result, verse, snap } = await seedFailedDeleteThenEqualSnapshotResave(1);

    const noteDeletesBefore = noteWriteCount('DELETE');

    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The re-saved note survives — the stale delete did not re-empty the verse.
    expect(result.current.notes.has(verse)).toBe(true);
    expect(result.current.notes.get(verse)).toBe(snap);
    // No new note DELETE was issued.
    expect(noteWriteCount('DELETE')).toBe(noteDeletesBefore);
    expect(result.current.writeError?.message).toBe(
      "Couldn't delete your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('the `online` event must not auto-replay a stale DELETE over a newer re-saved note equal to the snapshot', async () => {
    const { result, verse, snap } = await seedFailedDeleteThenEqualSnapshotResave(1);

    const noteDeletesBefore = noteWriteCount('DELETE');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.notes.has(verse)).toBe(true);
    expect(result.current.notes.get(verse)).toBe(snap);
    expect(noteWriteCount('DELETE')).toBe(noteDeletesBefore);
    expect(result.current.writeError?.message).toBe(
      "Couldn't delete your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('a legitimate saveVerseNote retry (no newer write arrived) still re-saves and clears the banner', async () => {
    // No-regression baseline: the generation-counter guard must NOT refuse a retry when no newer
    // note committed on the verse since this write's own rollback — the normal retry path for a
    // failed save must keep working. The failed write does not bump the generation (only a
    // successful settle bumps it), so a retry sees an unchanged generation and proceeds.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    // 'only' keeps failing; no newer write lands on the verse.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
      const body = init?.body ? (JSON.parse(String(init.body)) as { body?: string }) : {};
      if (body.body === 'only') return Promise.resolve(failJson(500));
      return Promise.resolve(okJson(201, {}));
    });
    act(() => result.current.saveVerseNote(16, 'only'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.notes.has(16)).toBe(false); // rolled back (verse was empty)
    expect(result.current.writeError?.message).toBe("Couldn't save your note");
    expect(result.current.writeError?.retry).toBeDefined();

    // The POST succeeds on retry — the save should redo the paint and clear the banner.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
      return Promise.resolve(okJson(201, {}));
    });
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.notes.get(16)).toBe('only');
    expect(result.current.writeError).toBeNull();
  });
});
