// @vitest-environment jsdom
//
// The My Works "Try again" button is hidden for refusal-derived failures (W-REFUSALCODE).
//
// Every non-'empty' parse refusal (needs_ocr / corrupt / too_large_decompressed /
// unsupported_type) collapses to status='failed', the SAME value a transient-exhaustion row
// lands at. Until migration 131 the UI's only gate was `d.status === 'failed'`, so it offered
// "Try again" for refusals too — re-running the same parse over the same bytes cannot change
// the answer, which is the "click forever" loop the retry route's docstring says refusals are
// NOT retryable to prevent. The fix ships the `refusalCode` the worker's catch writes alongside
// the status to the UI, and the button gate becomes `d.status === 'failed' && !d.refusalCode`.
//
// The source-grep guard in retry-refusal-gate.test.ts pins the gate's text; this file pins the
// BEHAVIOUR a reader sees: a refused row shows no "Try again", a transient-exhausted row still
// does.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

function stub(docs: Record<string, unknown>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      // The list endpoint is exactly `/api/user-corpus/documents`; per-doc retries, deletes,
      // voices and the search route all carry an extra segment after it.
      if (u.endsWith('/api/user-corpus/documents')) return Response.json({ documents: docs });
      return Response.json({});
    }),
  );
}

const base = (over: Record<string, unknown>) => ({
  id: 'doc-1',
  title: 'A sermon',
  status: 'failed',
  createdAt: '2026-08-17T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ documents: [] })),
  );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('My Works — Try again is hidden for refusal verdicts', () => {
  it('hides Try again for each of the four non-empty refusal codes', async () => {
    for (const code of ['needs_ocr', 'corrupt', 'too_large_decompressed', 'unsupported_type'] as const) {
      cleanup();
      stub([base({ refusalCode: code })]);
      render(<MyWorksClient />);
      // Wait for the row to render (load is async), THEN query synchronously — queryByRole does
      // not wait, so querying before the row appears would hide the button for the wrong reason.
      await screen.findByText('A sermon');
      const btn = screen.queryByRole('button', { name: /try again/i });
      expect(btn, `${code} must not offer Try again — it cannot change the answer`).toBeNull();
    }
  });

  it('still offers Try again for a transient-exhausted failure (no refusalCode)', async () => {
    stub([base({ refusalCode: null })]);
    render(<MyWorksClient />);
    const btn = await screen.findByRole('button', { name: /try again/i });
    expect(btn).toBeTruthy();
  });

  it('still offers Try again for an older failed row that carries no refusalCode field', async () => {
    // A row refused before migration 131 shipped has refusal_code NULL → refusalCode null on
    // the wire, OR a client that has not refreshed sees no field. Both read as "retryable",
    // matching the pre-existing behaviour. The fix narrows the gate, it does not retroactively
    // refuse rows the worker never tagged.
    stub([base({})]);
    render(<MyWorksClient />);
    const btn = await screen.findByRole('button', { name: /try again/i });
    expect(btn).toBeTruthy();
  });
});
