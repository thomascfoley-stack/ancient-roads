// @vitest-environment jsdom
//
// "IT SEEMS LIKE IT'S PAUSED" — owner report, 2026-08-22, against the live surface.
//
// One history search is five DB round trips plus an embedding call, and the first of a session
// also pays a cold function and two empty caches (vocab + coverage, 60s TTL each). While it ran,
// the whole signal was one grey sentence on an emptied screen — the examples hide while busy, so
// the page went blanker the moment the reader asked for something. A still page during a
// multi-second wait is indistinguishable from a broken one.
//
// What is pinned here is the affordance, not the wording: an INDETERMINATE progress bar present
// for exactly the window the request is in flight, and gone when it lands. Indeterminate because
// there is nothing to report — one round trip of unknown length — so `role="progressbar"` with no
// `aria-valuenow` is the correct ARIA, not a guessed percentage.
//
// SEED to prove red: delete the role="progressbar" block from history-ask.tsx. Every other
// history test stays green, which is the point — nothing else asserted it.
//
// The CSS half is here on purpose. This repo has already shipped a class that styled NOTHING
// (`text-accent-700`, the @tailwindcss/forms idiom, with the plugin not installed — UX-5), and a
// travelling bar whose keyframes were never defined is a static line: the exact defect being
// fixed, wearing the fix's own markup. So the test asserts the element carries the class AND that
// globals.css defines it, including its reduced-motion fallback.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryAsk } from '@/components/history-ask';

const CSS = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/app/globals.css'),
  'utf8',
);

const EMPTY_PAYLOAD = {
  interpretation: { entities: [], period: null },
  closest: null,
  results: [],
  coverage: { works: 28, sections: 40463 },
  threadId: null,
};

/** The search is held open on purpose: the busy window is the subject, and a fetch that resolves
 *  in the same tick has no busy window to observe. */
let land: () => void;
beforeEach(() => {
  vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => {
    land = () => resolve({ ok: true, status: 200, json: async () => EMPTY_PAYLOAD } as unknown as Response);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ask = (q: string): void => {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: q } });
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
};

describe('history search — the in-flight signal', () => {
  it('shows an indeterminate progress bar while the search is in flight', async () => {
    render(<HistoryAsk />);
    expect(screen.queryByRole('progressbar')).toBeNull();

    ask('the church at Ephesus');

    const bar = await waitFor(() => screen.getByRole('progressbar'));
    // Indeterminate: a percentage here would be invented. ARIA says omit aria-valuenow.
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.querySelector('.progress-travel')).not.toBeNull();
  });

  it('takes the bar away when the results land', async () => {
    render(<HistoryAsk />);
    ask('the church at Ephesus');
    await waitFor(() => screen.getByRole('progressbar'));

    land();

    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  });

  it('keeps announcing to a screen reader, not only to the eye', async () => {
    render(<HistoryAsk />);
    ask('the church at Ephesus');
    const status = await waitFor(() => screen.getByRole('status'));
    expect(status.textContent).toMatch(/searching/i);
  });

  it('defines the travelling animation in globals.css', () => {
    expect(CSS, 'the bar carries .progress-travel; without keyframes it is a static line')
      .toMatch(/@keyframes\s+progress-travel/);
    expect(/\.progress-travel\s*\{([\s\S]*?)\}/.exec(CSS)?.[1] ?? '').toMatch(/animation:/);
  });

  it('pins the fill in place under prefers-reduced-motion instead of parking it off-screen', () => {
    // globals.css's blanket reduced-motion rule forces animation-iteration-count:1 and a 0.01ms
    // duration, so a travelling bar would jump to its LAST frame and stay there — which is
    // translated fully past the right edge, i.e. an invisible progress bar for exactly the
    // readers who cannot be shown motion. The class needs its own opt-out.
    const rule = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.progress-travel\s*\{([\s\S]*?)\}/.exec(CSS);
    expect(rule?.[1], 'no reduced-motion rule for .progress-travel').toBeTruthy();
    expect(rule![1]!).toMatch(/animation:\s*none/);
  });
});
