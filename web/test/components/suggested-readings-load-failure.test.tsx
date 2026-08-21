// @vitest-environment jsdom
//
// B021 (fourth site) — SUGGESTED READINGS SAT ON "Loading…" FOREVER.
//
// `load()` had `if (!r.ok) return null` with no message, and an unguarded `await r.json()`. Either
// way `state` stayed null and the panel rendered "Loading…" for the life of the tab — for a 500,
// for a network failure, and for a non-JSON 200 (the site gate's HTML once a cookie expires; fetch
// follows the redirect and `r.ok` is true). The wait must end in a sentence with a retry.
//
// RED-PROOF: revert the `loadFailed` branch in suggested-readings.tsx `load()` — every case below
// hangs on "Loading…" and times out.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SuggestedReadings } from '../../src/components/suggested-readings';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CASES: [string, () => Promise<Response>][] = [
  ['a 500', async () => new Response('oops', { status: 500 })],
  ['a network failure', async () => { throw new TypeError('fetch failed'); }],
  ['a non-JSON 200 (the gate HTML)', async () =>
    new Response('<!doctype html><body>Enter the password</body>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })],
];

describe('SuggestedReadings — the wait ends', () => {
  for (const [name, respond] of CASES) {
    it(`${name} ends in a message with a retry, not a permanent "Loading…"`, async () => {
      vi.stubGlobal('fetch', vi.fn(respond));
      render(<SuggestedReadings documentId="doc-1" docReady />);

      await screen.findByText(/could not be loaded/i);
      await screen.findByRole('button', { name: /try again/i });
      expect(screen.queryByText('Loading…')).toBeNull();
    });
  }

  it('a good response still renders the panel, and clears a previous failure on retry', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('oops', { status: 500 });
      return Response.json({ status: 'none', categories: [], count: 0, readings: [] });
    }));
    render(<SuggestedReadings documentId="doc-1" docReady />);

    const retry = await screen.findByRole('button', { name: /try again/i });
    retry.click();
    await waitFor(() => {
      expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    });
  });
});
