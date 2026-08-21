// @vitest-environment jsdom
//
// THE INVITATION ON ASK (order 2026-08-20-historians-study-entrance): voices-mode /ask carries
// a welcome into History mode on its empty state — a reader who came to ask about a verse is
// shown the door into studying the history behind it. What is pinned:
//
//   * The invitation is a REAL LINK to /ask?mode=history — not a button wired to client state,
//     so it works before hydration and in a new tab.
//   * It lives on the EMPTY state only. Once a question has been asked the column belongs to
//     answers; a standing advertisement under every answer is noise, not a welcome.
//     (Asserted by absence after a turn exists — the conditional is the finding.)

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Signed in, so the signed-out notice does not sit beside the thing under test.
let mockSession: { data: { user: { id: string } } | null } = { data: { user: { id: 'u1' } } };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));

import { AskClient } from '@/components/ask-client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  mockSession = { data: { user: { id: 'u1' } } };
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

function inviteLink(): HTMLAnchorElement | null {
  return document.querySelector('a[href="/ask?mode=history"]');
}

describe('the church-history invitation on the voices empty state', () => {
  it('is a real link into History mode, present before anything is asked', () => {
    render(<AskClient />);

    const link = inviteLink();
    expect(link).not.toBeNull();
    expect(link!.textContent).toMatch(/church history/i);
    expect(link!.textContent).toMatch(/begin a study/i);
  });

  it('leaves the column once a question has been asked', async () => {
    // A minimal stream: the fetch rejects, which still creates a turn (the error state) —
    // enough to prove the invitation is conditional on the empty state, which is the finding.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    render(<AskClient />);

    const input = screen.getByRole('textbox');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'What is grace?' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(inviteLink()).toBeNull());
  });
});
