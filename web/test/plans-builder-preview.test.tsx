// @vitest-environment jsdom
//
// THE BUILDER TELLS YOU WHAT YOU ARE ABOUT TO GET, BEFORE YOU GET IT.
//
// The first pass of this screen was reported as unintuitive, and the specific
// reason is that "8 weeks x 5 days" over a book is meaningless until submitted:
// the only way to learn that Romans cannot fill 40 reading days was to press
// Create and read an error. The preview closes that by running `expandPlan` —
// the SAME pure function the server runs — live in the component.
//
// These cases drive the real component and read the rendered text. A preview
// computed from a second, parallel implementation would pass a test like this
// while drifting from what the server builds; asserting through the component
// against the shared function is what makes the guarantee real.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PlansClient } from '@/components/plans-client';

// EXPLICIT cleanup: this config does not enable vitest globals, so
// @testing-library/react never registers its automatic afterEach. Without it
// every render stacks and each query reports "found multiple elements" —
// which is what the first run of this file did.
afterEach(() => cleanup());

// One plan-less user, so the component lands on the builder path.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/plans') && !String(url).includes('topics')) {
      return { ok: true, status: 200, json: async () => ({ plans: [] }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ matches: [] }) } as unknown as Response;
  }));
});

async function openBuilder() {
  render(<PlansClient />);
  const open = await screen.findByRole('button', { name: /build my first plan/i });
  fireEvent.click(open);
}

describe('the builder previews the real plan', () => {
  it('shows the reading count, the pace and the span before anything is submitted', async () => {
    await openBuilder();
    // Defaults: Romans (16 chapters), 8 weeks x 5 days = 40 reading days.
    // 16 chapters cannot fill 40 days, so the REFUSAL must be visible up front.
    // SEED: delete the `preview` useMemo and this text never appears.
    await waitFor(() => expect(screen.getByText(/not enough for 40 reading days/i)).toBeTruthy());

    // Make it fit: 8 weeks x 2 days = 16 days for 16 chapters.
    fireEvent.change(screen.getByLabelText(/days each week/i), { target: { value: '2' } });
    await waitFor(() => {
      expect(screen.getByText(/16 readings/)).toBeTruthy();
      expect(screen.getByText(/about 1 chapter a day/)).toBeTruthy();
    });
    expect(screen.getByText(/Romans · 16 chapters/)).toBeTruthy();
  });

  it('disables Create while the preview is a refusal, so the dead end is unreachable', async () => {
    await openBuilder();
    // SEED: drop `disabled={... preview?.ok === false}` and this button is
    // clickable into a guaranteed server refusal.
    await waitFor(() => expect(screen.getByText(/not enough for 40 reading days/i)).toBeTruthy());
    const create = screen.getByRole('button', { name: /create plan/i }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/days each week/i), { target: { value: '2' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /create plan/i }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('recomputes when the scope changes, not only the schedule', async () => {
    await openBuilder();
    fireEvent.change(screen.getByLabelText(/days each week/i), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByText(/16 readings/)).toBeTruthy());

    // Genesis is 50 chapters over the same 16 days — the pace must move with it.
    fireEvent.change(screen.getByLabelText(/^book$/i), { target: { value: 'gen' } });
    await waitFor(() => expect(screen.getByText(/about 3 chapters a day/)).toBeTruthy());
    expect(screen.getByText(/Genesis · 50 chapters/)).toBeTruthy();
  });

  it('a collection previews across book boundaries', async () => {
    await openBuilder();
    fireEvent.click(screen.getByRole('tab', { name: /a collection/i }));
    // Paul's letters: 87 chapters. 8 x 5 = 40 days fits.
    await waitFor(() => expect(screen.getByText(/40 readings/)).toBeTruthy());
    expect(screen.getByText(/87 chapters across 13 books/)).toBeTruthy();
  });

  it('each mode explains itself, so the tabs are not three unlabelled nouns', async () => {
    await openBuilder();
    expect(screen.getByText(/Work through a single book/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /a topic/i }));
    await waitFor(() => expect(screen.getByText(/gathered by a classic topical index/i)).toBeTruthy());
  });
});
