// @vitest-environment jsdom
//
// THE CARRIED QUERY (order 2026-08-20-historians-study-entrance): the study entrance on the
// Historians shelf navigates to /ask?mode=history&q=…, so HistoryAsk must RUN a query it is
// handed — otherwise the entrance lands the reader on an empty page holding the question they
// already asked. What is pinned:
//
//   * With initialQuery, exactly ONE search fires on mount, with that query — once, not per
//     render (React strict mode double-invokes effects; the guard is the subject here).
//   * Without initialQuery, mount fires NOTHING. The empty state stays an invitation, and a
//     reader landing on /ask?mode=history directly is not charged a search they did not ask for.

import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryAsk } from '@/components/history-ask';

/** No matches, no thread — the smallest payload the results renderer accepts. */
const EMPTY_PAYLOAD = {
  interpretation: { entities: [], period: null },
  closest: null,
  results: [],
  coverage: { works: 28, sections: 40463 },
  threadId: null,
};

const calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => EMPTY_PAYLOAD,
    } as unknown as Response);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HistoryAsk with a carried query', () => {
  it('runs it once on mount — even under StrictMode double-invoke', async () => {
    // The whole point of the value-keyed guard is that StrictMode's setup→cleanup→setup does NOT
    // fire two searches (two embeddings, two persisted threads). RTL's plain render never
    // double-invokes, so this test would pass against a guardless component; wrapping in StrictMode
    // is what makes the guard the actual subject (proven by the false-confidence pass: deleting the
    // guard goes red here, stays green without StrictMode).
    render(<StrictMode><HistoryAsk initialQuery="Herod" /></StrictMode>);

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // Settle a beat so a late duplicate would land before the count is asserted.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('/api/history/search');
    expect(calls[0]!.body).toEqual({ query: 'Herod' });

    // The results view rendered — the carried query behaves exactly like a typed one.
    await waitFor(() => expect(screen.getByText(/nothing in the 28 served history items/i)).toBeTruthy());
  });

  it('fires nothing when no query is carried', async () => {
    render(<HistoryAsk />);

    // The empty state is the proof the component settled without searching.
    expect(await screen.findByText(/points you into the sources/i)).toBeTruthy();
    expect(calls.length).toBe(0);
  });
});
