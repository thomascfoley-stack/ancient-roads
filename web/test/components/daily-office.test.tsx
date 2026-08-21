// @vitest-environment jsdom
//
// THE DAILY OFFICE COMPOSES; IT NEVER AUTHORS. These cases drive the real
// TodayView with its three fetches stubbed and pin the composition rules:
// Daily Light renders for the LOCAL date+half, the due-plan card links to the
// plan's URL, and both EXTRAS degrade to absence — a missing file or a
// signed-out 401 must never cost the reader Spurgeon's page (the floor this
// surface has always had).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { TodayView } from '@/components/today-view';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A fixed LOCAL morning: Aug 21, 09:00. halfOf/mmddOf read the local clock.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 21, 9, 0, 0));
});

const SPURGEON = {
  '08-21': {
    am: {
      ref: 'Psalm 119:57',
      refDisplay: 'Psalm 119:57',
      verseText: 'Thou art my portion, O LORD.',
      body: 'Look at thy possessions, O believer.',
      attribution: 'C. H. Spurgeon, Morning and Evening',
    },
  },
};
const DAILY_LIGHT = {
  '08-21': {
    am: { title: 'August 21 — Morning', body: 'Thou art my portion, O LORD. All things are yours.', refs: 'Ps 119:57 1Co 3:21', attribution: 'Daily Light on the Daily Path' },
    pm: { title: 'August 21 — Evening', body: 'EVENING BODY — must not render in the morning.', refs: 'Pr 14:12', attribution: 'Daily Light on the Daily Path' },
  },
};
const PLANS = {
  plans: [{
    id: '11111111-2222-4333-8444-555555555555', title: 'The Gospels · 8 weeks',
    total_days: 40, read_days: 12,
    next_day_index: 13, next_day_date: '2026-08-21',
    next_verse_start: 41_011_001, next_verse_end: 41_012_999,
  }],
};

function stubFetch(overrides: Partial<Record<'me' | 'dl' | 'plans' | 'commentary', () => Promise<unknown> | unknown>> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as unknown as Response;
    const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;
    if (u.includes('morning-evening')) return overrides.me ? ok(await overrides.me()) : ok(SPURGEON);
    if (u.includes('daily-light')) return overrides.dl ? ok(await overrides.dl()) : ok(DAILY_LIGHT);
    if (u.includes('/api/plans')) return overrides.plans === null as unknown ? fail(401) : overrides.plans ? ok(await overrides.plans()) : ok(PLANS);
    if (u.includes('/api/commentary') || u.includes('commentary')) return ok({ entries: [] });
    return fail(404);
  }));
}

describe('the Daily Office on /home', () => {
  it('composes Daily Light (the local half), the due plan card, and Spurgeon', async () => {
    stubFetch();
    render(<TodayView />);
    // The office header is the hour; Spurgeon's ref heads his own section.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /morning/i })).toBeTruthy());
    expect(screen.getByText(/Daily Light · Morning/i)).toBeTruthy();
    expect(screen.getByText(/All things are yours/)).toBeTruthy();
    expect(screen.queryByText(/must not render in the morning/i)).toBeNull();
    // The plan card: due day, range label, and a LINK to the plan's URL.
    await waitFor(() => expect(screen.getByText(/Day 13 of 40/)).toBeTruthy());
    expect(screen.getByText(/Mark 11–12/)).toBeTruthy();
    const link = screen.getByRole('link', { name: /open the plan/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/plans/11111111-2222-4333-8444-555555555555');
    // Spurgeon's page is intact underneath.
    expect(screen.getByText('Thou art my portion, O LORD.')).toBeTruthy();
    expect(screen.getByText(/C\. H\. Spurgeon/)).toBeTruthy();
  });

  it('degrades to Spurgeon alone when the extras 401/404 — absence, never an error screen', async () => {
    stubFetch({
      dl: () => { throw new Error('missing'); },
      plans: null as unknown as () => unknown, // 401: signed out
    });
    render(<TodayView />);
    await waitFor(() => expect(screen.getByText('Thou art my portion, O LORD.')).toBeTruthy());
    expect(screen.queryByText(/Daily Light ·/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /open the plan/i })).toBeNull();
    expect(screen.queryByText(/could not be opened/i)).toBeNull();
  });

  it('a finished plan (no next day) renders no card rather than a broken one', async () => {
    stubFetch({
      plans: () => ({ plans: [{ ...PLANS.plans[0], next_day_index: null, next_day_date: null, next_verse_start: null, next_verse_end: null }] }),
    });
    render(<TodayView />);
    await waitFor(() => expect(screen.getByText('Thou art my portion, O LORD.')).toBeTruthy());
    expect(screen.queryByRole('link', { name: /open the plan/i })).toBeNull();
  });

  it('a plan that has not started yet is not "Your reading" — due means due', async () => {
    // Built today, starts next month: nothing is due, so the card must not
    // present it (the header comment's own claim, audited 2026-08-21).
    stubFetch({
      plans: () => ({ plans: [{ ...PLANS.plans[0], next_day_date: '2026-09-15' }] }),
    });
    render(<TodayView />);
    await waitFor(() => expect(screen.getByText('Thou art my portion, O LORD.')).toBeTruthy());
    expect(screen.queryByRole('link', { name: /open the plan/i })).toBeNull();
  });

  it('renders the citation list as a citation line, outside the scripture paragraph', async () => {
    stubFetch();
    render(<TodayView />);
    await waitFor(() => expect(screen.getByText(/All things are yours/)).toBeTruthy());
    const refs = screen.getByText('Ps 119:57 1Co 3:21');
    // The refs sit in their own element, not fused into the body's text node.
    expect(refs.textContent).not.toContain('All things are yours');
  });

  it('Spurgeon failing degrades to a quiet line — Daily Light and the plan card stand', async () => {
    stubFetch({ me: () => { throw new Error('down'); } });
    render(<TodayView />);
    await waitFor(() => expect(screen.getByText(/All things are yours/)).toBeTruthy());
    expect(screen.getByRole('link', { name: /open the plan/i })).toBeTruthy();
    expect(screen.getByText(/Spurgeon.s page could not be opened/i)).toBeTruthy();
    // The full-page error screen must NOT appear while the office stands.
    expect(screen.queryByText(/The Scriptures are still there to search/i)).toBeNull();
  });
});
