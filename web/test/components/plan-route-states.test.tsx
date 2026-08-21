// @vitest-environment jsdom
//
// /plans/[id] renders honest states for the reader who arrives by URL — the
// whole point of giving plans URLs. Signed out must say SIGN IN (not "could not
// be loaded"): two mount effects race on this route, and before the 2026-08-21
// audit fix, openPlan's 401 -> error overwrote refresh()'s signed-out state
// nondeterministically. A missing plan gets one plan-scoped message with a way
// back — and deliberately the SAME message for 404/400/500 (no oracle
// separating "not yours" from "does not exist").

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID = '11111111-2222-4333-8444-555555555555';

describe('/plans/[id] arrival states', () => {
  it('signed out: the sign-in state wins the race, however the effects land', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response));
    render(<PlansClient initialPlanId={ID} />);
    await waitFor(() => expect(screen.getByText(/to build a reading plan/i)).toBeTruthy());
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy();
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
  });

  it('a missing plan: one plan-scoped message and a way back, list not clobbered', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url) === '/api/plans') {
        return { ok: true, status: 200, json: async () => ({ plans: [] }) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) } as unknown as Response;
    }));
    render(<PlansClient initialPlanId={ID} />);
    await waitFor(() => expect(screen.getByText(/this plan could not be opened/i)).toBeTruthy());
    expect(screen.getByRole('link', { name: /all plans/i })).toBeTruthy();
    // The route-level failure never claims the LIST failed.
    expect(screen.queryByText(/plans could not be loaded/i)).toBeNull();
  });
});
