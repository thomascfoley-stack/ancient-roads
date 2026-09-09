// @vitest-environment jsdom

// THE ROW THAT FAILED TO UNSAVE COMES BACK IN THE RIGHT PLACE.
//
// /library/notes removes a row optimistically and rolls it back to "the index it left from"
// when the DELETE fails. That index is captured from the confirm-time `rows` snapshot, so it
// is only valid if no OTHER same-kind remove shifted the same list while the DELETE was
// pending. Two same-kind removes confirmed before either DELETE settles used to race: the
// earlier-confirmed one failing would reinsert it at a stale index into a now-shifted list
// and scramble the order (commit 15a3fbfe, "The page that showed everything you saved can
// now unsave it").
//
// The page now closes a PER-KIND in-flight gate at confirm time: a counter per kind ticks up
// and disables every same-kind row's remove button while the DELETE is pending, then ticks
// back down on settle. Cross-kind removes (a different array, no shared index) stay open.
// The counts are independent, so a highlight remove in flight never reopens a still-pending
// note's gate — a single shared flag would, and would re-open the same-kind race through the
// back door. This file pins that the rollback restores the server's order under every race
// the bug fires in, and that the gate blocks the concurrency that could invalidate the index.
//
// Drives the SHIPPED MyLibraryPage with a fetch whose DELETEs are deferred promises the test
// settles in a chosen order, so the race window the bug lives in is opened and pinned. Seeds
// the list in the server's actual order — newest first, `ORDER BY updated_at DESC, id DESC`
// (annotations.ts) — [Z, Y, X], the order the bug report's trace uses.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyLibraryPage from '@/app/library/notes/page';

// Verse ids this repo already uses in saved-page-remove.test.tsx.
const JOHN_3_16 = 43_003_016; // "John 3:16" — newest note (index 0)
const PSALM_23_1 = 19_023_001; // "Psalms 23:1" — middle note (index 1)
const JOHN_1_1 = 43_001_001; // "John 1:1" — oldest note (index 2)

interface Note { id: string; verse_id: number; body: string; updated_at: string }
interface Highlight { id: string; verse_id: number; color: string }

// Newest first — listNotes' ORDER BY updated_at DESC, id DESC. Distinct bodies so the
// rendered order can be read straight back from the DOM.
const NOTE_Z: Note = { id: 'note-Z', verse_id: JOHN_3_16, body: 'Body Z', updated_at: '2026-03-03T00:00:00.000Z' };
const NOTE_Y: Note = { id: 'note-Y', verse_id: PSALM_23_1, body: 'Body Y', updated_at: '2026-02-02T00:00:00.000Z' };
const NOTE_X: Note = { id: 'note-X', verse_id: JOHN_1_1, body: 'Body X', updated_at: '2026-01-01T00:00:00.000Z' };

// A highlight on the same verse as NOTE_Z — same reference, different array, so a cross-kind
// remove can run concurrently without touching the note list.
const HIGHLIGHT: Highlight = { id: 'hl-1', verse_id: JOHN_3_16, color: 'yellow' };

interface RecordedCall { url: string; method: string; body?: { kind?: string; id?: string; verseId?: number } }
interface Deferred { resolve: (v: Response) => void; promise: Promise<Response> }

function makeDeferred(): Deferred {
  let resolve!: (v: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });
  return { resolve, promise };
}
const ok = (b: unknown): Response => ({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response);
const fail = (): Response => ({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);

/** `fetch` stub: GET resolves with the seed; every DELETE returns a deferred the test controls. */
function stubFetch(seed: { notes?: Note[]; highlights?: Highlight[]; bookmarks?: unknown[] }) {
  const calls: RecordedCall[] = [];
  const pendingDeletes: Deferred[] = [];
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as RecordedCall['body']) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET') {
      return Promise.resolve(ok({ notes: seed.notes ?? [], highlights: seed.highlights ?? [], bookmarks: seed.bookmarks ?? [] }));
    }
    const d = makeDeferred();
    pendingDeletes.push(d);
    return d.promise;
  });
  vi.stubGlobal('fetch', mock);
  return { calls, pendingDeletes };
}

