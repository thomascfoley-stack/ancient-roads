// @vitest-environment jsdom
//
// 429 IS NOT "SOMETHING WENT WRONG". Filed as UX_POLISH_AUDIT P2: a rate-limited ask collapsed
// into the generic error with an instant retry offer — which re-fails against the same limit.
// The API envelope already says what happened and when to try again (`api-error.ts`: the message,
// plus `retryAfterSec` in the body AND a `Retry-After` header). The turn shows that message with a
// plain-language wait, and the retry control stays visible but DISABLED until the wait elapses
// (L1's "explicit failure with a retry control" — never hidden, never an instant re-fail).
//
// SEED: route 429 through the generic branch -> both legs RED.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

async function submit(q = 'What is grace?') {
  const box = await screen.findByPlaceholderText(/Ask a question/i);
  fireEvent.change(box, { target: { value: q } });
  fireEvent.submit(box.closest('form')!);
}

const MINUTE_MESSAGE = 'You’ve reached the per-minute question limit. Please wait a moment and try again.';

describe('a rate-limited ask', () => {
  it('shows the envelope message and a plain wait, with retry disabled until it elapses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json(
        { error: { code: 'RATE_LIMIT_MINUTE', message: MINUTE_MESSAGE, retryAfterSec: 60 } },
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
    ));
    render(<AskClient />);
    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/per-minute/);
    expect(alert.textContent).toMatch(/about 60 seconds/);
    const retry = screen.getByRole('button', { name: /ask again/i }) as HTMLButtonElement;
    expect(retry.disabled, 'an instant retry against a live limit is the defect').toBe(true);
  });

  it('reads Retry-After from the header when the body carries no seconds, and re-enables when it elapses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json(
        { error: { code: 'RATE_LIMIT_MINUTE', message: MINUTE_MESSAGE } },
        { status: 429, headers: { 'Retry-After': '1' } },
      ),
    ));
    render(<AskClient />);
    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/about 1 second/);
    const retry = screen.getByRole('button', { name: /ask again/i }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    await waitFor(() => expect(retry.disabled).toBe(false), { timeout: 3000 });
  });
});
