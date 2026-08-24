'use client';

// Our own sign-in / sign-up / password-reset forms, replacing Neon's prefab `<AuthView>`.
//
// The prefab came with the managed auth service we are leaving (SEC-1, docs/AUTH_CUTOVER_DESIGN.md).
// Owning these forms is not incidental to the cutover, it IS part of it: the prefab also dragged in
// next-themes, which took ownership of the `dark` class on <html> and deleted the reader's saved
// theme on every load (globals.css:6, and the A7b walk's "Light does not survive a reload").
//
// MIN_PASSWORD mirrors `authOptions.emailAndPassword.minPasswordLength`. The server is the
// enforcement; this is only so the reader is told before a round trip rather than after one.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth/client';
import type { AuthMode } from '@/lib/auth/paths';

/**
 * Where a brand-new reader lands — block `T1`.
 *
 * John 1 with the verse-1 study drawer already open.
 *
 * **The block assumed this deep link already existed. It did not** — the reader parses `#v<n>`
 * from the hash and only SCROLLS; it has no query params and no way to open the drawer from a
 * URL. Recorded in T1's Findings log. The hash was extended to `#v<n>:study`, reusing the effect
 * and the `openStudy` callback that were already there, which is the smallest change that makes
 * the block's premise true.
 *
 * ── WHY A QUERY PARAM AND NOT A HASH — THIS BROKE PRODUCTION SIGN-IN ───────────────────────────
 * The first version was `/read/jhn/1#v1:study`. It works for `router.push` (client-side), and it
 * BREAKS OAuth: `callbackURL` is validated by Neon's HOSTED auth server, which rejects a fragment
 * with *"callbackURL must be an absolute URL or a safe relative path starting with /"*. The value
 * does start with `/`, so the message is misleading — the fragment is what it refuses. That error
 * rendered on the sign-in page and took auth down.
 *
 * **The fragment was never sent to the server anyway** — that is the whole point of a hash — so a
 * server-side validator can only ever see it as junk. A query param is the only form that
 * survives an OAuth round trip.
 *
 * Hydration safety is preserved because the reader reads `window.location.search` in an EFFECT,
 * exactly as it already reads the hash — not via `useSearchParams`, which would need a Suspense
 * boundary and reintroduce the first-render disagreement that file spent an afternoon removing.
 *
 * Google sign-in uses the same destination via `callbackURL`, so the two paths cannot drift.
 *
 * NOTE it is used for sign-UP only. Sending a returning reader here every time would override the
 * place they chose to be, which is the opposite of the point.
 */
export const FIRST_RUN_DESTINATION = '/read/jhn/1?firstrun=1';

const MIN_PASSWORD = 12;

// Account-existence codes from the auth server, verified against the installed better-auth
// 1.4.18 rather than assumed: the sign-up route throws APIError(UNPROCESSABLE_ENTITY) with
// message "User already exists. Use another email." (dist/api/routes/sign-up.mjs), and
// better-call derives the wire code from the message (dist/error.mjs: uppercased, spaces to
// underscores), giving USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL. The bare USER_ALREADY_EXISTS is
// the same class emitted by the admin plugin. These get the generic message below so sign-up
// holds the same posture as sign-in and forgot-password (see the oracle comment there).
//
// This NARROWS the account-existence oracle; it does not CLOSE it. The form still succeeds for
// new addresses and fails for taken ones, so its behaviour alone leaks existence. Closing it
// means always claiming success and emailing the address's real owner — a much larger change,
// deliberately not taken here. Do not read this as a guarantee.
// THE PATTERN THIS REPLACES WAS DEAD CODE, and its deadness is the whole of bug #110 reopening.
//
// Every `authClient.*` call resolves `{ data, error }` on SUCCESS but **throws** on 4xx — it never
// populates `error`. Verified by execution against the installed @neondatabase/auth 0.5.0-beta, not
// inferred: a 422 sign-up rejects the promise with `AuthApiError`, so `const { error: err } = await
// ...; if (err) …` cannot run, and the curated message it guarded was never reachable. The raw
// server sentence went straight to the outer catch and onto the screen, which for a duplicate
// address is the literal words "User already exists. Use another email." — the exact account-
// existence oracle the old comment here claimed to have narrowed.
//
// (Why it looked fine: `@neondatabase/auth` is a Supabase-shaped shim over better-auth. Its
// `BETTER_AUTH_ERROR_MAP` translates the bare `USER_ALREADY_EXISTS` into its own safe message — but
// better-auth's sign-up route actually throws `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, which is NOT
// in that map, so it falls through to the branch that forwards `betterError.message` verbatim.)
//
// Codes below are the SHIM's normalized values (`AuthErrorCode`, snake_case), not better-auth's
// wire codes. Written as literals rather than imported: the enum lives behind a hashed internal
// module path (`better-auth-helpers-*.mjs`) with no public export, and pinning a literal that a
// test exercises beats importing a path that a patch release can rename.
const EMAIL_NOT_CONFIRMED = 'email_not_confirmed';

