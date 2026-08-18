// @vitest-environment jsdom
//
// A015 — ADJUDICATED NOT REPRODUCED; this file is the pin on WHY it cannot happen.
//
// A QA session reported one submission firing two near-simultaneous POSTs to /api/ask/stream.
// Three measurements, in order, each of which corrected the previous theory:
//
//   1. A real browser with a fetch counter: ONE submit -> ONE POST. The ordinary path is fine.
//   2. Theory: `busy` is React state, so a same-tick double submit reads a stale false twice.
//      DISPROVED by this file's own first run: React flushes discrete-event state synchronously,
//      so the second submit's closure sees busy=true. The test passed against unfixed code.
//   3. Theory: then the busy guard alone is the protection. ALSO DISPROVED by seeding: with
//      `|| busy` deleted the test STILL passes, because `setQuestion('')` clears the composer
//      synchronously and the second submit trims to '' and returns at `!q`.
//
// So the single-flight property is DOUBLY guarded — busy AND the cleared composer — and only
// removing both produces the reported symptom (seeded: 2 POSTs, red). The QA session's double was
// almost certainly its automation running two full type+submit cycles, not a reachable user
// gesture. No code change was needed; this test is the ratchet that keeps both guards from being
// removed together, which is the only state in which A015 becomes real.

import { cleanup, fireEvent, screen, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient } from '../../src/components/ask-client';

vi.mock('../../src/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

describe('A015 — a same-tick double submit spends once', () => {
  it('two synchronous submits of one question produce ONE POST', async () => {
    // SEED: neutralise BOTH guards (`if (!q && false)`) -> RED with 2 POSTs. Removing either one
    // alone stays green — see the header; that is the point of the pin.
    let posts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      posts++;
      return new Response('', { status: 401 });
    }));
    render(<AskClient />);
    const box = await screen.findByPlaceholderText(/Ask a question/i);
    fireEvent.change(box, { target: { value: 'What is grace?' } });
    const form = box.closest('form')!;

    // The double gesture: both dispatches run in this same task, before any re-render.
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(posts).toBeGreaterThan(0));
    // Give a queued second request the chance to fire before asserting it did not.
    await new Promise((r) => setTimeout(r, 50));
    expect(posts, 'a same-tick double submit reached the network twice').toBe(1);
  });

  it('a SECOND question after the first settles still submits', async () => {
    // Without this, a guard stuck permanently on would pass the leg above while breaking every
    // ask after the first.
    let posts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      posts++;
      return new Response('', { status: 401 });
    }));
    render(<AskClient />);
    const box = await screen.findByPlaceholderText(/Ask a question/i);

    fireEvent.change(box, { target: { value: 'First question?' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(posts).toBe(1));
    // The 401 settles the turn; busy clears. Ask again.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ask$/ })).toBeTruthy());

    fireEvent.change(box, { target: { value: 'Second question?' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(posts).toBe(2));
  });
});
