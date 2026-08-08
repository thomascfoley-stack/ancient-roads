'use client';

import { useState } from 'react';

type State = 'idle' | 'submitting' | 'done' | 'error';

/** Public waitlist capture on the marketing landing. Posts to /api/waitlist (rate-limited).
 *
 * Styled for the 2026-08-08 marketing redesign: pill input + sage pill button, and a
 * DESIGNED success state (the mockup's "Request received" moment rendered inline, so no
 * new route is needed and the reader keeps their scroll position). Error states keep the
 * serif voice rather than a browser default. Light-only, like the rest of the marketing
 * tier. */
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
        setMessage(data.message ?? '');
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
      <div role="status" className="mx-auto max-w-md rounded-2xl bg-paper px-8 py-8 text-center shadow-card">
        <p className="text-micro font-bold uppercase tracking-[0.3em] text-sage-600">Request received</p>
        <p className="mt-3 font-display text-2xl text-stone-900">Your name is on the list.</p>
        <p className="mt-3 font-serif text-base leading-relaxed text-stone-900/70">
          We are opening the doors slowly, a few at a time, so the first rooms stay quiet.
          {email ? (
            <>
              {' '}
              You will hear from us at <span className="font-semibold italic text-stone-900">{email}</span>.
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 sm:flex-row">
      <label htmlFor="waitlist-email" className="sr-only">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        autoComplete="email"
        className="min-h-[52px] w-full flex-1 rounded-full border border-stone-200 bg-paper px-7 font-serif text-base text-stone-900 shadow-paper outline-none transition-colors ease-gentle placeholder:text-stone-500 focus:border-sage-500 focus:ring-2 focus:ring-sage-500/30 sm:text-lg"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="inline-flex min-h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full bg-sage-500 px-8 text-micro font-bold uppercase tracking-[0.2em] text-stone-50 shadow-float transition-[background-color,opacity,transform] duration-300 ease-gentle hover:bg-stone-900 active:scale-[0.99] disabled:opacity-40 sm:w-auto"
      >
        {state === 'submitting' ? 'Sending…' : 'Request access'}
      </button>
      {state === 'error' && (
        <p role="alert" className="w-full text-center font-serif text-sm italic text-accent-700">
          {message}
        </p>
      )}
    </form>
  );
}
