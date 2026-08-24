# The auth-form hydration failure — cause and fix

## Cause

`AuthForm` called `useSearchParams()`, which forces the component under a `<Suspense>` boundary.
That boundary was the **only** lazily-hydrated thing on the auth page: everything outside it
hydrates in React's root pass, while a Suspense boundary is hydrated selectively, at lower
priority. A lazily-hydrated boundary is one that can still be waiting when someone types their
password and presses the button — which is exactly what was observed.

**Both reasons for the boundary were void:**
1. The page comment justified it as needed "to prerender". The route is `dynamic = 'force-dynamic'`
   — it is never prerendered.
2. `useSearchParams()` was used in exactly **one** place: `params.get('token')` inside `submit()`,
   a user event handler, where `window` is guaranteed available and the URL is final.

And `auth-forms.tsx`'s own header already prescribed the fix, for the same reason:
> "the reader reads `window.location.search` in an EFFECT … not via `useSearchParams`, which would
> need a Suspense boundary."

## Fix

Read the reset token from `window.location.search` inside the submit handler; delete
`useSearchParams()`; delete the now-purposeless `<Suspense>` wrapper. Two files, no new
dependencies, no behaviour change to the reset flow.

## Before / after — identical conditions, same tab

    DEV                    before: formHydrated false · submitIntercepted false (18s, never)
                           after:  formHydrated TRUE  · submitIntercepted TRUE

    PRODUCTION BUILD       before: form false · input false · 181 of 234 nodes hydrated
    (next build + start)   after:  form TRUE  · input TRUE  · 204 of 226 nodes hydrated

## End-to-end, for the first time

A real sign-up through the UI:
- submitted by JavaScript, **not** a native GET; `passwordInUrl: false`
- rendered **"Confirm your email — We have sent a verification link to <address>. Open it and you
  will be signed in."** with a working **"Resend the link"** button

That is K-4 and K-5 verified live rather than by component test, and it **answers the open owner
question**: the server returned no session (`token: null`), so **email verification IS enforced**.

A duplicate sign-up returned the *same* confirmation panel rather than an error — the server
re-sends verification for an unverified address, so the existence oracle is closed harder than my
own fix required. **Caveat:** that was a duplicate of an *unverified* account. The verified-duplicate
path still routes through the curated message and remains untested (no mailbox access).

## What I could NOT establish, and it matters

**Every measurement in this investigation was taken in a browser tab reporting
`document.visibilityState === 'hidden'`** — the automated pane and the MCP-driven Chrome tab alike.
I could not foreground a tab through automation (Chrome is granted read-only; the MCP tab group is
never the selected tab).

Hydration scheduling is priority-sensitive, so it is possible this only ever manifested in
backgrounded conditions and that a real user with a foreground tab was never affected. **I could
not rule that in or out.** The one time it hydrated pre-fix was the very first load after the pane
opened — consistent with that theory.

Shipping anyway, and the reasoning is not "it might be broken":
- The boundary existed for a stated reason that is provably void on this route.
- Lazy hydration of a *credential form* is fragile by design, whatever the trigger.
- The component's own header already called for the pattern that was restored.
- Removing it strictly reduces work: one less boundary, one less hook, no behaviour change.

The earlier claim that sign-in "does not work in production" was measured under those hidden-tab
conditions and should be read with that caveat. What is certain: the form was inert under
conditions I could reproduce at will, and it no longer is.
