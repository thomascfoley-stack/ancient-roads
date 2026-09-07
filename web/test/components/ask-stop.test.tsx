// @vitest-environment jsdom
//
// A RUNNING ASK HAS A WAY OUT. Filed as UX_POLISH_AUDIT P2 ("no way out past 10s") and
// DESIGN_FEEL_TEST's Escape row: any operation over ~10s needs a visible exit, and a live ask is
// 20–40s. Stop aborts the fetch, the turn resolves to an EXPLICIT failure with the retry control
// (L1's invariant — every submission reaches one of two terminal states), and the composer returns
// to idle. No second POST is made by stopping.
//
// The honest limit, stated here as in the code: the route does not read the request signal, so Stop
// stops WAITING — the server finishes on its own and the thread row already exists.
//
// SEED for leg 1: remove the post-loop `aborted` check -> the L1 guard writes "stopped partway" and
// the alert no longer says "Stopped before". SEED for leg 2: make the abort patch unconditional ->
// a Stop after `done` clobbers the answer.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

function openStream(lines: string[]) {
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n'));
    },
  });
}

async function submit(q = 'What is grace?') {
  const box = await screen.findByPlaceholderText(/Ask a question/i);
  fireEvent.change(box, { target: { value: q } });
  fireEvent.submit(box.closest('form')!);
}

describe('Stop', () => {
  it('resolves the turn to an explicit failure with a retry, idles the composer, and posts nothing more', async () => {
    // Only the ask POST is counted: other components make body-less GETs on mount.
    let posts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!String(url).includes('/api/ask/stream')) return new Response('{}', { status: 200 });
      posts += 1;
      return new Response(openStream([JSON.stringify({ stage: 'retrieving' })]), { status: 200 });
    }));
    render(<AskClient />);
    await submit();

    // Ask and Stop share one button slot, so a Stop inside the first 300ms after submit is
    // ignored — that is the second click of a double-click, not a decision. A real Stop is later.
    const stopButton = await screen.findByRole('button', { name: /^Stop$/ });
    await new Promise((r) => setTimeout(r, 350));
    fireEvent.click(stopButton);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Stopped before/);
    expect(screen.getByRole('button', { name: /ask again/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ask$/ })).toBeTruthy());
    expect(screen.queryByRole('progressbar')).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(posts).toBe(1);
  });

  it('never clobbers an answer that has already arrived', async () => {
    // The real route writes `outcome`/`saved` AFTER `done`, so the stream is still open — and the
    // Stop button still on screen — for a moment after the answer is complete.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(openStream([
      JSON.stringify({ stage: 'done', result: { kind: 'empty', reason: 'FIXTURE DONE' } }),
    ]), { status: 200 })));
    render(<AskClient />);
    await submit();

    await screen.findByText(/FIXTURE DONE/);
    await new Promise((r) => setTimeout(r, 350)); // past the double-click guard (see above)
    fireEvent.click(screen.getByRole('button', { name: /^Stop$/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^Ask$/ })).toBeTruthy());
    expect(screen.queryByRole('alert'), 'a Stop after done turned a good answer into a failure').toBeNull();
    expect(screen.getByText(/FIXTURE DONE/)).toBeTruthy();
  });
});
