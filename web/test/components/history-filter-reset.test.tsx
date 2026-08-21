// @vitest-environment jsdom
//
// FILTER STATE MUST NOT SURVIVE A NEW SEARCH (deep-audit client finding 2, HIGH; verifier F3 —
// the fix shipped without a red-proof). HistoryResults holds century/entity filter state; it is
// keyed `key={state.seq}` in history-ask.tsx so each search remounts it fresh. Without the key, a
// century filter set on search A applies to search B's results — and if B has nothing in that
// century, the page renders the honest-looking but FALSE "Nothing … matches this." over a corpus
// that did match. The entrance makes back-to-back searches the normal path, so this is live.
//
// SEED to prove red: delete `key={state.seq}` from history-ask.tsx and the second search shows the
// zero-state instead of its real results.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryAsk } from '@/components/history-ask';

// Two sections a century apart, so the bucket chips render (buckets.length > 1).
const row = (ordinal: number, year: number, excerpt: string) => ({
  sectionId: ordinal, ordinal, headingPath: ['Book', `§${ordinal}`],
  period: [year, year] as [number, number], excerpt, matched: ['text'] as ('entity' | 'period' | 'text')[],
});
const work = { slug: 'schaff-hcc1', title: 'History of the Christian Church', author: 'Philip Schaff' };

// Search A: first- and second-century sections → two century chips.
const PAYLOAD_A = {
  interpretation: { entities: [], period: null },
  closest: { ...row(1, 50, 'A first-century passage.'), work },
  results: [{ work, periodSpan: [50, 150] as [number, number], sections: [row(1, 50, 'A first-century passage.'), row(2, 150, 'A second-century passage.')] }],
  coverage: { works: 28, sections: 40463 },
  threadId: null,
};
// Search B: ONLY a fifth-century section. If A's century filter leaks, this is filtered to empty.
const PAYLOAD_B = {
  interpretation: { entities: [], period: null },
  closest: { ...row(9, 450, 'A distinct fifth-century passage.'), work },
  results: [{ work, periodSpan: [450, 450] as [number, number], sections: [row(9, 450, 'A distinct fifth-century passage.')] }],
  coverage: { works: 28, sections: 40463 },
  threadId: null,
};

let nextPayload: unknown = PAYLOAD_A;
beforeEach(() => {
  nextPayload = PAYLOAD_A;
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, status: 200, json: async () => nextPayload } as unknown as Response));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('history filters reset between searches', () => {
  it('a century filter from one search does not empty the next', async () => {
    render(<HistoryAsk />);
    const input = screen.getByLabelText('What do you want to study?');

    // Search A, then narrow to the first century.
    fireEvent.change(input, { target: { value: 'the early church' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText('A first-century passage.')).toBeTruthy());
    // A century chip reads like "1c · N"; click the one for the first century.
    fireEvent.click(screen.getByRole('button', { name: /^1c/ }));
    expect(screen.getByText('(within these results)')).toBeTruthy();
    // The second-century row is now filtered out — confirms the filter is really applied.
    expect(screen.queryByText('A second-century passage.')).toBeNull();

    // Search B (fifth century only). If the century-1 filter survived, this renders the false
    // zero-state; with the per-search key it renders B's real result.
    nextPayload = PAYLOAD_B;
    fireEvent.change(input, { target: { value: 'the medieval church' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(screen.getByText('A distinct fifth-century passage.')).toBeTruthy());
    expect(screen.queryByText(/Nothing in the .* served history items matches/)).toBeNull();
    expect(screen.queryByText('(within these results)')).toBeNull();
  });
});
