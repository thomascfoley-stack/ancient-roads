// @vitest-environment jsdom
//
// A102 — "Excessive redundant /api/auth/get-session calls — 20+ fired within ~10 seconds of page
// activity, suggesting many independent components each re-check auth state rather than sharing
// one result."
//
// THE CLAIM IS AN ARCHITECTURE CLAIM, so it is settled by counting, not by reading. The count that
// matters is: N mounted components that each call `authClient.useSession()` produce how many
// network requests to /get-session?
//
// WHY THE FINDING IS PLAUSIBLE ON ITS FACE, and why that is not enough to accept it. `SaveToStudy`
// (save-to-study.tsx:150) calls `authClient.useSession()` and is rendered ONCE PER SURFACED ITEM on
// /ask — per voice card (ask-client.tsx:844), per lane chunk in each of four lanes
// (ask-client.tsx:911) and per fallback retrieval row (ask-client.tsx:969). A full answer really
// does mount 20+ of these hooks, which is exactly the order of magnitude the finding reports. The
// open question is whether 20+ HOOKS means 20+ REQUESTS.
//
// It does not, and the reason is structural rather than incidental: `authClient` is a module-level
// singleton (lib/auth/client.ts), Neon's `createAuthClient` delegates to `better-auth/react`
// (dist/better-auth-react-adapter), and better-auth builds ONE nanostores atom per client via
// `getSessionAtom` -> `useAuthQuery` (better-auth/dist/client/session-atom.mjs, query.mjs). The
// fetch is fired from `onMount`, which nanostores runs when the subscriber count goes 0 -> 1 and
// not on any subscriber after it. So the sharing this finding asks for is already there.
//
// THE TWO LEGS ARE DELIBERATELY DIFFERENT IN KIND, because a test that only asserts "1" would pass
// just as happily against a broken counter, a stubbed-out client, or a render that never mounted:
//
//   Leg 1 (the property)  — 25 components sharing the shipped module singleton => exactly 1 request.
//   Leg 2 (the control)   — 25 components each holding their OWN createAuthClient() => 25 requests.
//
// Leg 2 is this file's red-proof. It is the shape the finding ALLEGES, built on purpose, and it
// proves the instrument can see the defect: if the counter could not count, or the components never
// mounted, or the client never reached fetch, leg 2 would report 0 or 1 and fail. Leg 1's "1" is
// therefore a measurement rather than an artifact of a check that cannot move.
//
// WHAT THIS PINS GOING FORWARD. There is no fix to make here, so this file is a PIN, not a
// regression test for a bug: it fails the day someone moves `createAuthClient()` out of module
// scope — into a component body, a `useMemo`, a per-provider factory or a per-route client — which
// is the one edit that would silently turn every new `useSession()` call site into another request
// and make A102 true retroactively. That edit is easy to make and invisible in review; this is the
// thing that notices.

import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

// ── the instrument ──────────────────────────────────────────────────────────────────────────

let getSessionCalls = 0;

/** Every /get-session request the auth client makes, counted; everything else passes through 404. */
function installCountingFetch(): void {
  getSessionCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input instanceof Request
              ? input.url
              : String(input);
      if (url.includes('/get-session')) {
        getSessionCalls += 1;
        // A signed-OUT session is the honest default here and keeps the assertion about REQUEST
        // COUNT rather than about what the hook returned.
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
    }),
  );
}

