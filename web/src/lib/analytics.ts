'use client';

// The one place product code is allowed to reach PostHog. See src/instrumentation-client.ts for
// the SDK wiring, and the owner rulings both files implement: 2026-08-18 ("after-the-fact, never
// embedded") and 2026-08-24 (DAU, 7-day churn, and campaign attribution — which is why pageviews
// and identify exist at all now).
//
// The closed-union shape below is adapted from PR #124 (feat/posthog-tracking-plan), which got
// this design right; it is reused here rather than reinvented. That branch is NOT merged: it sits
// on a pre-Slice-4 base and its diff reverts the user-library voice rendering. The good part is
// this file.
//
//   - TrackEvent is a CLOSED union. Adding an event means adding it here, typed, with an
//     enumerated property shape — never a free-form `track(name: string, props: object)`, which
//     would let a future call site pass a question, an email, or a filename with nothing to catch
//     it. A closed type is a mechanism; "no product text in analytics" as a review rule is not.
//   - Every property is an enum or a boolean. None is a free `string` that could carry
//     user-entered text.
//   - Fails soft, always. Analytics must never be why a sign-up or a question fails.
//
// Deliberately absent: prayer-journal events. That feature's own rule is "NO STREAKS, NO COUNTS,
// NO GAMIFICATION… prayer is not a habit metric" (prayer-journal.tsx). A PostHog event counting
// prayers is that metric in a different system. Do not add one without revisiting that ruling.

import posthog from 'posthog-js';

type AuthMethod = 'email' | 'google';

export type TrackEvent =
  // Public marketing tier — where newsletter and social campaigns land. These are the conversion
  // half of campaign attribution: the utm_* properties ride along automatically (posthog-js sends
  // them as top-level properties), so `waitlist_signup_succeeded` broken down by utm_source is the
  // "which campaign actually produced signups" number.
  | { name: 'waitlist_form_submitted' }
  | { name: 'waitlist_signup_succeeded' }
  | { name: 'waitlist_signup_failed'; reason: 'validation' | 'rate_limited' | 'error' }
  // The gated account funnel.
  | { name: 'auth_page_viewed'; mode: 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' }
  | { name: 'sign_up_submitted'; method: AuthMethod }
  | { name: 'sign_up_succeeded'; method: AuthMethod }
  | { name: 'sign_up_failed'; method: AuthMethod }
  | { name: 'sign_in_submitted'; method: AuthMethod }
  | { name: 'sign_in_succeeded'; method: AuthMethod }
  | { name: 'sign_in_failed'; method: AuthMethod }
  | { name: 'password_reset_requested' }
  // Both email and Google sign-ups redirect through FIRST_RUN_DESTINATION, so this is the one
  // reliable cross-method activation signal. Google's own success cannot be observed client-side:
  // signIn.social navigates the browser away and the OAuth callback never re-enters submit().
  | { name: 'first_run_reached' }
  // Core usage — what "active" in DAU actually means for this product.
  | { name: 'question_asked'; is_followup: boolean }
  | { name: 'search_run'; surface: 'works' | 'commentaries' | 'library' | 'my_works' | 'history' }
  | { name: 'plan_started'; scope: 'book' | 'books' | 'topic' };

/** Fire one of the events above. Never throws; never carries product text. */
export function track(event: TrackEvent): void {
  try {
    const { name, ...properties } = event;
    posthog.capture(name, properties);
  } catch {
    // After-the-fact and optional by design (owner ruling, 2026-08-18).
  }
}

/**
 * Bind subsequent events to a person, so "this reader was last seen on the 3rd" is answerable.
 *
 * THE ID IS THE OPAQUE INTERNAL USER ID, NEVER THE EMAIL — and no `$set` properties are sent
 * alongside it. A churn cohort needs identity, not personal data, and this repo's standing rule
 * is that PII stays out of third-party systems. `identify` is what makes a 7-day-inactive cohort
 * possible at all: without it every device is a separate anonymous id and nobody is ever "back".
 *
 * Idempotent by check: re-identifying the same id on every mount would be a wasted request on
 * every navigation.
 */
export function identifyReader(userId: string): void {
  try {
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
  } catch {
    // Same fail-soft contract as track().
  }
}

/**
 * Sign-out: unbind the person so the next reader on a shared device is not counted as this one.
 *
 * CALL THIS ONLY ON A REAL SIGN-OUT — an identified→anonymous transition. `reset()` mints a NEW
 * anonymous distinct id, which discards the campaign attribution posthog-js captured when the
 * visitor first landed. Calling it on every anonymous page load (the naive `if (!user) reset()`)
 * would therefore erase exactly the newsletter/social attribution this instrumentation exists to
 * collect. analytics-identity.tsx holds that transition check, and a test pins it.
 */
export function resetReader(): void {
  try {
    posthog.reset();
  } catch {
    // Same fail-soft contract as track().
  }
}
