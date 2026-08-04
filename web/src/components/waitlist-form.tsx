'use client';

import { useState } from 'react';

type State = 'idle' | 'submitting' | 'done' | 'error';

/** Public waitlist capture on the marketing landing. Posts to /api/waitlist (rate-limited). */
export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'submitting') return;
    setState('submitting');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) {
        setState('done');
        setMessage(data.message ?? "You're on the list. We'll be in touch.");
      } else {
        setState('error');
        setMessage(data.message ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setState('error');
      setMessage('Network error. Please try again.');
    }
  }

  if (state === 'done') {
    return (
      <p
        role="status"
        className="mx-auto max-w-md rounded-2xl bg-paper px-5 py-4 font-serif text-base text-stone-700 shadow-paper dark:bg-stone-800 dark:text-stone-200"
      >
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-md flex-col items-center gap-3 sm:flex-row">
      <label htmlFor="waitlist-email" className="sr-only">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        className="min-h-[48px] w-full flex-1 rounded-lg border border-stone-300 bg-stone-50 px-5 text-base text-stone-900 shadow-inner outline-none transition-colors placeholder:text-stone-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-accent-700 px-6 text-base font-semibold text-stone-50 shadow-float transition-all duration-200 ease-gentle hover:bg-accent-800 active:scale-[0.99] disabled:opacity-40 sm:w-auto dark:bg-accent-500 dark:hover:bg-accent-400"
      >
        {state === 'submitting' ? 'Joining…' : 'Request access'}
      </button>
      {state === 'error' && (
        <p role="alert" className="w-full text-center text-sm text-accent-700 dark:text-accent-400">
          {message}
        </p>
      )}
    </form>
  );
}
