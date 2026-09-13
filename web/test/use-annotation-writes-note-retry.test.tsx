// @vitest-environment jsdom

// Reproduces the "saveVerseNote / deleteVerseNote retry clobbers a newer, already-saved note"
// bug. A failed save arms a banner whose `retry` (the `attempt` closure) stays live even after a
// NEWER save on the same verse succeeds — note2's success branch clears only a banner whose `id`
// matches, so note1's older banner (and its destructive `retry`) persists. When that stale retry
// later fires (a manual Retry tap on the banner, or the browser `online` event), re-running
// `paint` with the captured `body` re-paints and re-POSTs the stale note over the newer one — and
// `upsertNote` is a blind `INSERT ... ON CONFLICT ... DO UPDATE SET body = EXCLUDED.body`, so the
// loss is irrecoverable. The fix mirrors clearVerse's replay guard: refuse the destructive replay
// when a newer note has arrived, replacing the banner with a no-retry reload hint. See
// use-annotation-writes.ts (saveVerseNote / deleteVerseNote) and the sibling test
// use-annotation-writes-clearverse-retry.test.tsx for the same shape on the highlight path.

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

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// note1's POST keeps failing until persistWrite exhausts its retries (all 5xx), the optimistic
// paint is rolled back (verse empty), and note1's banner is armed with a live `retry`. Then a
// newer save of note2 succeeds on the same verse. note2's success branch clears only a banner
// whose `id` matches note2's — note1's older banner (and its destructive `retry`) persists. This
// is exactly the preset the bug needs: an armed stale retry against a verse that now holds a
// newer, already-saved note.
async function seedFailedSaveThenNewerNote(verse: number, note1 = 'note1', note2 = 'note2') {
  const stub = stubAnnotationsFetch();
  const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
  await flushInitialLoad();

  // note1 always fails after persistWrite's retries; note2 (and any other write) succeeds.
  stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    const body = init?.body ? (JSON.parse(String(init.body)) as { body?: string }) : {};
    if (body.body === note1) return Promise.resolve(failJson(500));
    return Promise.resolve(okJson(201, {}));
  });

  act(() => result.current.saveVerseNote(verse, note1));
  expect(result.current.notes.get(verse)).toBe(note1); // optimistic paint
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  // Rolled back to empty (the verse had no note before note1's save).
  expect(result.current.notes.has(verse)).toBe(false);
  expect(result.current.writeError?.message).toBe("Couldn't save your note");
  expect(result.current.writeError?.retry).toBeDefined();

  // A newer save on the same verse succeeds.
  act(() => result.current.saveVerseNote(verse, note2));
  expect(result.current.notes.get(verse)).toBe(note2); // painted
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe(note2);
  // The bug's enabling condition: note2's success did NOT clear note1's older banner — its
  // `retry` is still armed and pointing at note1's destructive replay.
  expect(result.current.writeError?.message).toBe("Couldn't save your note");
  expect(result.current.writeError?.retry).toBeDefined();

  return { result, verse, note1, note2 };
}

// Seeds 'old' (succeeds), then a delete whose DELETE keeps failing (rolled back to 'old', banner
// armed with a live retry), then a newer save of 'new' (succeeds). The stale delete-retry would
// otherwise re-delete the verse and soft-delete 'new' server-side via removeNote.
async function seedFailedDeleteThenNewerNote(verse: number) {
  const stub = stubAnnotationsFetch();
  const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
  await flushInitialLoad();

  // Seed an existing note so the delete has something to remove.
  act(() => result.current.saveVerseNote(verse, 'old'));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe('old');

  // The delete's DELETE keeps failing; any POST (a newer re-save) succeeds.
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
  // Rolled back: 'old' restored.
  expect(result.current.notes.get(verse)).toBe('old');
  expect(result.current.writeError?.message).toBe("Couldn't delete your note");
  expect(result.current.writeError?.retry).toBeDefined();

  // A newer note is re-saved on the same verse and succeeds.
  stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
    return Promise.resolve(okJson(201, {}));
  });
  act(() => result.current.saveVerseNote(verse, 'new'));
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(result.current.notes.get(verse)).toBe('new');
  // The delete's older banner (and its retry) is still armed — note2's success cleared only its
  // own banner.
  expect(result.current.writeError?.message).toBe("Couldn't delete your note");
  expect(result.current.writeError?.retry).toBeDefined();

  return { result, verse };
}

