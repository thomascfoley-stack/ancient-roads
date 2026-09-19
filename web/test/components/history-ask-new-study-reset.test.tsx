// @vitest-environment jsdom
//
// "NEW STUDY" RESETS THE STUDY SURFACE — the click, not the navigation.
//
// After a search lands, HistoryResults offers a "New study" <Link href="/ask?mode=history"> that
// promises one-click recovery to the empty invitation. App Router reconciles — does not remount —
// the /ask segment on a searchParam change, so navigating from /ask/<threadId>?mode=history (or
// /ask?mode=history&q=…) back to /ask?mode=history drops `q` to undefined and the SAME HistoryAsk
// instance keeps its results state: `query` is seeded once at mount, and the carried-query effect
// early-returns on `initialQuery == null`. The URL moved; the screen did not. The fix resets on
// the CLICK itself — HistoryResults takes an `onReset` callback the "New study" link invokes
// before navigating — so recovery does not depend on whether the router reconciles, remounts, or
// no-ops. What is pinned here:
//
//   * After a settled search, clicking "New study" clears the input and brings back the empty
//     invitation ("History points you into the sources" + the example chips) — the same screen a
//     fresh mount with no carried query produces. The old excerpt is gone.
//   * A later carried `?q=` — even the SAME value — runs again after the reset. The reset clears
//     the value-keyed carried-query guard; without that, the fix would INTRODUCE a regression:
//     re-carried "Herod" would early-return and drop the reader on an empty page holding the
//     question.
//   * A search in flight when the click lands does NOT write its results over the emptied state
//     when it later resolves. The reset bumps a generation token the in-flight run checks before
//     it writes — without that guard, a second search clicked-into-recovery would land its
//     results on the empty screen a beat later, with a blank input above them.
//
// SEED to prove red:
//   * Drop `onClick={() => onReset?.()}` from the "New study" Link (history-results.tsx), OR drop
//     `onReset={reset}` from the HistoryResults call (history-ask.tsx) → the first and third
//     tests go red: the click changes nothing, the empty invitation is not found and the old
//     excerpt is still on screen.
//   * Drop `ranInitialFor.current = null` from reset() → the second test goes red: re-carrying
//     the same "Herod" stays on the empty invitation instead of running the search again.
//   * Drop the in-flight guard (`if (token !== runToken.current) return;` and the matching
//     `token === runToken.current` checks in run()) → the third test goes red: the late-landing
//     search writes its excerpt back over the emptied state.
//
// `next/link` is mocked to a plain <a> that forwards onClick because jsdom has no App Router —
// the navigation the link promises is a browser-e2e concern (the production proof); the unit
// subject here is the reset the click triggers.

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, onClick, className, children }: {
    href: string;
    onClick?: () => void;
    className?: string;
    children?: ReactNode;
  }) => <a href={href} onClick={onClick} className={className}>{children}</a>,
}));

import { HistoryAsk } from '@/components/history-ask';

// A result section with a recognizable excerpt, plus a persisted threadId so the pushState
// sub-path is exercised (history-ask.tsx rewrites the URL to /ask/<threadId>?mode=history) — the
// production shape the e2e drove, not the fails-open threadId:null sub-path alone.
const ROW = {
  sectionId: 1, ordinal: 1, headingPath: ['Book XV', '§10'],
  period: [-20, -10] as [number, number], excerpt: 'rebuilt the temple in Jerusalem',
  matched: ['text'] as ('entity' | 'period' | 'text')[],
};
const WORK = { slug: 'josephus-aj', title: 'Antiquities', author: 'Josephus', edition: null };
const RESULTS_PAYLOAD = {
  interpretation: { entities: [], period: null },
  closest: { ...ROW, work: WORK },
  results: [{ work: WORK, periodSpan: [-20, 30] as [number, number], sections: [ROW] }],
  coverage: { works: 28, sections: 40463 },
  threadId: 'thr_abc123def456',
};

const EXCERPT = /rebuilt the temple in Jerusalem/i;

function respondWith(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('HistoryAsk "New study" reset', () => {
  it('clears the screen and the input on click — the empty invitation returns', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respondWith(RESULTS_PAYLOAD))));

    render(<HistoryAsk initialQuery="Herod" />);

    // The carried query ran and the results are on screen.
    await waitFor(() => expect(screen.queryAllByText(EXCERPT).length).toBeGreaterThan(0));
    expect(screen.queryByText(/points you into the sources/i)).toBeNull();
    // The link itself still targets /ask?mode=history — the destination is unchanged by the fix.
    expect(screen.getByRole('link', { name: /New study/i }).getAttribute('href')).toBe('/ask?mode=history');

    // Click "New study".
    fireEvent.click(screen.getByRole('link', { name: /New study/i }));

    // The empty invitation is back, the examples are back, the input is blank, the old excerpt is gone.
    expect(await screen.findByText(/points you into the sources/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /tell me about Herod/i })).toBeTruthy();
    expect((screen.getByLabelText('What do you want to study?') as HTMLInputElement).value).toBe('');
    expect(screen.queryAllByText(EXCERPT)).toHaveLength(0);
  });

  it('runs a later carried query again — even the SAME value — after the reset', async () => {
    // The reset clears the value-keyed carried-query guard; without that, a reader who clicks
    // "New study" and then returns via the entrance to the SAME ?q=Herod lands on the empty
    // invitation holding the question: the prop transitions undefined -> "Herod", but the guard
    // still remembers "Herod" from before the reset and the effect early-returns.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respondWith(RESULTS_PAYLOAD))));

    const view = render(<HistoryAsk initialQuery="Herod" />);
    await waitFor(() => expect(screen.queryAllByText(EXCERPT).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('link', { name: /New study/i }));
    await screen.findByText(/points you into the sources/i);

    // The navigation the click triggers: q drops to undefined (App Router reconciles, no remount).
    view.rerender(<HistoryAsk initialQuery={undefined} />);
    // ...then the Historians entrance re-carries the SAME query.
    view.rerender(<HistoryAsk initialQuery="Herod" />);

    // The search runs again — the excerpt returns.
    await waitFor(() => expect(screen.queryAllByText(EXCERPT).length).toBeGreaterThan(0));
  });

  it('keeps the empty state when a search in flight resolves after the click', async () => {
    // The click can land while a second search is still in flight (busy stays true across the old
    // results until the new one lands). The reset invalidates that run; without the guard the
    // late-landing results would write themselves over the empty invitation and leave a blank
    // input above results — the reset would look like it failed a beat later.
    let callNo = 0;
    let landInFlight: () => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => {
      callNo++;
      if (callNo === 1) return Promise.resolve(respondWith(RESULTS_PAYLOAD));
      return new Promise<Response>((resolve) => {
        landInFlight = () => resolve(respondWith(RESULTS_PAYLOAD));
      });
    }));

    // First (carried) search lands and shows results.
    render(<HistoryAsk initialQuery="Herod" />);
    await waitFor(() => expect(screen.queryAllByText(EXCERPT).length).toBeGreaterThan(0));

    // Start a second search from the results screen and let it go in flight.
    const input = screen.getByLabelText('What do you want to study?') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Jerusalem in the first century' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy());

    // Click "New study" while the second search is still in flight.
    fireEvent.click(screen.getByRole('link', { name: /New study/i }));
    await screen.findByText(/points you into the sources/i);

    // The in-flight search now resolves — it must NOT write results over the emptied state.
    landInFlight();
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryAllByText(EXCERPT)).toHaveLength(0);
    expect((screen.getByLabelText('What do you want to study?') as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/points you into the sources/i)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
