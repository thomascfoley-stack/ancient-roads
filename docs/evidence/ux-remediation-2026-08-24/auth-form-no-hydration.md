# P0 — the auth form's Suspense boundary does not hydrate, and the form defaults to GET

Found 2026-08-24 while trying to browser-verify K-4/K-5 (unblocked when `NEON_AUTH_*` appeared in
`web/.env.local` at 22:42). **Not caused by this branch** — reproduced with `auth-forms.tsx` reverted
to `dec9484`.

## What happened

First sign-up attempt of the night, dev server, real form fill + click on the submit button:

    http://localhost:3055/auth/sign-up?name=UX+Test+K45&email=uxtest%2Bk45a%40example.com&password=a-long-enough-password-2026

The password went into the address bar. No account was created. The form had performed the
browser's DEFAULT submit — a GET to its own URL with every field in the query string.

## Two independent defects stacked

**1. The `<Suspense>` boundary wrapping `AuthForm` never hydrates,** so `onSubmit` is never attached.
Measured on the production page (`next build` + `next start`, gate passed):

    /auth/sign-up   234 nodes on the page, 181 hydrated
                    main: true   body: true   nav: true   a: true   button: true
                    form: FALSE  input: FALSE

The page hydrates. The form subtree does not. `submitIntercepted: false` — dispatching a cancelable
`submit` event is not prevented by anything.

**2. `<form>` carried no `method`,** so that un-intercepted submit was a GET rather than a POST.
Confirmed in the production HTML: `<form class="bg-paper …">`, no method attribute.

Defect 1 makes sign-up and sign-in non-functional. Defect 2 turns that failure into credential
exposure — URL bar, browser history, server access log, and the `Referer` of the next request.

## Controls run, because a hydration claim is easy to get wrong

| Check | Result |
|---|---|
| `/read/jhn/3`, same browser, same pane, back-to-back | **hydrates** (`__reactFiber$` present) |
| Same in the PRODUCTION build | **hydrates** |
| `/gate` form in the production build | **hydrates** |
| `/auth/sign-in` (a second auth path) | does NOT hydrate |
| `auth-forms.tsx` reverted to `dec9484` | still does NOT hydrate → pre-existing |
| Console on the prod auth page | no chunk errors; every JS chunk 200 |

## Fixed here: the floor only

`method="post"` on the form. Re-verified in a rebuilt production build, submitting while
un-hydrated:

    before: /auth/sign-up?name=…&email=…&password=a-long-enough-password-2026
    after:  /auth/sign-up          (passwordInUrl: false, emailInUrl: false)

Pinned by `web/test/auth-form-method-floor.test.tsx`, red-proofed by removing the attribute (all
three form paths went red).

**This is deliberately the symptom, not the cause.** The attribute costs nothing and removes the
credential-in-URL class for *any* reason JS fails to run — hydration bug, chunk 404, CSP change, JS
disabled. It does NOT make sign-up work.

## CONFIRMED ON THE LIVE PRODUCTION SITE — 2026-08-24

Checked in the owner's own Chrome (already past `SITE_PASSWORD` and signed in), so this is the
deployed build serving a real session, not a local approximation.

`/auth/sign-up` and `/auth/sign-in` redirect a SIGNED-IN reader to `/home` (the `SIGNED_OUT_ONLY`
guard), so they cannot be inspected from a signed-in session. **`/auth/forgot-password` renders the
same `AuthForm` inside the same `<Suspense>` boundary and is deliberately reachable while signed in**
— which makes it the honest probe for the same defect.

    https://ancientpaths.app/auth/forgot-password
      formMethod:        "(none -> GET)"
      formHydrated:      false
      inputHydrated:     false
      submitButtonHydrated: false
      submitIntercepted: false      <- nothing prevents the browser's default submit
      mainHydrated:      true
      nodes: 292, hydratedNodes: 260

Re-probed after a further 6 seconds: unchanged. The page hydrates; the auth-form subtree never does.

**The visibility caveat is now disproven, not merely argued away.** In the SAME tab, at the SAME
`document.visibilityState === 'hidden'`, `https://ancientpaths.app/home` hydrated **296 of 319
nodes**. Hidden-ness does not prevent hydration on this site. The failure is specific to the
`AuthForm` boundary.

## What this means

On the live site, the sign-in and sign-up forms have no JavaScript attached. Submitting one performs
the browser's default submit — a **GET to the same URL with every field in the query string,
including `password`**. No account is created and no session is established, because the handler
that would call the auth client never runs.

## NOT resolved — what someone has to do next

- **The hydration failure is the real bug and is untouched.** Sign-up and sign-in do not function in
  the environment measured here. Likely suspects, in order: the `useSearchParams()` +
  `<Suspense>` + `dynamic = 'force-dynamic'` combination on `/auth/[path]`, or the unusual
  `generateStaticParams` + `dynamicParams = false` pairing on a force-dynamic route.
- ~~Confirm against the deployed site~~ — **DONE, it reproduces on production.** See above.
- **The `method="post"` floor is committed but NOT deployed**, so production still writes the
  password to the URL on every attempted sign-in until something ships.
