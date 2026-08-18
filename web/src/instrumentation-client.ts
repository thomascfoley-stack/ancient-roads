// PostHog (owner ruling O-2, docs/pm/MASTER.md 2026-08-16): product analytics + error tracking.
// Next runs instrumentation-client.ts once on browser boot — the idiomatic client-init slot.
//
// api_host is SAME-ORIGIN ('/ingest', reverse-proxied to PostHog by next.config.ts rewrites)
// for two load-bearing reasons:
//   1. CSP — connect-src is 'self' + the Neon Auth origin (next.config.ts). Widening a
//      security header for a third party is the rejected remedy class (owner ruling
//      2026-08-08; see the fonts note in app/layout.tsx). The proxy leaves CSP untouched.
//   2. Ad-blockers filter us.i.posthog.com; a first-party path survives.
//
// No key → no init → total no-op (dev, CI, and any deploy where the var is not set yet).
// maskAllInputs is stated explicitly even though it is the default: this is an auth-gated
// product and the gate password + /ask text must never leave the page (O-2 requirement).
import posthog from 'posthog-js';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    // Anonymous traffic stays anonymous — no person records until identify() is called,
    // which nothing in this tree does yet.
    person_profiles: 'identified_only',
    // Exception autocapture — the SEC-1 condition-9 gap ("zero observability") this closes.
    capture_exceptions: true,
    session_recording: { maskAllInputs: true },
  });
}
