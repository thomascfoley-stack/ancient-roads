// @vitest-environment jsdom
//
// PR1c item 2 — A HEADLESS DELETE COMPLETES END TO END WITHOUT PATCHING THE PAGE CONTEXT.
//
// This is the exit test the owner specified, and its whole value is in what it does NOT do.
//
// jsdom implements `window.confirm` as a stub that returns `undefined` — falsy — so the OLD code
// path (`if (window.confirm(...))`) fails closed here and the delete never fires. The tempting fix
// is `vi.stubGlobal('confirm', () => true)`. **That would assert the opposite of the requirement:**
// it proves the blocking dialog is still in the path and that only a patched environment can get
// past it. The same is true in a real browser — an automated or assistive-tech driver that must
// pre-empt a native modal is not exercising the product, it is working around it.
//
// So: no `stubGlobal`, no patched `confirm`, no dialog handler. Click Delete, click Delete again,
// and the DELETE must reach the API. If anyone reintroduces `window.confirm`, this test fails
// without needing to know that they did.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// `fireEvent`, not `@testing-library/user-event`: the latter is not a dependency of this project,
// and a new dependency needs its justification written down first (CLAUDE.md). Clicking is all
// this test needs, and `fireEvent.click` dispatches a real DOM click — which is the point, since
// the requirement is that an ORDINARY driver can complete the flow.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrayerJournal } from '../../src/components/prayer-journal';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u1' } } }) },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PRAYER = {
  id: '11111111-1111-4111-8111-111111111111',
  body: 'For patience with my father',
  verse_id: null,
  created_at: '2026-08-08T09:00:00.000Z',
  updated_at: '2026-08-08T09:00:00.000Z',
};

/** Records every request so the assertion is about what reached the API, not about UI state. */
function stubApi() {
  const calls: { method: string; body: unknown }[] = [];
  let prayers = [PRAYER];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method !== 'POST') {
        return new Response(JSON.stringify({ prayers }), { status: 200 });
      }
      const body = JSON.parse(String(init.body));
      calls.push({ method: 'POST', body });
      if (body.kind === 'delete') prayers = [];
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  return calls;
}

describe('PR1c — headless delete, no page-context patching', () => {
  it('deletes end to end with NO stubbed confirm, and the DELETE reaches the API', async () => {
    // NOTE the absence: no vi.stubGlobal('confirm', ...). That absence IS the test.
    const calls = stubApi();
    render(<PrayerJournal />);

    fireEvent.click(await screen.findByRole('button', { name: /For patience with my father/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));

    // Step 2 — the in-page confirmation, reachable by an ordinary driver.
    expect(screen.getByText(/Delete this prayer\?/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Keep/i }), 'no way to back out').toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));

    await waitFor(() =>
      expect(
        calls.filter((c) => (c.body as { kind: string }).kind === 'delete'),
        'the delete never reached the API — a blocking dialog is still in the path',
      ).toHaveLength(1),
    );
    expect((calls.at(-1)!.body as { id: string }).id).toBe(PRAYER.id);
  });

  it('Keep cancels without deleting', async () => {
    // The confirmation must be real. A two-step where the first step is decorative is not a guard.
    const calls = stubApi();
    render(<PrayerJournal />);

    fireEvent.click(await screen.findByRole('button', { name: /For patience with my father/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Keep/i }));

    expect(screen.queryByText(/Delete this prayer\?/i), 'confirmation did not dismiss').toBeNull();
    expect(calls.filter((c) => (c.body as { kind: string }).kind === 'delete')).toHaveLength(0);
  });
});
