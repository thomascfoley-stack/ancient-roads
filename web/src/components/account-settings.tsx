'use client';

// Replaces Neon's prefab `<AccountView>`, scoped per AUTH_CUTOVER_DESIGN §5 to change-password.
//
// DEFERRED, AND NAMED SO THE DEFERRAL IS A DECISION RATHER THAN AN OMISSION: the prefab also
// shipped change-email, an active-session list, and delete-account. Delete-account in particular
// touches 21 user-scoped tables and deserves its own slice; shipping a button that half-deletes an
// account is worse than not shipping one.

import { useState, type FormEvent } from 'react';
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

  const field =
    'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 ' +
    'outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-300 ' +
    'dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:ring-stone-700';

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
        Your account
      </h1>
      <p className="mt-1 font-serif text-sm text-stone-600 dark:text-stone-400">{email}</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
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
          <label htmlFor="current" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            Current password
          </label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className={`mt-1.5 ${field}`} />
        </div>

        <div>
          <label htmlFor="next" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            New password
          </label>
          <input id="next" name="next" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={`mt-1.5 ${field}`} />
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">At least {MIN_PASSWORD} characters.</p>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-base font-medium text-paper transition hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          {busy ? 'Working...' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
