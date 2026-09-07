// @vitest-environment jsdom
//
// "WHEN SOMETHING IS RUNNING IT'S NOT DISCERNIBLE THAT IT'S RUNNING" — owner, 2026-09-06.
//
// The only signals were a 12px pulsing ring on one step and a 12px "Thinking…" beside the Ask
// button. This pins the redesign's answer: from the first committed frame of a submission until the
// stream terminates, the turn carries an indeterminate progress bar (the house `.progress-travel`
// idiom — the one motion the PRD exempts from its fade-only budget), the composer's box carries the
// same bar along its top edge, and the primary button reads Stop. When the stream ends, all three
// go away and the button is Ask again.
//
// SEED: remove the `role="progressbar"` from TurnView, or the edge bar from the composer, or the
// Stop swap -> the matching leg goes RED.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

/** A stream that emits its lines and then STAYS OPEN — the shape of an answer still in flight. */
function openStream(lines: string[]) {
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n'));
    },
  });
}
/** A stream that emits its lines and closes. */
function closedStream(lines: string[]) {
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n'));
      c.close();
    },
  });
}

async function submit(q = 'What is grace?') {
  const box = await screen.findByPlaceholderText(/Ask a question/i);
  fireEvent.change(box, { target: { value: q } });
  fireEvent.submit(box.closest('form')!);
}

describe('the running state is unmistakable', () => {
  it('shows one progress bar on the turn, one on the composer edge, and a Stop button while in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(openStream([JSON.stringify({ stage: 'retrieving' })]), { status: 200 })));
    const { container } = render(<AskClient />);
    await submit();

    const bars = await screen.findAllByRole('progressbar', { name: 'Answering' });
    expect(bars, 'exactly one announced progress bar per in-flight turn').toHaveLength(1);
    // The composer edge bar is aria-hidden (the turn's bar is the announced one), so it is
    // located structurally: a travelling fill inside the form.
    expect(container.querySelector('form .progress-travel'), 'the composer carries no working signal').not.toBeNull();
    expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Ask$/ }), 'Ask and Stop must not both be offered').toBeNull();
  });

  it('takes all three away when the stream terminates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(closedStream([
      JSON.stringify({ stage: 'retrieved', sources: [], traditions: 1 }),
      JSON.stringify({ stage: 'done', result: { kind: 'empty', reason: 'FIXTURE DONE' } }),
    ]), { status: 200 })));
    const { container } = render(<AskClient />);
    await submit();

    await screen.findByText(/FIXTURE DONE/);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ask$/ })).toBeTruthy());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.querySelector('form .progress-travel')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
  });
});
