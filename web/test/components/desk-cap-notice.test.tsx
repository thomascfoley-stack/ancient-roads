// @vitest-environment jsdom
//
// A078 — THE DESK MUST SAY WHAT THE CAP DID.
//
// THE DEFECT, in two silences the reader meets at the same moment:
//
//   1. `/desk?p=a&p=b&p=c&p=d` renders three panes. The fourth is refused by the parser and
//      nothing on the page mentions it. Desk state lives in the URL precisely so a desk can be
//      SENT to someone — and the recipient of a four-pane link has no way to know a pane is
//      missing, because they never saw it there.
//   2. At three panes both add controls (`+` for a work, the book button for Scripture) simply
//      disappear, on `panes.length < MAX_PANES`. A control that vanishes states a rule in
//      invisible ink: the reader looks for the button they used a minute ago and finds nothing
//      where it was, with no text anywhere saying the desk is full or what to do about it.
//
// WHY THIS RENDERS THE PAGE. The parser's half is unit-tested in test/desk-cap-overflow.test.ts,
// and on its own it proves only that a number was computed — which is exactly the shape this repo
// has been bitten by before (a value derived correctly and then dropped on the floor by the only
// surface that could have shown it; see catalog-url-facets.test.tsx for the same lesson). The
// subject here is therefore the rendered page: what a reader can actually read.
//
// The control legs matter as much as the positive ones. A notice that is always on screen would
// pass every "says something" assertion while being wallpaper, so a two-pane desk is asserted to
// carry NO notice, and a URL whose extra entries were malformed or duplicated is asserted not to
// claim a loss that never happened.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The desk reads `?p=` through useSearchParams and rewrites it through router.replace. Both are
// stubbed: nothing here navigates, the params are the test's input, and `replace` is recorded so
// the remedy the notice recommends can be checked.
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: () => {} }),
  useSearchParams: () => params.current,
}));

import DeskPage from '@/app/desk/page';

/** Render the desk at a given `?p=` query. */
function renderDesk(query: string) {
  params.current = new URLSearchParams(query);
  return render(<DeskPage />);
}

beforeEach(() => {
  // Every work pane fetches its metadata on mount. A promise that never settles holds them in
  // their loading state for the whole test: this file is about the page's cap notice, and a pane
  // that resolved would only add noise (and its own render churn) to these assertions.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('a desk under the cap says nothing about it', () => {
  it('two panes: no status line at all', () => {
    renderDesk('p=work:a&p=work:b');
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('two panes: the add controls are present, so there is nothing to explain', () => {
    renderDesk('p=work:a&p=work:b');
    expect(screen.getByLabelText('Add a work from the library')).toBeTruthy();
    expect(screen.getByLabelText('Add a Bible chapter')).toBeTruthy();
  });
});

describe('a full desk states the cap instead of just hiding the buttons', () => {
  it('three panes: the add controls are gone AND a status line says why', () => {
    renderDesk('p=work:a&p=work:b&p=work:c');
    // The vanishing half — unchanged behaviour, asserted so the notice below is anchored to the
    // moment it is needed rather than tested in isolation from it.
    expect(screen.queryByLabelText('Add a work from the library')).toBeNull();
    expect(screen.queryByLabelText('Add a Bible chapter')).toBeNull();

    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/full/i);
    expect(status.textContent).toContain('3');
    // The remedy, not just the state: a rule with no way out reads as a bug.
    expect(status.textContent).toMatch(/close one/i);
  });
});

describe('a URL that asked for more panes than the desk holds says so', () => {
  it('four panes requested: three open and the notice names the one that did not', () => {
    renderDesk('p=work:a&p=work:b&p=work:c&p=work:d');
    expect(screen.getAllByRole('region')).toHaveLength(3);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('1 pane');
    expect(status.textContent).toMatch(/did not open/i);
  });

  it('six panes requested: the count is the real one, and it is plural', () => {
    renderDesk('p=work:a&p=work:b&p=work:c&p=work:d&p=work:e&p=scripture:psa/23');
    expect(screen.getAllByRole('region')).toHaveLength(3);
    expect(screen.getByRole('status').textContent).toContain('3 panes');
  });

  it('a comma-joined URL reports the same as repeated params', () => {
    renderDesk('p=work:a,work:b,work:c,work:d');
    expect(screen.getByRole('status').textContent).toContain('1 pane');
  });
});

describe('the remedy the notice names actually works', () => {
  // "Close one to make room" is advice, and advice that does not work is worse than no notice at
  // all. The desk rewrites `?p=` from the panes it decoded, so closing one both frees a slot and —
  // because the notice is derived from that URL and not held in state — takes the overflow entries
  // with it. That is the claim; this is the check.
  it('closing a pane rewrites the URL to a desk one pane shorter, dropping the overflow entries', () => {
    renderDesk('p=work:a&p=work:b&p=work:c&p=work:d');
    expect(screen.getByRole('status').textContent).toMatch(/did not open/i);

    // All three work panes are still loading, so all three close buttons carry the same
    // loading-state label (B011). The first one is the pane being closed.
    fireEvent.click(screen.getAllByLabelText('Close this pane')[0]!);

    // Two panes, and `work:d` is NOT resurrected — the desk it navigates to is built from the
    // three panes that opened, so the next render is under the cap and silent.
    expect(replace).toHaveBeenCalledTimes(1);
    const href = String(replace.mock.calls[0]?.[0]);
    expect(href).toBe('/desk?p=work%3Ab&p=work%3Ac');
  });
});

describe('the notice never claims a loss that did not happen', () => {
  it('malformed extras are not reported as panes that did not open', () => {
    // `garbage` and `scripture:john/0` were never panes — they are refused by decodePane on its
    // own long-standing terms. Two panes open, the desk is not full, so there is nothing to say.
    renderDesk('p=work:a&p=garbage&p=scripture:john/0&p=work:b');
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a duplicate beyond the cap is a full desk, NOT a lost pane', () => {
    renderDesk('p=work:a&p=work:b&p=work:c&p=work:a');
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/full/i);
    expect(status.textContent).not.toMatch(/did not open/i);
  });
});