/**
 * An auth-server failure, as opposed to one of our own curated `throw new Error(...)` messages.
 * Discriminated structurally (`code` + `status`) rather than by class name, because the thrown type
 * comes from `@supabase/auth-js` via the shim and is not ours to depend on.
 */
function authFailure(e: unknown): { code?: string; status?: number } | null {
  return e instanceof Error && 'code' in e && 'status' in e
    ? (e as unknown as { code?: string; status?: number })
    : null;
}

// PRD §6 inputs: parchment surface, 1px vellum hairline (`edge`, which also flips the color in
// dark mode — a layered `dark:border-*` pair cannot be trusted to, per globals.css:226). Focus is
// the global 2px antique-gold :focus-visible outline, NOT a focus border: an unlayered `.edge`
// rule beats any layered `focus:border-accent-*`, so a gold focus border could never paint.
// `outline-none` is deliberately gone so that outline shows.
const field =
  'w-full border edge bg-stone-50 px-3 py-2.5 text-sm text-stone-900 ' +
  'placeholder:text-stone-500 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-400';
// PRD §4 form labels: 12px Source Sans, weight 600, uppercase, 0.08em, ink-wash.
const label =
  'block text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400';
// PRD §6 primary button: 1px ink hairline, transparent until hover fills ink and inverts the
// label. No transition — the PRD's hover is an instant fill, not a crossfade.
const button =
  'w-full border border-stone-900 bg-transparent px-4 py-3 text-sm font-semibold tracking-[0.02em] ' +
  'text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-60 ' +
  'dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-200 dark:hover:text-stone-900';
// PRD §6 text link: antique gold, no underline until hover.
const quiet =
  'text-sm font-semibold text-accent-600 underline-offset-4 hover:underline dark:text-accent-400';
// Secondary weight against the primary submit above it: this is an alternative to the form, not
// the form's action. Same geometry so the two read as one stack. PRD §6 secondary: the same
// hairline treatment stepped down to ink-wash.
const socialButton =
  'flex w-full items-center justify-center gap-3 border border-stone-500 bg-transparent ' +
  'px-4 py-3 text-sm font-semibold tracking-[0.02em] text-stone-600 hover:bg-stone-500 ' +
  'hover:text-stone-50 disabled:opacity-60 dark:border-stone-400 dark:text-stone-300 ' +
  'dark:hover:bg-stone-400 dark:hover:text-stone-950';

