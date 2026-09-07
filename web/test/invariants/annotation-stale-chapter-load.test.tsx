// @vitest-environment jsdom

// RACE, VERIFIED: the chapter-load effect in use-annotation-writes.ts fires
// GET /api/annotations?book=B&chapter=C with no staleness guard. Switch chapters A→B; if A's
// response resolves AFTER B's, it paints into B's state — and highlights/notes/bookmarks are
// keyed by verse number only (verse_id % 1000), so chapter A's annotations land on chapter B's
// verses. The destructive half: a reader who "clears" one of those phantom highlights issues a
// DELETE whose verseId is computed from the CURRENT chapter (`verseId` in the hook) — silently
// destroying a real chapter-B annotation they never saw.
//
// Fixed by aborting the previous load in the effect's cleanup and dropping any response whose
// signal was aborted. These tests reproduce the exact ordering — A deferred, B resolved, A
// resolved LAST — against the REAL hook, the same harness pattern as
// test/invariants/annotation-write-failure.test.tsx.

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeVerseId } from '@bible/verse-id';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';

interface RecordedCall {
  url: string;
  method: string;
  body?: { kind?: string; verseId?: number; [k: string]: unknown };
}

const jsonResponse = (d: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(d) } as Response);

/** Chapter 3 (A) carries verse 5; chapter 4 (B) carries verse 9. Distinct verses so a leak is
 *  unambiguous: verse 5 appearing after the switch can ONLY have come from A's late response. */
const chapterAPayload = {
  highlights: [
    { id: 'a-h5', verse_id: encodeVerseId({ book: 43, chapter: 3, verse: 5 }), span_start: null, span_end: null, color: 'yellow', text_color: null, translation: 'kjv' },
  ],
  notes: [{ verse_id: encodeVerseId({ book: 43, chapter: 3, verse: 5 }), body: 'chapter 3 note' }],
  bookmarks: [{ verse_id: encodeVerseId({ book: 43, chapter: 3, verse: 5 }) }],
};
const chapterBPayload = {
  highlights: [
    { id: 'b-h9', verse_id: encodeVerseId({ book: 43, chapter: 4, verse: 9 }), span_start: null, span_end: null, color: 'green', text_color: null, translation: 'kjv' },
  ],
  notes: [{ verse_id: encodeVerseId({ book: 43, chapter: 4, verse: 9 }), body: 'chapter 4 note' }],
  bookmarks: [{ verse_id: encodeVerseId({ book: 43, chapter: 4, verse: 9 }) }],
};

/** /api/annotations mock where chapter A's GET is DEFERRED (resolves only when the test says so)
 *  and chapter B's GET resolves immediately. Writes succeed. */
function stubRacedChapterFetch() {
  const calls: RecordedCall[] = [];
  let resolveA: (r: Response) => void = () => {
    throw new Error('chapter A GET was never requested');
  };
  const chapterA = new Promise<Response>((res) => {
    resolveA = res;
  });
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as RecordedCall['body']) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET') {
      if (url.includes('chapter=3')) return chapterA; // deferred: the losing side of the race
      return Promise.resolve(jsonResponse(chapterBPayload));
    }
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, resolveStaleA: () => resolveA(jsonResponse(chapterAPayload)) };
}

/** Pure microtask flushing — the GET chain has no timers. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

/** Runs the exact race: mount on chapter 3 (A's GET left pending), switch to chapter 4 (B's GET
 *  resolves), then resolve A's stale response LAST. */
async function runStaleLoadRace() {
  const stub = stubRacedChapterFetch();
  const { result, rerender } = renderHook(
    ({ chapter }) => useAnnotationWrites(43, chapter, 'kjv'),
    { initialProps: { chapter: 3 } },
  );
  await flush(); // A's GET issued, still pending

  await act(async () => {
    rerender({ chapter: 4 });
  });
  await flush(); // B's GET resolved: chapter 4's own annotations are on screen
  expect(result.current.highlights.has(9)).toBe(true);

  await act(async () => {
    stub.resolveStaleA(); // the loser of the race arrives LAST
  });
  await flush();
  return { result, calls: stub.calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('useAnnotationWrites — a stale chapter load must not paint over the current chapter', () => {
  it("chapter A's late response never enters chapter B's highlights/notes/bookmarks", async () => {
    // SEED: drop the `controller.signal.aborted` bail (or the cleanup's abort) in the load effect
    // -> A's verse 5 paints into chapter 4's state beside B's verse 9.
    const { result } = await runStaleLoadRace();

    expect([...result.current.highlights.keys()]).toEqual([9]);
    expect([...result.current.notes.keys()]).toEqual([9]);
    expect([...result.current.bookmarks]).toEqual([9]);
    // The aborted load is not a failure either — the reader is looking at a good chapter.
    expect(result.current.annotationsFailed).toBe(false);
  });

  it('clearing after the stale resolution issues NO misdirected DELETE for the current chapter', async () => {
    // The reader does what the screen tells them to: if they SEE a highlight on verse 5, they
    // clear it. Post-fix they never see it (it was stale chapter-A data), so no DELETE is sent.
    // Pre-fix this clear DELETEs verseId(43, 4, 5) — a REAL chapter-4 annotation the reader
    // never saw — which is the silent-destruction bug.
    const { result, calls } = await runStaleLoadRace();

    if (result.current.highlights.has(5)) {
      act(() => result.current.clearVerse(5));
      await flush();
    }

    const deletes = calls.filter((c) => c.method === 'DELETE');
    // SEED: drop the staleness guard -> highlights.has(5) is true, clearVerse fires, and this
    // fails with deletes === [{ verseId: encodeVerseId({ book: 43, chapter: 4, verse: 5 }) }]:
    // the misdirected DELETE, caught in the act.
    expect(deletes).toEqual([]);
  });
});
