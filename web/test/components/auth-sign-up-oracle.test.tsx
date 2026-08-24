// @vitest-environment jsdom
//
// B9 (#110) — SIGN-UP MUST NOT CONFIRM WHICH ADDRESSES ARE REGISTERED.
//
// Sign-in and forgot-password already refuse to distinguish "no such account" from any other
// failure (auth-forms.tsx, the "account-existence oracle" comment on the sign-in branch). Sign-up
// passed the server's message straight through, and the server's duplicate-email message is
// "User already exists. Use another email." — an existence oracle on the one form that was
// documented as not having one.
//
// The codes under test are verified, not assumed: better-auth 1.4.18's sign-up route throws
// APIError(UNPROCESSABLE_ENTITY, { message: "User already exists. Use another email." })
// (dist/api/routes/sign-up.mjs), and better-call derives the wire code from that message
// (dist/error.mjs: message.toUpperCase() with spaces -> "_"), giving
// USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL. The report's guessed codes (user_already_exists,
// email_exists) exist nowhere in the installed packages. A stubbed PASSWORD_TOO_SHORT is the
// control: validation messages must still pass through, or the fix has silenced the wrong errors.
//
// Red-proof: against the unfixed passthrough the existence case shows the server's raw message.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let signUpError: { code?: string; message?: string } | null = null;
vi.mock('../../src/lib/auth/client', () => ({
  authClient: {
    signUp: { email: vi.fn(async () => ({ error: signUpError })) },
    signIn: { email: vi.fn(async () => ({ error: null })), social: vi.fn(async () => ({ error: null })) },
    requestPasswordReset: vi.fn(async () => ({ error: null })),
    resetPassword: vi.fn(async () => ({ error: null })),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AuthForm } from '../../src/components/auth-forms';

async function submitSignUp(): Promise<void> {
  render(<AuthForm path="sign-up" />);
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'reader@example.com' } });
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'a-long-enough-password' } });
  fireEvent.click(screen.getByRole('button', { name: /Create an account/i }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
}

beforeEach(() => { signUpError = null; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('B9 — sign-up account-existence oracle', () => {
  it('suppresses the duplicate-email code instead of showing "already exists"', async () => {
    signUpError = {
      code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
      message: 'User already exists. Use another email.',
    };
    await submitSignUp();
    const alert = screen.getByRole('alert');
    expect(alert.textContent, 'the server message confirmed the account exists').not.toMatch(/already exists/i);
    expect(alert.textContent).toBe('That account could not be created.');
  });

  it('suppresses the bare USER_ALREADY_EXISTS code the same way', async () => {
    signUpError = { code: 'USER_ALREADY_EXISTS', message: 'User already exists.' };
    await submitSignUp();
    expect(screen.getByRole('alert').textContent).toBe('That account could not be created.');
  });

  it('still passes validation errors through — the fix must not silence the wrong errors', async () => {
    signUpError = { code: 'PASSWORD_TOO_SHORT', message: 'Password too short' };
    await submitSignUp();
    expect(screen.getByRole('alert').textContent).toBe('Password too short');
  });
});
