// @vitest-environment jsdom
//
// THE COMPOSE REDESIGN'S EXIT TEST (owner direction 2026-08-12, mockup
// `journal-redesign-mockup_1.html`: "Save / Cancel → autosave with a quiet timestamp. Nothing
// can be lost.").
//
// What this file asserts, at the level a jsdom render honestly can:
//   1. THERE IS NO SAVE BUTTON AND NO CANCEL BUTTON in the compose view. Their presence is the
//      old design; a test that only checks autosave fires would pass with both buttons restored.
//   2. TYPING SAVES BY ITSELF — the first save is a CREATE, later saves are UPDATEs on the id
//      the create returned. The second half matters as much as the first: an autosave that
//      creates on every debounce files the same prayer over and over.
//   3. EDITING an existing prayer autosaves an UPDATE on its id and never a CREATE.
//   4. AN EMPTY DRAFT IS NEVER WRITTEN — autosave must not create an empty prayer, and must
//      never delete one either (that half lives in the delete test file; deleting stays a
//      deliberate two-step act).
//   5. The confirmation is the quiet timestamp ("Saved …"), not a toast, banner, or modal.
//
// The debounce is REAL TIME here on purpose: fake timers would also fake the ordering between
// the timer, the fetch promise, and the pending-save chain, which is exactly the machinery under
// test. The waits are ~1s each; that is the cost of testing the real thing.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrayerJournal } from '../../src/components/prayer-journal';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u1' } } }) },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const EXISTING = {
  id: '22222222-2222-4222-8222-222222222222',
  body: 'For patience with my father',
  verse_id: null,
  created_at: '2026-08-08T09:00:00.000Z',
  updated_at: '2026-08-08T09:00:00.000Z',
};

/** Records every POST body so assertions are about what reached the API, not about UI state. */
function stubApi(initial: typeof EXISTING[] = []) {
  const calls: Record<string, unknown>[] = [];
  let seq = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method !== 'POST') {
        return new Response(JSON.stringify({ prayers: initial }), { status: 200 });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push(body);
      if (body.kind === 'create') {
        seq += 1;
        return new Response(
          JSON.stringify({
            prayer: {
              id: `33333333-3333-4333-8333-${String(seq).padStart(12, '0')}`,
              body: body.body,
              verse_id: null,
              created_at: '2026-08-12T09:00:00.000Z',
              updated_at: '2026-08-12T09:00:00.000Z',
            },
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  return calls;
}

describe('Prayer compose redesign — autosave', () => {
  it('has NO Save and NO Cancel, and typing saves by itself: create once, then update', async () => {
    const calls = stubApi();
    render(<PrayerJournal />);
    fireEvent.click(await screen.findByRole('button', { name: /write a prayer/i }));

    // SEED: restore the Save / Cancel buttons -> RED. Their absence is half the redesign.
    expect(screen.queryByRole('button', { name: /^save$/i }), 'the Save button is back').toBeNull();
    expect(screen.queryByRole('button', { name: /^cancel$/i }), 'the Cancel button is back').toBeNull();

    const box = screen.getByLabelText('Your prayer');
    fireEvent.change(box, { target: { value: 'Lord, teach me patience' } });

    // SEED: drop `scheduleSave()` from onChange (or the save effect) -> RED: nothing ever
    // reaches the API and this wait times out.
    await waitFor(() => expect(calls.filter((c) => c.kind === 'create')).toHaveLength(1), { timeout: 3000 });
    const createId = (calls.find((c) => c.kind === 'create') as { kind: string; body: string }).body;
    expect(createId).toBe('Lord, teach me patience');

    // The quiet timestamp is the confirmation.
    expect(await screen.findByText(/Saved /), 'no saved timestamp after the create').toBeTruthy();

    fireEvent.change(box, { target: { value: 'Lord, teach me patience today' } });
    await waitFor(() => expect(calls.filter((c) => c.kind === 'update')).toHaveLength(1), { timeout: 3000 });

    const update = calls.find((c) => c.kind === 'update') as { id: string; body: string };
    // SEED: always create (never remember the returned id) -> RED here, and the journal would
    // fill with duplicates of one prayer.
    expect(update.id).toBe('33333333-3333-4333-8333-000000000001');
    expect(update.body).toBe('Lord, teach me patience today');
    expect(calls.filter((c) => c.kind === 'create'), 'a second create — duplicates').toHaveLength(1);
  });

  it('editing an existing prayer autosaves an UPDATE on its id and never creates', async () => {
    const calls = stubApi([EXISTING]);
    render(<PrayerJournal />);

    fireEvent.click(await screen.findByRole('button', { name: /For patience with my father/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/i }));

    const box = screen.getByLabelText('Your prayer');
    // Opening the editor must not, by itself, write anything.
    await new Promise((r) => setTimeout(r, 1200));
    expect(calls, 'opening the editor saved something').toHaveLength(0);

    fireEvent.change(box, { target: { value: 'For patience with my father, and for his health' } });
    await waitFor(() => expect(calls.filter((c) => c.kind === 'update')).toHaveLength(1), { timeout: 3000 });
    expect(calls.find((c) => c.kind === 'update')).toMatchObject({ id: EXISTING.id });
    expect(calls.filter((c) => c.kind === 'create'), 'an edit created a new prayer').toHaveLength(0);
  });

  it('an empty draft is never written', async () => {
    const calls = stubApi();
    render(<PrayerJournal />);
    fireEvent.click(await screen.findByRole('button', { name: /write a prayer/i }));

    const box = screen.getByLabelText('Your prayer');
    // Type and erase INSIDE the debounce window: nothing may reach the API.
    fireEvent.change(box, { target: { value: 'a' } });
    fireEvent.change(box, { target: { value: '' } });
    await new Promise((r) => setTimeout(r, 1500));
    // SEED: drop the `!body.trim()` guard -> RED: an empty prayer lands in the journal.
    expect(calls, 'an empty draft was saved').toHaveLength(0);
  });
});