/** Google's brand mark, inlined: the CSP here is `style-src 'self'` and blocks remote assets. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function AuthForm({ path }: { path: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // K-4/K-5 — the address we are waiting on a verification click for. One state serves both
  // entrances (a fresh sign-up held pending verification, and a sign-in by an unverified account)
  // because the reader's situation and the way out of it are identical in both.
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  // GOOGLE, AND WHAT IT COSTS — stated once, here, where someone would remove it.
  //
  // ADR-109: enabling a social provider alongside email/password restores GHSA-g38m's
  // precondition (attacker pre-registers the victim's address unverified; the victim's later
  // Google sign-in auto-links onto it). Neon exposes no verified-email-before-link control -- the
  // SDK types, the OAuth guide and the management API were all checked. The owner accepted that
  // knowingly. This button is that decision made visible; it is not an oversight to be "fixed" by
  // deleting it, nor a licence to add more providers.
  //
  // No try/finally reset of `busy` on the success path: signIn.social navigates the browser to
  // Google, so nothing after it runs and leaving the button disabled is correct. Only the failure
  // path re-enables it.
  async function google() {
    setError(null);
    setBusy(true);
    try {
      // Throws on failure rather than returning `{ error }` — the `if (err)` this replaces could
      // never fire. The catch below already produces the right sentence for every cause.
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: FIRST_RUN_DESTINATION,
        errorCallbackURL: '/auth/sign-in',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in could not be started.');
      setBusy(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    setBusy(true);

    try {
      if (path === 'sign-in') {
        // No `if (error)` check: this call THROWS on failure (see the note above the codes).
        // The catch below curates every server failure into one generic sentence, which is what
        // keeps "no such account" and "wrong password" indistinguishable — an account-existence
        // oracle, and this app's whole SEC-1 problem was an account-takeover class.
        await authClient.signIn.email({ email, password });
        router.push('/home');
        router.refresh();
        return;
      }

      if (path === 'sign-up') {
        if (password.length < MIN_PASSWORD) {
          throw new Error(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
        }
        // Throws on failure; the catch curates it to one generic sentence for every cause.
        const { data: created } = await authClient.signUp.email({
          email,
          password,
          name: String(data.get('name') ?? '').trim() || email.split('@')[0],
        });

        // K-4 — DOES THIS ACCOUNT HAVE A SESSION YET? The server answers, so we do not have to
        // guess. The sign-up response is a union: `token: string` when a session was issued, and
        // `token: null` when the server is holding the account pending email verification
        // (@neondatabase/auth types, adapter-core-*.d.mts:1715-1737).
        //
        // Reading it is what lets this UI stay correct while "is verification required for beta?"
        // is still an open owner decision. Hardcoding either answer would be wrong the moment that
        // decision is made, and wrong silently.
        if (!created?.token) {
          setVerifyFor(email);
          return;
        }

        // T1 — a new reader's first screen is the PRODUCT, not a dashboard. `/home` shows a
        // devotional feed that teaches nothing about what makes this app different; the verse
        // drawer is the one idea that does. Sign-IN keeps `/home` deliberately: a returning
        // reader has already met the idea and wants their own place.
        //
        // Reached only WITH a session. Sending an unverified, session-less reader here was K-4:
        // they landed in the reader with nothing saved, nothing explained, and no idea an email
        // was waiting for them.
        router.push(FIRST_RUN_DESTINATION);
        router.refresh();
        return;
      }

      if (path === 'forgot-password') {
        await authClient.requestPasswordReset({ email, redirectTo: '/auth/reset-password' });
        // Always the same outcome, whether or not the address is registered -- for the same
        // account-existence reason as the sign-in message above.
        setSent(true);
        return;
      }

      // reset-password
      const token = params.get('token');
      if (!token) throw new Error('That reset link is incomplete. Please request a new one.');
      if (password.length < MIN_PASSWORD) {
        throw new Error(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
      }
      // Throws on failure; curated per-path in the catch (same dead-`error` mechanism as above).
      await authClient.resetPassword({ newPassword: password, token });
      router.push('/auth/sign-in');
    } catch (e) {
      // K-5 — an unverified reader supplied the RIGHT password and was told it was wrong. That
      // message is protective for a bad password and simply false here, and it sent people to
      // reset a password that was never broken. This branch is not an existence leak: the server
      // only reaches EMAIL_NOT_VERIFIED after the credentials CHECK OUT, so anyone who sees it
      // already knew the account existed.
      if (authFailure(e)?.code === EMAIL_NOT_CONFIRMED) {
        setVerifyFor(email);
        return;
      }
      // Server failures are curated to one sentence per surface; only our own thrown Errors (which
      // carry no `code`/`status`) are shown as written. Without this, raw auth-server text reaches
      // the screen — which is how "User already exists. Use another email." shipped.
      // One curated sentence per surface. `reset-password` needs its own or an expired link reads
      // as a credentials failure; `forgot-password` must stay silent about outcomes for the same
      // existence reason it always claims success.
      const CURATED: Record<AuthMode, string> = {
        'sign-up': 'That account could not be created.',
        'sign-in': 'That email and password do not match an account.',
        'forgot-password': 'That request could not be sent. Please try again.',
        'reset-password': 'That reset link has expired or has already been used.',
      };
      setError(
        authFailure(e)
          ? CURATED[path]
          : e instanceof Error
            ? e.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification(): Promise<void> {
    if (!verifyFor || resend === 'sending') return;
    setResend('sending');
    try {
      await authClient.sendVerificationEmail({ email: verifyFor });
      setResend('sent');
    } catch {
      // Deliberately not surfacing the server's words: this button is reachable pre-auth, and a
      // detailed failure here would describe an account to whoever typed the address.
      setResend('failed');
    }
  }

  // K-4/K-5 — the state that did not exist. Sign-up used to redirect into the reader saying
  // nothing; an unverified sign-in used to claim the password was wrong.
  if (verifyFor) {
    return (
      <div className="bg-paper px-6 pb-8 pt-4 dark:bg-stone-900">
        <h2 className="font-serif text-lg text-stone-900 dark:text-stone-100">Confirm your email</h2>
        {/* The address is interpolated into the same paragraph rather than wrapped in its own
            element: readers scan this for THEIR address to check for a typo, and a mis-typed
            address is the single most common reason the link never arrives. */}
        <p className="mt-3 font-serif text-stone-700 dark:text-stone-300">
          We have sent a verification link to {verifyFor}. Open it and you will be signed in.
        </p>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          If it has not arrived, check the spam folder before requesting another.
        </p>

        <button type="button" onClick={resendVerification} disabled={resend === 'sending'} className={`mt-6 ${button}`}>
          {resend === 'sending' ? 'Sending...' : 'Resend the link'}
        </button>

        {/* role=status, not role=alert: this is a confirmation, and alert would interrupt a screen
            reader mid-sentence for good news. Same reasoning as the write-path fixes in A7b. */}
        {resend === 'sent' && (
          <p role="status" className="mt-3 text-sm text-stone-600 dark:text-stone-400">
            Sent. It can take a minute to arrive.
          </p>
        )}
        {resend === 'failed' && (
          <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-200">
            That could not be sent just now. Please try again in a moment.
          </p>
        )}

        <p className="mt-5">
          <Link href="/auth/sign-in" className={quiet}>Back to sign in</Link>
        </p>
      </div>
    );
  }

  if (path === 'forgot-password' && sent) {
    return (
      <div className="bg-paper px-6 pb-8 pt-4 dark:bg-stone-900">
        <p className="font-serif text-stone-700 dark:text-stone-300">
          If that address has an account, a reset link is on its way. It can be used once, and
          expires in an hour.
        </p>
        <p className="mt-5">
          <Link href="/auth/sign-in" className={quiet}>Back to sign in</Link>
        </p>
      </div>
    );
  }

  const heading =
    path === 'sign-in' ? 'Sign in'
      : path === 'sign-up' ? 'Create an account'
        : path === 'forgot-password' ? 'Reset your password'
          : 'Choose a new password';

  return (
    <form onSubmit={submit} className="bg-paper px-6 pb-8 pt-4 dark:bg-stone-900">
      <h2 className="sr-only">{heading}</h2>

      {error && (
        // role=alert so it is announced; the A7b walk found silent failures on write paths.
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <div className="space-y-4">
        {path === 'sign-up' && (
          <div>
            <label htmlFor="name" className={label}>Name</label>
            <input id="name" name="name" autoComplete="name" className={`mt-1.5 ${field}`} />
          </div>
        )}

        {path !== 'reset-password' && (
          <div>
            <label htmlFor="email" className={label}>Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={`mt-1.5 ${field}`}
            />
          </div>
        )}

        {path !== 'forgot-password' && (
          <div>
            <label htmlFor="password" className={label}>
              {path === 'reset-password' ? 'New password' : 'Password'}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={path === 'sign-in' ? undefined : MIN_PASSWORD}
              autoComplete={path === 'sign-in' ? 'current-password' : 'new-password'}
              className={`mt-1.5 ${field}`}
            />
            {path !== 'sign-in' && (
              <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                At least {MIN_PASSWORD} characters.
              </p>
            )}
          </div>
        )}
      </div>

      <button type="submit" disabled={busy} className={`mt-6 ${button}`}>
        {busy ? 'Working...' : heading}
      </button>

      {/* Only where an account is being entered or created. A password-reset flow has no social
          equivalent -- Google accounts have no password here to reset. */}
      {(path === 'sign-in' || path === 'sign-up') && (
        <>
          <div className="mt-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
            <span className="text-micro uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">or</span>
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
          </div>
          <button type="button" onClick={google} disabled={busy} className={`mt-6 ${socialButton}`}>
            <GoogleMark />
            {path === 'sign-up' ? 'Sign up with Google' : 'Sign in with Google'}
          </button>
        </>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-2">
        {path === 'sign-in' && (
          <>
            <Link href="/auth/sign-up" className={quiet}>Create an account</Link>
            <Link href="/auth/forgot-password" className={quiet}>Forgot password?</Link>
          </>
        )}
        {path !== 'sign-in' && (
          <Link href="/auth/sign-in" className={quiet}>Back to sign in</Link>
        )}
      </div>
    </form>
  );
}
