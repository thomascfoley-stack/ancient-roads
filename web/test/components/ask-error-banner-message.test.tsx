// @vitest-environment jsdom
//
// A017 — A FAILURE BANNER NEVER PAINTS AS AN EMPTY FRAME.
//
// Filed as "momentary empty error banner frame when retrying a failed Ask". THE RETRY MECHANISM
// NAMED THERE IS DISPROVEN, and deliberately has no test here. A retry replaces the failed turn in
// one batched update (`ask`: setTurns/setQuestion/setBusy all run before the first `await`), so no
// committed render sits between the old banner and the new progress view — a MutationObserver over
// a real retry records `alerts=1 "Please sign in…"` → `alerts=0` → `alerts=1 "Please sign in…"`,
// and nothing else. That probe was run and thrown away rather than committed: once the guard below
// exists, a wordless banner is impossible by construction, so "no wordless banner during a retry"
// is a test that cannot fail, and this repo audits for exactly that.
//
// What DOES render the reported artifact is the stream's own contract being trusted:
// `JSON.parse(line) as StreamEvent` is a CAST, so an `error` event with no `message` writes
// `undefined` into `turn.error`, and the banner paints a bordered red box whose entire text is the
// retry button. It is latent today — `api/ask/stream/route.ts:145`, the only writer, always sets a
// message — and guarded anyway: "a failure always says what failed" must not depend on a remote
// field being present.
//
// RED-PROOF (watched, not assumed): with the guard reverted to a bare `{turn.error}`, all three
// legs fail with `expected '' not to be ''`. Restored, all three pass.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient } from '../../src/components/ask-client';

vi.mock('../../src/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

function streamOf(lines: string[]) {
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n'));
      c.close();
    },
  });
}

async function submit(q: string) {
  const box = await screen.findByPlaceholderText(/Ask a question/i);
  fireEvent.change(box, { target: { value: q } });
  fireEvent.submit(box.closest('form')!);
}

/** The banner's own words: everything inside the alert that is not one of its controls. */
function messageOf(alert: HTMLElement): string {
  const clone = alert.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, a').forEach((el) => el.remove());
  return (clone.textContent ?? '').trim();
}

describe('A017 — the error banner always carries a message', () => {
  it.each([
    ['no message field', JSON.stringify({ stage: 'error' })],
    ['an empty message', JSON.stringify({ stage: 'error', message: '' })],
    ['a whitespace message', JSON.stringify({ stage: 'error', message: '   ' })],
  ])('an error event with %s still renders a message, not a bare frame', async (_label, line) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamOf([line]), { status: 200 })));
    render(<AskClient />);
    await submit('What is grace?');

    const alert = await screen.findByRole('alert');
    // The frame stays — it carries the retry control — but it must never be the ONLY thing in it.
    expect(screen.getByRole('button', { name: /ask again/i })).toBeTruthy();
    expect(
      messageOf(alert),
      'the banner painted as an empty bordered box: frame and retry button, no words',
    ).not.toBe('');
  });

  it('a real message is shown as sent — the fallback does not swallow it', async () => {
    // Without this leg, "always render the fallback" passes the three legs above forever while
    // throwing away every message the server actually took the trouble to send.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      streamOf([JSON.stringify({ stage: 'error', message: 'The teacher failed to answer. Please try again.' })]),
      { status: 200 },
    )));
    render(<AskClient />);
    await submit('What is grace?');

    const alert = await screen.findByRole('alert');
    expect(messageOf(alert)).toBe('The teacher failed to answer. Please try again.');
  });
});
