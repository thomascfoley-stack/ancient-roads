// @vitest-environment jsdom
//
// THE AUTH FORMS' ERROR VOICE — and the marker that makes "one of ours" a fact.
//
// THE DEFECT. `authFailure(e)` sorts a thrown failure into "the auth server refused" (curated per
// surface) and everything else, and the comment on it called that second branch "our own curated
// `throw new Error(...)` messages" — so the catch rendered `e.message` for it, unread. The premise
// is only true of the three `throw`s in that file. A DROPPED CONNECTION is not an `authFailure`
// either: `fetch` rejects with a `TypeError` carrying no `code` and no `status`, it took the same
// branch, and the reader was shown the literal words "Failed to fetch". Same shape at the Google
// button, which forwarded `e.message` under a comment claiming it produced "the right sentence for
// every cause".
//
// The fix marks our own three (`CuratedError`) instead of inferring ownership from the ways an
// error can arrive. That inverts the risk — a marker can be forgotten, and then a message we DID
// write silently collapses into the generic sentence — so both directions are asserted here. The
// absence leg alone would pass against a form that showed one sentence for everything, which is
// exactly the regression the marker can cause.
//
// The component is driven for real; only `fetch` is stubbed, so the actual authClient, the actual
// submit handler and the actual render paths run.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { AuthForm } from '@/components/auth-forms';

function fillAndSubmit(container: HTMLElement, password = 'a-long-enough-passphrase') {
  const email = container.querySelector('input[type="email"]');
  if (email) fireEvent.change(email, { target: { value: 'reader@example.com' } });
  const pw = container.querySelector('input[type="password"]');
  if (pw) fireEvent.change(pw, { target: { value: password } });
  fireEvent.submit(container.querySelector('form')!);
}

beforeEach(() => {
  window.history.replaceState({}, '', '/auth/sign-in');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a dropped connection never speaks the browser’s words', () => {
  it('sign-in: shows a sentence, not "Failed to fetch"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const { container } = render(<AuthForm path="sign-in" />);
    fillAndSubmit(container);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').not.toMatch(/failed to fetch/i);
    expect(alert.textContent ?? '').toMatch(/[.!?]/);
  });

  it('the Google button: shows a sentence, not "Failed to fetch"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    render(<AuthForm path="sign-in" />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').not.toMatch(/failed to fetch/i);
    expect(alert.textContent ?? '').toMatch(/google sign-in could not be started/i);
  });
});

describe('our own sentences still survive the marker', () => {
  it('reset-password with no token in the URL says so, in our words', async () => {
    // This message is thrown BEFORE any request, so it can only reach the screen through the
    // "ours" branch. If the marker is dropped from that throw, the reader gets the generic
    // sentence and is told nothing about the link they clicked.
    window.history.replaceState({}, '', '/auth/reset-password');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const { container } = render(<AuthForm path="reset-password" />);
    fillAndSubmit(container);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/reset link is incomplete/i),
    );
  });

  it('reset-password with a short password says the length, in our words', async () => {
    window.history.replaceState({}, '', '/auth/reset-password?token=abc');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const { container } = render(<AuthForm path="reset-password" />);
    fillAndSubmit(container, 'short');

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/at least 12 characters/i),
    );
  });
});
