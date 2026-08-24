// @vitest-environment jsdom
//
// L2 STEP 2 — THE PLAN DAY TOGGLE IS OPTIMISTIC.
//
// MASTER.md C3: step 1 (the plan-write grants, migration 106) shipped 2026-08-07;
// step 2 — the optimistic mark-as-read toggle — was deferred. Before it, `toggle`
// in plans-client.tsx awaited the POST AND a full re-read of the plan before the
// tick moved, with busyDay holding the checkbox disabled the whole time: on a
// slow connection (this app's core context is phones on low signal, CLAUDE.md)
// the tap read as dead.
//
// The write sends an ABSOLUTE value (`completed: !d.completed_at`), never
// "flip", so a late response cannot set the row to something the reader is no
// longer looking at — which is what makes painting first safe. busyDay still
// locks the same day until the write resolves, so a rollback can never clobber
// a newer paint of that day.
//
// These cases drive the REAL PlansClient (the A7b lesson: a store-only test
// misses the dual-theme class of bug — the completed classes below assert the
// light AND dark variants move on the same optimistic paint).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';

// VerseRef consults input capability (`(hover: hover)`), which jsdom has no
// matchMedia for at all. The shared helpers/match-media stub only parses
// min/max-width clauses and would THROW on this query; hover is not this
// file's subject, so a fixed no-hover stub, the verse-ref-preview pattern.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID = '11111111-2222-4333-8444-555555555555';

// Day 1 unread, day 2 read; dates far ahead so the catch-up card stays out of
// the way. Romans ch. 1/2 verse ids (book 45).
const OPEN = {
  plan: { id: ID, title: 'Romans in a month' },
  days: [
    { day_index: 1, day_date: '2099-01-01', verse_start: 45001001, verse_end: 45001016, completed_at: null },
    { day_index: 2, day_date: '2099-01-02', verse_start: 45002001, verse_end: 45002016, completed_at: '2099-01-02T00:00:00.000Z' },
  ],
  readings: [],
};

type FetchImpl = (url: string, init?: { method?: string; body?: string }) => Promise<unknown>;

function stubPlansFetch(onPost: FetchImpl) {
  const posts: { body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (init?.method === 'POST' && u === `/api/plans/${ID}`) {
      posts.push({ body: init.body });
      return onPost(url, init);
    }
    if (u === '/api/plans') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ plans: [{ id: ID, title: OPEN.plan.title, total_days: 2, read_days: 1 }] }) });
    }
    if (u === `/api/plans/${ID}`) {
      // The re-read deliberately returns the plan UNCHANGED: if the component
      // still needed the server round-trip to move the tick, these tests could
      // never go green — the paint has to be local.
      return Promise.resolve({ ok: true, status: 200, json: async () => OPEN });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }));
  return posts;
}

const OK = { ok: true, status: 200, json: async () => ({ ok: true }) };

describe('L2 step 2 — the day toggle is optimistic', () => {
  it('paints the flip BEFORE the server answers, in both themes', async () => {
    // SEED: drop the optimistic `onDayPainted` call in `toggle` and the tick
    // only moves after POST + re-read — this waitFor times out -> RED.
    let answerPost!: (res: unknown) => void;
    stubPlansFetch(() => new Promise((resolve) => { answerPost = resolve; }));
    render(<PlansClient initialPlanId={ID} />);
    const toggle = await screen.findByRole('button', { name: 'Mark day 1 read' });

    fireEvent.click(toggle);

    // The POST is still hanging. The paint is already there.
    const painted = await screen.findByRole('button', { name: 'Mark day 1 unread' });
    expect(painted.className).toContain('bg-accent-700'); // light theme completed
    expect(painted.className).toContain('dark:bg-accent-500'); // dark theme completed

    answerPost(OK);
    await waitFor(() => expect(screen.queryByText(/could not be saved/i)).toBeNull());
    // The paint survives the successful save (no revert, no error).
    expect(screen.getByRole('button', { name: 'Mark day 1 unread' })).toBeTruthy();
  });

  it('sends the ABSOLUTE new state, not "flip"', async () => {
    const posts = stubPlansFetch(() => Promise.resolve(OK));
    render(<PlansClient initialPlanId={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark day 1 read' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(JSON.parse(posts[0]!.body!)).toEqual({ kind: 'day', dayIndex: 1, completed: true });
  });

  it('a refused save rolls the paint back and says so', async () => {
    // SEED: drop the rollback in the `!res.ok` branch and the tick stays
    // painted over a write the server refused -> RED on the second waitFor.
    stubPlansFetch(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }));
    render(<PlansClient initialPlanId={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark day 1 read' }));

    // Painted first...
    await screen.findByRole('button', { name: 'Mark day 1 unread' });
    // ...then reverted when the save was refused, with the standard error.
    await screen.findByRole('button', { name: 'Mark day 1 read' });
    expect(screen.getByText('That change could not be saved. Please try again.')).toBeTruthy();
  });

  it('a dropped connection rolls the paint back and says so', async () => {
    // SEED: drop the rollback in the `catch` branch -> RED as above.
    stubPlansFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<PlansClient initialPlanId={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark day 1 read' }));

    await screen.findByRole('button', { name: 'Mark day 1 unread' });
    await screen.findByRole('button', { name: 'Mark day 1 read' });
    expect(screen.getByText('That change could not be saved. Please try again.')).toBeTruthy();
  });
});
