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

// PlansClient routes now (/plans/[id]); outside the app router the hook throws.
// Navigation is not this file's subject — the preview is.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

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
    // THE IMPOSSIBLE COMBINATION IS NOW SET DELIBERATELY. It used to arrive for free, because the
    // builder OPENED at 8 weeks x 5 days = 40 slots against Romans's 16 chapters — which is the
    // defect block L2b removed (defaults are derived from the book now). This test's subject was
    // never the default; it is that the preview surfaces a refusal, which L2b's Do-NOT protects and
    // its second exit check requires ("the validation still fires when a user deliberately sets an
    // impossible combination"). So the fixture changes and the assertion does not.
    fireEvent.change(screen.getByLabelText(/weeks/i), { target: { value: '8' } });
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
    // Deliberate impossible combination, as above — the default no longer supplies one.
    fireEvent.change(screen.getByLabelText(/weeks/i), { target: { value: '8' } });
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
    // NUMBERS UPDATED FOR L2b, PROPERTY UNCHANGED. The builder used to open at a constant 8 weeks;
    // it now derives from the book, so Romans (16 chapters) opens at 3 weeks x 5 days. Setting 2
    // days a week gives 3 x 2 = 6 readings. The subject of this test — that the preview recomputes
    // when the SCOPE changes and not only the schedule — is untouched.
    fireEvent.change(screen.getByLabelText(/days each week/i), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByText(/6 readings/)).toBeTruthy());

    // Genesis is 50 chapters over the same 6 days — the pace must move with it. 6 days still fits
    // 50 chapters, so the reader's 2-days-a-week choice is preserved rather than re-derived.
    fireEvent.change(screen.getByLabelText(/^book$/i), { target: { value: 'gen' } });
    await waitFor(() => expect(screen.getByText(/chapters a day/)).toBeTruthy());
    expect(screen.getByText(/Genesis · 50 chapters/)).toBeTruthy();
  });

  it('a collection previews across book boundaries', async () => {
    await openBuilder();
    fireEvent.click(screen.getByRole('tab', { name: /a collection/i }));
    // Paul's letters: 87 chapters. The schedule carried over from the book mode is 3 x 5 = 15 days,
    // which fits. (Was 40, from the constant 8 weeks L2b replaced.)
    await waitFor(() => expect(screen.getByText(/15 readings/)).toBeTruthy());
    expect(screen.getByText(/87 chapters across 13 books/)).toBeTruthy();
  });

  it('each mode explains itself, so the tabs are not three unlabelled nouns', async () => {
    await openBuilder();
    expect(screen.getByText(/Work through a single book/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /a topic/i }));
    await waitFor(() => expect(screen.getByText(/gathered by a classic topical index/i)).toBeTruthy());
  });
});

describe('a half-typed schedule is an incomplete form, not a crash', () => {
  // SEED: revert the preview's incomplete-shape guard and the first case THROWS during
  // render — Number('') is 0, expandPlan returns { ok: true, days: [] }, and the preview
  // reads r.days[0]!.date. The error boundary is the whole page; a cleared field must never
  // cost the reader the form.
  it('clearing Weeks shows a quiet finish-the-numbers refusal and disables Create', async () => {
    await openBuilder();
    fireEvent.change(screen.getByLabelText(/weeks/i), { target: { value: '' } });
    await waitFor(() => expect(screen.getByText(/how many weeks and days each week/i)).toBeTruthy());
    const create = screen.getByRole('button', { name: /create plan/i }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    // Restoring the number restores the live preview.
    fireEvent.change(screen.getByLabelText(/weeks/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/days each week/i), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByText(/16 readings/)).toBeTruthy());
  });

  it('clearing Days each week never renders "Infinity" in topic mode', async () => {
    // A PICKED topic, or this test cannot fail: with no pick the preview is null and
    // nothing renders either way. The fetch stub serves one real-shaped match.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('topics')) {
        return { ok: true, status: 200, json: async () => ({ matches: [
          { workSlug: 'torreys-topical-textbook', workTitle: 'The New Topical Text Book', sectionId: 1, heading: 'TRUST', entryCount: 111 },
        ] }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ plans: [] }) } as unknown as Response;
    }));
    await openBuilder();
    fireEvent.click(screen.getByRole('tab', { name: /a topic/i }));
    fireEvent.change(screen.getByLabelText(/search topics/i), { target: { value: 'trust' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.click(await screen.findByRole('button', { name: /TRUST/ }));
    // The pace line proves the picked-topic preview is live before the field clears.
    await waitFor(() => expect(screen.getByText(/passages a day|passage a day/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/days each week/i), { target: { value: '' } });
    // The guard sits above the per-mode branches, so topic mode gets the same quiet
    // refusal instead of `entryCount / 0` = "about Infinity passages a day".
    await waitFor(() => expect(screen.getByText(/how many weeks and days each week/i)).toBeTruthy());
    expect(screen.queryByText(/Infinity/)).toBeNull();
  });
});
