'use client';

import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import { captureAttribution } from '@/lib/attribution';

/** The exact promise shown beside the button, stored with the signup (migration 130). Kept HERE,
 *  next to the copy it must match, so the two cannot drift apart silently. */
export const CONSENT_TEXT =
  'The preview is free. We invite a few readers at a time, and your email is used for the invitation alone.';

type State = 'idle' | 'submitting' | 'done' | 'error';

/** Public waitlist capture on the marketing landing. Posts to /api/waitlist (rate-limited).
 *
 * Styled for the 2026-08-08 marketing redesign (PRD §6): hairline-bordered square input
 * with an antique-gold focus border, the ink-hairline CTA, and a DESIGNED success state
 * (the "Request received" moment rendered inline, so no new route is needed and the
 * reader keeps their scroll position). Error states keep the serif voice rather than a
 * browser default. Light-only, like the rest of the marketing tier. */
export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  // ON MOUNT, not on submit. The campaign is on the URL when the reader ARRIVES and gone the
  // moment they navigate to /about — capturing it at submit time would record "no campaign" for
  // most real signups while appearing to work. See lib/attribution.ts.
  useEffect(() => {
    captureAttribution();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'submitting') return;
    setState('submitting');
    // The conversion half of campaign attribution: posthog-js attaches utm_source/medium/campaign
    // (and gclid/fbclid/mc_cid) to these automatically, so "signups by campaign" is a breakdown
    // rather than a join. The EMAIL IS NEVER SENT — only that a submit happened.
    track({ name: 'waitlist_form_submitted' });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The attribution captured on ARRIVAL, and the exact promise this form displayed. Both are
        // re-validated server-side — a public endpoint trusts nothing from a client.
        body: JSON.stringify({ email, attribution: captureAttribution(), consent: CONSENT_TEXT }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) {
        track({ name: 'waitlist_signup_succeeded' });
        setState('done');
        setMessage(data.message ?? '');
      } else {
        track({
          name: 'waitlist_signup_failed',
          reason: res.status === 400 ? 'validation' : res.status === 429 ? 'rate_limited' : 'error',
        });
        setState('error');
        setMessage(data.message ?? 'Something went wrong. Please try again.');
      }
    } catch {
      track({ name: 'waitlist_signup_failed', reason: 'error' });
      setState('error');
      setMessage('Network error. Please try again.');
    }
  }

  if (state === 'done') {
    return (
      <div role="status" className="mx-auto max-w-md rounded-[1.75rem] border border-stone-200/70 bg-stone-50/80 px-8 py-8 text-center backdrop-blur-xl shadow-[0_1px_2px_rgba(43,33,25,0.05),0_8px_24px_-8px_rgba(43,33,25,0.10),0_32px_80px_-24px_rgba(43,33,25,0.16)]">
        <p className="text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Request received</p>
        <p className="mt-3 font-display text-2xl text-stone-900">Your name is on the list.</p>
        <p className="mt-3 font-serif text-base leading-relaxed text-stone-500">
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
      {/* PRD §6 input: parchment, 1px hairline, 14px Source Sans, antique-gold focus
          border, no ring/shadow, square. */}
      <input
        id="waitlist-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        autoComplete="email"
        className="min-h-[52px] w-full flex-1 rounded-full border border-stone-300/80 bg-stone-50/70 px-6 font-sans text-sm text-stone-900 outline-none transition-[border-color,box-shadow] duration-200 ease-gentle placeholder:text-stone-500 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20"
      />
      {/* PRD §6 primary CTA: 1px ink hairline, instant ink fill on hover (no transition). */}
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="inline-flex min-h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full bg-stone-900 px-8 font-sans text-sm font-semibold tracking-[0.02em] text-stone-50 shadow-[0_1px_2px_rgba(43,33,25,0.05),0_8px_24px_-8px_rgba(43,33,25,0.10),0_32px_80px_-24px_rgba(43,33,25,0.16)] transition-[background-color,transform] duration-200 ease-gentle hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40 sm:w-auto"
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
