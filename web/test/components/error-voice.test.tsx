// @vitest-environment jsdom
//
// THE ERROR VOICE — a failure never speaks in the machine's words.
//
// THE DEFECT, as found by the UX sweep. Four surfaces put transport-level text on screen:
//
//   catalog-search.tsx    `search failed (${res.status})` -> "Search failed: search failed (500)"
//                         and, on a dropped connection, `err.message` -> "Failed to fetch"
//   account-settings.tsx  `err.message` -> whatever the auth vendor's server sentence was
//   auth-forms.tsx        the Google button's catch -> the same, plus "Failed to fetch"
//   library/passages      `Search failed (${r.status})`
//
// A status code is not a sentence and "Failed to fetch" is a browser implementation detail. 429 is
// the sharpest case: it is the one failure with a genuinely useful thing to say ("wait, then try
// again"), and the reader was shown a number instead.
//
// WHAT IS ASSERTED, and why in this shape. The absence checks alone would pass against a surface
// that rendered nothing at all, so each leg pairs "the raw form is NOT reachable" with "a sentence
// IS". `textContent` of the whole container is the subject rather than a specific node: the point
// is that the raw string reaches no part of the page a reader can see, however it is nested.
//
// The vendor string used below is a REAL one: better-auth's sign-up route throws with the literal
// words "User already exists. Use another email." (see auth-forms.tsx's own note), which is the
// shape of thing that reached the screen.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const changePassword = vi.fn();
vi.mock('@/lib/auth/client', () => ({ authClient: { changePassword: (...a: unknown[]) => changePassword(...a) } }));

import { CatalogSearch } from '@/components/catalog-search';
import { AccountSettings } from '@/components/account-settings';

/** The forms a reader must never be shown, whatever the cause of the failure. */
const RAW_FORMS: Array<[string, RegExp]> = [
  ['a bare HTTP status code', /\b(?:4\d\d|5\d\d)\b/],
  ['a parenthesised status code', /\(\s*\d{3}\s*\)/],
  ['the fetch implementation detail', /failed to fetch/i],
  ['a TypeError name', /TypeError/],
];

function assertNoRawForms(text: string) {
  for (const [label, re] of RAW_FORMS) {
    expect(re.test(text), `${label} reached the DOM: ${JSON.stringify(text)}`).toBe(false);
  }
}

/** A sentence: at least a few words, and ending like prose rather than like a log line. */
function assertReadsAsSentence(text: string) {
  expect(text.trim().length, `nothing was said at all: ${JSON.stringify(text)}`).toBeGreaterThan(15);
  expect(/[.!?]/.test(text), `no sentence punctuation: ${JSON.stringify(text)}`).toBe(true);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  changePassword.mockReset();
});

// ── catalog search ────────────────────────────────────────────────────────────────────────────

async function searchAndRead(fetchImpl: typeof globalThis.fetch): Promise<string> {
  vi.stubGlobal('fetch', fetchImpl);
  const { container } = render(<CatalogSearch catalog="commentaries" label="Commentaries" />);
  const box = container.querySelector('input')!;
  fireEvent.change(box, { target: { value: 'grace' } });
  fireEvent.submit(box.closest('form')!);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  return container.textContent ?? '';
}

describe('catalog search — a failed search speaks English', () => {
  it('a 500 with no body says something, and never says 500', async () => {
    const text = await searchAndRead((async () =>
      new Response('', { status: 500 })) as typeof globalThis.fetch);
    assertNoRawForms(text);
    assertReadsAsSentence(screen.getByRole('alert').textContent ?? '');
  });

  it('a dropped connection never shows "Failed to fetch"', async () => {
    const text = await searchAndRead((async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch);
    assertNoRawForms(text);
    assertReadsAsSentence(screen.getByRole('alert').textContent ?? '');
  });

  it('a 429 reads as a sentence about waiting, not as a number', async () => {
    const text = await searchAndRead((async () =>
      new Response(
        JSON.stringify({ error: { code: 'RATE_LIMIT_MINUTE', message: 'You have reached the per-minute limit. Please wait a moment and try again.' } }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      )) as typeof globalThis.fetch);
    assertNoRawForms(text);
    // The server's own curated copy is the best sentence available and must survive.
    expect(screen.getByRole('alert').textContent).toMatch(/try again/i);
  });

  it('a 429 with no readable body still talks about trying again', async () => {
    // The throttle can answer with an empty body (a proxy, a truncated response). The status is
    // still known, and it is the one status with something worth saying.
    await searchAndRead((async () => new Response('', { status: 429 })) as typeof globalThis.fetch);
    const said = screen.getByRole('alert').textContent ?? '';
    assertNoRawForms(said);
    expect(said).toMatch(/again/i);
  });
});

// ── account settings ──────────────────────────────────────────────────────────────────────────

describe('account settings — a change-password failure speaks English', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
  });

  async function submitPassword(container: HTMLElement) {
    const inputs = container.querySelectorAll('input[type="password"]');
    fireEvent.change(inputs[0], { target: { value: 'the-old-passphrase' } });
    fireEvent.change(inputs[1], { target: { value: 'a-long-enough-new-passphrase' } });
    fireEvent.submit(container.querySelector('form')!);
  }

  it('a vendor sentence from the auth service is never forwarded verbatim', async () => {
    changePassword.mockResolvedValue({
      error: { message: 'User already exists. Use another email.', status: 422 },
    });
    const { container } = render(<AccountSettings email="reader@example.com" />);
    await submitPassword(container);

    await waitFor(() => expect(container.textContent).toMatch(/could not|not correct/i));
    const text = container.textContent ?? '';
    expect(text, 'the auth vendor’s own sentence reached the screen').not.toContain('Use another email');
    assertNoRawForms(text);
  });

  it('a dropped connection never shows "Failed to fetch"', async () => {
    changePassword.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(<AccountSettings email="reader@example.com" />);
    await submitPassword(container);

    await waitFor(() => expect(container.textContent).toMatch(/could not|not correct/i));
    assertNoRawForms(container.textContent ?? '');
  });

  it('the wrong current password still gets its own specific sentence', async () => {
    // The other half of D41: curating the voice must not collapse the ONE failure that has a
    // precise, actionable cause back into the generic sentence.
    changePassword.mockResolvedValue({
      error: { message: 'Invalid current password credential', status: 400 },
    });
    const { container } = render(<AccountSettings email="reader@example.com" />);
    await submitPassword(container);

    await waitFor(() => expect(container.textContent).toMatch(/current password is not correct/i));
  });
});
