// @vitest-environment jsdom
//
// A010 — RETRYING A FAILED ASK REPLACES IT; IT DOES NOT STACK A SECOND COPY.
//
// `ask()` always minted a fresh turn id and appended, so "Ask again" on a failed turn left the
// failure on screen and put an identical question under it. Two sessions filed it. Retry three
// times on a persistent failure — the signed-out 401, say — and the page is four copies of the
// same question and four identical error banners.
//
// REPLACEMENT IS SCOPED TO THE ERROR PATH, and that distinction is the whole design. A completed
// answer also offers "Ask again" (as a fallback, `Answer`'s own control), and there replacing
// would DESTROY a good answer the reader already has. So the id is threaded only when the turn
// being retried is in the error state; a retry from a finished answer still appends, as it should.
// Test 2 pins that, and without it "always replace" passes test 1 forever while quietly eating
// answers.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('A010 — a failed ask is replaced on retry, not duplicated', () => {
  it('retrying a 401 leaves ONE question and ONE error, not two', async () => {
    // SEED: drop the replaceId argument -> RED. Each retry appends another copy.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    render(<AskClient />);
    await submit('What is grace?');

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /ask again/i }));

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(
      screen.getAllByText(/What is grace\?/).length,
      'the retry stacked a second copy of the question',
    ).toBe(1);
  });

  it('a retry from a COMPLETED answer still appends — it must not eat the answer', async () => {
    // Without this leg, "always replace" is green above and destroys finished work here.
    //
    // A `fallback` result, not `empty`: only the fallback branch renders a retry control on a
    // COMPLETED turn (ask-client.tsx:880, tone="fallback"). A first draft used `empty`, which
    // renders no retry at all, so the test failed for a reason unrelated to what it checks.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      streamOf([JSON.stringify({
        stage: 'done',
        result: { kind: 'fallback', retrieval: [], violations: [{ check: 'quote', message: 'not verbatim' }] },
      })]),
      { status: 200 },
    )));
    render(<AskClient />);
    await submit('Why does Job suffer?');

    await waitFor(() => expect(screen.getByText(/A grounded answer couldn/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /ask again/i }));

    await waitFor(() => expect(screen.getAllByText(/Why does Job suffer\?/).length).toBe(2));
  });
});
