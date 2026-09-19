// @vitest-environment jsdom
//
// The client half of the limiter 'unavailable' fix on POST /api/history/search. The route now
// answers via apiError(), so a genuine quota hit's retryAfterSec lives under `error.retryAfterSec`
// (api-error.ts:55) and a limiter-DB outage is 503 UPSTREAM_UNAVAILABLE. Pins three end-to-end
// facts the route-level test (history-search-rate-unavailable.test.ts) cannot, because they cross
// the fetch boundary:
//   * A 429 RATE_LIMIT_DAY body (nested retryAfterSec: 3600) renders the 3600s window — NOT the
//     client's 60s fallback. This is the regression a route-only apiError change would have
//     introduced (top-level retryAfterSec goes undefined → 60), so it is pinned here.
//   * A 429 RATE_LIMIT_MINUTE body (nested retryAfterSec: 60) renders the 60s window.
//   * A 503 UPSTREAM_UNAVAILABLE outage FALLS THROUGH the 429 branch and renders the unavailable
//     message — the core of the bug, which used to surface as a misclassified 429 "Too many
//     searches … about 30 seconds."
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryAsk } from '@/components/history-ask';

const calls: { url: string; body: unknown }[] = [];
let respond: () => Response = () => new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return Promise.resolve(respond());
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Build a JSON response the way apiError() does: `{ error: { code, message, retryAfterSec } }`
 *  plus a Retry-After header. */
function envelope(status: number, code: string, message: string, retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message, retryAfterSec } }),
    { status, headers: { 'content-type': 'application/json', 'Retry-After': String(retryAfterSec) } },
  );
}

