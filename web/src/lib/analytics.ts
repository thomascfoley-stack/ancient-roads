'use client';

// The one place product code is allowed to reach PostHog. See
// src/instrumentation-client.ts for the SDK wiring itself and the owner
// ruling it implements (2026-08-18: analytics must be "after-the-fact",
// never embedded in the product). This module is that boundary, made
// narrow on purpose:
//
//   - TrackEvent below is a CLOSED union. Adding an event means adding it
//     here, typed, with an enumerated property shape -- never a free-form
//     `track(name: string, props: Record<string, unknown>)`, which would
//     let a future call site pass a question, an email, or a filename as a
//     property with nothing to catch it. A closed type is the mechanism;
//     "no product text in analytics" as a review rule is not -- the same
//     lesson stripProductText's own comment draws in instrumentation-client.
//   - Every property below is an enum or a boolean. None is a free `string`
//     that could carry user-entered text. A future event that seems to need
//     one is a sign it needs the same review this file's events got, not a
//     quick addition here.
//   - Fails soft, always. Capturing before `posthog.init()` runs (no key
//     configured -- true of every non-production environment) does not
//     throw in posthog-js, but this wraps it in try/catch anyway: analytics
//     must never be the reason a sign-up or a question fails. "If it
//     doesn't work, I don't care" (owner ruling) is the requirement this
//     satisfies.
//
// Deliberately absent: prayer-journal events. The block that owns that
// feature is explicit -- "NO STREAKS, NO COUNTS, NO GAMIFICATION... prayer
// is not a habit metric" (prayer-journal.tsx) -- and a PostHog event counting
// prayers added would be exactly that metric, just kept in a different
// system. Left out on purpose; do not add one without revisiting that ruling.

import posthog from 'posthog-js';

type AuthMethod = 'email' | 'google';

export type TrackEvent =
  // Public waitlist capture on the marketing landing (pre-launch top of funnel).
  | { name: 'waitlist_form_submitted' }
  | { name: 'waitlist_signup_succeeded' }
  | { name: 'waitlist_signup_failed'; reason: 'validation' | 'rate_limited' | 'error' }
  // /auth/[sign-in|sign-up|forgot-password|reset-password] -- the gated account funnel.
  | { name: 'auth_page_viewed'; mode: 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' }
  | { name: 'sign_up_submitted'; method: AuthMethod }
  | { name: 'sign_up_succeeded'; method: AuthMethod }
  | { name: 'sign_up_failed'; method: AuthMethod }
  | { name: 'sign_in_submitted'; method: AuthMethod }
  | { name: 'sign_in_succeeded'; method: AuthMethod }
  | { name: 'sign_in_failed'; method: AuthMethod }
  | { name: 'password_reset_requested' }
  // Fires for BOTH email and Google sign-ups -- both redirect through
  // FIRST_RUN_DESTINATION (auth-forms.tsx), so this is the one reliable
  // cross-method activation signal. Google's own success can't be observed
  // client-side: signIn.social navigates the browser away to Google and the
  // OAuth callback never re-enters submit(), so there is no client code path
  // after it succeeds to fire sign_up_succeeded{method:'google'} from.
  | { name: 'first_run_reached' }
  // Core usage.
  | { name: 'question_asked'; is_followup: boolean }
  | { name: 'plan_started'; scope: 'book' | 'books' | 'topic' };

/** Fire one of the events above. Never throws; never carries product text. */
export function track(event: TrackEvent): void {
  try {
    const { name, ...properties } = event;
    posthog.capture(name, properties);
  } catch {
    // Analytics is after-the-fact and optional by design (owner ruling,
    // 2026-08-18). A capture failure must never surface to the reader.
  }
}
