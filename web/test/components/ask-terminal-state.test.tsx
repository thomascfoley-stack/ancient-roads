// @vitest-environment jsdom
//
// L1 / L1b — EVERY SUBMISSION REACHES A TERMINAL STATE, AND THE WAIT SETS AN EXPECTATION.
//
// ── L1, AND THE HOLE THAT WAS ACTUALLY LEFT ────────────────────────────────────────────────────
// The block's invariant: "every submission resolves to exactly one of two terminal states — an
// answer, or an explicit failure with a retry control — and the question text is never cleared by
// either."
//
// Three of the four minimal changes were already in `ask-client.tsx`: the `catch` routes to the
// error state, retry re-submits `t.question`, and the question lives on the turn rather than in the
// composer. **The remaining hole is not an exception at all** — it is the stream ENDING WITHOUT A
// TERMINAL EVENT. `reader.read()` returns `done`, the loop exits, `busy` clears, and the turn sits
// on `retrieving` or `composing` forever with no answer, no error, and no retry. No `catch` fires,
// because nothing threw.
//
// That is the one state the invariant forbids and the one no existing test covered: a truncated
// response, a proxy closing the connection, a server that exits its handler without emitting
// `done`. INSTR measured Ask at 58-104s, which is exactly the duration range where an intermediary
// gives up on a stream.
//
// ── L1b, AND WHY THE BLOCK'S OWN NUMBER COULD NOT BE USED ──────────────────────────────────────
// The block specifies "after ~15s". Its premise was measured false: INSTR recorded 104s / 58s /
// 64s. A "taking longer than usual" line at 15s would fire on EVERY request, telling the reader
// something untrue every single time — the copy claims exception and would describe the norm.
// Threshold re-derived below from the measured series.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient, SLOW_ANSWER_NOTICE_MS } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  // jsdom implements no layout, so `scrollIntoView` does not exist. Stubbing a DOM API jsdom
  // simply lacks is not the same as stubbing away the behaviour under test — the component's
  // auto-scroll is not what these tests assert, and without this every one dies on a TypeError
  // before reaching its assertion.
  Element.prototype.scrollIntoView = vi.fn();
});

/** A stream that emits the given lines and then closes — terminal event optional, on purpose. */
function streamOf(lines: string[]) {
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n'));
      c.close();
    },
  });
}

function stubStream(lines: string[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(streamOf(lines), { status: 200 })));
}

async function submit(q = 'What is grace?') {
  const box = await screen.findByPlaceholderText(/Ask a question/i);
  fireEvent.change(box, { target: { value: q } });
  fireEvent.submit(box.closest('form')!);
}

describe('L1 — a stream that ends without a terminal event still resolves', () => {
  it('a truncated stream lands in the failure state with a retry, not a permanent spinner', async () => {
    // SEED: remove the post-loop terminal guard -> RED. The turn stays on `retrieving` forever:
    // no answer, no error, no retry, and nothing threw so no catch fires.
    stubStream([JSON.stringify({ stage: 'retrieved', sources: [], traditions: 2 })]);
    render(<AskClient />);
    await submit();

    // The control's label is "Ask again" — the first version of this test looked for
    // /try again|retry/i, which matches nothing this product renders. It failed for the wrong
    // reason here, and made the third test below pass VACUOUSLY (a query that can never match
    // is always null). Corrected to the real copy.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /ask again/i }),
        'the turn never reached a terminal state — this is the hang the invariant forbids',
      ).toBeTruthy(),
    );
    expect(screen.getByRole('alert'), 'no explicit failure was shown').toBeTruthy();
  });

  it('the question survives the failure, so nobody retypes it', async () => {
    stubStream([]);
    render(<AskClient />);
    await submit('Why does Job suffer?');
    await waitFor(() => expect(screen.getByText(/Why does Job suffer\?/)).toBeTruthy());
  });

  it('a complete stream is NOT forced into the failure state', async () => {
    // The guard must fire only on a turn that never terminated. If it fires on a good answer it
    // has converted the success path into an error, which is worse than the bug.
    stubStream([
      JSON.stringify({ stage: 'retrieved', sources: [], traditions: 2 }),
      // A REAL TeacherResult shape (teach.ts:31-34). The first attempt invented
      // `{ answer, citations }`, which the discriminated union rejects — so nothing rendered and
      // the test failed for a reason unrelated to the guard it exists to check.
      JSON.stringify({ stage: 'done', result: { kind: 'empty', reason: 'No relevant sources found.' } }),
    ]);
    render(<AskClient />);
    await submit();
    // Asserts on the ERROR STATE, not on the retry control: a successful answer legitimately
    // offers "Ask again" as a fallback, so querying that button here would be testing nothing.
    await waitFor(() => expect(screen.getByText(/No relevant sources found/)).toBeTruthy());
    expect(screen.queryByRole('alert'), 'a completed answer was forced into the failure state').toBeNull();
  });
});

describe('L1b — the slow-answer notice is derived from measurement, not from the block', () => {
  it('the threshold is above the measured typical latency, so the copy is true when shown', () => {
    // SEED: set SLOW_ANSWER_NOTICE_MS to the block's 15_000 -> RED. INSTR measured 104s/58s/64s,
    // so a 15s "taking longer than usual" fires on every request and describes the norm as an
    // exception. A message that is false whenever it appears is worse than no message.
    expect(
      SLOW_ANSWER_NOTICE_MS,
      'notice fires at or below the measured median (64s) — it would claim "longer than usual" ' +
        'about a completely ordinary request',
    ).toBeGreaterThan(64_000);
    // And it must still fire inside a plausible wait rather than never.
    expect(SLOW_ANSWER_NOTICE_MS).toBeLessThanOrEqual(120_000);
  });
});
