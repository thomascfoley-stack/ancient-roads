// @vitest-environment jsdom
//
// L1c — THE SLOW-ANSWER NOTICE NAMES THE STAGE THE UI IS ACTUALLY IN.
//
// `Progress` (ask-client.tsx) renders a staged progress indicator and, after
// SLOW_ANSWER_NOTICE_MS (90s), the line "This one is taking longer than usual — …".
// The 90s timer is scheduled once on mount with `useEffect(..., [])` deps, so it is
// stage-independent: it can trip during any long stage. Per-stage measurement
// (docs/evidence/ask-latency/) puts `verifying` at ≤1ms (0.0% of wall time): the
// server emits `verifying` only after `compose()` resolves and emits `done` ~1ms
// later, so `turn.stage` on the client is `verifying` for a window too short to
// reach a 90s threshold. When the 90s timer trips, the active stage is, in every
// real request, `composing` (compose is 50–74% of wall time).
//
// The original copy hard-coded "still verifying every quote" — naming a step that
// is never the ACTIVE one when the notice shows. Every `step(...)` renders its
// label unconditionally; only the indicator icon changes (done ✓ / active pulse /
// pending empty ring). So during composing the verify step LABEL is on screen — as a
// pending, non-pulsing row — while the pulsing (active) row is "Composing a grounded
// answer", and the notice above the contradiction claimed "still verifying every
// quote." (introduced dc5f9eb).
//
// WHAT THIS PINS. The notice's clause must track `turn.stage` so it can only ever
// name the step the UI shows as active:
//   * composing (and anything pre-verify) → "still working on it."
//   * verifying → "still verifying every quote." (the verbatim-check promise copy,
//     preserved for the one stage it is true of)
//
// The two-stream harness below simulates the real failure surface — a stream that
// goes silent mid-flight — by enqueuing the non-terminal events and never closing,
// so `turn.stage` stays put and no terminal-state guard fires.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient, SLOW_ANSWER_NOTICE_MS } from '../../src/components/ask-client';

// `useSignedIn` is not what's under test; mock it signed-in so the signed-out notice
// (and its sign-in link) stay out of the DOM and `role="status"` is unambiguous.
vi.mock('@/lib/auth/use-signed-in', () => ({ useSignedIn: () => true }));

/** Flush the submit→fetch→stream-read→patch microtask chain WITHOUT awaiting the
 *  perpetually-pending second `reader.read()` — that pending read IS the stall. */
async function flush(rounds = 12) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** One source so the `retrieved` line renders cleanly (avoids NaN traditions). */
const RETRIEVED = JSON.stringify({
  stage: 'retrieved',
  sources: [{ sourceId: 's1', author: 'A', sourceTitle: 'T', tradition: 'x', content: 'c', score: 1 }],
  traditions: 1,
});
const COMPOSING = JSON.stringify({ stage: 'composing', attempt: 0 });
const VERIFYING = JSON.stringify({ stage: 'verifying', attempt: 0 });

/** A stream that emits the given non-terminal events and then stays open forever,
 *  so the turn never advances past the last event and no terminal guard fires. */
function stallStream(...events: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(enc.encode(events.join('\n') + '\n')); /* never close */ },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

async function submit(q = 'What does John 3:16 mean?') {
  await act(async () => {
    const box = screen.getByPlaceholderText(/Ask a question/i);
    fireEvent.change(box, { target: { value: q } });
    fireEvent.submit(box.closest('form')!);
    await flush();
  });
}

/** The indicator icon for a progress step, keyed by the step's label text.
 *  Progress renders each step as a row whose first child is the indicator span;
 *  the indicator is a ✓ (done), a pulsing ring (active), or an empty ring (pending). */
function indicatorForStep(label: string): HTMLElement {
  const spans = Array.from(document.querySelectorAll('span'));
  const labelSpan = spans.find((s) => (s.textContent ?? '').trim() === label);
  if (!labelSpan) throw new Error(`no progress step labeled "${label}"`);
  const row = labelSpan.parentElement!;
  return row.firstElementChild as HTMLElement;
}

/** The active (pulsing) step is the one whose indicator carries `animate-pulse`. */
function isActive(label: string): boolean {
  return indicatorForStep(label).className.includes('animate-pulse');
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => stallStream(RETRIEVED, COMPOSING)));
});

describe('slow-notice — composing is the real slow case, so the notice must not name verifying', () => {
  it('at 90s the composing step is the one pulsing and the notice says "still working on it.", not "still verifying every quote"', async () => {
    render(<AskClient />);
    await submit();

    // Sanity: the stream reached `composing` and is stalled there. The composing step
    // is the ACTIVE (pulsing) one; the verify step label is on screen but is the
    // PENDING (empty-ring, non-pulsing) row — exactly the contradiction that made the
    // old notice wrong.
    expect(isActive('Composing a grounded answer'), 'composing is the active step').toBe(true);
    expect(isActive('Verifying every quote is word-for-word'), 'verify is NOT the active step at composing').toBe(false);

    // Before the threshold fires, there is no slow notice at all.
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_ANSWER_NOTICE_MS + 1); });

    // The notice appears; the headline is unchanged.
    const notice = screen.getByRole('status');
    expect(notice.textContent).toMatch(/This one is taking longer than usual/);
    // FIX: the clause names the ACTIVE step — composing ⇒ "still working on it." — and
    // never the verify copy while the verify step is merely pending.
    expect(notice.textContent).toContain('still working on it.');
    expect(notice.textContent).not.toContain('still verifying every quote');
  });

  it('the wrong-stage clause "still verifying every quote" never appears during a composing stall', async () => {
    // SEED: revert the notice to the unconditional clause -> RED. The composition below
    // is the canonical repro: a stream that reaches composing and goes silent at 90s.
    render(<AskClient />);
    await submit();
    await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_ANSWER_NOTICE_MS + 1); });
    expect(
      screen.queryByText(/still verifying every quote/),
      'the notice names a stage the UI is never in when it fires',
    ).toBeNull();
  });
});

describe('slow-notice — when turn.stage IS verifying, the verbatim-check copy is preserved', () => {
  it('a verifying stall keeps "still verifying every quote." (the defensive branch)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => stallStream(RETRIEVED, COMPOSING, VERIFYING)));
    render(<AskClient />);
    await submit();

    // Sanity: the stream reached `verifying` and is stalled there. Now the verify step
    // is the ACTIVE (pulsing) one.
    expect(isActive('Verifying every quote is word-for-word'), 'verify is the active step here').toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_ANSWER_NOTICE_MS + 1); });

    const notice = screen.getByRole('status');
    expect(notice.textContent).toMatch(/This one is taking longer than usual/);
    // The original, accurate copy survives for the one stage it is true of — so the
    // fix narrows the copy to the active stage rather than deleting it.
    expect(notice.textContent).toContain('still verifying every quote.');
    expect(notice.textContent).not.toContain('still working on it.');
  });
});

describe('slow-notice — the threshold mechanism itself is unchanged', () => {
  it('the notice does not appear before SLOW_ANSWER_NOTICE_MS', async () => {
    render(<AskClient />);
    await submit();
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_ANSWER_NOTICE_MS - 1); });
    // One ms short of the threshold: still no notice.
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
