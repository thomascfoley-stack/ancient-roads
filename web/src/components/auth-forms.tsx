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

export function AuthForm({ path }: { path: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
        router.push('/home');
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
