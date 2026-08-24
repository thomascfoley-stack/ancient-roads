// @vitest-environment jsdom
//
// K-4 / K-5 (UX_REMEDIATION_PLAN.md) — sign-up said nothing, and sign-in LIED to unverified users.
//
// Two findings, one root: the auth UI had no concept of "verified", while the server enforced it.
//
//   K-4  A successful sign-up did `router.push('/read/jhn/1?firstrun=1')` and nothing else. If the
//        server withheld a session pending verification, the new reader was dropped into the reader
//        with no session, no message, and no idea an email had been sent.
//   K-5  A sign-in by an unverified user hit the deliberately-generic branch and was told **"That
//        email and password do not match an account."** That message is correct-and-protective for
//        a wrong password; for a correct password on an unverified account it is simply FALSE, and
//        it sends the user to reset a password that was never wrong. There is no resend anywhere.
//
// WHY NOT JUST HARDCODE "we sent you a link": whether verification is enforced is a Neon Auth
// server setting and an OPEN OWNER DECISION at the time of writing (plan K-5, 👤). So the UI must
// not assume either answer. The server already tells us, in the sign-up response: the union is
// `{ token: string, user }` (session issued — verification not enforced) or `{ token: null, user }`
// (no session — verification enforced), per the installed @neondatabase/auth types
// (adapter-core-*.d.mts:1715-1737). Branching on `token` makes the UI TRACK the setting instead of
// guessing it, and it stays correct whichever way the owner rules.
//
// THE ORACLE POSTURE IS LOAD-BEARING AND IS PINNED HERE TOO. auth-forms.tsx deliberately refuses to
// distinguish "no such account" from "wrong password" (SEC-1 was an account-takeover class), and
// sign-up gives one generic failure for a taken address. K-5 must not become a hole in that: the
// unverified branch only fires on EMAIL_NOT_VERIFIED, which the server returns only when the
// supplied password was CORRECT. Someone who supplied the right password already knows the account
// exists, so no existence signal is added. Legs 4 and 5 below are the controls that hold that line
// — without them this file would "pass" a fix that helpfully announced which emails are registered.
//
// The component is driven for real; only `fetch` is stubbed, so the actual authClient, the actual
// submit handler and the actual render paths run.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  // AuthForm no longer calls useSearchParams (it reads window.location.search in the submit
  // handler, so it needs no Suspense boundary — see the note in the component). The reset-password
  // leg below sets the real URL instead.
}));

import { AuthForm } from '@/components/auth-forms';

type Reply = { status: number; body: unknown };
let routes: Record<string, Reply>;

function installFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string' ? input
          : input instanceof URL ? input.href
            : input instanceof Request ? input.url : String(input);
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const reply = key ? routes[key] : { status: 404, body: { message: 'unrouted' } };
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

let calls: { url: string; body: string }[] = [];

const USER = {
  id: 'u1', email: 'reader@example.com', name: 'Reader',
  emailVerified: false, createdAt: new Date(), updatedAt: new Date(),
};

/**
 * The form is UNCONTROLLED — `submit()` reads `new FormData(e.currentTarget)` — so the values have
 * to land on the real DOM nodes, and a click on the submit button has to reach the real onSubmit.
 * `fireEvent` is used rather than user-event because user-event is not a dependency of this repo
 * and a test is not a good enough reason to add one.
 */
function fillAndSubmit(email = 'reader@example.com', password = 'a-long-enough-password'): void {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } });
  // `type=submit`, not a name match: /sign in/i also matches the "Sign in with Google" button and
  // the "Create an account" link that sit in the same form.
  const submit = document.querySelector('button[type="submit"]');
  if (!submit) throw new Error('no submit button rendered');
  fireEvent.click(submit);
}