describe('useAnnotationWrites — saveVerseNote retry must not clobber a newer saved note', () => {
  it('retrying a failed save (manual retryWrite tap) does not overwrite a newer, saved note', async () => {
    const { result, verse, note2 } = await seedFailedSaveThenNewerNote(1);

    // Snapshot the note POSTs already issued (note1's original persistWrite attempts) BEFORE the
    // stale retry fires, so the assertion can prove the retry itself issued no new note1 POST.
    const notePostsBefore = vi.mocked(fetch).mock.calls
      .filter(([, init]) => !!init && (init!.method ?? 'GET').toUpperCase() === 'POST')
      .map(([, init]) => JSON.parse(String(init!.body)) as { kind?: string; body?: string })
      .filter((b) => b.kind === 'note');

    // The reader taps [Retry] on the stale (note1) banner.
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The newer note survives — the stale retry did NOT re-paint note1 over it.
    expect(result.current.notes.get(verse)).toBe(note2);

    // The stale retry issued NO new note1 POST to the server (the original save's attempts are
    // unchanged; the guard refused before paint + request).
    const notePostsAfter = vi.mocked(fetch).mock.calls
      .filter(([, init]) => !!init && (init!.method ?? 'GET').toUpperCase() === 'POST')
      .map(([, init]) => JSON.parse(String(init!.body)) as { kind?: string; body?: string })
      .filter((b) => b.kind === 'note');
    expect(notePostsAfter.length).toBe(notePostsBefore.length);
    expect(notePostsAfter.some((b) => b.body === 'note1')).toBe(notePostsBefore.some((b) => b.body === 'note1'));
  });

  it('the `online` event auto-retries the failed save and must not clobber the newer note', async () => {
    const { result, verse, note2 } = await seedFailedSaveThenNewerNote(1);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The newer note survives the automatic online retry — this path is the silent one (no user
    // tap, no dismissWrite), so the banner must be replaced with a reload hint carrying no retry.
    expect(result.current.notes.get(verse)).toBe(note2);
    expect(result.current.writeError?.message).toBe(
      "Couldn't save your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('a legitimate saveVerseNote retry (no newer save arrived) still re-saves and clears the banner', async () => {
    // Regression guard: the replay guard must NOT refuse a retry when the verse is unchanged
    // since this write's own rollback — the normal retry path for a failed save must keep working.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    // The save's POST keeps failing; no newer write lands on the verse.
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

    // Now the POST succeeds on retry — the save should redo the paint and clear the banner.
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

  it('a stale save retry does not clobber a newer save that landed within the same retry window', async () => {
    // Replicates the exact setup of the existing rollback test (annotation-write-failure.test.tsx:
    // "a failed note save does not roll back a NEWER save that landed during the retry window")
    // — both saves interleave WITHIN a single persistWrite retry budget — then fires the old
    // write's retry, the step the existing test never takes.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    // 'first' keeps failing while 'second' succeeds.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { body?: string }) : {};
      const fail = body.body === 'first';
      return Promise.resolve(fail ? failJson(500) : okJson(201, {}));
    });

    act(() => result.current.saveVerseNote(16, 'first'));
    expect(result.current.notes.get(16)).toBe('first');
    // A newer save lands while the first one's POST is still retrying.
    act(() => result.current.saveVerseNote(16, 'second'));
    expect(result.current.notes.get(16)).toBe('second');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The existing rollback test stops here, asserting the newer note survived the rollback and
    // the banner is armed. Replicate those two assertions, then also fire the stale retry.
    expect(result.current.notes.get(16)).toBe('second');
    expect(result.current.writeError?.message).toBe("Couldn't save your note");
    expect(result.current.writeError?.retry).toBeDefined();

    // Make the network succeed, then fire the old write's (first's) retry — the production trigger.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
      return Promise.resolve(okJson(201, {}));
    });
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The bug would have clobbered 'second' back to 'first'. The fix refuses the stale replay.
    expect(result.current.notes.get(16)).toBe('second');
    expect(result.current.writeError?.message).toBe(
      "Couldn't save your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });
});

describe('useAnnotationWrites — deleteVerseNote retry must not wipe a newer re-saved note', () => {
  it('retrying a failed delete (manual retryWrite tap) does not delete a newer, re-saved note', async () => {
    const { result, verse } = await seedFailedDeleteThenNewerNote(1);

    // The original delete's persistWrite already issued its (failed) DELETE attempts; snapshot
    // the count so the assertion can prove the stale retry added no new note DELETE.
    const noteDeletesBefore = vi.mocked(fetch).mock.calls
      .filter(([, init]) => !!init && (init!.method ?? 'GET').toUpperCase() === 'DELETE')
      .map(([, init]) => JSON.parse(String(init!.body)) as { kind?: string })
      .filter((b) => b.kind === 'note').length;

    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The newer note 'new' survives the stale delete-retry.
    expect(result.current.notes.get(verse)).toBe('new');
    // The stale replay did not re-issue a note DELETE — the count is unchanged.
    const noteDeletesAfter = vi.mocked(fetch).mock.calls
      .filter(([, init]) => !!init && (init!.method ?? 'GET').toUpperCase() === 'DELETE')
      .map(([, init]) => JSON.parse(String(init!.body)) as { kind?: string })
      .filter((b) => b.kind === 'note').length;
    expect(noteDeletesAfter).toBe(noteDeletesBefore);
  });

  it('the `online` event auto-retries the failed delete and must not wipe the newer note', async () => {
    const { result, verse } = await seedFailedDeleteThenNewerNote(1);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.notes.get(verse)).toBe('new');
    expect(result.current.writeError?.message).toBe(
      "Couldn't delete your note — a newer edit arrived; reload to refresh.",
    );
    expect(result.current.writeError?.retry).toBeUndefined();
  });

  it('a legitimate deleteVerseNote retry (no newer note arrived) still deletes and clears the banner', async () => {
    // Regression guard: the replay guard must NOT refuse a retry when the verse is unchanged
    // since this delete's own rollback — the normal retry path for a failed delete must keep working.
    const stub = stubAnnotationsFetch();
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'kjv'));
    await flushInitialLoad();

    // Seed an existing note so the delete has something to remove.
    act(() => result.current.saveVerseNote(16, 'old'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.notes.get(16)).toBe('old');

    // The delete's DELETE keeps failing; no newer note is re-saved.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
      if (method === 'DELETE') return Promise.resolve(failJson(500));
      return Promise.resolve(okJson(201, {}));
    });
    act(() => result.current.deleteVerseNote(16));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.notes.get(16)).toBe('old'); // rolled back
    expect(result.current.writeError?.message).toBe("Couldn't delete your note");
    expect(result.current.writeError?.retry).toBeDefined();

    // Now the DELETE succeeds on retry — the delete should redo and clear the banner.
    stub.mock.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(okJson(200, { highlights: [], notes: [], bookmarks: [] }));
      return Promise.resolve(okJson(201, {}));
    });
    act(() => result.current.retryWrite());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.notes.has(16)).toBe(false);
    expect(result.current.writeError).toBeNull();
  });
});
