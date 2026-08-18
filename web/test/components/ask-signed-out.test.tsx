// @vitest-environment jsdom
//
// Q1 — THE SIGNED-OUT READER IS TOLD BEFORE THEY TYPE, NOT AFTER THEY SUBMIT.
//
// The 2026-08-16 QA fleet hit this independently in 13 of 20 sessions, more than any other
// finding: the /ask composer, its lane chips and its example prompts all render normally and
// invite input, and the sign-in requirement is discoverable ONLY by typing a full question,
// submitting it, and reading the 401 that comes back. The error then offers "Ask again" as its
// only control — which re-fails identically — and no link to the thing it just asked for.
//
// Confirmed from source before this test was written: `ask-client.tsx:236` was the ONLY
// signed-out handling on the entire surface, and nothing on the page consulted `useSignedIn()`.
//
// WHAT THIS PINS, AND WHAT IT DELIBERATELY DOES NOT.
//
//   * The notice is PRE-SUBMIT. Test 1 asserts it is present with no submission having happened —
//     that is the whole finding. A test that submitted first would pass against the broken code.
//   * It is CONDITIONAL. Test 2 renders signed IN and asserts absence. Without it, hardcoding the
//     banner unconditionally would be green, and the signed-in reader would be nagged forever.
//   * The 401 carries a WAY OUT. Test 3 asserts a link, not merely more prose.
//
// NOT AN ERROR STATE. Signed-out is the app's own auth state, not a fault, and rendering it as
// one is the mistake `save-to-study.test.tsx` records ("an error state would be the app reporting
// its own auth state as a fault — the prayer-journal lesson"). Hence the pre-submit notice is
// asserted by its text and link, and NOT by role="alert" — which stays reserved for the failure
// path in test 3.
//
// NOT COVERED HERE: the signed-out console 401 from /api/annotations on reader pages. That is a
// deliberate trade documented at `use-annotation-writes.ts:85-93` (gating the GET on the session
// query makes Retry unreachable exactly when it helps), and the plan's first draft of this block
// wrongly proposed "fixing" it. See docs/pm/orders/2026-08-17-qa-fleet-attack-plan.md Q1.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Session state is per-test; the `mock` prefix satisfies vitest's mock-hoisting rule.
let mockSession: { data: { user: { id: string } } | null } = { data: null };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));

import { AskClient } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  mockSession = { data: null };
  vi.stubGlobal('scrollTo', vi.fn());
  // jsdom implements no layout, so scrollIntoView does not exist; same stub and same reasoning
  // as ask-terminal-state.test.tsx.
  Element.prototype.scrollIntoView = vi.fn();
});

/** The sign-in destination, wherever it is rendered. Asserted as a real link, not as prose. */
function signInLink(): HTMLAnchorElement | null {
  return document.querySelector('a[href*="/auth/sign-in"]');
}

describe('Q1 — the sign-in requirement is announced before submission', () => {
  it('a signed-out reader is told, and given a link, with nothing submitted', async () => {
    // SEED: drop the `!signedIn` notice from ask-client -> RED. This is the 13-session finding.
    render(<AskClient />);

    // The composer is present and inviting — that part is not the bug and must not regress.
    expect(await screen.findByPlaceholderText(/Ask a question/i)).toBeTruthy();

    await waitFor(
      () => expect(signInLink(), 'no sign-in link on the signed-out /ask surface').toBeTruthy(),
    );
    // And it must be reachable BEFORE typing: no fetch was stubbed, so any submission in this
    // test would have thrown. Nothing was submitted; the notice is on first paint.
  });

  it('a signed-in reader is not nagged — the notice is conditional, not hardcoded', async () => {
    mockSession = { data: { user: { id: 'u-test' } } };
    render(<AskClient />);
    await screen.findByPlaceholderText(/Ask a question/i);

    // Without this test, an unconditional banner passes test 1 forever.
    await waitFor(() =>
      expect(signInLink(), 'the signed-out notice rendered for a signed-in reader').toBeNull(),
    );
  });
});

describe('Q1 — the 401 offers a way out, not just a way to re-fail', () => {
  it('the failure state carries a sign-in link beside "Ask again"', async () => {
    // SEED: revert the 401 branch to the bare string -> RED.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    mockSession = { data: null };
    render(<AskClient />);

    const box = await screen.findByPlaceholderText(/Ask a question/i);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(box, { target: { value: 'What is grace?' } });
    fireEvent.submit(box.closest('form')!);

    // The explicit failure is still an alert — that behaviour is L1's and must survive.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const alert = screen.getByRole('alert');
    expect(
      alert.querySelector('a[href*="/auth/sign-in"]'),
      'the 401 told the reader to sign in and gave them no way to do it',
    ).toBeTruthy();
    // "Ask again" stays: a reader who signed in on another tab can retry without retyping (L1).
    expect(screen.getByRole('button', { name: /ask again/i })).toBeTruthy();
  });
});
