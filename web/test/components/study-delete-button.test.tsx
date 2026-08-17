// @vitest-environment jsdom
//
// B028 — A STUDY CAN BE DELETED FROM THE UI.
//
// `DELETE /api/studies/[id]` has existed since the studies slice shipped and NOTHING called it.
// The 2026-08-17 authenticated QA pass put it plainly: "No way to delete a Study from the UI at
// all" — the session had to use a raw API call to clean up after itself. Same shape as the
// research-thread gap (B005) and the bookmark gap (B023): working plumbing, no button.
//
// TWO STEPS, for the same reason the research-thread control has two: a study is a durable body
// of the reader's own writing, this is irreversible from their point of view, and the control sits
// on a list row next to a link they click all the time.
//
// NO OPTIMISTIC REMOVAL HERE, deliberately — and this differs from the research-thread control on
// purpose. `/studies` is a SERVER component (`force-dynamic`, `currentUser()`), so the row this
// button sits in is server-rendered; there is no client-side list to splice. Faking one would mean
// holding a second copy of the list in the client just to hide a row. `router.refresh()` re-fetches
// the authoritative list instead, which cannot disagree with the server about what still exists.
// The cost is a beat of latency on a delete, which is the right trade for a list that must not lie.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { DeleteStudyButton } from '../../src/components/study-delete-button';

let calls: { url: string; method?: string }[] = [];
let ok = true;

beforeEach(() => {
  calls = [];
  ok = true;
  refresh.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    calls.push({ url: String(url), method: init?.method });
    return ok ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response('', { status: 500 });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const STUDY = { id: '3f9a1c2e-0000-4000-8000-000000000001', title: 'Sermon on John 10' };

describe('B028 — deleting a study', () => {
  it('takes two taps: the first arms, the second deletes', async () => {
    // SEED: call remove() on the first tap -> RED. One stray tap on a list row would destroy a
    // durable piece of the reader's writing.
    render(<DeleteStudyButton id={STUDY.id} title={STUDY.title} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete study: Sermon on John 10/i }));
    expect(calls, 'the FIRST tap issued a delete').toEqual([]);

    fireEvent.click(await screen.findByRole('button', { name: /Confirm delete: Sermon on John 10/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('calls DELETE on the right study', async () => {
    render(<DeleteStudyButton id={STUDY.id} title={STUDY.title} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete study/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirm delete/i }));
    await waitFor(() => {
      expect(calls[0]?.url).toBe(`/api/studies/${STUDY.id}`);
      expect(calls[0]?.method).toBe('DELETE');
    });
  });

  it('refreshes the server list on success — the list is the authority, not local state', async () => {
    render(<DeleteStudyButton id={STUDY.id} title={STUDY.title} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete study/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirm delete/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('says so on failure, and does NOT refresh — a silent failure would read as success', async () => {
    // SEED: drop the !res.ok branch -> RED. router.refresh() would re-render the row unchanged
    // and the reader would conclude the delete silently did nothing.
    ok = false;
    render(<DeleteStudyButton id={STUDY.id} title={STUDY.title} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete study/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirm delete/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(refresh, 'refreshed after a failed delete').not.toHaveBeenCalled();
  });

  it('disarms on blur, so an armed row does not sit waiting for a stray click', async () => {
    render(<DeleteStudyButton id={STUDY.id} title={STUDY.title} />);
    const btn = screen.getByRole('button', { name: /Delete study/i });
    fireEvent.click(btn);
    await screen.findByRole('button', { name: /Confirm delete/i });
    fireEvent.blur(screen.getByRole('button', { name: /Confirm delete/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete study/i })).toBeTruthy());
  });
});