beforeEach(() => {
  installCountingFetch();
  // A fresh module registry per test = a fresh module singleton, which is what a fresh PAGE LOAD
  // gives the browser. Without this, leg 1 would be measuring an atom another test already mounted.
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The number of concurrent hook consumers to mount. Above the ~20 the finding reports. */
const CONSUMERS = 25;

describe('A102 — session fetches are shared across hook call sites', () => {
  it('LEG 1 (property): 25 components on the shipped singleton fire ONE /get-session', async () => {
    // The SHIPPED hook and the SHIPPED client, imported fresh — not a re-implementation. If
    // use-signed-in.ts or client.ts stops sharing, this import chain is what carries the change in.
    const { useSignedIn } = await import('@/lib/auth/use-signed-in');

    function Consumer() {
      const signedIn = useSignedIn();
      return <span data-testid="c">{signedIn ? 'in' : 'out'}</span>;
    }

    const { findAllByTestId } = render(
      <>
        {Array.from({ length: CONSUMERS }, (_, i) => (
          <Consumer key={i} />
        ))}
      </>,
    );

    // Prove the components actually mounted before asserting on a count of network calls --
    // otherwise "0 requests" and "25 shared into 1" are indistinguishable.
    expect(await findAllByTestId('c')).toHaveLength(CONSUMERS);

    // useAuthQuery fires from onMount behind a setTimeout(0), so wait for the request rather
    // than assuming it has already happened.
    await waitFor(() => expect(getSessionCalls).toBeGreaterThan(0));
    // Give any additional (unshared) requests a chance to land before declaring "exactly one".
    await new Promise((r) => setTimeout(r, 50));

    expect(getSessionCalls).toBe(1);
  });

  it('LEG 2 (control/red-proof): 25 components each with their OWN client fire 25', async () => {
    // THE SHAPE A102 ALLEGES, built deliberately. This is what "many independent components each
    // re-check auth state" would actually look like in code: the client constructed per component
    // instead of once at module scope.
    const { createAuthClient } = await import('@neondatabase/auth/next');

    function IsolatedConsumer() {
      // `useState(factory)` so each instance holds ONE STABLE client for its lifetime. Calling
      // createAuthClient() bare in the render body also reproduces the finding, but it does so via
      // an infinite re-render (a fresh atom every render, each subscription forcing another), which
      // would make this control prove "unstable client" rather than "unshared client". The
      // counterfactual under test is unshared-but-stable.
      const [client] = useState(() => createAuthClient());
      const { data: session } = client.useSession();
      // Mirrors useSignedIn's `mounted` guard exactly, so the ONLY difference between this
      // component and leg 1's is where the client comes from.
      const [mounted, setMounted] = useState(false);
      useEffect(() => setMounted(true), []);
      return <span data-testid="c">{mounted && session?.user ? 'in' : 'out'}</span>;
    }

    const { findAllByTestId } = render(
      <>
        {Array.from({ length: CONSUMERS }, (_, i) => (
          <IsolatedConsumer key={i} />
        ))}
      </>,
    );

    expect(await findAllByTestId('c')).toHaveLength(CONSUMERS);

    await waitFor(() => expect(getSessionCalls).toBeGreaterThan(1), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 50));

    // The exact number is not the point and pinning it would make this brittle; the point is that
    // the counter RISES WITH THE COMPONENT COUNT, which is precisely what leg 1 shows it does not.
    expect(getSessionCalls).toBeGreaterThanOrEqual(CONSUMERS);
  });

  it('LEG 3 (the /ask shape): consumers arriving progressively still fire ONE', async () => {
    // WHY THIS IS NOT LEG 1 AGAIN. Leg 1 mounts all 25 in a single commit, where "they shared one
    // fetch" could just mean "one render pass, one effect flush". /ask does not work like that: it
    // STREAMS, so SaveToStudy instances appear in waves as voices, then lanes, then fallback rows
    // arrive over the tens of seconds INSTR measured the endpoint at. Each wave subscribes to an
    // atom that is already mounted and already resolved. That is the actual scenario A102 was
    // observed in ("~10 seconds of page activity"), so it is the one worth pinning.
    const { useSignedIn } = await import('@/lib/auth/use-signed-in');

    function Consumer() {
      const signedIn = useSignedIn();
      return <span data-testid="c">{signedIn ? 'in' : 'out'}</span>;
    }

    const { rerender, findAllByTestId } = render(<Consumer />);
    await waitFor(() => expect(getSessionCalls).toBe(1));

    for (const n of [5, 12, CONSUMERS]) {
      rerender(
        <>
          {Array.from({ length: n }, (_, i) => (
            <Consumer key={i} />
          ))}
        </>,
      );
      // Each wave gets the same settling window leg 1 gave the initial mount, so a late request
      // has room to land and be counted rather than being missed by a too-fast assertion.
      await new Promise((r) => setTimeout(r, 30));
    }

    expect(await findAllByTestId('c')).toHaveLength(CONSUMERS);
    expect(getSessionCalls).toBe(1);
  });

  it('LEG 4 (churn): unmounting every consumer and remounting does not refetch per component', async () => {
    // The last mechanism that could still multiply requests behind a SHARED client: nanostores runs
    // `onMount` when the subscriber count goes 0 -> 1, so a tree that drops to zero consumers and
    // comes back (route change, a filter clearing then repopulating the result list) could in
    // principle re-arm the fetch. This asserts the PROPERTY — churn does not scale with the number
    // of components — rather than a specific count, which would be pinning an implementation
    // detail of nanostores' unmount delay.
    const { useSignedIn } = await import('@/lib/auth/use-signed-in');

    function Consumer() {
      const signedIn = useSignedIn();
      return <span data-testid="c">{signedIn ? 'in' : 'out'}</span>;
    }

    const all = (
      <>
        {Array.from({ length: CONSUMERS }, (_, i) => (
          <Consumer key={i} />
        ))}
      </>
    );

    const { rerender } = render(all);
    await waitFor(() => expect(getSessionCalls).toBe(1));

    for (let cycle = 0; cycle < 3; cycle += 1) {
      rerender(<></>);
      await new Promise((r) => setTimeout(r, 30));
      rerender(all);
      await new Promise((r) => setTimeout(r, 30));
    }

    // Three full teardown/rebuild cycles of 25 components each. If mounting re-armed per consumer
    // this would be in the dozens; the guarantee is that it stays bounded by the number of CYCLES,
    // never by the number of components.
    expect(getSessionCalls).toBeLessThan(CONSUMERS);
  });
});