beforeEach(() => {
  calls = []; routes = {}; push.mockClear(); installFetch();
  // Default: no token in the URL. The reset-password case sets one.
  window.history.replaceState({}, '', '/auth/sign-in');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('K-4 — sign-up tells the reader what just happened', () => {
  it('verification ENFORCED (token: null) → says an email was sent, and does NOT dump them in the reader', async () => {
    routes['sign-up'] = { status: 200, body: { status: true, token: null, user: USER } };
    render(<AuthForm path="sign-up" />);
    fillAndSubmit();

    // The whole finding: the reader must be TOLD. Wording may change; "check your inbox / we sent
    // a link to <their address>" is the substance, so assert on substance not on an exact string.
    await waitFor(() => {
      expect(screen.getByText(/verif/i), 'no verification message after sign-up').toBeTruthy();
    });
    expect(screen.getByText(/reader@example\.com/), 'the message must name the address it sent to').toBeTruthy();
    // And it must not silently navigate: with no session, /read/jhn/1?firstrun=1 is a dead end.
    expect(push, 'navigated away instead of explaining').not.toHaveBeenCalled();
  });

  it('verification NOT enforced (token issued) → keeps the deliberate first-run reader redirect (T1)', async () => {
    routes['sign-up'] = { status: 200, body: { status: true, token: 'sess_abc', user: { ...USER, emailVerified: true } } };
    render(<AuthForm path="sign-up" />);
    fillAndSubmit();

    // This leg is why the fix branches instead of hardcoding a message: the T1 product decision
    // (a new reader's first screen is the PRODUCT) must survive, and does, when a session exists.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/read/jhn/1?firstrun=1'));
  });

  it('CONTROL — a taken address still gets ONE generic failure, no existence signal', async () => {
    routes['sign-up'] = {
      status: 422,
      body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists. Use another email.' },
    };
    render(<AuthForm path="sign-up" />);
    fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be created/i));
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert, 'leaked that the account already exists').not.toMatch(/already exists|taken|registered/i);
    expect(screen.queryByText(/verif/i), 'a failed sign-up must not claim a link was sent').toBeNull();
  });
});

describe('K-5 — an unverified sign-in is told the truth, and can do something about it', () => {
  it('EMAIL_NOT_VERIFIED → names verification and offers resend, NOT "password does not match"', async () => {
    routes['sign-in'] = { status: 403, body: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' } };
    render(<AuthForm path="sign-in" />);
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/verif/i), 'unverified sign-in gave no verification message').toBeTruthy();
    });
    // The active harm: sending a user to reset a password that was never wrong.
    expect(document.body.textContent, 'still claiming the credentials are wrong')
      .not.toMatch(/do not match an account/i);
    expect(
      screen.getByRole('button', { name: /resend|send.*again|send.*link/i }),
      'no way to get another verification email',
    ).toBeTruthy();
  });

  it('resend actually asks the server for a new link', async () => {
    routes['sign-in'] = { status: 403, body: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' } };
    routes['send-verification-email'] = { status: 200, body: { status: true } };
    render(<AuthForm path="sign-in" />);
    fillAndSubmit();
    await waitFor(() => screen.getByRole('button', { name: /resend|send.*again|send.*link/i }));

    fireEvent.click(screen.getByRole('button', { name: /resend|send.*again|send.*link/i }));

    await waitFor(() => {
      const sent = calls.find((c) => c.url.includes('send-verification-email'));
      expect(sent, 'resend button never called send-verification-email').toBeTruthy();
      expect(sent!.body, 'resend must name the address it is resending to').toMatch(/reader@example\.com/);
    });
  });

  it('CONTROL — a genuinely wrong password still gets the generic non-oracle message', async () => {
    routes['sign-in'] = { status: 401, body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' } };
    render(<AuthForm path="sign-in" />);
    fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/do not match an account/i));
    // If this ever starts mentioning verification, the fix has become an existence oracle.
    expect(screen.queryByText(/verif/i), 'wrong-password path leaked a verification hint').toBeNull();
    expect(screen.queryByRole('button', { name: /resend/i })).toBeNull();
  });
});

describe('the same dead-`error` mechanism on the other auth surfaces', () => {
  // These two branches had the identical defect and were fixed in the same pass: both destructured
  // an `error` that is never populated, so both forwarded raw auth-server text to the reader.
  it('an expired reset link says so — not "email and password do not match"', async () => {
    routes['reset-password'] = { status: 400, body: { code: 'INVALID_TOKEN', message: 'invalid token' } };
    // The token now comes from the real URL, which is what the component reads.
    window.history.replaceState({}, '', '/auth/reset-password?token=tok_123');
    render(<AuthForm path="reset-password" />);
    // this surface labels the field "New password"
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'a-long-enough-password' } });
    const submit = document.querySelector('button[type="submit"]');
    fireEvent.click(submit!);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/reset link has expired/i));
    // The raw server word must not reach the reader, and neither must the sign-in sentence.
    expect(screen.getByRole('alert').textContent).not.toMatch(/invalid token|do not match an account/i);
  });
});
