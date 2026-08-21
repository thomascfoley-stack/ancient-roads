// @vitest-environment jsdom
//
// B020 + B021 — TWO WAYS THE MY WORKS PAGE STOPPED BEING A PAGE.
//
// B020 (the search error envelope): the client typed the search error as `{ error?: string }`, but
// `/api/user-corpus/search` answers failures with `apiError`, whose envelope is
// `{ error: { code, message } }`. `setSearchNote(d.error)` therefore stored an OBJECT, and
// rendering `{searchNote}` as a React child throws "Objects are not valid as a React child" — which
// the root error boundary turns into the whole page being replaced. Two ordinary triggers: a query
// over 500 characters (the input has no maxLength), and any 429 — including the one the limiter
// emits when it fails closed on a transient DB error. The `as` cast is what hid this from tsc.
//
// B021 (`r.json()` outside the try): four call sites parsed JSON with no guard against a non-JSON
// body, before any `r.ok` check. A throw there left the document list as a permanent `aria-busy`
// skeleton with no recovery control, discarded an upload silently while the button flicked back to
// "Add a document", and made a search render nothing at all. This is reachable through the site's
// own password gate: an expired gate cookie REDIRECTS, `fetch` follows it, and gate HTML arrives
// with status 200 — so `r.ok` is true and the parse is what fails. Platform 413/502/504 bodies are
// the same class.
//
// The two ship together because they are one property: a response the page did not expect must end
// in a sentence the reader can act on, never in a blank page or an endless wait.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

const DOC = {
  id: 'doc-1',
  title: 'My sermon on John 10',
  status: 'ready',
  created_at: '2026-08-17T00:00:00.000Z',
  bytes: 4096,
};

/** What the site gate actually returns when a cookie has expired: HTML, status 200. */
const GATE_HTML = () =>
  new Response('<!doctype html><html><body>Enter the password</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

function stubFetch(handler: (url: string, init?: { method?: string }) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string }) => handler(String(url), init)));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('My Works — a response the page did not expect', () => {
  it('B020: renders a rate-limit error as readable text instead of crashing the page', async () => {
    stubFetch(async (u) => {
      if (u.includes('/api/user-corpus/search')) {
        return Response.json(
          { error: { code: 'RATE_LIMIT_MINUTE', message: 'Youve reached the per-minute limit.', retryAfterSec: 30 } },
          { status: 429 },
        );
      }
      return Response.json({ documents: [DOC] });
    });

    render(<MyWorksClient />);
    await screen.findByText('My sermon on John 10');

    fireEvent.change(screen.getByLabelText('Search your works'), { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    // The message reaches the reader …
    await screen.findByText(/per-minute limit/i);
    // … and the page is still a page. Before the fix, the root boundary replaced all of this.
    expect(screen.getByRole('heading', { name: 'My Works' })).toBeTruthy();
    expect(screen.getByText('My sermon on John 10')).toBeTruthy();
  });

  it('B020: renders a 400 error envelope for an over-long query', async () => {
    stubFetch(async (u) => {
      if (u.includes('/api/user-corpus/search')) {
        return Response.json(
          { error: { code: 'INVALID_REQUEST', message: 'That search is too long. Please shorten it.' } },
          { status: 400 },
        );
      }
      return Response.json({ documents: [DOC] });
    });

    render(<MyWorksClient />);
    await screen.findByText('My sermon on John 10');
    fireEvent.change(screen.getByLabelText('Search your works'), { target: { value: 'x'.repeat(600) } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText(/too long/i);
    expect(screen.getByRole('heading', { name: 'My Works' })).toBeTruthy();
  });

  it('B021: a non-JSON document list ends the wait with a reason and a retry', async () => {
    stubFetch(async () => GATE_HTML());

    const { container } = render(<MyWorksClient />);

    // The skeleton must not be the final state.
    await waitFor(() => {
      expect(container.querySelector('[aria-busy]')).toBeNull();
    });
    expect(screen.getByRole('heading', { name: 'My Works' })).toBeTruthy();
    await screen.findByRole('button', { name: /try again/i });
  });

  it('B021: a non-JSON upload response is reported rather than silently discarded', async () => {
    stubFetch(async (u, init) => {
      if (u.includes('/api/user-corpus/upload') && init?.method === 'POST') return GATE_HTML();
      return Response.json({ documents: [DOC] });
    });

    render(<MyWorksClient />);
    await screen.findByText('My sermon on John 10');

    const input = screen.getByLabelText(/add a document/i, { selector: 'input' }) as HTMLInputElement;
    const file = new File(['a sermon'], 'sermon.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    // Before the fix the throw escaped `upload`, `finally` cleared `busy`, and the label simply
    // flicked back to "Add a document" with nothing said and nothing uploaded.
    await screen.findByText(/could not be uploaded|could not be completed|try again/i);
  });

  it('B021: a non-JSON search response says so instead of rendering nothing', async () => {
    stubFetch(async (u) => {
      if (u.includes('/api/user-corpus/search')) return GATE_HTML();
      return Response.json({ documents: [DOC] });
    });

    render(<MyWorksClient />);
    await screen.findByText('My sermon on John 10');
    fireEvent.change(screen.getByLabelText('Search your works'), { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText(/could not be run|try again/i);
  });
});
