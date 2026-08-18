'use client';

// Replaces Neon's prefab `<AccountView>`, scoped per AUTH_CUTOVER_DESIGN §5 to change-password.
//
// DEFERRED, AND NAMED SO THE DEFERRAL IS A DECISION RATHER THAN AN OMISSION: the prefab also
// shipped change-email, an active-session list, and delete-account. Delete-account in particular
// touches 21 user-scoped tables and deserves its own slice; shipping a button that half-deletes an
// account is worse than not shipping one.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth/client';

const MIN_PASSWORD = 12;

export function AccountSettings({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNote(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('current') ?? '');
    const newPassword = String(data.get('next') ?? '');

    if (newPassword.length < MIN_PASSWORD) {
      setNote({ ok: false, text: `Please choose a password of at least ${MIN_PASSWORD} characters.` });
      return;
    }

    setBusy(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        // Every other session dies with the old password. A password change is usually a response
        // to losing control of it, so leaving other sessions alive would defeat the point.
        revokeOtherSessions: true,
      });
      if (error) throw new Error('That current password is not correct.');
      form.reset();
      setNote({ ok: true, text: 'Your password has been changed. Other sessions were signed out.' });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'That did not work.' });
    } finally {
      setBusy(false);
    }
  }

  // Same input treatment as auth-forms.tsx: parchment surface, 1px vellum hairline via `edge`,
  // focus carried by the global antique-gold :focus-visible outline (an unlayered `.edge` rule
  // beats any layered `focus:border-*`, so a focus border could never paint — see globals.css:226).
  const field =
    'w-full border edge bg-stone-50 px-3 py-2.5 text-sm text-stone-900 ' +
    'placeholder:text-stone-500 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-400';
  // PRD §4 form labels: 12px Source Sans, weight 600, uppercase, 0.08em, ink-wash.
  const label =
    'block text-xs font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400';

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
        Your account
      </h1>
      <p className="mt-1 font-serif text-sm text-stone-600 dark:text-stone-400">{email}</p>

      {/* B038 — the app has two "settings" surfaces ON PURPOSE, and the ruling is cross-link,
          not merge: this page is the auth-bound half (server session, password writes) and
          /settings is the per-device half (localStorage reading prefs) — two security contexts,
          deliberately two files. /settings has linked here since it shipped (settings-form.tsx,
          the "Account" section); this quiet line is the missing direction back, in this page's
          own hint typography. */}
      <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
        This page is your account — email and password. Reading preferences (theme, text size,
        translation) are saved per-device in{' '}
        <Link
          href="/settings"
          className="font-semibold text-accent-600 underline-offset-4 hover:underline dark:text-accent-400"
        >
          Settings
        </Link>
        .
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4 border-t edge pt-8">
        <h2 className="font-display text-lg text-stone-900 dark:text-stone-100">Change password</h2>

        {note && (
          <p
            role="alert"
            className={`rounded-lg px-3 py-2 text-sm ${
              note.ok
                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
            }`}
          >
            {note.text}
          </p>
        )}

        <div>
          <label htmlFor="current" className={label}>
            Current password
          </label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className={`mt-1.5 ${field}`} />
        </div>

        <div>
          <label htmlFor="next" className={label}>
            New password
          </label>
          <input id="next" name="next" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={`mt-1.5 ${field}`} />
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">At least {MIN_PASSWORD} characters.</p>
        </div>

        {/* PRD §6 primary: 1px ink hairline, hover fills ink and inverts; instant fill, no transition. */}
        <button
          type="submit"
          disabled={busy}
          className="w-full border border-stone-900 bg-transparent px-4 py-3 text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-60 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-200 dark:hover:text-stone-900"
        >
          {busy ? 'Working...' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
