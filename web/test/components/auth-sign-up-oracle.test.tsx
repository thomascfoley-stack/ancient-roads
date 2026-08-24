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
// ─────────────────────────────────────────────────────────────────────────────────────────────
// REWRITTEN 2026-08-24 (K-4/K-5, finding Claude-10). THIS FILE WAS GREEN WHILE THE ORACLE IT
// GUARDS WAS WIDE OPEN IN PRODUCTION, and the reason is one line of its own mock.
//
// It stubbed the auth client so `signUp.email` RESOLVED `{ error }`:
//     signUp: { email: vi.fn(async () => ({ error: signUpError })) }
// The real client — `@neondatabase/auth`, a Supabase-shaped shim over better-auth — **throws** on
// 4xx and never populates `error`. So the branch this file exercised (`const { error: err } = await
// ...; if (err) ...`) was unreachable in the running app: the rejection skipped it and landed in
// the outer catch, which put the SERVER'S OWN SENTENCE on screen — "User already exists. Use
// another email." Every assertion below passed against a client shape that does not exist.
//
// The header's old red-proof line ("against the unfixed passthrough the existence case shows the
// server's raw message") was true of the MOCK and therefore proved nothing about the product. A
// red-proof is only worth the fidelity of the thing it is proved against.
//
// The mock now throws, matching the shipped client. The assertions are unchanged — they were
// always the right assertions — and they now fail if the oracle reopens.
//
// The codes are verified, not assumed: better-auth 1.4.18's sign-up route throws
// APIError(UNPROCESSABLE_ENTITY, { message: "User already exists. Use another email." })
// (dist/api/routes/sign-up.mjs) and better-call derives USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL from
// it. NOTE that code is NOT in the shim's BETTER_AUTH_ERROR_MAP (only the bare USER_ALREADY_EXISTS
// is), which is exactly why the raw message reached the screen instead of a safe substitute.
// PASSWORD_TOO_SHORT normalises to `weak_password` and is the control: a fault in what the person
// TYPED must still be reported, or the fix has silenced the errors worth reading.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let signUpError: { code?: string; message?: string } | null = null;

/**
 * The shipped client's failure shape: an Error carrying `code` and `status`, THROWN.
 * `code` is the shim's normalised value (snake_case), not better-auth's wire code — the mapping
 * happens inside the client, so a test that fed wire codes to the component would be testing a
 * translation layer the component never sees.
 */
class FakeAuthApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = 422;
  }
}

vi.mock('../../src/lib/auth/client', () => ({
  authClient: {
    signUp: {
      email: vi.fn(async () => {
        if (signUpError) throw new FakeAuthApiError(signUpError.code ?? '', signUpError.message ?? '');
        return { data: { status: true, token: 'sess', user: { emailVerified: true } }, error: null };
      }),
    },
    signIn: { email: vi.fn(async () => ({ error: null })), social: vi.fn(async () => ({ error: null })) },
    requestPasswordReset: vi.fn(async () => ({ error: null })),
    resetPassword: vi.fn(async () => ({ error: null })),
    sendVerificationEmail: vi.fn(async () => ({ error: null })),
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
    // The shim leaves this one UNMAPPED (it only maps the bare USER_ALREADY_EXISTS), so the code
    // arrives as its generic fallback and the raw message rides along — the exact combination that
    // put "User already exists. Use another email." in front of readers.
    signUpError = {
      code: 'unexpected_failure',
      message: 'User already exists. Use another email.',
    };
    await submitSignUp();
    const alert = screen.getByRole('alert');
    expect(alert.textContent, 'the server message confirmed the account exists').not.toMatch(/already exists/i);
    expect(alert.textContent).toBe('That account could not be created.');
  });

  it('suppresses the bare USER_ALREADY_EXISTS code the same way', async () => {
    signUpError = { code: 'user_already_exists', message: 'User already exists.' };
    await submitSignUp();
    expect(screen.getByRole('alert').textContent).toBe('That account could not be created.');
  });

  it('still passes validation errors through — the fix must not silence the wrong errors', async () => {
    signUpError = { code: 'weak_password', message: 'Password too short' };
    await submitSignUp();
    expect(screen.getByRole('alert').textContent).toBe('Password too short');
  });
});