/** Mount the page and flush its mount-time GET to /api/annotations/all. */
async function renderLoaded() {
  render(<MyLibraryPage />);
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
}

/** The note bodies in rendered (DOM) order — the order the bug scrambles. */
function noteBodies(): string[] {
  return screen.getAllByText(/^Body /).map((el) => el.textContent ?? '');
}
function removeBtn(noun: string, ref: string): HTMLButtonElement {
  return screen.getByRole('button', { name: `Remove ${noun} on ${ref}` }) as HTMLButtonElement;
}
function confirmBtn(noun: string, ref: string): HTMLButtonElement {
  return screen.getByRole('button', { name: `Confirm remove: ${noun} on ${ref}` }) as HTMLButtonElement;
}
async function armAndConfirm(noun: string, ref: string) {
  await act(async () => { removeBtn(noun, ref).click(); });
  await act(async () => { confirmBtn(noun, ref).click(); });
}
/** Resolve a pending DELETE and let the page's await chain + state updates flush. */
async function settle(d: Deferred, res: Response) {
  await act(async () => { d.resolve(res); for (let i = 0; i < 5; i++) await Promise.resolve(); });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('/library/notes — rollback order under concurrent same-kind removals', () => {
  it('seeds and renders the list in the server (newest-first, DESC) order the bug fires in', async () => {
    stubFetch({ notes: [NOTE_Z, NOTE_Y, NOTE_X] });
    await renderLoaded();
    expect(noteBodies()).toEqual(['Body Z', 'Body Y', 'Body X']);
  });

  it('closes the per-kind gate: while a note DELETE is pending, the other note rows cannot be armed', async () => {
    const { calls, pendingDeletes } = stubFetch({ notes: [NOTE_Z, NOTE_Y, NOTE_X] });
    await renderLoaded();

    // Confirm the MIDDLE note (Y, index 1) — the case the bug scrambles.
    await armAndConfirm('note', 'Psalms 23:1');
    expect(pendingDeletes).toHaveLength(1);

    // Y left optimistically...
    expect(noteBodies()).toEqual(['Body Z', 'Body X']);
    // ...and every OTHER same-kind row is gated OFF while the DELETE is in flight.
    expect(removeBtn('note', 'John 3:16').disabled).toBe(true);
    expect(removeBtn('note', 'John 1:1').disabled).toBe(true);

    // A disabled button does not arm: clicking it sends no DELETE and arms nothing.
    await act(async () => { removeBtn('note', 'John 3:16').click(); });
    expect(pendingDeletes).toHaveLength(1);
    expect(noteBodies()).toEqual(['Body Z', 'Body X']);
    expect(screen.queryByRole('button', { name: 'Confirm remove: note on John 3:16' })).toBeNull();

    // Failing the pending DELETE rolls Y back at the index it left from (1) into [Z, X] -> [Z, Y, X].
    await settle(pendingDeletes[0]!, fail());
    await waitFor(() => expect(noteBodies()).toEqual(['Body Z', 'Body Y', 'Body X']));

    // The gate reopens once the DELETE settles, so the surviving note rows can be armed again.
    expect(removeBtn('note', 'John 3:16').disabled).toBe(false);
    expect(removeBtn('note', 'John 1:1').disabled).toBe(false);

    // Exactly one DELETE was sent — the gate serialized the same-kind removal.
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('a failed remove restores the row to its original position (the bug-headline middle row)', async () => {
    const { pendingDeletes } = stubFetch({ notes: [NOTE_Z, NOTE_Y, NOTE_X] });
    await renderLoaded();

    // Pre-fix, the MIDDLE row Y (index 1) failing could reinsert at a stale index into a
    // shifted list and yield [X, Y] (one fails) or [Z, X, Y] (both fail, Y rejects first).
    // With the gate holding index 1 valid, Y lands back at index 1 in the still-[Z, X] list.
    await armAndConfirm('note', 'Psalms 23:1');
    await settle(pendingDeletes[0]!, fail());
    await waitFor(() => expect(noteBodies()).toEqual(['Body Z', 'Body Y', 'Body X']));
  });

  it('lets cross-kind removals proceed while a same-kind DELETE is in flight (the gate is per kind)', async () => {
    const { calls, pendingDeletes } = stubFetch({ notes: [NOTE_Z, NOTE_Y, NOTE_X], highlights: [HIGHLIGHT] });
    await renderLoaded();

    // Confirm Y's note remove: the note gate closes, the note DELETE is pending.
    await armAndConfirm('note', 'Psalms 23:1');
    expect(pendingDeletes).toHaveLength(1);
    expect(removeBtn('note', 'John 3:16').disabled).toBe(true);

    // The highlight row is a DIFFERENT array — its remove control stays armed-able, and a
    // cross-kind remove fires a SECOND, concurrent DELETE without touching the note's index.
    expect(removeBtn('highlight', 'John 3:16').disabled).toBe(false);
    await armAndConfirm('highlight', 'John 3:16');
    expect(pendingDeletes).toHaveLength(2);

    // The independent counts mean the cross-kind remove did NOT reopen the note gate: the
    // still-pending note's rows stay disabled, so no second note remove can race it.
    expect(removeBtn('note', 'John 3:16').disabled).toBe(true);
    await act(async () => { removeBtn('note', 'John 3:16').click(); });
    expect(pendingDeletes).toHaveLength(2);

    // Settle: the note fails (rolls back to [Z, Y, X]); the highlight succeeds (gone).
    await settle(pendingDeletes[0]!, fail());
    await waitFor(() => expect(noteBodies()).toEqual(['Body Z', 'Body Y', 'Body X']));
    await settle(pendingDeletes[1]!, ok({}));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove highlight on John 3:16' })).toBeNull());

    // Both DELETEs fired, in the shipped shapes (note by verse; highlight by span id).
    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(2);
    expect(deletes[0]!.body).toEqual({ kind: 'note', verseId: PSALM_23_1 });
    expect(deletes[1]!.body).toEqual({ kind: 'highlight', id: 'hl-1' });
  });

  it('reopens the gate after a successful remove, so a later same-kind remove proceeds', async () => {
    const { calls, pendingDeletes } = stubFetch({ notes: [NOTE_Z, NOTE_Y, NOTE_X] });
    await renderLoaded();

    // Y succeeds and stays gone -> [Z, X]; the note gate reopens.
    await armAndConfirm('note', 'Psalms 23:1');
    await settle(pendingDeletes[0]!, ok({}));
    await waitFor(() => expect(noteBodies()).toEqual(['Body Z', 'Body X']));
    expect(removeBtn('note', 'John 3:16').disabled).toBe(false);

    // Z succeeds next -> [X]; its captured index (0 in [Z, X]) is valid because the gate kept
    // Z's remove button disabled until Y's DELETE had settled.
    await armAndConfirm('note', 'John 3:16');
    await settle(pendingDeletes[1]!, ok({}));
    await waitFor(() => expect(noteBodies()).toEqual(['Body X']));

    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
  });

  it('two same-kind removes that each fail, run one after the other, both restore the order', async () => {
    const { pendingDeletes } = stubFetch({ notes: [NOTE_Z, NOTE_Y, NOTE_X] });
    await renderLoaded();

    // Y fails -> [Z, Y, X]; the note gate reopens once the DELETE settles.
    await armAndConfirm('note', 'Psalms 23:1');
    await settle(pendingDeletes[0]!, fail());
    await waitFor(() => expect(noteBodies()).toEqual(['Body Z', 'Body Y', 'Body X']));

    // Now Z (index 0 in [Z, Y, X]) fails too, and lands back at index 0 -> [Z, Y, X].
    await armAndConfirm('note', 'John 3:16');
    await settle(pendingDeletes[1]!, fail());
    await waitFor(() => expect(noteBodies()).toEqual(['Body Z', 'Body Y', 'Body X']));
  });
});