describe('HistoryAsk — limiter outcome rendering', () => {
  it('renders the 3600s day-cap window read from `error.retryAfterSec`, not the 60s fallback', async () => {
    respond = () => envelope(429, 'RATE_LIMIT_DAY', 'You’ve reached today’s question limit. It resets at midnight UTC.', 3600);
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/Too many searches\. Try again in about 3600 seconds/i)).toBeTruthy();
    // The 60s fallback would have rendered "about 60 seconds" — its absence is the regression guard.
    expect(screen.queryByText(/about 60 seconds/i)).toBeNull();
  });

  it('renders the 60s minute-cap window', async () => {
    respond = () => envelope(429, 'RATE_LIMIT_MINUTE', 'You’ve reached the per-minute question limit.', 60);
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/Too many searches\. Try again in about 60 seconds/i)).toBeTruthy();
  });

  it('falls back to the top-level retryAfterSec for a legacy bare-string 429 body', async () => {
    // The client keeps the top-level read for tolerance of the old { error: 'rate_limited',
    // retryAfterSec } shape; pin it so the fallback chain the change added is not dead code.
    respond = () => new Response(
      JSON.stringify({ error: 'rate_limited', retryAfterSec: 120 }),
      { status: 429, headers: { 'content-type': 'application/json', 'Retry-After': '120' } },
    );
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/Too many searches\. Try again in about 120 seconds/i)).toBeTruthy();
  });

  it('an absent Retry-After header and empty body falls back to 60s, NOT 0 seconds (Number(null)===0 guard)', async () => {
    // A prior version used `?? Number(res.headers.get('Retry-After')) ?? 60`, which yields 0 here:
    // `Number(null) === 0`, and `0 ?? 60 === 0`, so the message would read "about 0 seconds".
    // The committed `Number.isFinite(headerSec) && headerSec > 0` guard prevents that.
    respond = () => new Response(JSON.stringify({}), { status: 429, headers: { 'content-type': 'application/json' } });
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/Too many searches\. Try again in about 60 seconds/i)).toBeTruthy();
    expect(screen.queryByText(/about 0 seconds/i)).toBeNull();
  });

  it('renders "History search is unavailable right now." on a 503 limiter outage, not a quota hit', async () => {
    // An outage is 503 UPSTREAM_UNAVAILABLE. Before the reclassification it surfaced as a
    // misclassified 429 "Too many searches … 30 seconds"; now the outage wording is what the reader
    // sees. (The 503 branch now also reads/paces retryAfterSec — pinned by the tests below this.)
    respond = () => envelope(503, 'UPSTREAM_UNAVAILABLE', 'We couldn’t reach the study service just now. Please try again in a moment.', 30);
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/History search is unavailable right now/i)).toBeTruthy();
    // No quota message escapes the outage path — the misclassified 429 wording must not appear.
    expect(screen.queryByText(/Too many searches/i)).toBeNull();
  });

  it('reads retryAfterSec on a 503 (does not drop it) and renders the wait in the alert', async () => {
    // Defect A: the 429 branch parses retryAfterSec; the 503 branch used to discard it by landing in
    // the generic !res.ok handler. The signal must reach the DOM — not just the wording swap above.
    // This is the assertion the wording-scoped test above left open.
    respond = () => envelope(503, 'UPSTREAM_UNAVAILABLE', 'We couldn’t reach the study service just now. Please try again in a moment.', 30);
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/History search is unavailable right now/i)).toBeTruthy();
    expect(screen.getByText(/Please try again in about 30 seconds/i)).toBeTruthy();
    // The misclassified quota wording still must not escape the outage path.
    expect(screen.queryByText(/Too many searches/i)).toBeNull();
  });

  it('disables the Retry button on a 503 — paced, not ungated (Defect B)', async () => {
    // Each Retry click during a sustained outage re-fetches against an unhealthy upstream; the
    // limiter minute cap can't bound it (bump() throws before it can increment). The 429 path
    // paces via the limited state; the 503 path must pace the same, not render an instant retry.
    respond = () => envelope(503, 'UPSTREAM_UNAVAILABLE', 'We couldn’t reach the study service just now. Please try again in a moment.', 30);
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/History search is unavailable right now/i)).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement;
    expect(retry.disabled, 'an instant retry against a sustained outage is the defect').toBe(true);
  });

  it('re-enables the Retry button once retryAfterSec elapses', async () => {
    // The pacing is a wait, not a wall: once the signal's window closes the reader can retry. Real
    // timers + a 1s window mirrors ask-rate-limited.test.tsx's re-enable assertion verbatim.
    respond = () => envelope(503, 'UPSTREAM_UNAVAILABLE', 'We couldn’t reach the study service just now. Please try again in a moment.', 1);
    render(<HistoryAsk initialQuery="Herod" />);

    const retry = await screen.findByRole('button', { name: 'Retry' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(screen.getByText(/Please try again in about 1 second/i)).toBeTruthy();
    await waitFor(() => expect(retry.disabled).toBe(false), { timeout: 3000 });
  });

  it('reads retryAfterSec from the Retry-After header when the 503 body carries none', async () => {
    // The 429 branch falls back to the header; the 503 branch must too, not just the body. A
    // proxy/WAF 503 may carry the Retry-After header without the apiError envelope.
    respond = () => new Response(
      JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'We couldn’t reach the study service just now.' } }),
      { status: 503, headers: { 'content-type': 'application/json', 'Retry-After': '45' } },
    );
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/Please try again in about 45 seconds/i)).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
  });

  it('keeps the Retry ungated when a 503 carries no retryAfterSec (no made-up wait)', async () => {
    // Pacing on a value that wasn't sent would be a fabricated wait. An intermediary 503 with no
    // envelope and no Retry-After header stays ungated — the reader chooses when to try again.
    respond = () => new Response(JSON.stringify({}), { status: 503, headers: { 'content-type': 'application/json' } });
    render(<HistoryAsk initialQuery="Herod" />);

    expect(await screen.findByText(/History search is unavailable right now/i)).toBeTruthy();
    expect(screen.queryByText(/Please try again/i)).toBeNull();
    const retry = screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });
});
