// @vitest-environment jsdom
//
// "Opening today’s page…" MUST END.
//
// The Daily Office's devotional load had no bound of any kind. A fetch that never settles — a
// hung CDN edge, a captive-portal wifi that accepts the connection and answers nothing, a
// half-open socket — left `state` at `'loading'` forever, so the reader's home screen sat on
// "Opening today's page…" with no error, no retry, and no way to tell a slow morning from a
// broken one. The other two loads already degrade to absence on failure; this one could not
// fail at all, which is worse than failing.
//
// The bound covers the WHOLE load, not just the fetch: `resolveToday` goes on to pull commentary
// through fetchCommentary, so a timeout on the JSON alone would leave the same hang one call
// later. The honest failure state already existed and is reused — it names what happened and
// offers the Word.
//
// SEED: remove the Promise.race deadline from today-view.tsx and the first case hangs at
// "Opening today's page…" through every advanceTimersByTime, then fails on the error assertion.

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/bible', () => ({ fetchCommentary: vi.fn(async () => null) }));
vi.mock('@/components/commentary-panel', () => ({ EntryCard: () => null }));

import { TodayView } from '../../src/components/today-view';

/** Everything except the devotional degrades to absence, so the office renders nothing extra and
 *  the loading/error line is what is on screen. */
function fetchWith(devotional: () => Promise<Response>) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('morning-evening')) return devotional();
    return new Response('no', { status: 404 });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe('the Daily Office fetch is bounded', () => {
  it('gives up on a hung request and says so, instead of loading forever', async () => {
    // A request that is accepted and never answered. This is the case with no timeout at all:
    // nothing rejects, nothing resolves, and the component has no other path out of 'loading'.
    vi.stubGlobal('fetch', fetchWith(() => new Promise<Response>(() => {})));

    render(<TodayView />);
    expect(screen.getByText(/opening today/i), 'it starts by saying it is working').toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.queryByText(/opening today/i), 'the wait ended').toBeNull();
    expect(screen.getByText(/could not be opened/i), 'and it said what happened').toBeTruthy();
    // The failure is not a dead end — the existing error state offers Scripture.
    expect(screen.getByRole('link', { name: /open the word/i })).toBeTruthy();
  });

  it('the bound is short enough to be a UI timeout, not a session timeout', async () => {
    vi.stubGlobal('fetch', fetchWith(() => new Promise<Response>(() => {})));
    render(<TodayView />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(
      screen.getByText(/could not be opened/i),
      'a reader staring at a blank morning does not wait a minute to be told',
    ).toBeTruthy();
  });

  it('a devotional that answers in time is unaffected by the bound', async () => {
    vi.stubGlobal(
      'fetch',
      fetchWith(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    render(<TodayView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // An empty devotional file resolves to no card, which is the SAME honest error state — the
    // point here is that it arrives from the data, not from the timer.
    expect(screen.queryByText(/opening today/i)).toBeNull();
  });
});
