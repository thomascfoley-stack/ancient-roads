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
 * A HASH, not a query string, and that is deliberate: the reader page reads it in an effect
 * precisely because a hash is never sent to the server, so no first client render can disagree
 * with it. A `?v=` would reintroduce the hydration-mismatch shape that file spent an afternoon
 * removing.
 *
 * Google sign-in uses the same destination via `callbackURL`, so the two paths cannot drift.
 *
 * NOTE it is used for sign-UP only. Sending a returning reader here every time would override the
 * place they chose to be, which is the opposite of the point.
 */
export const FIRST_RUN_DESTINATION = '/read/jhn/1#v1:study';

const MIN_PASSWORD = 12;

const field =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 ' +
  'outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-300 ' +
  'dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-700';
const label = 'block text-sm font-medium text-stone-700 dark:text-stone-300';
const button =
  'w-full rounded-lg bg-stone-900 px-4 py-2.5 text-base font-medium text-paper transition ' +
  'hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 ' +
  'dark:hover:bg-stone-200';
const quiet = 'text-sm text-stone-600 underline underline-offset-4 dark:text-stone-400';
// Secondary weight against the primary submit above it: this is an alternative to the form, not
// the form's action. Same geometry so the two read as one stack.
const socialButton =
  'flex w-full items-center justify-center gap-3 rounded-lg border border-stone-300 bg-white ' +
  'px-4 py-2.5 text-base font-medium text-stone-800 transition hover:bg-stone-50 ' +
  'disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 ' +
  'dark:hover:bg-stone-900';

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
      const { error: err } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: FIRST_RUN_DESTINATION,
        errorCallbackURL: '/auth/sign-in',
      });
      if (err) throw new Error(err.message ?? 'Google sign-in could not be started.');
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
        const { error: err } = await authClient.signIn.email({ email, password });
        // Deliberately does not distinguish "no such account" from "wrong password": that
        // difference is an account-existence oracle, and this app's whole SEC-1 problem was an
        // account-takeover class.
        if (err) throw new Error('That email and password do not match an account.');
        router.push('/home');
        router.refresh();
        return;
      }

      if (path === 'sign-up') {
        if (password.length < MIN_PASSWORD) {
          throw new Error(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
        }
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: String(data.get('name') ?? '').trim() || email.split('@')[0],
        });
        if (err) throw new Error(err.message ?? 'That account could not be created.');
        // T1 — a new reader's first screen is the PRODUCT, not a dashboard. `/home` shows a
        // devotional feed that teaches nothing about what makes this app different; the verse
        // drawer is the one idea that does. Sign-IN keeps `/home` deliberately: a returning
        // reader has already met the idea and wants their own place.
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
      const { error: err } = await authClient.resetPassword({ newPassword: password, token });
      if (err) throw new Error('That reset link has expired or has already been used.');
      router.push('/auth/sign-in');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
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
            <span className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">or</span>
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
